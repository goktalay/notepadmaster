'use strict';

// Proje oturumu: bir proje penceresinin sunucu/klasör bağlantısı ve yerel çalışma kopyası (önbellek).
//
// Çalışma kopyası ("template klasörü"): %APPDATA%\Notepad Master\cache\<bağlantı id>\<uzak yol>
//   - Dosya açılınca sunucudaki içerik klasör yapısıyla birlikte buraya kopyalanır.
//   - Kaydedince dosya sunucuya yüklenir; yükleme başarılıysa kopya da güncellenir.
// Yerel klasör ve tek dosya projelerinde de aynı kopya tutulur (klasöre göre göreli yolla).

const fs = require('fs');
const path = require('path');
const { createRemote } = require('./remote');
const codec = require('./textcodec');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const NETWORK_ERR = /ECONNRESET|socket hang up|Client is closed|closed by the server|Not connected|No response|ETIMEDOUT|Timeout|EPIPE|not connected/i;

// Windows'ta geçersiz dosya adı karakterlerini değiştir
const safeSegment = (s) => s.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, (m) => '_'.repeat(m.length)) || '_';

class ProjectSession {
  constructor({ conn, cacheDir, onHostKey, onStatus }) {
    this.conn = conn;
    this.kind = conn.kind;
    this.cacheRoot = path.join(cacheDir, conn.id);
    this.onHostKey = onHostKey || (() => {});
    this.onStatus = onStatus || (() => {});
    this.remote = null;
    this.root = '';
    this.chain = Promise.resolve();
    this.closedByUser = false;
  }

  get p() { return this.remote ? this.remote.pathApi : (this.isLocal ? path : path.posix); }
  get isLocal() { return this.kind === 'local' || this.kind === 'file'; }

  async connect() {
    if (this.remote) this.remote.close();
    this.onStatus('connecting');
    const r = createRemote(this.conn);
    try {
      await r.connect();
    } catch (err) {
      this.onStatus('off');
      throw err;
    }
    if (r.fingerprint) this.onHostKey(r.fingerprint);
    this.remote = r;
    this.onStatus('on');
    return r;
  }

  async open() {
    const r = await this.connect();
    let home = '';
    let info = '';
    if (this.isLocal) {
      const lp = this.conn.localPath;
      if (!lp || !fs.existsSync(lp)) throw Object.assign(new Error('NOLOCAL'), { code: 'NOLOCAL' });
      this.root = this.kind === 'file' ? path.dirname(lp) : lp;
      home = this.root;
    } else {
      try { home = await r.pwd(); } catch { home = '/'; }
      try { info = await r.info(); } catch {}
      this.root = this.conn.rootDir || home || '/';
    }
    return { root: this.root, home, info, sep: this.isLocal ? path.sep : '/' };
  }

  // İşlemleri sıraya koyar (FTP tek bağlantıda aynı anda tek komut çalıştırır); bağlantı koptuysa bir kez yeniden bağlanır
  run(fn) {
    const job = this.chain.then(async () => {
      if (this.closedByUser) throw new Error('Client is closed');
      if (!this.remote || this.remote.closed) await this.connect();
      try {
        return await fn(this.remote);
      } catch (err) {
        if (this.isLocal || !NETWORK_ERR.test((err && err.message) || '')) throw err;
        await this.connect();
        return fn(this.remote);
      }
    });
    this.chain = job.catch(() => {});
    return job;
  }

  // Yerel projelerde yalnızca proje klasörünün içindeki yollara izin ver
  check(p) {
    if (!p || typeof p !== 'string') throw new Error('ENOENT');
    if (this.kind === 'file') {
      if (path.resolve(p) !== path.resolve(this.conn.localPath)) throw new Error('EACCES');
    } else if (this.isLocal) {
      const rel = path.relative(this.root, path.resolve(p));
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('EACCES');
    }
    return p;
  }

  // Bir proje yolunun çalışma kopyasındaki karşılığı (klasör yapısı korunur)
  cachePath(p) {
    let parts;
    if (this.isLocal) parts = path.relative(this.root, path.resolve(p)).split(/[\\/]+/);
    else parts = path.posix.normalize(p).split('/');
    parts = parts.filter((s) => s && s !== '.' && s !== '..').map(safeSegment);
    return path.join(this.cacheRoot, ...parts);
  }

  async writeCache(p, buf) {
    const file = this.cachePath(p);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, buf);
    return file;
  }

  list(dir) { return this.run((r) => r.list(this.check(dir))); }
  stat(p) { return this.run((r) => r.stat(this.check(p))); }

  // Dosyayı açar: içeriği indirir, çalışma kopyasına yazar, metne çevirir
  async read(p, { encoding = 'auto', fallback = 'windows-1254' } = {}) {
    this.check(p);
    const st = await this.stat(p);
    if (st.isDir) throw new Error('EISDIR');
    if (st.size > MAX_FILE_BYTES) return { tooLarge: true, size: st.size };
    const buf = await this.run((r) => r.readFile(p));
    const cachePath = await this.writeCache(p, buf);
    const d = codec.decode(buf, { encoding, fallback });
    if (d.binary) return { binary: true, size: buf.length, cachePath };
    return { ...d, size: buf.length, mtime: st.mtime, cachePath };
  }

  // Kaydeder: (istenirse) sunucudaki dosya açıldıktan sonra değişmiş mi bakar, yükler, çalışma kopyasını günceller
  async save(p, text, { encoding = 'utf8', bom = false, expect = null, force = false, allowLossy = false } = {}) {
    this.check(p);
    // Metin seçilen kodlamada saklanamıyorsa (ör. Türkçe harfler Windows-1252'de "?" olur) önce sor
    if (!allowLossy && !codec.canEncode(text, encoding)) return { lossy: true };
    if (expect && !force) {
      let st = null;
      try { st = await this.stat(p); } catch { /* dosya silinmiş olabilir; yeniden oluşturulur */ }
      if (st && ((expect.size != null && st.size !== expect.size) || (expect.mtime && st.mtime && Math.abs(st.mtime - expect.mtime) > 1500))) {
        return { conflict: true, size: st.size, mtime: st.mtime };
      }
    }
    const buf = codec.encode(text, { encoding, bom });
    await this.run((r) => r.writeFile(p, buf));
    const cachePath = await this.writeCache(p, buf);
    let st = { size: buf.length, mtime: Date.now() };
    try { st = await this.stat(p); } catch {}
    return { ok: true, size: st.size, mtime: st.mtime, cachePath };
  }

  async createFile(p) {
    this.check(p);
    // Varlık üst klasörün listesinden anlaşılır (FTP'de SIZE boş dosyalarda güvenilir değil)
    const name = this.p.basename(p);
    const siblings = await this.list(this.p.dirname(p));
    if (siblings.some((e) => e.name === name)) throw new Error('EEXIST');
    await this.run((r) => r.writeFile(p, Buffer.alloc(0)));
  }

  mkdir(p) { return this.run((r) => r.mkdir(this.check(p))); }

  async rename(from, to) {
    await this.run((r) => r.rename(this.check(from), this.check(to)));
    // çalışma kopyasını da taşı (yoksa sessizce geç)
    try {
      const dst = this.cachePath(to);
      await fs.promises.mkdir(path.dirname(dst), { recursive: true });
      await fs.promises.rename(this.cachePath(from), dst);
    } catch {}
  }

  async remove(p, isDir) {
    this.check(p);
    if (this.isLocal && this.trash) await this.trash(p);
    else await this.run((r) => (isDir ? r.removeDir(p) : r.removeFile(p)));
    try { await fs.promises.rm(this.cachePath(p), { recursive: true, force: true }); } catch {}
  }

  close() {
    this.closedByUser = true;
    if (this.remote) this.remote.close();
  }
}

module.exports = { ProjectSession, MAX_FILE_BYTES };
