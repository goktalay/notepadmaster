'use strict';

// Metin kodlaması: dosya baytlarını editör metnine çevirir ve kaydederken geri kodlar (Notepad++ "Kodlama" menüsü).
//
//   decode(buf, { encoding, fallback }) → { text, encoding, bom, eol, binary }
//   encode(text, { encoding, bom })     → Buffer
//
// encoding 'auto': BOM varsa ona, yoksa geçerli UTF-8 ise UTF-8'e, değilse ANSI yedeğine (varsayılan Windows-1254) bakar.

const iconv = require('iconv-lite');

const ENCODINGS = ['utf8', 'utf16le', 'utf16be', 'windows-1254', 'windows-1252', 'iso-8859-9', 'iso-8859-1', 'windows-1251', 'windows-1256'];

const BOMS = [
  { enc: 'utf8', bytes: [0xef, 0xbb, 0xbf] },
  { enc: 'utf16le', bytes: [0xff, 0xfe] },
  { enc: 'utf16be', bytes: [0xfe, 0xff] },
];

function sniffBom(buf) {
  for (const b of BOMS) if (buf.length >= b.bytes.length && b.bytes.every((x, i) => buf[i] === x)) return b;
  return null;
}

// Bozuk UTF-8 dizisi yoksa true (ASCII de geçerli UTF-8'dir)
function isUtf8(buf) {
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const c = buf[i];
    if (c < 0x80) { i++; continue; }
    let need;
    if (c >= 0xc2 && c <= 0xdf) need = 1;
    else if (c >= 0xe0 && c <= 0xef) need = 2;
    else if (c >= 0xf0 && c <= 0xf4) need = 3;
    else return false;
    if (i + need >= n) return true; // dosya bir dizinin ortasında bitiyor (kesilmiş): yine de UTF-8 say
    for (let k = 1; k <= need; k++) if ((buf[i + k] & 0xc0) !== 0x80) return false;
    i += need + 1;
  }
  return true;
}

// İlk 8 KB'ta NUL baytı varsa (ve UTF-16 BOM'u yoksa) ikili dosya say
function looksBinary(buf) {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

// Baskın satır sonu: CRLF | LF | CR (hiç yoksa null)
function detectEol(text) {
  let crlf = 0, lf = 0, cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) { if (text.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++; } else if (c === 10) lf++;
  }
  if (!crlf && !lf && !cr) return null;
  if (crlf >= lf && crlf >= cr) return 'crlf';
  return lf >= cr ? 'lf' : 'cr';
}

function normalizeEncoding(e) {
  if (e === 'utf8bom') return 'utf8';
  return ENCODINGS.includes(e) ? e : 'utf8';
}

function decode(buf, { encoding = 'auto', fallback = 'windows-1254' } = {}) {
  const bom = sniffBom(buf);
  if (!bom && looksBinary(buf)) return { binary: true };
  let enc;
  let hasBom = false;
  let body = buf;
  if (encoding === 'auto' || !encoding) {
    if (bom) { enc = bom.enc; hasBom = true; body = buf.subarray(bom.bytes.length); }
    else enc = isUtf8(buf) ? 'utf8' : normalizeEncoding(fallback);
  } else {
    enc = normalizeEncoding(encoding);
    if (bom && bom.enc === enc) { hasBom = true; body = buf.subarray(bom.bytes.length); }
    else if (encoding === 'utf8bom') hasBom = true; // kaydederken BOM eklenir
  }
  const text = iconv.decode(body, enc, { stripBOM: false });
  return { text, encoding: enc, bom: hasBom, eol: detectEol(text), binary: false };
}

function encode(text, { encoding = 'utf8', bom = false } = {}) {
  const enc = normalizeEncoding(encoding);
  const body = iconv.encode(text, enc, { addBOM: false });
  if (!bom) return body;
  const b = BOMS.find((x) => x.enc === enc);
  return b ? Buffer.concat([Buffer.from(b.bytes), body]) : body;
}

// Metin bu kodlamada kayıpsız saklanabilir mi (ör. Türkçe metin Windows-1252'de "?" olur)
function canEncode(text, encoding) {
  const enc = normalizeEncoding(encoding);
  if (enc.startsWith('utf')) return true;
  return iconv.decode(iconv.encode(text, enc), enc) === text;
}

module.exports = { decode, encode, canEncode, detectEol, isUtf8, looksBinary, ENCODINGS };
