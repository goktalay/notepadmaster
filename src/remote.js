'use strict';

// Dosya sistemi katmanı: SSH (SFTP alt sistemi), FTP / FTPS (basic-ftp), SFTP ve yerel klasör için ortak arayüz.
// FTP Masters'ın remote.js'inden; aktarım kuyruğu yerine dosyayı bellekte okuyup yazar.
//
//   connect(), close(), closed
//   pwd(), info(), fingerprint (SSH host anahtarı, SHA256)
//   list(dir)        → [{ name, path, isDir, isLink, size, mtime }]
//   stat(p)          → { isDir, size, mtime }
//   readFile(p)      → Buffer          writeFile(p, buf)
//   mkdir(p), rename(a, b), removeFile(p), removeDir(p)
//   pathApi          → path.posix (sunucular) | path (yerel)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Writable } = require('stream');
const ftp = require('basic-ftp');
const { Client: SshClient } = require('ssh2');

const posix = path.posix;

// FTP Masters ile aynı protokol seçenekleri; "ssh" bağlantı türü her zaman SFTP alt sistemini kullanır
const PROTOCOLS = {
  ftp: { port: 21 },
  'ftps-implicit': { port: 990 },
  'ftps-ssl': { port: 21 },
  'ftps-tls': { port: 21 },
  sftp: { port: 22 },
};

const isIp = (h) => /^[\d.]+$/.test(h) || h.includes(':');

function credentials(conn) {
  if (conn.loginMethod === 'anonymous') return { user: 'anonymous', password: conn.password || 'anonymous@' };
  return { user: String(conn.username || '').trim(), password: conn.password || '' };
}

// ---------------------------------------------------------------------------
// FTP / FTPS — tek kontrol bağlantısı; çağıran işlemleri sıraya koyar (bkz. project.js)
// ---------------------------------------------------------------------------
class FtpRemote {
  constructor(conn) {
    this.conn = conn;
    this.client = null;
    this.pathApi = posix;
  }

  get closed() { return !this.client || this.client.closed; }

  async connect() {
    const conn = this.conn;
    const host = String(conn.host || '').trim();
    const port = Number(conn.port) || PROTOCOLS[conn.protocol].port;
    const c = new ftp.Client(30000);
    if (conn.nameEncoding === 'ascii') c.ftp.encoding = 'latin1';
    // Sunucu sertifikaları çoğunlukla kendinden imzalıdır; FileZilla / FTP Masters gibi kabul ediyoruz
    const tls = { rejectUnauthorized: false, servername: isIp(host) ? undefined : host };
    try {
      if (conn.protocol === 'ftps-implicit') {
        await c.connectImplicitTLS(host, port, tls);
      } else {
        await c.connect(host, port);
        if (conn.protocol === 'ftps-tls') await c.useTLS(tls, 'AUTH TLS');
        if (conn.protocol === 'ftps-ssl') await c.useTLS(tls, 'AUTH SSL');
      }
      const { user, password } = credentials(conn);
      await c.login(user, password);
      await c.useDefaultSettings();
      if (conn.nameEncoding === 'ascii') await c.sendIgnoringError('OPTS UTF8 OFF');
    } catch (err) {
      c.close();
      throw err;
    }
    this.client = c;
    return this;
  }

  async info() {
    const res = await this.client.sendIgnoringError('SYST');
    return (res.message || '').replace(/^\d+\s*/, '').trim();
  }

  pwd() { return this.client.pwd(); }

  async list(dir) {
    const items = await this.client.list(dir);
    return items
      .filter((e) => e.name !== '.' && e.name !== '..')
      .map((e) => ({
        name: e.name,
        path: posix.join(dir, e.name),
        isDir: e.type === ftp.FileType.Directory,
        isLink: e.type === ftp.FileType.SymbolicLink,
        size: e.size,
        mtime: e.modifiedAt ? e.modifiedAt.getTime() : 0,
      }));
  }

  async stat(p) {
    try {
      const size = await this.client.size(p);
      let mtime = 0;
      try { mtime = (await this.client.lastMod(p)).getTime(); } catch { /* MDTM yok */ }
      return { isDir: false, size, mtime };
    } catch {
      // SIZE klasörlerde başarısız olur; klasöre girmeyi deneyerek ayırt et
      const cwd = await this.client.pwd();
      await this.client.cd(p);
      await this.client.cd(cwd);
      return { isDir: true, size: 0, mtime: 0 };
    }
  }

  async readFile(p) {
    const chunks = [];
    const sink = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } });
    await this.client.downloadTo(sink, p);
    return Buffer.concat(chunks);
  }

  async writeFile(p, buf) {
    await this.client.uploadFrom(Readable.from([buf]), p);
  }

  async mkdir(p) { await this.client.send('MKD ' + (await this.client.protectWhitespace(p))); }
  rename(a, b) { return this.client.rename(a, b); }
  removeFile(p) { return this.client.remove(p); }
  removeDir(p) { return this.client.removeDir(p); }

  close() { if (this.client) this.client.close(); }
}

// ---------------------------------------------------------------------------
// SFTP (SSH2) — "SSH projesi" ve FTP projesindeki SFTP protokolü
// ---------------------------------------------------------------------------
class SftpRemote {
  constructor(conn) {
    this.conn = conn;
    this.ssh = null;
    this.sftp = null;
    this.fingerprint = null;
    this._closed = true;
    this.pathApi = posix;
  }

  get closed() { return this._closed; }

  connect() {
    const conn = this.conn;
    return new Promise((resolve, reject) => {
      const ssh = new SshClient();
      let mismatch = false;
      const { user, password } = credentials(conn);
      const cfg = {
        host: String(conn.host || '').trim(),
        port: Number(conn.port) || 22,
        username: user,
        readyTimeout: 20000,
        keepaliveInterval: 20000,
        tryKeyboard: true,
        hostVerifier: (key) => {
          this.fingerprint = crypto.createHash('sha256').update(key).digest('base64');
          if (conn.hostKey && conn.hostKey !== this.fingerprint) {
            mismatch = true;
            return false;
          }
          return true;
        },
      };
      try {
        if (conn.authType === 'key') {
          cfg.privateKey = conn.keyPath ? fs.readFileSync(conn.keyPath) : '';
          if (!cfg.privateKey) throw new Error('NOKEY');
          if (conn.passphrase) cfg.passphrase = conn.passphrase;
        } else {
          cfg.password = password;
        }
      } catch (err) {
        return reject(err);
      }
      ssh.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => password)));
      ssh.on('error', (err) => {
        this._closed = true;
        if (mismatch) {
          const e = new Error('HOSTKEY');
          e.hostKey = { old: conn.hostKey, new: this.fingerprint };
          reject(e);
        } else reject(err);
      });
      ssh.on('close', () => (this._closed = true));
      ssh.on('ready', () => {
        ssh.sftp((err, sftp) => {
          if (err) { ssh.end(); return reject(err); }
          this.ssh = ssh;
          this.sftp = sftp;
          this._closed = false;
          sftp.on('close', () => (this._closed = true));
          resolve(this);
        });
      });
      ssh.connect(cfg);
    });
  }

  _call(fn, ...args) {
    return new Promise((resolve, reject) => this.sftp[fn](...args, (err, res) => (err ? reject(err) : resolve(res))));
  }

  info() {
    return new Promise((resolve) => {
      this.ssh.exec('uname -sr 2>/dev/null; hostname 2>/dev/null', (err, stream) => {
        if (err) return resolve('');
        let out = '';
        stream.on('data', (d) => (out += d));
        stream.on('close', () => resolve(out.trim().split('\n').join(' · ')));
      });
    });
  }

  pwd() { return this._call('realpath', '.'); }

  async list(dir) {
    const list = await this._call('readdir', dir);
    const out = list
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => {
        const type = e.attrs.mode & 0o170000;
        return {
          name: e.filename,
          path: posix.join(dir, e.filename),
          isDir: type === 0o040000,
          isLink: type === 0o120000,
          size: e.attrs.size,
          mtime: e.attrs.mtime * 1000,
        };
      });
    // Sembolik bağlantıların klasör olup olmadığını öğren
    await Promise.all(out.filter((e) => e.isLink).map(async (e) => {
      try { e.isDir = (await this._call('stat', e.path)).isDirectory(); } catch {}
    }));
    return out;
  }

  async stat(p) {
    const st = await this._call('stat', p);
    return { isDir: st.isDirectory(), size: st.size, mtime: st.mtime * 1000 };
  }

  readFile(p) { return this._call('readFile', p); }
  writeFile(p, buf) { return this._call('writeFile', p, buf); }
  mkdir(p) { return this._call('mkdir', p); }
  rename(a, b) { return this._call('rename', a, b); }
  removeFile(p) { return this._call('unlink', p); }

  async removeDir(p) {
    for (const e of await this.list(p)) {
      if (e.isDir && !e.isLink) await this.removeDir(e.path);
      else await this._call('unlink', e.path);
    }
    await this._call('rmdir', p);
  }

  close() {
    this._closed = true;
    try { this.ssh && this.ssh.end(); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Yerel klasör / tek dosya
// ---------------------------------------------------------------------------
class LocalRemote {
  constructor(conn) {
    this.conn = conn;
    this.pathApi = path;
    this._closed = true;
  }

  get closed() { return this._closed; }
  async connect() { this._closed = false; return this; }
  async info() { return ''; }
  async pwd() { return this.conn.localPath || ''; }

  async list(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return Promise.all(entries.map(async (e) => {
      const full = path.join(dir, e.name);
      let size = 0, mtime = 0, isDir = e.isDirectory();
      try {
        const st = await fs.promises.stat(full);
        size = st.size; mtime = st.mtimeMs; isDir = st.isDirectory();
      } catch { /* erişilemeyen sistem dosyaları */ }
      return { name: e.name, path: full, isDir, isLink: e.isSymbolicLink(), size: isDir ? 0 : size, mtime };
    }));
  }

  async stat(p) {
    const st = await fs.promises.stat(p);
    return { isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
  }

  readFile(p) { return fs.promises.readFile(p); }
  writeFile(p, buf) { return fs.promises.writeFile(p, buf); }
  mkdir(p) { return fs.promises.mkdir(p); }
  rename(a, b) { return fs.promises.rename(a, b); }
  removeFile(p) { return fs.promises.unlink(p); }
  removeDir(p) { return fs.promises.rm(p, { recursive: true }); }
  close() { this._closed = true; }
}

function createRemote(conn) {
  if (conn.kind === 'local' || conn.kind === 'file') return new LocalRemote(conn);
  if (conn.kind === 'ssh' || conn.protocol === 'sftp') return new SftpRemote(conn);
  return new FtpRemote(conn);
}

// Sunucu hatalarını kullanıcı dostu metne çevirir
function friendlyError(err, t) {
  const msg = (err && err.message) || String(err);
  const code = err && err.code;
  if (msg === 'HOSTKEY' && err.hostKey) return t('main.errHostKey', err.hostKey);
  if (msg === 'NOKEY') return t('main.errNoKey');
  if (code === 530 || /All configured authentication methods failed|Login incorrect|530/i.test(msg)) return t('main.errAuth');
  if (code === 550) return t('main.err550', { msg: msg.replace(/^550\s*/, '') });
  if (code === 553) return t('main.err553');
  if (/ECONNREFUSED/i.test(msg)) return t('main.errRefused');
  if (/ETIMEDOUT|Timed out|Timeout/i.test(msg)) return t('main.errTimeout');
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return t('main.errDns');
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) return t('main.errUnreach');
  if (/ECONNRESET|socket hang up|Client is closed|closed by the server|Not connected/i.test(msg)) return t('main.errReset');
  if (/ENOENT|No such file/i.test(msg)) return t('main.errNotFound');
  if (/EEXIST|already exists/i.test(msg)) return t('main.errExists');
  if (/EACCES|EPERM|Permission denied/i.test(msg)) return t('main.errPerm');
  if (/Cannot parse privateKey|Encrypted private key/i.test(msg)) return t('main.errKey');
  if (/wrong version number|SSL|TLS|certificate/i.test(msg)) return t('main.errTls', { msg });
  return msg;
}

module.exports = { createRemote, friendlyError, PROTOCOLS };
