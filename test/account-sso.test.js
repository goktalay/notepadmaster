'use strict';

// Ortak oturum (SSO) akışları — sahte /api/np sunucusuyla. Mastertool sözleşmesi: şifreyle girişte sso:true,
// ortak kimlikle şifresiz giriş (/auth/sso), çıkışta ortak kimliği silme ve "out" duyurusu, 401'de tüm ailenin kapanması.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { memoryKeyring, tmpDir } = require('./helpers');

const SALT = 'AAECAwQFBgcICQoLDA0ODw==';
const KDF = { alg: 'PBKDF2-SHA256', iter: 1000, salt: SALT }; // testte hızlı olsun diye az tur
const calls = [];
let reply = {}; // uç → (body) => [status, json]

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ route: req.url, body, auth: req.headers.authorization || '' });
    const h = reply[req.url];
    const [status, json] = h ? h(body) : [404, { code: 'not_found' }];
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(json));
  });
});

let createAccount;
let encKeyFromMaster;
let deriveKeys;

test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.NOTEPADM_API = `http://127.0.0.1:${server.address().port}`;
  ({ createAccount, encKeyFromMaster, deriveKeys } = require('../src/account'));
});
test.after(() => server.close());

const { createSso } = require('../src/sso');

function makeApp(kr, stateDir, events = []) {
  const dir = tmpDir('np-acc-');
  const store = { folders: [], connections: [], settings: {}, syncMeta: {} };
  const sso = createSso({ keyring: kr, stateDir, pollMs: 50 });
  const acc = createAccount({
    userDataDir: dir, appVersion: '1.1.0', sso,
    encrypt: (x) => 'b64:' + Buffer.from(x).toString('base64'),
    decrypt: (x) => Buffer.from(String(x).slice(4), 'base64').toString(),
    getStore: () => store, replaceLibrary: () => {}, persistStore: () => {}, backupAndClearLibrary: () => null,
    onStatus: () => {}, onSessionExpired: (c) => events.push('expired:' + c), onUpdate: () => {},
    onSharedSignIn: () => events.push('sharedIn'), onSharedSignOut: (c) => events.push('sharedOut' + (c ? ':' + c : '')),
  });
  return { acc, sso, events };
}

function serverAccepting() {
  reply = {
    '/api/np/auth/prelogin': () => [200, { kdf: KDF }],
    '/api/np/auth/login': (b) => [200, { token: 'app-tok-1', sso_token: b.sso ? 'sso-tok-1' : undefined, user: { id: 7, email: 'demo@ornek.com', name: 'Demo' }, sync_enabled: true, kdf: KDF }],
    '/api/np/auth/sso': (b) => (b.sso_token === 'sso-tok-1'
      ? [200, { token: 'app-tok-2', user: { id: 7, email: 'demo@ornek.com', name: 'Demo' }, sync_enabled: true, kdf: KDF }]
      : [401, { code: 'session_expired' }]),
    '/api/np/auth/logout': () => [200, { ok: true, sso_ended: true }],
  };
}

test('şifreyle giriş sso:true gönderir, ortak kimliği yazar ve durumu "in" yapar', async () => {
  serverAccepting();
  calls.length = 0;
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const { acc, sso } = makeApp(kr, stateDir);
  await acc.login('Demo@Ornek.com', 'Test1234!', true);
  const login = calls.find((c) => c.route === '/api/np/auth/login');
  assert.equal(login.body.sso, true);
  assert.equal(login.body.password, undefined); // şifre gönderilmez
  const cred = sso.readCredential();
  assert.equal(cred.sso_token, 'sso-tok-1');
  assert.equal(cred.email, 'demo@ornek.com');
  assert.equal(Buffer.from(cred.master, 'base64').length, 32);
  assert.deepEqual(sso.readState().state, 'in');
  // Ortak kimlikteki master, şifreden türetilenle aynı encKey'i verir
  const { encKey } = await deriveKeys('Test1234!', KDF);
  assert.deepEqual(encKeyFromMaster(Buffer.from(cred.master, 'base64')), encKey);
});

test('ikinci uygulama ortak kimlikle şifresiz girer', async () => {
  serverAccepting();
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const a = makeApp(kr, stateDir);
  await a.acc.login('demo@ornek.com', 'Test1234!', true);
  calls.length = 0;
  const b = makeApp(kr, stateDir);
  assert.equal(b.acc.isLoggedIn(), false);
  const r = await b.acc.trySharedSignIn();
  assert.equal(r.ok, true);
  assert.equal(b.acc.isLoggedIn(), true);
  assert.deepEqual(calls.map((c) => c.route), ['/api/np/auth/sso']); // prelogin/şifre yok
  assert.equal(calls[0].body.sso_token, 'sso-tok-1');
});

test('çıkış: sunucuya bildirilir, ortak kimlik silinir, durum "out"; diğer uygulama da kapanır', async () => {
  serverAccepting();
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const a = makeApp(kr, stateDir);
  const b = makeApp(kr, stateDir);
  await a.acc.login('demo@ornek.com', 'Test1234!', true);
  await b.acc.trySharedSignIn();
  b.acc.watchShared();
  calls.length = 0;
  await a.acc.logout();
  assert.ok(calls.some((c) => c.route === '/api/np/auth/logout' && c.auth === 'Bearer app-tok-1'));
  assert.equal(a.sso.readCredential(), null);
  assert.equal(a.sso.readState().state, 'out');
  await new Promise((r) => setTimeout(r, 250)); // izleyici (fs.watch / 50 ms yoklama)
  b.acc.stopWatching();
  assert.equal(b.acc.isLoggedIn(), false);
  assert.deepEqual(b.events, ['sharedOut']);
});

test('başka uygulamada giriş yapılınca giriş ekranındaki uygulama kendiliğinden açılır', async () => {
  serverAccepting();
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const b = makeApp(kr, stateDir);
  b.acc.watchShared();
  const a = makeApp(kr, stateDir);
  await a.acc.login('demo@ornek.com', 'Test1234!', true);
  await new Promise((r) => setTimeout(r, 300));
  b.acc.stopWatching();
  assert.equal(b.acc.isLoggedIn(), true);
  assert.deepEqual(b.events, ['sharedIn']);
});

test('ortak oturum geçersizse (401) ortak kimlik silinir ve durum "out" olur', async () => {
  serverAccepting();
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const { sso, acc } = makeApp(kr, stateDir);
  sso.writeCredential({ email: 'demo@ornek.com', user: { id: 7, name: 'Demo' }, sso_token: 'eski', master: Buffer.alloc(32, 1), kdf: KDF });
  const r = await acc.trySharedSignIn();
  assert.deepEqual([r.ok, r.code], [false, 'session_expired']);
  assert.equal(sso.readCredential(), null);
  assert.equal(sso.readState().state, 'out');
});

test('lisans kapalıysa (403 app_disabled) ortak kimlik korunur, diğer uygulamalar etkilenmez', async () => {
  serverAccepting();
  reply['/api/np/auth/sso'] = () => [403, { code: 'app_disabled' }];
  const kr = memoryKeyring();
  const stateDir = tmpDir('np-st-');
  const { sso, acc } = makeApp(kr, stateDir);
  sso.writeCredential({ email: 'demo@ornek.com', user: { id: 7, name: 'Demo' }, sso_token: 'sso-tok-1', master: Buffer.alloc(32, 1), kdf: KDF });
  const r = await acc.trySharedSignIn();
  assert.deepEqual([r.ok, r.code], [false, 'app_disabled']);
  assert.ok(sso.readCredential());
  assert.equal(acc.isLoggedIn(), false);
});

test('ortak kimlik deposu olmadan da (sso yok) normal giriş çalışır', async () => {
  serverAccepting();
  calls.length = 0;
  const acc = createAccount({
    userDataDir: tmpDir('np-acc-'), appVersion: '1.1.0',
    encrypt: (x) => x, decrypt: (x) => x, getStore: () => ({ folders: [], connections: [], settings: {}, syncMeta: {} }),
    replaceLibrary() {}, persistStore() {}, backupAndClearLibrary: () => null, onStatus() {}, onSessionExpired() {}, onUpdate() {},
  });
  await acc.login('demo@ornek.com', 'Test1234!', false);
  assert.equal(acc.isLoggedIn(), true);
  assert.equal(calls.find((c) => c.route === '/api/np/auth/login').body.sso, false);
  assert.deepEqual(await acc.trySharedSignIn(), { ok: true });
});
