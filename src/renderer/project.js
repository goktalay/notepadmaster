'use strict';

// Proje penceresi: solda klasör ağacı, sağda sekmeli Monaco editörü.
// Dosya açılınca içerik sunucudan indirilip çalışma kopyasına yazılır (ana süreç); kaydedince sunucuya yüklenir
// ve çalışma kopyası güncellenir. Editör ayarları bağlantının (ya da genel) Notepad++ ayarlarından gelir.

const $ = (s) => document.querySelector(s);
const connId = new URLSearchParams(location.search).get('id');

let data = { connections: [], settings: {} };
let conn = null;           // bu pencerenin bağlantısı (şifresiz kopya)
let root = '';             // proje kökü
let sep = '/';
let monaco = null;
let editor = null;
let tree = null;
let opened = false;        // proj:open başarılı mı
const tabs = [];           // { path, name, model, view, encoding, bom, eol, savedAlt, metaDirty, mtime, size, saving, langForced }
let active = null;
const overrides = {};      // pencere oturumuna özel geçişler (araç çubuğu: kaydırma, boşluklar, mini harita, yakınlaştırma)
let zoom = 0;

const isRemote = () => conn && (conn.kind === 'ssh' || conn.kind === 'ftp');
const cleanErr = (err) => String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;
const EOL_LABEL = { crlf: 'Windows (CR LF)', lf: 'Unix (LF)', cr: 'Macintosh (CR)' };
const encLabel = (enc, bom) => {
  if (enc === 'utf8') return bom ? 'UTF-8 BOM' : 'UTF-8';
  const e = NPDEF.ENCODINGS.find((x) => x[0] === enc);
  return e ? e[1].replace(/ —.*| \(.*/, '') : enc;
};

// Geçerli editör ayarları: bağlantıya özel ya da genel + bu penceredeki geçişler
const eff = () => ({ ...NPDEF.effectiveEditor(conn, data.settings), ...overrides });

// ---------------------------------------------------------------------------
// Üst çubuk ve araç çubuğu
// ---------------------------------------------------------------------------
const setBtn = (el, ic, title) => { el.innerHTML = icon(ic); el.title = title; };
setBtn($('#btnTree'), 'sidebar', t('proj.toggleTree'));
setBtn($('#btnSettings'), 'gear', t('app.settings'));
$('#btnReconnect').innerHTML = icon('reconnect') + esc(t('proj.reconnect'));
$('#btnReconnect').classList.add('hidden');
const paintThemeBtn = themeButton($('#btnTheme'), () => data.settings || {});
mountMastertool($('.bar-actions'));
$('#btnSettings').onclick = () => openSettings(data.settings || {});
$('#btnTree').onclick = () => toggleTree();
$('#btnReconnect').onclick = () => reconnect();

const TOOLS = [
  { a: 'newFile', ic: 'filePlus', tip: () => t('tree.newFile') + ' (Ctrl+N)' },
  { a: 'save', ic: 'save', tip: () => t('proj.save') + ' (Ctrl+S)' },
  { a: 'saveAll', ic: 'saveAll', tip: () => t('proj.saveAll') + ' (Ctrl+Shift+S)' },
  '-',
  { a: 'undo', ic: 'undo', tip: () => t('proj.undo') + ' (Ctrl+Z)' },
  { a: 'redo', ic: 'redo', tip: () => t('proj.redo') + ' (Ctrl+Y)' },
  '-',
  { a: 'find', ic: 'search', tip: () => t('proj.find') + ' (Ctrl+F)' },
  { a: 'replace', ic: 'replace', tip: () => t('proj.replace') + ' (Ctrl+H)' },
  { a: 'goto', ic: 'crosshair', tip: () => t('proj.goto') + ' (Ctrl+G)' },
  '-',
  { a: 'wrap', ic: 'wrap', tip: () => t('ed.wordWrap') + ' (Alt+Z)', toggle: 'wordWrap' },
  { a: 'ws', ic: 'pilcrow', tip: () => t('proj.showWs'), toggle: 'renderWhitespace' },
  { a: 'minimap', ic: 'map', tip: () => t('ed.minimap'), toggle: 'minimap' },
  '-',
  { a: 'zoomOut', ic: 'zoomOut', tip: () => t('proj.zoomOut') + ' (Ctrl+-)' },
  { a: 'zoomIn', ic: 'zoomIn', tip: () => t('proj.zoomIn') + ' (Ctrl+=)' },
  '-',
  { a: 'cache', ic: 'layers', tip: () => t('proj.showCache') },
];
for (const it of TOOLS) {
  if (it === '-') { $('#toolbar').appendChild(h('<span class="tb-sep"></span>')); continue; }
  const b = h(`<button class="icon-btn" data-a="${it.a}" title="${esc(it.tip())}">${icon(it.ic)}</button>`);
  b.onclick = () => runTool(it.a);
  $('#toolbar').appendChild(b);
}

function paintToolbar() {
  const e = eff();
  const on = { wrap: e.wordWrap, ws: e.renderWhitespace === 'all', minimap: e.minimap };
  for (const [a, v] of Object.entries(on)) $(`#toolbar [data-a=${a}]`).classList.toggle('active', !!v);
  const tab = active;
  $('#toolbar [data-a=save]').disabled = !tab || !isDirty(tab);
  $('#toolbar [data-a=saveAll]').disabled = !tabs.some(isDirty);
  for (const a of ['undo', 'redo', 'find', 'replace', 'goto']) $(`#toolbar [data-a=${a}]`).disabled = !tab;
}

function runTool(a) {
  const e = eff();
  switch (a) {
    case 'newFile': return newFileIn(tree ? tree.targetDir() : root);
    case 'save': return active && saveTab(active);
    case 'saveAll': return saveAll();
    case 'undo': return editor && (editor.focus(), editor.trigger('toolbar', 'undo'));
    case 'redo': return editor && (editor.focus(), editor.trigger('toolbar', 'redo'));
    case 'find': return editor && (editor.focus(), editor.getAction('actions.find').run());
    case 'replace': return editor && (editor.focus(), editor.getAction('editor.action.startFindReplaceAction').run());
    case 'goto': return editor && (editor.focus(), editor.getAction('editor.action.gotoLine').run());
    case 'wrap': overrides.wordWrap = !e.wordWrap; break;
    case 'ws': overrides.renderWhitespace = e.renderWhitespace === 'all' ? 'none' : 'all'; break;
    case 'minimap': overrides.minimap = !e.minimap; break;
    case 'zoomIn': zoom = Math.min(zoom + 1, 20); break;
    case 'zoomOut': zoom = Math.max(zoom - 1, -8); break;
    case 'zoomReset': zoom = 0; break;
    case 'cache': return window.api.projRevealCache(active ? active.path : null);
  }
  applyEditorOptions();
}

// ---------------------------------------------------------------------------
// Ağaç paneli: genişlik ve aç/kapa (cihaza özgü görünüm ayarı)
// ---------------------------------------------------------------------------
function toggleTree(open) {
  const col = $('#colTree');
  const now = open ?? col.classList.contains('closed');
  col.classList.toggle('closed', !now);
  $('#splitTree').classList.toggle('hidden', !now);
  $('#btnTree').classList.toggle('active', now);
  window.api.setSettings({ treeOpen: now });
  if (editor) editor.layout();
}

(function splitter() {
  const sp = $('#splitTree');
  const col = $('#colTree');
  sp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = col.getBoundingClientRect().width;
    const rtl = document.documentElement.dir === 'rtl';
    sp.classList.add('active');
    document.body.classList.add('resizing-col');
    const move = (ev) => {
      const dx = (ev.clientX - startX) * (rtl ? -1 : 1);
      col.style.width = Math.max(160, Math.min(700, startW + dx)) + 'px';
      if (editor) editor.layout();
    };
    const up = () => {
      sp.classList.remove('active');
      document.body.classList.remove('resizing-col');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.api.setSettings({ treeWidth: Math.round(col.getBoundingClientRect().width) });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
})();

// ---------------------------------------------------------------------------
// Bağlantı durumu
// ---------------------------------------------------------------------------
function setStatus(st) {
  $('#dot').className = 'status-dot ' + (st === 'on' ? 'on' : st === 'off' ? 'off' : '');
  $('#dot').title = t('proj.status.' + st);
  $('#btnReconnect').classList.toggle('hidden', st !== 'off' || !isRemote());
}
window.api.onProjStatus(setStatus);

async function reconnect() {
  setStatus('connecting');
  try {
    await window.api.projReconnect();
    toast(t('proj.reconnected'), { type: 'ok' });
    if (tree) tree.refresh(root);
  } catch (err) {
    setStatus('off');
    toast(t('proj.connectFail'), { type: 'err', sub: cleanErr(err), timeout: 8000 });
  }
}

// ---------------------------------------------------------------------------
// Sekmeler
// ---------------------------------------------------------------------------
const isDirty = (tab) => tab.metaDirty || (tab.model && tab.model.getAlternativeVersionId() !== tab.savedAlt);

function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML = '';
  for (const tab of tabs) {
    const dirty = isDirty(tab);
    const el = h(`<div class="tab ${tab === active ? 'on' : ''} ${dirty ? 'dirty' : ''}" title="${esc(tab.path)}">
      <span class="tab-ico">${icon('fileCode')}</span><span class="tab-name">${esc(tab.name)}</span>
      ${tab.saving ? '<span class="spin"></span>' : `<button class="tab-x" title="${esc(t('proj.closeTab'))} (Ctrl+W)">${icon('x')}${icon('dot', 'dot')}</button>`}
    </div>`);
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(tab); return; }
      if (e.button === 0 && !e.target.closest('.tab-x')) activate(tab);
    });
    el.querySelector('.tab-x')?.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: t('proj.save'), icon: 'save', kbd: 'Ctrl+S', disabled: !dirty, action: () => saveTab(tab) },
        { label: t('proj.reload'), icon: 'refresh', action: () => reloadTab(tab) },
        '-',
        { label: t('proj.closeTab'), icon: 'x', kbd: 'Ctrl+W', action: () => closeTab(tab) },
        { label: t('proj.closeOthers'), action: () => closeMany(tabs.filter((x) => x !== tab)) },
        { label: t('proj.closeAll'), action: () => closeMany([...tabs]) },
        '-',
        { label: t('common.copyPath'), icon: 'copy', action: () => window.api.clipboardWrite(tab.path) },
        conn.kind !== 'file' ? { label: t('proj.revealTree'), icon: 'sidebar', action: () => { toggleTree(true); tree.reveal(tab.path); } } : null,
        { label: t('proj.showCache'), icon: 'layers', action: () => window.api.projRevealCache(tab.path) },
      ]);
    });
    bar.appendChild(el);
  }
  const tabEl = bar.querySelector('.tab.on');
  if (tabEl) tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#empty').classList.toggle('hidden', !!active);
  $('#editor').classList.toggle('hidden', !active);
  document.title = `${active ? (isDirty(active) ? '● ' : '') + active.name + ' — ' : ''}${conn ? conn.name : ''} — Notepad Master`;
  paintToolbar();
  paintStatus();
  if (tree) tree.render();
}

function persistTabs() {
  window.api.projTabs(tabs.map((x) => x.path), active ? active.path : null);
}

function activate(tab) {
  if (active === tab) return;
  if (active && editor) active.view = editor.saveViewState();
  active = tab;
  if (tab && editor) {
    editor.setModel(tab.model);
    if (tab.view) editor.restoreViewState(tab.view);
    applyEditorOptions();
    editor.focus();
  }
  renderTabs();
  persistTabs();
}

async function closeTab(tab, { ask = true } = {}) {
  if (ask && isDirty(tab)) {
    const choice = await openModal({
      title: t('proj.unsavedTitle'), iconName: 'save',
      body: `<div style="color:var(--text-2);line-height:1.5">${t('proj.unsavedMsg', { name: esc(tab.name) })}</div>`,
      buttons: [
        { label: t('proj.dontSave'), value: 'discard', left: true },
        { label: t('common.cancel'), value: null },
        { label: t('proj.save'), cls: 'primary', value: 'save' },
      ],
    });
    if (!choice) return false;
    if (choice === 'save' && !(await saveTab(tab))) return false;
  }
  const i = tabs.indexOf(tab);
  if (i < 0) return true;
  tabs.splice(i, 1);
  if (active === tab) {
    active = null;
    const next = tabs[i] || tabs[i - 1] || null;
    if (next) activate(next);
    else if (editor) editor.setModel(null);
  }
  tab.model.dispose();
  clearTimeout(tab.autoTimer);
  renderTabs();
  persistTabs();
  return true;
}

async function closeMany(list) {
  for (const tab of list) if (!(await closeTab(tab))) return;
}

// ---------------------------------------------------------------------------
// Dil algılama (uzantı, dosya adı, ilk satır) — Notepad++ "Dil" menüsü
// ---------------------------------------------------------------------------
let extMap = null;
function languageFor(path, firstLine) {
  if (!extMap) {
    extMap = { ext: new Map(), name: new Map() };
    for (const l of monaco.languages.getLanguages()) {
      for (const e of l.extensions || []) if (!extMap.ext.has(e.toLowerCase())) extMap.ext.set(e.toLowerCase(), l.id);
      for (const f of l.filenames || []) extMap.name.set(f.toLowerCase(), l.id);
    }
    // Monaco'da ayrı kaydı olmayan yaygın uzantılar
    for (const [e, id] of [['.conf', 'ini'], ['.cfg', 'ini'], ['.env', 'ini'], ['.htaccess', 'ini'], ['.tpl', 'html'], ['.vue', 'html'], ['.phtml', 'php'], ['.inc', 'php'], ['.zsh', 'shell'], ['.bash', 'shell'], ['.log', 'plaintext']]) {
      if (!extMap.ext.has(e)) extMap.ext.set(e, id);
    }
    for (const [n, id] of [['.htaccess', 'ini'], ['.env', 'ini'], ['.bashrc', 'shell'], ['.profile', 'shell'], ['makefile', 'plaintext'], ['nginx.conf', 'ini']]) extMap.name.set(n, id);
  }
  const name = baseName(path).toLowerCase();
  if (extMap.name.has(name)) return extMap.name.get(name);
  // ".blade.php" gibi çok parçalı uzantılar: en uzun eşleşme
  const parts = name.split('.');
  for (let i = 1; i < parts.length; i++) {
    const ext = '.' + parts.slice(i).join('.');
    if (extMap.ext.has(ext)) return extMap.ext.get(ext);
  }
  const l = firstLine || '';
  if (/^#!.*\b(ba|z|k)?sh\b/.test(l)) return 'shell';
  if (/^#!.*\bpython/.test(l)) return 'python';
  if (/^#!.*\b(node|deno)\b/.test(l)) return 'javascript';
  if (/^#!.*\bperl\b/.test(l)) return 'perl';
  if (/^#!.*\bruby\b/.test(l)) return 'ruby';
  if (/^<\?php/.test(l)) return 'php';
  if (/^<\?xml/.test(l)) return 'xml';
  if (/^<!doctype html/i.test(l)) return 'html';
  return 'plaintext';
}

const languageName = (id) => {
  const l = monaco.languages.getLanguages().find((x) => x.id === id);
  return (l && l.aliases && l.aliases[0]) || id;
};

// ---------------------------------------------------------------------------
// Dosya açma
// ---------------------------------------------------------------------------
function modelUri(path) {
  return monaco.Uri.from({ scheme: 'np', path: '/' + encodeURIComponent(path) });
}

async function openFile(path, { activateTab = true, isNew = false } = {}) {
  const existing = tabs.find((x) => x.path === path);
  if (existing) { if (activateTab) activate(existing); return existing; }
  const e = eff();
  let r;
  try {
    r = await window.api.projRead(path, e.encoding, e.fallbackEncoding);
  } catch (err) {
    toast(t('proj.openFail', { name: baseName(path) }), { type: 'err', sub: cleanErr(err), timeout: 8000 });
    return null;
  }
  if (r.tooLarge) { toast(t('proj.tooLarge', { name: baseName(path), size: formatSize(r.size) }), { type: 'err', timeout: 8000 }); return null; }
  if (r.binary) { toast(t('proj.binary', { name: baseName(path) }), { type: 'err', sub: r.cachePath, timeout: 8000 }); return null; }

  // Boş (yeni) dosyalar "yeni belge" kodlaması ve satır sonuyla başlar
  let { encoding, bom, eol } = r;
  if (!r.text.length && (isNew || e.encoding === 'auto')) {
    encoding = e.newEncoding === 'utf8bom' ? 'utf8' : e.newEncoding;
    bom = e.newEncoding === 'utf8bom' || e.newEncoding.startsWith('utf16');
  }
  if (!eol) eol = e.newEol;
  let metaDirty = false;
  if (e.eol !== 'auto' && eol !== e.eol) { eol = e.eol; metaDirty = !!r.text.length; } // ayarda zorlanan satır sonu: açılışta dönüştür

  const firstLine = r.text.slice(0, 200).split(/\r?\n|\r/)[0];
  const langForced = e.language !== 'auto';
  const lang = langForced ? e.language : languageFor(path, firstLine);
  const old = monaco.editor.getModel(modelUri(path));
  if (old) old.dispose();
  const model = monaco.editor.createModel(r.text, lang, modelUri(path));
  model.setEOL(eol === 'crlf' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  const tab = {
    path, name: baseName(path), model, view: null, encoding, bom, eol, metaDirty, langForced,
    savedAlt: model.getAlternativeVersionId(), mtime: r.mtime, size: r.size, cachePath: r.cachePath,
  };
  applyModelOptions(tab);
  model.onDidChangeContent(() => { onContentChange(tab); });
  tabs.push(tab);
  if (activateTab || !active) activate(tab); else renderTabs();
  persistTabs();
  return tab;
}

async function reloadTab(tab, encoding) {
  if (isDirty(tab)) {
    const ok = await confirmBox(t('proj.reload'), t('proj.reloadMsg', { name: esc(tab.name) }), { okText: t('proj.reload') });
    if (!ok) return;
  }
  const e = eff();
  let r;
  try {
    r = await window.api.projRead(tab.path, encoding || (tab.encoding === 'utf8' && tab.bom ? 'utf8bom' : tab.encoding), e.fallbackEncoding);
  } catch (err) {
    toast(t('proj.openFail', { name: tab.name }), { type: 'err', sub: cleanErr(err), timeout: 8000 });
    return;
  }
  if (r.binary || r.tooLarge) return toast(t('proj.binary', { name: tab.name }), { type: 'err' });
  tab.model.setValue(r.text);
  tab.model.setEOL(tab.eol === 'crlf' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
  Object.assign(tab, { encoding: r.encoding, bom: r.bom, mtime: r.mtime, size: r.size, metaDirty: false, savedAlt: tab.model.getAlternativeVersionId() });
  renderTabs();
}

function onContentChange(tab) {
  renderTabsSoon();
  const sec = eff().autoSave;
  if (sec > 0) {
    clearTimeout(tab.autoTimer);
    tab.autoTimer = setTimeout(() => { if (isDirty(tab) && tabs.includes(tab)) saveTab(tab, { auto: true }); }, sec * 1000);
  }
}

let tabsTimer = null;
function renderTabsSoon() {
  if (tabsTimer) return;
  tabsTimer = requestAnimationFrame(() => { tabsTimer = null; renderTabs(); });
}

// ---------------------------------------------------------------------------
// Kaydetme: (sondaki boşlukları sil / son satır sonu) → kodla → sunucuya yükle → çalışma kopyasını güncelle
// ---------------------------------------------------------------------------
function applySaveTransforms(tab) {
  const e = eff();
  const model = tab.model;
  const edits = [];
  if (e.trimTrailing) {
    for (let ln = 1; ln <= model.getLineCount(); ln++) {
      const text = model.getLineContent(ln);
      const m = /[ \t]+$/.exec(text);
      if (m) edits.push({ range: new monaco.Range(ln, m.index + 1, ln, text.length + 1), text: '' });
    }
  }
  if (e.finalNewline) {
    const last = model.getLineCount();
    if (model.getLineContent(last).length) edits.push({ range: new monaco.Range(last, model.getLineMaxColumn(last), last, model.getLineMaxColumn(last)), text: model.getEOL() });
  }
  if (edits.length) model.pushEditOperations(editor && editor.getModel() === model ? editor.getSelections() : [], edits, () => null);
}

function textForSave(tab) {
  const lf = tab.model.getValue(monaco.editor.EndOfLinePreference.LF);
  if (tab.eol === 'crlf') return lf.replace(/\n/g, '\r\n');
  if (tab.eol === 'cr') return lf.replace(/\n/g, '\r');
  return lf;
}

async function saveTab(tab, { auto = false, force = false, allowLossy = false } = {}) {
  if (tab.saving) return false;
  if (!force && !allowLossy) applySaveTransforms(tab);
  const alt = tab.model.getAlternativeVersionId();
  const e = eff();
  tab.saving = true;
  renderTabs();
  let res;
  try {
    res = await window.api.projSave({
      path: tab.path, text: textForSave(tab), encoding: tab.encoding, bom: tab.bom,
      expect: e.checkRemoteChange ? { size: tab.size, mtime: tab.mtime } : null, force, allowLossy,
    });
  } catch (err) {
    tab.saving = false;
    renderTabs();
    toast(t('proj.saveFail', { name: tab.name }), { type: 'err', sub: cleanErr(err), timeout: 10000 });
    return false;
  }
  tab.saving = false;
  if (res.lossy) {
    renderTabs();
    const ok = await confirmBox(t('proj.lossyTitle'), t('proj.lossyMsg', { enc: esc(encLabel(tab.encoding, tab.bom)) }), { okText: t('proj.saveAnyway') });
    return ok ? saveTab(tab, { force, allowLossy: true }) : false;
  }
  if (res.conflict) {
    renderTabs();
    if (auto) { toast(t('proj.conflictAuto', { name: tab.name }), { type: 'err', timeout: 8000 }); return false; }
    const choice = await openModal({
      title: t('proj.conflictTitle'), iconName: 'info',
      body: `<div style="color:var(--text-2);line-height:1.5">${t('proj.conflictMsg', { name: esc(tab.name) })}</div>`,
      buttons: [
        { label: t('proj.conflictReload'), value: 'reload', left: true },
        { label: t('common.cancel'), value: null },
        { label: t('proj.conflictOverwrite'), cls: 'primary danger-primary', value: 'overwrite' },
      ],
    });
    if (choice === 'overwrite') return saveTab(tab, { force: true, allowLossy });
    if (choice === 'reload') { tab.metaDirty = false; tab.savedAlt = tab.model.getAlternativeVersionId(); await reloadTab(tab); }
    return false;
  }
  Object.assign(tab, { savedAlt: alt, metaDirty: false, mtime: res.mtime, size: res.size, cachePath: res.cachePath });
  renderTabs();
  if (!auto) toast(isRemote() ? t('proj.savedRemote', { name: tab.name }) : t('proj.saved', { name: tab.name }), { type: 'ok', timeout: 2200 });
  return true;
}

async function saveAll() {
  for (const tab of tabs.filter(isDirty)) if (!(await saveTab(tab))) return;
}

// ---------------------------------------------------------------------------
// Editör seçenekleri
// ---------------------------------------------------------------------------
function applyModelOptions(tab) {
  const e = eff();
  tab.model.updateOptions({ tabSize: e.tabSize, indentSize: e.tabSize, insertSpaces: e.insertSpaces, trimAutoWhitespace: true });
  if (e.detectIndentation) tab.model.detectIndentation(e.insertSpaces, e.tabSize);
}

function applyEditorOptions() {
  if (!editor) return;
  const e = eff();
  monaco.editor.setTheme(resolveTheme(e.theme));
  const rulers = String(e.rulers || '').split(/[,\s]+/).map(Number).filter((n) => n > 0 && n < 1000);
  editor.updateOptions({
    fontFamily: e.fontFamily,
    fontSize: Math.max(6, e.fontSize + zoom),
    lineHeight: e.lineHeight || 0,
    wordWrap: e.wordWrap ? 'on' : 'off',
    renderWhitespace: e.renderWhitespace,
    renderControlCharacters: e.renderControlChars,
    lineNumbers: e.lineNumbers ? 'on' : 'off',
    minimap: { enabled: e.minimap },
    renderLineHighlight: e.highlightLine ? 'all' : 'none',
    guides: { indentation: e.indentGuides, bracketPairs: e.bracketColors ? 'active' : false },
    bracketPairColorization: { enabled: e.bracketColors },
    folding: e.folding,
    autoIndent: e.autoIndent ? 'full' : 'none',
    autoClosingBrackets: e.autoClose ? 'languageDefined' : 'never',
    autoClosingQuotes: e.autoClose ? 'languageDefined' : 'never',
    occurrencesHighlight: e.smartHighlight ? 'singleFile' : 'off',
    selectionHighlight: e.smartHighlight,
    rulers,
  });
  $('#stZoom').textContent = zoom ? `${Math.round(((e.fontSize + zoom) / e.fontSize) * 100)}%` : '';
  paintToolbar();
}

// Ayarlar değişince (bu pencerede, ana pencerede ya da senkronla) tüm sekmelere uygula
function onSettingsChanged() {
  for (const tab of tabs) {
    applyModelOptions(tab);
    if (!tab.langForced && eff().language !== 'auto') monaco.editor.setModelLanguage(tab.model, eff().language);
  }
  applyEditorOptions();
}

// ---------------------------------------------------------------------------
// Durum çubuğu: Ln/Col, girinti, kodlama, satır sonu, dil (tıklanınca değiştirilir)
// ---------------------------------------------------------------------------
function paintStatus() {
  const tab = active;
  for (const id of ['#stIndent', '#stEnc', '#stEol', '#stLang', '#stPos']) $(id).classList.toggle('hidden', !tab);
  $('#stPath').textContent = tab ? tab.path : '';
  $('#stPath').title = tab ? `${tab.path}\n${t('proj.cacheCopy')}: ${tab.cachePath || ''}` : '';
  if (!tab) return;
  const o = tab.model.getOptions();
  $('#stIndent').textContent = o.insertSpaces ? t('proj.spaces', { n: o.tabSize }) : t('proj.tabWidth', { n: o.tabSize });
  $('#stEnc').textContent = encLabel(tab.encoding, tab.bom);
  $('#stEol').textContent = { crlf: 'CRLF', lf: 'LF', cr: 'CR' }[tab.eol];
  $('#stEol').title = EOL_LABEL[tab.eol];
  $('#stLang').textContent = languageName(tab.model.getLanguageId());
  paintPos();
}

function paintPos() {
  if (!editor || !active) return;
  const p = editor.getPosition();
  if (!p) return;
  const sel = editor.getSelection();
  const n = sel && !sel.isEmpty() ? active.model.getValueInRange(sel).length : 0;
  $('#stPos').textContent = t('proj.pos', { ln: p.lineNumber, col: p.column }) + (n ? ` (${t('proj.sel', { n })})` : '');
}

const menuAt = (el, items) => { const r = el.getBoundingClientRect(); contextMenu(r.left, r.top - 8 - Math.min(items.length * 32, 420), items); };

$('#stPos').onclick = () => runTool('goto');
$('#stIndent').onclick = (ev) => {
  const tab = active;
  if (!tab) return;
  const set = (insertSpaces, tabSize) => { tab.model.updateOptions({ insertSpaces, tabSize, indentSize: tabSize }); paintStatus(); };
  menuAt(ev.currentTarget, [
    ...[2, 4, 8].map((n) => ({ label: t('proj.spaces', { n }), action: () => set(true, n) })),
    '-',
    ...[2, 4, 8].map((n) => ({ label: t('proj.tabWidth', { n }), action: () => set(false, n) })),
    '-',
    { label: t('proj.indentToSpaces'), action: () => { editor.focus(); editor.getAction('editor.action.indentationToSpaces').run(); } },
    { label: t('proj.indentToTabs'), action: () => { editor.focus(); editor.getAction('editor.action.indentationToTabs').run(); } },
  ]);
};
$('#stEnc').onclick = async () => {
  const tab = active;
  if (!tab) return;
  const list = NPDEF.ENCODINGS;
  const body = h(`<div style="display:grid;gap:14px">
    <div class="field"><label>${esc(t('proj.encConvert'))}</label><select class="input" id="en-to">${list.map(([k, l]) => `<option value="${k}" ${k === (tab.encoding === 'utf8' && tab.bom ? 'utf8bom' : tab.encoding) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <small class="hint">${esc(t('proj.encConvertHint'))}</small></div>
    <div class="field"><label>${esc(t('proj.encReopen'))}</label><select class="input" id="en-re"><option value="">—</option>${list.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <small class="hint">${esc(t('proj.encReopenHint'))}</small></div>
  </div>`);
  const res = await openModal({
    title: t('proj.encTitle', { name: tab.name }), iconName: 'layers', body,
    buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'primary', onClick: (m) => ({ to: m.querySelector('#en-to').value, re: m.querySelector('#en-re').value }) }],
  });
  if (!res) return;
  if (res.re) return reloadTab(tab, res.re);
  const enc = res.to === 'utf8bom' ? 'utf8' : res.to;
  const bom = res.to === 'utf8bom' || res.to.startsWith('utf16');
  if (enc !== tab.encoding || bom !== tab.bom) { Object.assign(tab, { encoding: enc, bom, metaDirty: true }); renderTabs(); }
};
$('#stEol').onclick = (ev) => {
  const tab = active;
  if (!tab) return;
  const set = (eol) => {
    if (eol === tab.eol) return;
    tab.eol = eol;
    tab.model.pushEOL(eol === 'crlf' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
    tab.metaDirty = true;
    renderTabs();
  };
  menuAt(ev.currentTarget, Object.entries(EOL_LABEL).map(([k, l]) => ({ label: t('proj.eolTo', { eol: l }), icon: k === tab.eol ? 'check' : null, action: () => set(k) })));
};
$('#stLang').onclick = () => pickLanguage();

async function pickLanguage() {
  const tab = active;
  if (!tab) return;
  const langs = monaco.languages.getLanguages().map((l) => ({ id: l.id, name: (l.aliases && l.aliases[0]) || l.id, ext: (l.extensions || []).slice(0, 4).join(' ') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const body = h(`<div class="browse"><input class="input" id="lg-q" placeholder="${esc(t('proj.langSearch'))}" spellcheck="false"><div class="browse-list" id="lg-list"></div></div>`);
  const list = body.querySelector('#lg-list');
  const cur = tab.model.getLanguageId();
  let close;
  const paint = (q) => {
    list.innerHTML = '';
    const auto = h(`<div class="browse-item">${icon('bolt')}<span>${esc(t('ed.langAuto'))}</span></div>`);
    auto.onclick = () => close({ id: null });
    if (!q) list.appendChild(auto);
    for (const l of langs.filter((x) => !q || x.name.toLowerCase().includes(q) || x.id.includes(q) || x.ext.includes(q))) {
      const row = h(`<div class="browse-item ${l.id === cur ? 'sel' : ''}">${icon('code')}<span>${esc(l.name)}</span><small style="margin-inline-start:auto;color:var(--text-3)">${esc(l.ext)}</small></div>`);
      row.onclick = () => close({ id: l.id });
      list.appendChild(row);
    }
  };
  const res = await openModal({
    title: t('proj.langTitle'), iconName: 'code', width: 520, body,
    onMount: (_m, c) => { close = c; paint(''); body.querySelector('#lg-q').addEventListener('input', (e) => paint(e.target.value.trim().toLowerCase())); },
    buttons: [{ label: t('common.cancel'), value: null }],
  });
  if (!res) return;
  tab.langForced = !!res.id;
  const firstLine = tab.model.getLineContent(1);
  monaco.editor.setModelLanguage(tab.model, res.id || languageFor(tab.path, firstLine));
  paintStatus();
}

// ---------------------------------------------------------------------------
// Ağaç işlemleri: yeni dosya / klasör, yeniden adlandır, sil
// ---------------------------------------------------------------------------
const validName = (n) => n && !/[\\/]/.test(n) && n !== '.' && n !== '..';

async function newFileIn(dir) {
  if (conn.kind === 'file') return;
  const name = await prompt(t('tree.newFile'), { label: t('tree.fileName'), placeholder: 'index.php', okText: t('common.create'), iconName: 'filePlus' });
  if (!name) return;
  if (!validName(name)) return toast(t('tree.badName'), { type: 'err' });
  const p = tree.join(dir, name);
  try {
    await window.api.projNewFile(p);
  } catch (err) {
    return toast(t('tree.createFail'), { type: 'err', sub: cleanErr(err) });
  }
  await tree.refresh(dir);
  await tree.reveal(p);
  openFile(p, { isNew: true });
}

async function newFolderIn(dir) {
  const name = await prompt(t('common.newFolder'), { label: t('common.folderName'), okText: t('common.create'), iconName: 'folderPlus' });
  if (!name) return;
  if (!validName(name)) return toast(t('tree.badName'), { type: 'err' });
  const p = tree.join(dir, name);
  try {
    await window.api.projMkdir(p);
  } catch (err) {
    return toast(t('tree.createFail'), { type: 'err', sub: cleanErr(err) });
  }
  await tree.refresh(dir);
  tree.reveal(p);
}

async function renameNode(n) {
  const name = await prompt(t('common.rename'), { label: t('common.newName'), value: n.name, okText: t('common.rename') });
  if (!name || name === n.name) return;
  if (!validName(name)) return toast(t('tree.badName'), { type: 'err' });
  const dir = tree.parentOf(n.path);
  const to = tree.join(dir, name);
  // Açık sekmeler yeni yola taşınır (kaydedilmemiş değişiklik varsa önce kaydedilmesi istenir)
  const affected = tabs.filter((x) => x.path === n.path || x.path.startsWith(n.path + sep));
  if (affected.some(isDirty)) return toast(t('tree.renameDirty'), { type: 'err' });
  try {
    await window.api.projRename(n.path, to);
  } catch (err) {
    return toast(t('tree.renameFail'), { type: 'err', sub: cleanErr(err) });
  }
  for (const tab of affected) {
    const wasActive = tab === active;
    const np = to + tab.path.slice(n.path.length);
    await closeTab(tab, { ask: false });
    await openFile(np, { activateTab: wasActive });
  }
  await tree.refresh(dir);
  tree.reveal(to);
}

async function deleteNode(n) {
  const ok = await confirmBox(t('tree.deleteTitle'), t(n.isDir ? 'tree.deleteDirMsg' : 'tree.deleteMsg', { name: esc(n.name) }) + (conn.kind === 'local' ? '<br>' + esc(t('tree.trashNote')) : ''));
  if (!ok) return;
  try {
    await window.api.projDelete(n.path, n.isDir);
  } catch (err) {
    return toast(t('tree.deleteFail'), { type: 'err', sub: cleanErr(err) });
  }
  for (const tab of tabs.filter((x) => x.path === n.path || x.path.startsWith(n.path + sep))) await closeTab(tab, { ask: false });
  await tree.refresh(tree.parentOf(n.path));
}

function treeContext(n, x, y) {
  const dir = n ? (n.isDir ? n.path : tree.parentOf(n.path)) : root;
  contextMenu(x, y, [
    n && !n.isDir ? { label: t('common.open'), icon: 'open', kbd: 'Enter', action: () => openFile(n.path) } : null,
    n && !n.isDir ? '-' : null,
    { label: t('tree.newFile'), icon: 'filePlus', action: () => newFileIn(dir) },
    { label: t('common.newFolder'), icon: 'folderPlus', action: () => newFolderIn(dir) },
    n ? '-' : null,
    n ? { label: t('common.rename'), icon: 'edit', kbd: 'F2', action: () => renameNode(n) } : null,
    n ? { label: t('common.delete'), icon: 'trash', danger: true, kbd: 'Del', action: () => deleteNode(n) } : null,
    '-',
    n ? { label: t('common.copyPath'), icon: 'copy', action: () => window.api.clipboardWrite(n.path) } : null,
    n && conn.kind === 'local' ? { label: t('tree.showExplorer'), icon: 'folderOpen', action: () => window.api.revealLocal(n.path) } : null,
    { label: t('proj.showCache'), icon: 'layers', action: () => window.api.projRevealCache(n ? n.path : null) },
    { label: t('common.refresh'), icon: 'refresh', action: () => tree.refresh(dir) },
    !n ? { label: t('tree.collapseAll'), icon: 'collapse', action: () => tree.collapseAll() } : null,
  ]);
}

// Gizli dosya ve hariç tutma kalıpları (node_modules, .git, *.log …)
function makeFilter() {
  const pats = String(conn.exclude || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
  return (name) => {
    if (conn.showHidden === false && name.startsWith('.')) return false;
    return !pats.some((re) => re.test(name));
  };
}

// ---------------------------------------------------------------------------
// Klavye kısayolları (editör odakta değilken de)
// ---------------------------------------------------------------------------
// Pencere kısayolları yakalama aşamasında bir kez işlenir; olay Monaco'ya ulaşmaz (aynı tuş iki kez çalışmasın)
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-backdrop')) return;
  const k = e.key.toLowerCase();
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  const inEditor = editor && editor.hasTextFocus();
  if (e.ctrlKey && !e.altKey) {
    if (k === 's' && e.shiftKey) { stop(); saveAll(); return; }
    if (k === 's') { stop(); if (active) saveTab(active); return; }
    if (k === 'w' || k === 'f4') { stop(); if (active) closeTab(active); return; }
    if (k === 'n') { stop(); runTool('newFile'); return; }
    if (k === 'b') { stop(); toggleTree(); return; }
    if (k === 'tab' && tabs.length > 1) {
      stop();
      const i = tabs.indexOf(active);
      activate(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]);
      return;
    }
    if (k === '=' || k === '+') { stop(); runTool('zoomIn'); return; }
    if (k === '-') { stop(); runTool('zoomOut'); return; }
    if (k === '0') { stop(); runTool('zoomReset'); return; }
  }
  if (e.altKey && k === 'z') { stop(); runTool('wrap'); return; }
  if (!inEditor && document.activeElement === $('#tree')) {
    const n = tree.selectedNode();
    if (n && e.key === 'F2') { stop(); renameNode(n); }
    if (n && e.key === 'Delete') { stop(); deleteNode(n); }
  }
}, true);

window.addEventListener('beforeunload', (e) => {
  if (tabs.some(isDirty)) { e.preventDefault(); e.returnValue = false; }
});

window.addEventListener('resize', () => editor && editor.layout());

// ---------------------------------------------------------------------------
// Başlangıç: depo → Monaco → bağlantı → ağaç → önceki sekmeler
// ---------------------------------------------------------------------------
function paintHeader() {
  if (!conn) return;
  $('#projName').textContent = conn.name;
  const sub = isRemote()
    ? `${conn.loginMethod === 'anonymous' ? 'anonymous' : conn.username}@${conn.host}${root ? ':' + root : ''}`
    : conn.localPath || '';
  $('#projSub').textContent = sub;
  const kindIcon = { ssh: 'terminal', ftp: 'server', local: 'folder', file: 'fileCode' }[conn.kind];
  const label = conn.kind === 'ftp' ? ({ sftp: 'SFTP', ftp: 'FTP' }[conn.protocol] || 'FTPS') : conn.kind === 'ssh' ? 'SSH' : t('kind.' + conn.kind);
  $('#projKind').innerHTML = `<span class="tag proto secure">${icon(kindIcon)}${esc(label)}</span>`;
  document.querySelector('.site-bar').style.setProperty('--c', conn.color || '#22d3ee');
  $('#treeIco').innerHTML = icon(conn.kind === 'local' ? 'folder' : 'server');
  $('#treeTitle').textContent = baseName(root || conn.rootDir || '/') || '/';
  $('#treeTitle').title = root;
}

function emptyScreen() {
  const keys = [['Ctrl+S', t('proj.save')], ['Ctrl+Shift+S', t('proj.saveAll')], ['Ctrl+F / Ctrl+H', `${t('proj.find')} / ${t('proj.replace')}`],
    ['Ctrl+G', t('proj.goto')], ['Ctrl+W', t('proj.closeTab')], ['Ctrl+B', t('proj.toggleTree')], ['Alt+Z', t('ed.wordWrap')], ['F1', t('proj.palette')]];
  $('#empty').innerHTML = `<div class="empty-inner">
    <img src="../../build/icon.png" alt="">
    <div class="empty-title">${esc(conn ? conn.name : 'Notepad Master')}</div>
    <div class="empty-hint">${esc(t(conn && conn.kind === 'file' ? 'proj.emptyFile' : 'proj.emptyHint'))}</div>
    <div class="keys">${keys.map(([k, l]) => `<span class="kbd">${esc(k)}</span><span>${esc(l)}</span>`).join('')}</div>
  </div>`;
}

function loadMonaco() {
  return new Promise((resolve, reject) => {
    const base = new URL('../../node_modules/monaco-editor/min/', location.href).href;
    // Dil servisleri (JSON/CSS/HTML/TS) için işçi; açılamazsa Monaco ana iş parçacığına düşer
    window.MonacoEnvironment = { getWorkerUrl: () => base + 'vs/base/worker/workerMain.js' };
    window.require.config({ paths: { vs: base + 'vs' } });
    window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
  });
}

async function init() {
  data = await window.api.getStore();
  window.__cacheDir = data.cacheDir;
  conn = data.connections.find((c) => c.id === connId) || null;
  if (data.settings.treeWidth) $('#colTree').style.width = data.settings.treeWidth + 'px';
  emptyScreen();
  paintHeader();
  paintThemeBtn();
  renderTabs();

  monaco = await loadMonaco();
  defineThemes(monaco);
  editor = monaco.editor.create($('#editor'), {
    model: null,
    automaticLayout: true,
    theme: resolveTheme(eff().theme),
    fixedOverflowWidgets: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    mouseWheelZoom: true,
    unicodeHighlight: { ambiguousCharacters: false },
    stickyScroll: { enabled: false },
    find: { addExtraSpaceOnTop: false, seedSearchStringFromSelection: 'selection' },
  });
  editor.onDidChangeCursorPosition(paintPos);
  editor.onDidChangeCursorSelection(paintPos);
  editor.onDidChangeModelOptions(() => paintStatus());
  editor.onDidChangeModelLanguage(() => paintStatus());
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyEditorOptions());
  applyEditorOptions();

  if (!conn) { toast(t('main.errConnNotFound'), { type: 'err', timeout: 0 }); return; }

  setStatus('connecting');
  const res = await window.api.projOpen();
  if (!res.ok) {
    setStatus('off');
    $('#tree').innerHTML = `<div class="tr-note err">${esc(res.message)}</div>`;
    $('#empty .empty-hint').textContent = res.message;
    if (isRemote()) $('#btnReconnect').onclick = () => location.reload();
    return;
  }
  opened = true;
  root = res.root;
  sep = res.sep;
  paintHeader();

  if (conn.kind === 'file') {
    toggleTree(false);
    $('#btnTree').classList.add('hidden');
    $('#splitTree').classList.add('hidden');
    await openFile(conn.localPath);
    return;
  }

  toggleTree(data.settings.treeOpen !== false);
  tree = new FileTree($('#tree'), {
    sep,
    list: (dir) => window.api.projList(dir),
    filter: makeFilter(),
    onOpen: (n) => openFile(n.path),
    onContext: treeContext,
    isOpen: (p) => tabs.some((x) => x.path === p),
  });
  const ta = $('#colTree .panel-actions');
  setBtn(ta.querySelector('[data-a=newFile]'), 'filePlus', t('tree.newFile'));
  setBtn(ta.querySelector('[data-a=newFolder]'), 'folderPlus', t('common.newFolder'));
  setBtn(ta.querySelector('[data-a=refresh]'), 'refresh', t('common.refresh'));
  setBtn(ta.querySelector('[data-a=collapse]'), 'collapse', t('tree.collapseAll'));
  ta.querySelector('[data-a=newFile]').onclick = () => newFileIn(tree.targetDir());
  ta.querySelector('[data-a=newFolder]').onclick = () => newFolderIn(tree.targetDir());
  ta.querySelector('[data-a=refresh]').onclick = () => tree.refresh(root);
  ta.querySelector('[data-a=collapse]').onclick = () => tree.collapseAll();
  await tree.setRoot(root, baseName(root));

  // Önceki oturumun sekmeleri
  if (conn.restoreTabs !== false && conn.openTabs && conn.openTabs.length) {
    const want = conn.activeTab;
    for (const p of conn.openTabs) await openFile(p, { activateTab: false });
    const tab = tabs.find((x) => x.path === want) || tabs[0];
    if (tab) { active = null; activate(tab); }
  }
}

window.api.onStoreChanged((d) => {
  data = d;
  window.__cacheDir = d.cacheDir;
  const c = d.connections.find((x) => x.id === connId);
  if (c) {
    const filterChanged = conn && (conn.showHidden !== c.showHidden || conn.exclude !== c.exclude);
    conn = c;
    paintHeader();
    if (tree && filterChanged) { tree.o.filter = makeFilter(); tree.refresh(root); }
  }
  paintThemeBtn();
  if (monaco) onSettingsChanged();
});

init().catch((err) => {
  console.error(err);
  toast(t('proj.initFail'), { type: 'err', sub: cleanErr(err), timeout: 0 });
});
