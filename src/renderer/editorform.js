'use strict';

// Editör ayarları formu (Notepad++ "Tercihler"in karşılığı). Ayarlar penceresinde genel varsayılanlar için,
// bağlantı formunda da bağlantıya özel ayarlar için kullanılır.
//
//   const f = editorForm(values); f.el (DOM), f.read() → nesne, f.setDisabled(bool), f.setValues(v)

function editorForm(values) {
  const v = NPDEF.sanitizeEditor(values);
  const opt = (list, cur) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const encs = NPDEF.ENCODINGS;
  const ansi = encs.filter(([k]) => !k.startsWith('utf'));
  const eols = [['crlf', 'Windows (CR LF)'], ['lf', 'Unix (LF)'], ['cr', 'Macintosh (CR)']];
  const check = (id, key, label, hint = '') =>
    `<label class="check"><input type="checkbox" data-k="${key}" id="${id}" ${v[key] ? 'checked' : ''}><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;

  const el = h(`<div class="ed-form">
    <div class="ed-sec">${icon('layers')}<span>${esc(t('ed.secEncoding'))}</span></div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('ed.encoding'))}</label><select class="input" data-k="encoding">${opt([['auto', t('ed.encAuto')], ...encs], v.encoding)}</select></div>
      <div class="field"><label>${esc(t('ed.fallback'))}</label><select class="input" data-k="fallbackEncoding">${opt(ansi, v.fallbackEncoding)}</select></div>
    </div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('ed.eol'))}</label><select class="input" data-k="eol">${opt([['auto', t('ed.eolAuto')], ...eols.map(([k, l]) => [k, t('ed.eolConvert', { eol: l })])], v.eol)}</select></div>
      <div class="field"><label>${esc(t('ed.newDoc'))}</label>
        <div class="row c-1-1" style="gap:8px"><select class="input" data-k="newEncoding">${opt(encs, v.newEncoding)}</select><select class="input" data-k="newEol">${opt(eols, v.newEol)}</select></div></div>
    </div>

    <div class="ed-sec">${icon('code')}<span>${esc(t('ed.secIndent'))}</span></div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('ed.tabSize'))}</label><input class="input" type="number" min="1" max="16" data-k="tabSize" value="${esc(v.tabSize)}"></div>
      <div class="field"><label>${esc(t('ed.language'))}</label><select class="input" data-k="language">${opt([['auto', t('ed.langAuto')], ...NPDEF.LANGUAGES], v.language)}</select></div>
    </div>
    <div class="ed-checks">
      ${check('e-spaces', 'insertSpaces', t('ed.insertSpaces'))}
      ${check('e-detect', 'detectIndentation', t('ed.detectIndent'), t('ed.detectIndentHint'))}
      ${check('e-autoind', 'autoIndent', t('ed.autoIndent'))}
      ${check('e-close', 'autoClose', t('ed.autoClose'))}
    </div>

    <div class="ed-sec">${icon('palette')}<span>${esc(t('ed.secLook'))}</span></div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('ed.theme'))}</label><select class="input" data-k="theme">${opt([['auto', t('ed.themeAuto')], ...NPDEF.THEMES], v.theme)}</select></div>
      <div class="field"><label>${esc(t('ed.whitespace'))}</label><select class="input" data-k="renderWhitespace">${opt([
        ['none', t('ed.wsNone')], ['boundary', t('ed.wsBoundary')], ['trailing', t('ed.wsTrailing')], ['all', t('ed.wsAll')]], v.renderWhitespace)}</select></div>
    </div>
    <div class="row ed-font">
      <div class="field"><label>${esc(t('ed.font'))}</label><input class="input" data-k="fontFamily" value="${esc(v.fontFamily)}" spellcheck="false"></div>
      <div class="field"><label>${esc(t('ed.fontSize'))}</label><input class="input" type="number" min="6" max="48" data-k="fontSize" value="${esc(v.fontSize)}"></div>
      <div class="field"><label>${esc(t('ed.rulers'))}</label><input class="input" data-k="rulers" value="${esc(v.rulers)}" placeholder="80,120" spellcheck="false"></div>
    </div>
    <div class="ed-checks">
      ${check('e-wrap', 'wordWrap', t('ed.wordWrap'))}
      ${check('e-lines', 'lineNumbers', t('ed.lineNumbers'))}
      ${check('e-hl', 'highlightLine', t('ed.highlightLine'))}
      ${check('e-smart', 'smartHighlight', t('ed.smartHighlight'))}
      ${check('e-guides', 'indentGuides', t('ed.indentGuides'))}
      ${check('e-fold', 'folding', t('ed.folding'))}
      ${check('e-brackets', 'bracketColors', t('ed.bracketColors'))}
      ${check('e-minimap', 'minimap', t('ed.minimap'))}
      ${check('e-ctrl', 'renderControlChars', t('ed.controlChars'))}
    </div>

    <div class="ed-sec">${icon('save')}<span>${esc(t('ed.secSave'))}</span></div>
    <div class="ed-checks">
      ${check('e-trim', 'trimTrailing', t('ed.trimTrailing'))}
      ${check('e-final', 'finalNewline', t('ed.finalNewline'))}
      ${check('e-remote', 'checkRemoteChange', t('ed.checkRemote'), t('ed.checkRemoteHint'))}
    </div>
    <div class="row c-1-1">
      <div class="field"><label>${esc(t('ed.autoSave'))}</label>
        <div class="unit-wrap"><input class="input" type="number" min="0" max="3600" data-k="autoSave" value="${esc(v.autoSave)}"><span>${esc(t('ed.sec'))}</span></div>
        <small class="hint">${esc(t('ed.autoSaveHint'))}</small></div>
    </div>
  </div>`);

  const fields = () => [...el.querySelectorAll('[data-k]')];

  function read() {
    const out = {};
    for (const f of fields()) {
      const k = f.dataset.k;
      if (f.type === 'checkbox') out[k] = f.checked;
      else if (f.type === 'number') out[k] = Number(f.value);
      else out[k] = f.value;
    }
    return NPDEF.sanitizeEditor(out);
  }

  function setValues(nv) {
    const s = NPDEF.sanitizeEditor(nv);
    for (const f of fields()) {
      const k = f.dataset.k;
      if (f.type === 'checkbox') f.checked = !!s[k];
      else f.value = s[k];
    }
  }

  function setDisabled(on) {
    el.classList.toggle('disabled', on);
    for (const f of fields()) f.disabled = on;
  }

  return { el, read, setValues, setDisabled };
}
