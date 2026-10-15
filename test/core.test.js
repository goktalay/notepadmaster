'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { deriveKeys, encryptLibrary, decryptLibrary } = require('../src/account');
const codec = require('../src/textcodec');
const { ProjectSession } = require('../src/project');

test('sözleşme test vektörü (PBKDF2 + HKDF "npm-enc-v1")', async () => {
  const { authHash, encKey } = await deriveKeys('Test1234!', { alg: 'PBKDF2-SHA256', iter: 310000, salt: 'AAECAwQFBgcICQoLDA0ODw==' });
  assert.strictEqual(authHash, 'mLBQ6HQqD19kX/VavErWYq+7tM4mCmGfic7GuQQlBMY=');
  assert.strictEqual(encKey.subarray(0, 8).toString('hex'), '2bba9a96476374da');
  const lib = { schema: 1, items: [{ id: 'a', kind: 'connection', data: { name: 'x' } }] };
  assert.deepStrictEqual(decryptLibrary(encKey, encryptLibrary(encKey, lib)), lib);
});

test('kodlama: BOM, UTF-8, ANSI yedeği, satır sonu', () => {
  const tr = 'Şükrü ığdır\r\nçalış\r\n';
  let d = codec.decode(Buffer.from(tr, 'utf8'));
  assert.deepStrictEqual([d.encoding, d.bom, d.eol, d.text], ['utf8', false, 'crlf', tr]);
  d = codec.decode(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\nb')]));
  assert.deepStrictEqual([d.encoding, d.bom, d.eol, d.text], ['utf8', true, 'lf', 'a\nb']);
  const ansi = codec.encode('Şık ğ', { encoding: 'windows-1254' });
  d = codec.decode(ansi);
  assert.deepStrictEqual([d.encoding, d.text], ['windows-1254', 'Şık ğ']);
  d = codec.decode(codec.encode('merhaba', { encoding: 'utf16le', bom: true }));
  assert.deepStrictEqual([d.encoding, d.bom, d.text], ['utf16le', true, 'merhaba']);
  assert.ok(codec.decode(Buffer.from([1, 0, 2, 3])).binary);
  assert.strictEqual(codec.canEncode('Ş', 'windows-1252'), false);
  assert.strictEqual(codec.canEncode('Ş', 'windows-1254'), true);
  // UTF-8 BOM'lu kaydetme
  assert.deepStrictEqual([...codec.encode('a', { encoding: 'utf8', bom: true })], [0xef, 0xbb, 0xbf, 0x61]);
});

test('yerel klasör projesi: aç, çalışma kopyası, kaydet, değişiklik algılama', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'));
  const root = path.join(tmp, 'proje');
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  const file = path.join(root, 'src', 'lib', 'a.js');
  fs.writeFileSync(file, 'let x = 1;\n');
  const s = new ProjectSession({ conn: { id: 'c1', kind: 'local', localPath: root }, cacheDir: path.join(tmp, 'cache') });
  const o = await s.open();
  assert.strictEqual(o.root, root);
  const names = (await s.list(root)).map((e) => e.name);
  assert.deepStrictEqual(names, ['src']);
  const r = await s.read(file);
  assert.strictEqual(r.text, 'let x = 1;\n');
  assert.strictEqual(r.cachePath, path.join(tmp, 'cache', 'c1', 'src', 'lib', 'a.js'));
  assert.strictEqual(fs.readFileSync(r.cachePath, 'utf8'), 'let x = 1;\n');
  // dışarıdan değişti → çakışma
  fs.writeFileSync(file, 'let x = 22;\n');
  const c = await s.save(file, 'let x = 2;\n', { encoding: 'utf8', expect: { size: r.size, mtime: r.mtime } });
  assert.ok(c.conflict);
  const ok = await s.save(file, 'let x = 2;\n', { encoding: 'utf8', force: true });
  assert.ok(ok.ok);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'let x = 2;\n');
  assert.strictEqual(fs.readFileSync(r.cachePath, 'utf8'), 'let x = 2;\n');
  await assert.rejects(s.read(path.join(tmp, 'disarida.txt')));
  s.close();
});
