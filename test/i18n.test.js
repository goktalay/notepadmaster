'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRINGS } = require('../src/i18n');

// Kodda kullanılan her anahtar iki dilde de olmalı; iki sözlüğün anahtarları da aynı olmalı
test('i18n: kullanılan anahtarlar tr ve en sözlüklerinde var', () => {
  const dir = path.join(__dirname, '..', 'src');
  const files = ['main.js', 'remote.js', ...fs.readdirSync(path.join(dir, 'renderer')).filter((f) => f.endsWith('.js')).map((f) => 'renderer/' + f)];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/'((?:auth|tree)\.[\w]+)'/g)) used.add(m[1]);
  }
  for (const k of ['ssh', 'ftp', 'local', 'file']) used.add('kind.' + k).add('kind.' + k + 'Hint');
  for (const k of ['on', 'off', 'connecting']) used.add('proj.status.' + k);
  for (const k of ['ftp', 'ftps-implicit', 'ftps-ssl', 'ftps-tls', 'sftp']) used.add('type.note.' + k);
  const missing = [...used].filter((k) => !k.endsWith('.') && (!(k in STRINGS.tr) || !(k in STRINGS.en)));
  assert.deepStrictEqual(missing, []);
  const trOnly = Object.keys(STRINGS.tr).filter((k) => !(k in STRINGS.en));
  const enOnly = Object.keys(STRINGS.en).filter((k) => !(k in STRINGS.tr));
  assert.deepStrictEqual([trOnly, enOnly], [[], []]);
});

// Mastertool standardı: 8 dil sabit sırayla, hepsinde aynı anahtarlar ve aynı yer tutucular
test('i18n: 8 dil, anahtar ve yer tutucu eşliği', () => {
  const { LANGUAGES } = require('../src/i18n');
  assert.deepStrictEqual(Object.keys(LANGUAGES), ['tr', 'en', 'fr', 'de', 'es', 'ar', 'zh', 'ru']);
  assert.strictEqual(LANGUAGES.ar.dir, 'rtl');
  const keys = Object.keys(STRINGS.en).sort();
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of Object.keys(LANGUAGES)) {
    assert.deepStrictEqual(Object.keys(STRINGS[l]).sort(), keys, l);
    for (const k of keys) assert.strictEqual(ph(STRINGS[l][k]), ph(STRINGS.en[k]), `${l} ${k}`);
  }
});
