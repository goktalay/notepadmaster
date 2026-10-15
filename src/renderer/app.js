'use strict';

// Ana pencere: bağlantı (proje) kartları, klasörler, bağlantı formu (Bağlantı / Proje / Editör), ayarlar

const COLORS = ['#22d3ee', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#fbbf24', '#34d399', '#94a3b8'];

// FTP projesi protokolleri (FTP Masters ile aynı seçenekler)
const PROTOCOLS = {
  ftp: { port: 21, short: 'FTP', secure: false },
  'ftps-implicit': { port: 990, short: 'FTPS', secure: true },
  'ftps-ssl': { port: 21, short: 'FTPS', secure: true },
  'ftps-tls': { port: 21, short: 'FTPS', secure: true },
  sftp: { port: 22, short: 'SFTP', secure: true },
};

// Bağlantı türleri: "Yeni bağlantı" formundaki dört seçenek
const KINDS = {
  ssh: { icon: 'terminal', short: 'SSH' },
  ftp: { icon: 'server', short: 'FTP' },
  local: { icon: 'folder', short: 'LOCAL' },
  file: { icon: 'fileCode', short: 'FILE' },
};
const isRemote = (c) => c.kind === 'ssh' || c.kind === 'ftp';

let data = { folders: [], connections: [], settings: {} };
let currentFolder = null;
let query = '';
let selectedId = null;

const $ = (s) => document.querySelector(s);

// --- Başlangıç ---------------------------------------------------------------
$('.search-ico').innerHTML = icon('search');
$('#btnSettings').innerHTML = icon('gear');
$('#btnSettings').title = t('app.settings');
$('#btnNewFolder').innerHTML = icon('folderPlus') + esc(t('common.newFolder'));
$('#btnNewConn').innerHTML = icon('plus') + esc(t('app.newConn'));
$('#search').placeholder = t('app.searchPh');
const paintThemeBtn = themeButton($('#btnTheme'), () => data.settings || {});
mountMastertool($('.topbar .actions'));

$('#btnSettings').onclick = () => openSettings(data.settings || {});
$('#content').addEventListener('mousedown', (e) => {
  if (!e.target.closest('.card, .new-card')) { selectedId = null; updateSelectionUI(); }
});
$('#btnNewFolder').onclick = () => newFolder();
$('#btnNewConn').onclick = () => editConnection(null);
$('#search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-backdrop')) return;
  const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); editConnection(null); }
  if (e.key === 'Escape' && document.activeElement === $('#search')) { $('#search').value = ''; query = ''; render(); $('#search').blur(); }
  if (e.key === 'Backspace' && !inInput && currentFolder) goFolder(folderById(currentFolder)?.parentId || null);
  const sel = data.connections.find((c) => c.id === selectedId);
  if (sel && !inInput) {
    if (e.key === 'Enter') openConn(sel);
    if (e.key === 'Delete') deleteConnection(sel);
    if (e.key === 'F2') editConnection(sel);
  }
});

const setData = (d) => { data = d; window.__cacheDir = d.cacheDir; render(); paintThemeBtn(); };
window.api.onStoreChanged(setData);

// --- Hesap rozeti ve senkron durumu ---------------------------------------------
let lastErrorShown = null;
onAcct((st) => {
  const b = $('#btnAccount');
  const name = (st.user && (st.user.name || st.user.email)) || st.email || '?';
  b.querySelector('.ac-avatar').textContent = name.trim().slice(0, 1).toUpperCase();
  const s = !st.syncEnabled || st.state === 'off' ? 'off' : st.state || 'idle';
  b.className = `account-chip s-${s}`;
  b.querySelector('.ac-sync').innerHTML = s === 'syncing' ? '<span class="spin"></span>' : icon(['off', 'offline', 'error'].includes(s) ? 'cloudOff' : 'cloud');
  b.title = `${(st.user && st.user.email) || st.email || ''}\n${syncText(st)}`;
  // Kalıcı hatalar bir kez bildirilir
  if (st.state === 'error' && st.error !== lastErrorShown) {
    lastErrorShown = st.error;
    toast(syncText(st), { type: 'err', timeout: 9000 });
  }
  if (st.state === 'ok') lastErrorShown = null;
});

$('#btnAccount').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  contextMenu(r.right - 260, r.bottom + 6, [
    { label: (acct.user && acct.user.email) || acct.email || '', icon: 'user', disabled: true, action: () => {} },
    { label: syncText(acct), icon: acct.syncEnabled ? 'cloud' : 'cloudOff', disabled: true, action: () => {} },
    '-',
    { label: t('acct.syncNow'), icon: 'refresh', disabled: !acct.syncEnabled, action: () => window.api.syncNow() },
    { label: t('acct.myAccount'), icon: 'open', action: () => window.api.openWeb('account') },
    { label: t('app.settings'), icon: 'gear', action: () => openSettings(data.settings || {}) },
    '-',
    { label: t('acct.logout'), icon: 'logout', danger: true, action: logout },
  ]);
};

// Yeni sürüm bildirimi: exe yalnız hesabın kişiye özel bağlantısından indirilir
window.api.onUpdateAvailable(({ version }) => {
  const bar = $('#updateBar');
  bar.innerHTML = `${icon('download')}<span>${esc(t('update.available', { version }))} — ${esc(t('update.hint'))}</span>
    <button class="btn sm primary" data-a="open">${esc(t('update.open'))}</button>
    <button class="icon-btn" data-a="close" title="${esc(t('common.cancel'))}">${icon('x')}</button>`;
  bar.classList.remove('hidden');
  bar.querySelector('[data-a="open"]').onclick = () => window.api.openWeb('account');
  bar.querySelector('[data-a="close"]').onclick = () => bar.classList.add('hidden');
});

window.api.onLibraryBackup((file) => toast(t('acct.backupNotice'), { sub: file, timeout: 12000 }));
window.api.getStore().then(setData);

// --- Yardımcılar -------------------------------------------------------------
const folderById = (id) => data.folders.find((f) => f.id === id);
const sortByName = (a, b) => a.name.localeCompare(b.name, LANG, { sensitivity: 'base' });

function folderPath(id) {
  const out = [];
  let f = folderById(id);
  while (f) { out.unshift(f); f = folderById(f.parentId); }
  return out;
}

function countIn(folderId) {
  // Alt klasörler dahil bağlantı sayısı
  let n = data.connections.filter((c) => (c.folderId || null) === folderId).length;
  for (const sub of data.folders.filter((f) => (f.parentId || null) === folderId)) n += countIn(sub.id);
  return n;
}

function goFolder(id) {
  currentFolder = id && folderById(id) ? id : null;
  selectedId = null;
  render();
}

function updateSelectionUI() {
  document.querySelectorAll('.conn-card').forEach((x) => x.classList.toggle('selected', x.dataset.id === selectedId));
}

// Kartı aç: yerel klasör/dosya senkronla geldiyse bu bilgisayardaki yolu önce sor
async function openConn(c) {
  if (!isRemote(c) && !c.hasLocalPath) {
    const p = c.kind === 'file' ? await window.api.pickFile(c.localPath) : await window.api.pickFolder(c.localPath);
    if (!p) return;
    await window.api.setLocalPath(c.id, p);
  }
  window.api.openConnection(c.id);
}

// --- Çizim -------------------------------------------------------------------
function render() {
  if (currentFolder && !folderById(currentFolder)) currentFolder = null;
  renderCrumbs();
  renderGrid();
  updateSelectionUI();
  const nc = data.connections.length;
  $('#stats').textContent = nc ? t('app.stats', { c: nc, f: data.folders.length }) : t('app.welcome');
}

function renderCrumbs() {
  const el = $('#crumbs');
  el.innerHTML = '';
  if (query) {
    el.appendChild(h(`<span class="crumb current">${icon('search')} ${esc(t('app.results', { q: query }))}</span>`));
    return;
  }
  const parts = [{ id: null, name: t('app.all') }, ...folderPath(currentFolder)];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const c = h(`<span class="crumb ${last ? 'current' : ''}">${i === 0 ? icon('home') : icon('folder')}${esc(p.name)}</span>`);
    if (!last) {
      c.onclick = () => goFolder(p.id);
      makeDropTarget(c, p.id);
    }
    el.appendChild(c);
    if (!last) el.appendChild(h(`<span class="crumb-sep">${icon('chevronRight')}</span>`));
  });
}

function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';

  if (!data.connections.length && !data.folders.length) {
    const w = h(`<div class="welcome"><div class="new-card">
      <div class="plus">${icon('plus')}</div>
      <div class="lbl">${esc(t('app.newConn'))}</div>
      <div class="hint">${t('app.welcomeHint')}</div>
    </div></div>`);
    w.querySelector('.new-card').onclick = () => editConnection(null);
    grid.appendChild(w);
    return;
  }

  let folders;
  let conns;
  if (query) {
    folders = data.folders.filter((f) => f.name.toLowerCase().includes(query));
    conns = data.connections.filter((c) =>
      [c.name, c.host, c.username, c.rootDir, c.localPath, c.comments, KINDS[c.kind]?.short, t('kind.' + c.kind)]
        .some((v) => String(v || '').toLowerCase().includes(query))
    );
  } else {
    folders = data.folders.filter((f) => (f.parentId || null) === currentFolder);
    conns = data.connections.filter((c) => (c.folderId || null) === currentFolder);
  }
  folders.sort(sortByName);
  conns.sort(sortByName);

  if (folders.length) {
    grid.appendChild(h(`<div class="section-title">${esc(t('app.folders'))}</div>`));
    for (const f of folders) grid.appendChild(folderCard(f));
  }
  grid.appendChild(h(`<div class="section-title">${esc(t('app.connections'))}${conns.length ? `<span class="hint">${esc(t('app.dblHint'))}</span>` : ''}</div>`));
  for (const c of conns) grid.appendChild(connCard(c));

  if (!query) {
    const n = h(`<div class="new-card"><div class="plus">${icon('plus')}</div><div class="lbl">${esc(t('app.newConn'))}</div></div>`);
    n.onclick = () => editConnection(null);
    grid.appendChild(n);
  } else if (!conns.length && !folders.length) {
    grid.appendChild(h(`<div class="empty-note" style="grid-column:1/-1">${esc(t('app.noMatch'))}</div>`));
  }
}

function folderCard(f) {
  const n = countIn(f.id);
  const el = h(`<div class="card folder-card" draggable="true">
    <div class="avatar">${icon('folder')}</div>
    <div style="min-width:0">
      <div class="card-title">${esc(f.name)}</div>
      <div class="card-sub">${esc(t('app.folderCount', { n }))}</div>
    </div></div>`);
  el.addEventListener('dblclick', () => { $('#search').value = ''; query = ''; goFolder(f.id); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: t('common.open'), icon: 'open', action: () => goFolder(f.id) },
      { label: t('app.newConnHere'), icon: 'plus', action: () => editConnection(null, f.id) },
      { label: t('app.newSubfolder'), icon: 'folderPlus', action: () => newFolder(f.id) },
      '-',
      { label: t('common.rename'), icon: 'edit', action: () => renameFolder(f) },
      { label: t('common.moveEllipsis'), icon: 'move', action: () => moveDialog({ type: 'folder', item: f }) },
      '-',
      { label: t('common.delete'), icon: 'trash', danger: true, action: () => deleteFolder(f) },
    ]);
  });
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-npm', JSON.stringify({ type: 'folder', id: f.id }));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  makeDropTarget(el, f.id);
  return el;
}

function kindTag(c) {
  if (c.kind === 'ftp') {
    const p = PROTOCOLS[c.protocol] || PROTOCOLS.ftp;
    return `<span class="tag proto ${p.secure ? 'secure' : ''}">${icon(p.secure ? 'lock' : 'globe')}${esc(p.short)}</span>`;
  }
  if (c.kind === 'ssh') return `<span class="tag proto secure">${icon('lock')}SSH</span>`;
  return `<span class="tag proto local">${icon(KINDS[c.kind].icon)}${esc(t('kind.' + c.kind))}</span>`;
}

function connSub(c) {
  if (isRemote(c)) {
    const p = PROTOCOLS[c.protocol] || PROTOCOLS.ftp;
    const user = c.loginMethod === 'anonymous' ? 'anonymous' : c.username;
    return `${user ? esc(user) + '@' : ''}${esc(c.host)}${Number(c.port) !== p.port ? ':' + esc(c.port) : ''}`;
  }
  return c.hasLocalPath ? esc(c.localPath) : `<span class="warn-text">${esc(t('app.noLocalPath'))}</span>`;
}

function connCard(c) {
  const where = query && c.folderId ? folderPath(c.folderId).map((f) => f.name).join(' / ') : '';
  const k = KINDS[c.kind] || KINDS.ssh;
  const el = h(`<div class="card conn-card ${selectedId === c.id ? 'selected' : ''}" data-id="${esc(c.id)}" draggable="true" style="--c:${esc(c.color || '#22d3ee')}">
    <div class="card-head">
      <div class="avatar">${icon(k.icon)}</div>
      <div style="min-width:0;flex:1">
        <div class="card-title">${esc(c.name)}</div>
        <div class="card-sub">${connSub(c)}</div>
      </div>
    </div>
    <div class="quick">
      <button class="icon-btn" data-a="edit" title="${esc(t('common.edit'))}">${icon('edit')}</button>
      <button class="icon-btn connect" data-a="open" title="${esc(t('common.open'))}">${icon('play')}</button>
    </div>
    <div class="card-foot">
      ${kindTag(c)}
      ${isRemote(c) && c.authType === 'key' && (c.kind === 'ssh' || c.protocol === 'sftp') ? `<span class="tag">${icon('key')}${esc(t('app.keyTag'))}</span>` : ''}
      ${isRemote(c) && c.rootDir ? `<span class="tag dir">${icon('folder')}${esc(c.rootDir)}</span>` : ''}
      ${c.openTabs && c.openTabs.length ? `<span class="tag" title="${esc(t('app.openTabs'))}">${icon('fileCode')}${c.openTabs.length}</span>` : ''}
      ${c.editorMode === 'custom' ? `<span class="tag" title="${esc(t('app.customEditor'))}">${icon('sliders')}</span>` : ''}
      ${where ? `<span class="tag">${icon('folder')}${esc(where)}</span>` : ''}
    </div></div>`);
  if (c.comments) el.title = c.comments;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'open') return openConn(c);
    if (a === 'edit') return editConnection(c);
    selectedId = c.id;
    updateSelectionUI();
  });
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-a]')) return;
    openConn(c);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    selectedId = c.id;
    updateSelectionUI();
    contextMenu(e.clientX, e.clientY, [
      { label: t('common.open'), icon: 'play', kbd: 'Enter', action: () => openConn(c) },
      '-',
      { label: t('common.edit'), icon: 'edit', kbd: 'F2', action: () => editConnection(c) },
      { label: t('app.duplicate'), icon: 'copy', action: () => window.api.duplicateConnection(c.id) },
      { label: t('app.moveToFolder'), icon: 'move', action: () => moveDialog({ type: 'conn', item: c }) },
      !isRemote(c) ? { label: t('app.changeLocalPath'), icon: 'folderOpen', action: () => changeLocalPath(c) } : null,
      '-',
      { label: t('common.delete'), icon: 'trash', danger: true, kbd: 'Del', action: () => deleteConnection(c) },
    ]);
  });
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-npm', JSON.stringify({ type: 'conn', id: c.id }));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

async function changeLocalPath(c) {
  const p = c.kind === 'file' ? await window.api.pickFile(c.localPath) : await window.api.pickFolder(c.localPath);
  if (p) await window.api.setLocalPath(c.id, p);
}

// Sürükle-bırak: bağlantı/klasörü bir klasöre (veya üst seviyeye) taşı
function makeDropTarget(el, folderId) {
  let depth = 0;
  el.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('application/x-npm')) return;
    depth++;
    el.classList.add('drop');
  });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('drop'); } });
  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-npm')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    el.classList.remove('drop');
    const d = JSON.parse(e.dataTransfer.getData('application/x-npm') || '{}');
    if (d.type === 'conn') {
      await window.api.moveConnection(d.id, folderId);
      toast(t('app.connMoved'), { type: 'ok', sub: folderId ? folderById(folderId).name : t('app.all') });
    } else if (d.type === 'folder' && d.id !== folderId) {
      const ok = await window.api.moveFolder(d.id, folderId);
      if (!ok) toast(t('app.folderIntoSelf'), { type: 'err' });
    }
  });
}

// --- Klasör işlemleri ----------------------------------------------------------
async function newFolder(parentId = currentFolder) {
  const name = await prompt(t('common.newFolder'), { label: t('common.folderName'), placeholder: t('app.folderPh'), okText: t('common.create'), iconName: 'folderPlus' });
  if (name) await window.api.saveFolder({ name, parentId: typeof parentId === 'string' ? parentId : currentFolder });
}

async function renameFolder(f) {
  const name = await prompt(t('app.renameFolder'), { label: t('common.folderName'), value: f.name, okText: t('common.save') });
  if (name) await window.api.saveFolder({ id: f.id, name });
}

async function deleteFolder(f) {
  const n = countIn(f.id);
  const ok = await confirmBox(t('app.deleteFolder'), t('app.deleteFolderMsg', { name: esc(f.name) }) + (n ? t('app.deleteFolderConns', { n }) : ''));
  if (ok) await window.api.deleteFolder(f.id);
}

function folderOptions(selected, excludeId) {
  // Hiyerarşik klasör listesi (select için)
  const out = [`<option value="">${esc(t('app.rootFolder'))}</option>`];
  const walk = (parentId, depth) => {
    for (const f of data.folders.filter((x) => (x.parentId || null) === parentId).sort(sortByName)) {
      if (f.id === excludeId) continue;
      out.push(`<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${'&nbsp;&nbsp;&nbsp;'.repeat(depth)}${esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return out.join('');
}

async function moveDialog({ type, item }) {
  const current = type === 'conn' ? item.folderId : item.parentId;
  const target = await openModal({
    title: t('app.moveTitle', { name: item.name }), iconName: 'move',
    body: `<div class="field"><label>${esc(t('app.targetFolder'))}</label><select class="input" id="mv">${folderOptions(current, type === 'folder' ? item.id : null)}</select></div>`,
    buttons: [
      { label: t('common.cancel'), value: null },
      { label: t('common.move'), cls: 'primary', onClick: (m) => ({ v: m.querySelector('#mv').value || null }) },
    ],
  });
  if (!target) return;
  if (type === 'conn') await window.api.moveConnection(item.id, target.v);
  else if (!(await window.api.moveFolder(item.id, target.v))) toast(t('app.folderIntoSelf'), { type: 'err' });
}

async function deleteConnection(c) {
  const target = isRemote(c) ? c.host : c.localPath || t('kind.' + c.kind);
  const ok = await confirmBox(t('app.deleteConn'), t('app.deleteConnMsg', { name: esc(c.name), target: esc(target) }));
  if (ok) { await window.api.deleteConnection(c.id); if (selectedId === c.id) selectedId = null; }
}

// --- Uzak klasör seçici (bağlantı testinden sonra, aynı bağlantı bilgileriyle) ---------
async function browseRemoteFolder(form, startDir) {
  const opened = await window.api.browseOpen(form);
  if (!opened.ok) { toast(t('form.testFail'), { type: 'err', sub: opened.message, timeout: 8000 }); return null; }
  const token = opened.token;
  let dir = startDir || opened.home || '/';
  const body = h(`<div class="browse">
    <div class="browse-bar">
      <button class="icon-btn" data-a="up" title="${esc(t('tree.up'))}">${icon('up')}</button>
      <button class="icon-btn" data-a="home" title="${esc(t('tree.home'))}">${icon('home')}</button>
      <input class="input path-input" id="b-path" spellcheck="false">
    </div>
    <div class="browse-list" id="b-list"></div>
  </div>`);
  const list = body.querySelector('#b-list');
  const pathEl = body.querySelector('#b-path');
  const parent = (p) => (p === '/' ? '/' : p.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/');

  async function load(d) {
    list.innerHTML = `<div class="empty-note"><span class="spin" style="display:inline-block;vertical-align:middle"></span></div>`;
    try {
      const items = (await window.api.browseList(token, d)).sort(sortByName);
      dir = d;
      pathEl.value = d;
      list.innerHTML = '';
      if (!items.length) list.appendChild(h(`<div class="empty-note">${esc(t('form.browseEmpty'))}</div>`));
      for (const it of items) {
        const row = h(`<div class="browse-item">${icon('folder')}<span>${esc(it.name)}</span></div>`);
        row.onclick = () => { list.querySelectorAll('.browse-item').forEach((x) => x.classList.remove('sel')); row.classList.add('sel'); };
        row.ondblclick = () => load(it.path);
        list.appendChild(row);
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-note" style="color:var(--err)">${esc(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</div>`;
      pathEl.value = dir;
    }
  }
  body.querySelector('[data-a=up]').onclick = () => load(parent(dir));
  body.querySelector('[data-a=home]').onclick = () => load(opened.home || '/');
  pathEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); load(pathEl.value.trim() || '/'); } });

  const res = await openModal({
    title: t('form.browseTitle'), iconName: 'folderOpen', width: 560, body,
    onMount: () => load(dir),
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('form.browseSelect'), cls: 'primary', onClick: () => {
          const sel = list.querySelector('.browse-item.sel span');
          return sel ? (dir.replace(/\/+$/, '') + '/' + sel.textContent) : dir;
        },
      },
    ],
  });
  window.api.browseClose(token);
  return res ? { dir: res, fingerprint: opened.fingerprint } : null;
}

// --- Bağlantı formu --------------------------------------------------------------
const sel = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');

async function editConnection(conn, folderId) {
  const isNew = !conn;
  const s = data.settings || {};
  const c = conn || {
    kind: 'ssh', name: '', host: '', protocol: 'sftp', port: 22, username: '', loginMethod: 'normal', authType: 'password', keyPath: '',
    comments: '', folderId: folderId ?? currentFolder, color: COLORS[data.connections.length % COLORS.length],
    rootDir: '', localPath: '', nameEncoding: 'auto', showHidden: true, exclude: '', restoreTabs: true,
    editorMode: 'global', editor: s.editor,
  };
  let kind = c.kind || 'ssh';
  let color = c.color || COLORS[0];
  let authType = c.authType || 'password';
  let loginMethod = c.loginMethod || 'normal';
  let nameEncoding = c.nameEncoding || 'auto';
  let testedHostKey = null;
  let testedOk = false;
  let portTouched = !isNew;

  const ed = editorForm(c.editorMode === 'custom' ? c.editor : s.editor);

  const body = h(`<div class="site-form">
    <div class="tabs" id="f-tabs">
      <button data-tab="conn" class="on">${icon('link')}${esc(t('form.tabConn'))}</button>
      <button data-tab="project">${icon('folder')}${esc(t('form.tabProject'))}</button>
      <button data-tab="editor">${icon('code')}${esc(t('form.tabEditor'))}</button>
    </div>

    <section class="tab-panel" data-panel="conn">
      <div class="kind-pick" id="f-kind">
        ${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-v="${k}">${icon(v.icon)}<b>${esc(t('kind.' + k))}</b><small>${esc(t('kind.' + k + 'Hint'))}</small></button>`).join('')}
      </div>
      <div class="field"><label>${esc(t('form.name'))}</label><input class="input" id="f-name" placeholder="${esc(t('form.namePh'))}" value="${esc(c.name)}"></div>

      <div class="remote-only" style="display:grid;gap:14px">
        <div class="row c-1-1 ftp-only">
          <div class="field"><label>${esc(t('type.protocol'))}</label><select class="input" id="f-proto">${sel([
            ['ftp', t('type.ftp')], ['ftps-implicit', t('type.ftpsImplicit')], ['ftps-ssl', t('type.ftpsSsl')], ['ftps-tls', t('type.ftpsTls')], ['sftp', t('type.sftp')],
          ], c.kind === 'ftp' ? c.protocol : 'ftp')}</select></div>
          <div class="field"><label>${esc(t('opt.encoding'))}</label>
            <div class="seg" id="f-enc"><button data-v="auto">${esc(t('opt.encAuto'))}</button><button data-v="utf8">UTF-8</button><button data-v="ascii">ASCII</button></div></div>
        </div>
        <div class="proto-note ftp-only" id="f-proto-note"></div>
        <div class="row c-3-1">
          <div class="field"><label>${esc(t('form.host'))}</label><input class="input" id="f-host" placeholder="${esc(t('form.hostPh'))}" value="${esc(c.host)}" spellcheck="false"></div>
          <div class="field"><label>${esc(t('form.port'))}</label><input class="input" id="f-port" type="number" min="1" max="65535" value="${esc(c.port || 22)}"></div>
        </div>
        <div class="field plain-ftp-only">
          <label>${esc(t('form.loginMethod'))}</label>
          <div class="seg" id="f-login"><button data-v="normal">${esc(t('form.loginNormal'))}</button><button data-v="anonymous">${esc(t('form.loginAnon'))}</button></div>
        </div>
        <div id="cred-fields" style="display:grid;gap:14px">
          <div class="row c-1-1">
            <div class="field"><label>${esc(t('form.user'))}</label><input class="input" id="f-user" value="${esc(c.username)}" spellcheck="false" autocomplete="off"></div>
            <div class="field" id="pw-field"><label>${esc(t('form.password'))}</label>
              <div class="pw-wrap"><input class="input" id="f-pass" type="password" placeholder="${c.hasPassword ? esc(t('form.pwSaved')) : ''}" autocomplete="new-password">
              <button class="icon-btn" id="f-eye" type="button" title="${esc(t('common.show'))}">${icon('eye')}</button></div>
            </div>
          </div>
          <div class="field ssh-auth" id="auth-field">
            <label>${esc(t('form.auth'))}</label>
            <div class="seg" id="f-auth"><button data-v="password">${esc(t('form.password'))}</button><button data-v="key">${esc(t('form.privateKey'))}</button></div>
          </div>
          <div id="key-fields" class="hidden" style="display:grid;gap:14px">
            <div class="field"><label>${esc(t('form.keyFile'))}</label>
              <div class="key-wrap"><input class="input" id="f-key" value="${esc(c.keyPath)}" placeholder="C:\\Users\\…\\.ssh\\id_ed25519" spellcheck="false"><button class="btn" id="f-keypick" type="button">${esc(t('common.choose'))}</button></div>
            </div>
            <div class="field"><label>${esc(t('form.passphrase'))}</label><input class="input" id="f-phrase" type="password" placeholder="${esc(c.hasPassphrase ? t('form.passSaved') : t('form.passEmpty'))}"></div>
          </div>
        </div>
        <div class="field"><label>${esc(t('form.rootDir'))}</label>
          <div class="key-wrap"><input class="input" id="f-root" value="${esc(c.rootDir)}" placeholder="/var/www/html" spellcheck="false">
            <button class="btn" id="f-browse" type="button" disabled>${icon('folderOpen')}${esc(t('form.browse'))}</button></div>
          <small class="hint" id="f-browse-hint">${esc(t('form.browseHint'))}</small></div>
      </div>

      <div class="local-only field"><label id="f-lpath-label"></label>
        <div class="key-wrap"><input class="input" id="f-lpath" value="${esc(c.localPath || '')}" spellcheck="false">
          <button class="btn" id="f-lpick" type="button">${icon('folderOpen')}${esc(t('common.choose'))}</button></div>
        <small class="hint">${esc(t('form.localPathHint'))}</small></div>

      <div class="row c-1-1">
        <div class="field"><label>${esc(t('form.folder'))}</label><select class="input" id="f-folder">${folderOptions(c.folderId)}</select></div>
        <div class="field"><label>${esc(t('form.color'))}</label><div class="colors" id="f-colors" style="height:36px;align-items:center"></div></div>
      </div>
      <div class="field"><label>${esc(t('form.comments'))}</label><textarea class="input plain" id="f-notes" rows="2">${esc(c.comments)}</textarea></div>
    </section>

    <section class="tab-panel hidden" data-panel="project">
      <div class="proto-note secure">${icon('layers')}<span>${esc(t('form.cacheNote'))}</span></div>
      <label class="check"><input type="checkbox" id="f-restore" ${c.restoreTabs !== false ? 'checked' : ''}>
        <span>${esc(t('form.restoreTabs'))}<small>${esc(t('form.restoreTabsHint'))}</small></span></label>
      <div class="tree-opts">
        <label class="check"><input type="checkbox" id="f-hidden" ${c.showHidden !== false ? 'checked' : ''}>
          <span>${esc(t('form.showHidden'))}<small>${esc(t('form.showHiddenHint'))}</small></span></label>
        <div class="field"><label>${esc(t('form.exclude'))}</label><input class="input" id="f-exclude" value="${esc(c.exclude || '')}" placeholder="node_modules, .git, *.log" spellcheck="false">
          <small class="hint">${esc(t('form.excludeHint'))}</small></div>
      </div>
    </section>

    <section class="tab-panel hidden" data-panel="editor">
      <div class="field"><label>${esc(t('form.editorMode'))}</label><select class="input" id="f-edmode">${sel([['global', t('form.edGlobal')], ['custom', t('form.edCustom')]], c.editorMode || 'global')}</select></div>
    </section>

    <div class="test-result" id="f-result"></div>
  </div>`);

  const q = (s2) => body.querySelector(s2);
  q('[data-panel="editor"]').appendChild(ed.el);

  // Sekmeler
  body.querySelectorAll('#f-tabs button').forEach((b) => (b.onclick = () => {
    body.querySelectorAll('#f-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    body.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== b.dataset.tab));
  }));

  const protocol = () => (kind === 'ssh' ? 'sftp' : q('#f-proto').value);
  const usesSsh = () => protocol() === 'sftp';

  // Bağlantı bilgisi değişince klasör seçici yeniden test ister
  const invalidateTest = () => {
    testedOk = false;
    q('#f-browse').disabled = true;
    q('#f-browse-hint').classList.remove('hidden');
  };
  for (const id of ['#f-host', '#f-port', '#f-user', '#f-pass', '#f-key', '#f-phrase']) q(id).addEventListener('input', invalidateTest);
  q('#f-port').addEventListener('input', () => { portTouched = true; });

  const setLogin = (v) => {
    loginMethod = v;
    body.querySelectorAll('#f-login button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    q('#cred-fields').classList.toggle('hidden', v === 'anonymous' && !usesSsh());
    invalidateTest();
  };
  body.querySelectorAll('#f-login button').forEach((b) => (b.onclick = () => setLogin(b.dataset.v)));

  const setAuth = (v) => {
    authType = v;
    body.querySelectorAll('#f-auth button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    const key = v === 'key' && usesSsh();
    q('#key-fields').classList.toggle('hidden', !key);
    q('#pw-field').classList.toggle('hidden', key);
    invalidateTest();
  };
  body.querySelectorAll('#f-auth button').forEach((b) => (b.onclick = () => setAuth(b.dataset.v)));

  const setEnc = (v) => { nameEncoding = v; body.querySelectorAll('#f-enc button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
  body.querySelectorAll('#f-enc button').forEach((b) => (b.onclick = () => setEnc(b.dataset.v)));
  setEnc(nameEncoding);

  const defaultPort = () => (kind === 'ssh' ? 22 : PROTOCOLS[q('#f-proto').value].port);
  const applyDefaultPort = () => {
    const isDefault = [22, ...Object.values(PROTOCOLS).map((x) => x.port)].some((p) => String(p) === q('#f-port').value);
    if (!portTouched || isDefault) q('#f-port').value = defaultPort();
  };

  // Tür seçimi: SSH / FTP / Lokal klasör / Proje dosyası — altındaki alanlar türe göre açılır
  const setKind = (v) => {
    kind = v;
    body.querySelectorAll('#f-kind button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    const remote = v === 'ssh' || v === 'ftp';
    body.querySelectorAll('.remote-only').forEach((x) => x.classList.toggle('hidden', !remote));
    body.querySelectorAll('.local-only').forEach((x) => x.classList.toggle('hidden', remote));
    body.querySelectorAll('.ftp-only').forEach((x) => x.classList.toggle('hidden', v !== 'ftp'));
    q('.tree-opts').classList.toggle('hidden', v === 'file');
    q('#f-lpath-label').textContent = t(v === 'file' ? 'form.filePath' : 'form.folderPath');
    q('#f-lpath').placeholder = v === 'file' ? 'C:\\Projeler\\site\\index.php' : 'C:\\Projeler\\site';
    onProto();
    if (remote) applyDefaultPort();
  };

  const onProto = () => {
    const p = protocol();
    const ssh = p === 'sftp';
    body.querySelectorAll('.ssh-auth').forEach((x) => x.classList.toggle('hidden', !ssh));
    body.querySelectorAll('.plain-ftp-only').forEach((x) => x.classList.toggle('hidden', kind !== 'ftp' || ssh));
    if (ssh && loginMethod === 'anonymous') setLogin('normal');
    q('#f-proto-note').innerHTML = `${icon(PROTOCOLS[q('#f-proto').value].secure ? 'lock' : 'info')}<span>${esc(t('type.note.' + q('#f-proto').value))}</span>`;
    q('#f-proto-note').classList.toggle('secure', PROTOCOLS[q('#f-proto').value].secure);
    setAuth(authType);
  };
  q('#f-proto').addEventListener('change', () => { applyDefaultPort(); onProto(); invalidateTest(); });
  body.querySelectorAll('#f-kind button').forEach((b) => (b.onclick = () => { setKind(b.dataset.v); invalidateTest(); }));
  // Var olan bağlantının türü değiştirilemez (çalışma kopyası ve sekmeler türe bağlı)
  if (!isNew) body.querySelectorAll('#f-kind button').forEach((b) => (b.disabled = b.dataset.v !== kind));
  setLogin(loginMethod);
  setKind(kind);

  q('#f-eye').onclick = () => {
    const p = q('#f-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    q('#f-eye').innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeOff');
  };
  q('#f-keypick').onclick = async () => { const p = await window.api.pickKeyFile(); if (p) { q('#f-key').value = p; invalidateTest(); } };
  q('#f-lpick').onclick = async () => {
    const p = kind === 'file' ? await window.api.pickFile(q('#f-lpath').value) : await window.api.pickFolder(q('#f-lpath').value);
    if (!p) return;
    q('#f-lpath').value = p;
    if (!q('#f-name').value.trim()) q('#f-name').value = p.split(/[\\/]/).filter(Boolean).pop() || p;
  };

  const syncEdMode = () => {
    const custom = q('#f-edmode').value === 'custom';
    ed.setDisabled(!custom);
    if (!custom) ed.setValues(s.editor);
  };
  q('#f-edmode').onchange = syncEdMode;
  syncEdMode();

  const colorsEl = q('#f-colors');
  for (const col of COLORS) {
    const b = h(`<button type="button" style="--c:${col}" class="${col === color ? 'on' : ''}"></button>`);
    b.onclick = () => { color = col; colorsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    colorsEl.appendChild(b);
  }

  const readForm = () => {
    const p = protocol();
    const remote = kind === 'ssh' || kind === 'ftp';
    const lpath = q('#f-lpath').value.trim();
    return {
      id: c.id,
      kind,
      name: q('#f-name').value.trim() || (remote ? q('#f-host').value.trim() : lpath.split(/[\\/]/).filter(Boolean).pop() || ''),
      host: q('#f-host').value.trim(),
      port: Number(q('#f-port').value) || defaultPort(),
      protocol: p,
      loginMethod: p === 'sftp' ? 'normal' : loginMethod,
      username: q('#f-user').value.trim(),
      authType: p === 'sftp' ? authType : 'password',
      password: authType === 'password' || p !== 'sftp' ? q('#f-pass').value : '',
      keyPath: p === 'sftp' && authType === 'key' ? q('#f-key').value.trim() : '',
      passphrase: p === 'sftp' && authType === 'key' ? q('#f-phrase').value : '',
      nameEncoding,
      rootDir: q('#f-root').value.trim(),
      localPath: lpath,
      comments: q('#f-notes').value,
      folderId: q('#f-folder').value || null,
      color,
      showHidden: q('#f-hidden').checked,
      exclude: q('#f-exclude').value.trim(),
      restoreTabs: q('#f-restore').checked,
      editorMode: q('#f-edmode').value,
      editor: ed.read(),
      testedHostKey,
    };
  };

  const goTab = (name) => body.querySelector(`#f-tabs button[data-tab="${name}"]`).click();

  const validate = (forTest) => {
    const f = readForm();
    let ok = true;
    const mark = (id, bad) => { q(id).classList.toggle('invalid', bad); if (bad) ok = false; };
    if (kind === 'ssh' || kind === 'ftp') {
      mark('#f-host', !f.host);
      mark('#f-user', f.loginMethod !== 'anonymous' && !f.username);
      if (f.protocol === 'sftp' && f.authType === 'key') mark('#f-key', !f.keyPath);
    } else if (!forTest) {
      mark('#f-lpath', !f.localPath);
    }
    if (!ok) goTab('conn');
    return ok;
  };

  const showResult = (cls, html) => {
    const r = q('#f-result');
    r.className = `test-result show ${cls}`;
    r.innerHTML = html;
  };

  const runTest = async (btn) => {
    if (kind === 'local' || kind === 'file') return false;
    if (!validate(true)) return false;
    btn.disabled = true;
    showResult('', `<span class="spin" style="color:var(--accent);margin-top:2px"></span><div>${esc(t('form.connecting'))}</div>`);
    const res = await window.api.testConnection(readForm());
    btn.disabled = false;
    if (res.ok) {
      testedHostKey = res.fingerprint || null;
      testedOk = true;
      q('#f-browse').disabled = false;
      q('#f-browse-hint').classList.add('hidden');
      const lines = [];
      if (res.info) lines.push(esc(res.info));
      if (res.home) lines.push(esc(t('form.homeDir', { dir: res.home })));
      if (!res.rootOk) lines.push(`<span style="color:var(--warn)">${esc(t('form.rootMissing'))}</span>`);
      showResult('ok', `${icon('check')}<div><b>${esc(t('form.testOk'))}</b> · ${res.ms} ms${lines.length ? '<br>' + lines.join('<br>') : ''}
        ${res.fingerprint ? `<div class="fp">${esc(t('form.hostKey', { fp: res.fingerprint }))}</div>` : ''}</div>`);
    } else {
      showResult('err', `${icon('x')}<div><b>${esc(t('form.testFail'))}</b><br>${esc(res.message)}</div>`);
    }
    return false;
  };

  q('#f-browse').onclick = async () => {
    if (!testedOk) return;
    const r = await browseRemoteFolder(readForm(), q('#f-root').value.trim());
    if (r) { q('#f-root').value = r.dir; if (r.fingerprint && !testedHostKey) testedHostKey = r.fingerprint; }
  };

  const save = async (andOpen) => {
    if (!validate(false)) return false;
    const id = await window.api.saveConnection(readForm());
    toast(isNew ? t('form.saved') : t('form.changesSaved'), { type: 'ok', sub: q('#f-name').value || q('#f-host').value || q('#f-lpath').value });
    if (andOpen) window.api.openConnection(id);
    return true;
  };

  const testBtn = { label: t('form.test'), icon: 'bolt', left: true, onClick: (_m, btn) => runTest(btn) };
  await openModal({
    title: isNew ? t('form.titleNew') : t('form.titleEdit', { name: c.name }),
    iconName: 'link',
    width: 680,
    body,
    onMount: (m) => {
      // "Bağlantıyı dene" yalnız sunucu türlerinde
      const tb = [...m.querySelectorAll('footer .btn')].find((b) => b.textContent === t('form.test'));
      const sync = () => tb && tb.classList.toggle('hidden', !(kind === 'ssh' || kind === 'ftp'));
      body.querySelectorAll('#f-kind button').forEach((b) => b.addEventListener('click', sync));
      sync();
    },
    buttons: [
      testBtn,
      { label: t('common.cancel'), cls: 'ghost', value: null },
      { label: t('form.saveOpen'), onClick: () => save(true) },
      { label: t('common.save'), cls: 'primary', onClick: () => save(false) },
    ],
  });
}
