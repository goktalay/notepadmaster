'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, clipboard, nativeTheme, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const I18N = require('./i18n');
const NPDEF = require('./defaults');
const { createRemote, friendlyError, PROTOCOLS } = require('./remote');
const { ProjectSession } = require('./project');
const { createAccount, API_BASE } = require('./account');

// Arayüz dili: ayarlarda seçilen ya da sistem dili (desteklenmiyorsa İngilizce)
let t = I18N.createT('en');
const currentLang = () => (store && store.settings.language) || I18N.resolveLanguage(app.getLocale());
function applyLanguage() { t = I18N.createT(currentLang()); }

const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const errText = (err) => (err && err.code === 'NOLOCAL' ? t('main.errNoLocal') : friendlyError(err, t));
const KINDS = ['ssh', 'ftp', 'local', 'file'];

// ---------------------------------------------------------------------------
// Kalıcı depo (userData/store.json)
// ---------------------------------------------------------------------------
const storePath = () => path.join(app.getPath('userData'), 'store.json');
const cacheDir = () => path.join(app.getPath('userData'), 'cache');

const defaultStore = () => ({
  folders: [],      // { id, name, parentId }
  connections: [],  // bağlantı kayıtları, bkz. conn:save
  syncMeta: {},     // senkron: öğe id -> { kind, hash, updated_at, rev, device, deleted }
  settings: {
    appTheme: 'system', // 'dark' | 'light' | 'system' (Mastertool standardı: varsayılan Sistem)
    language: null,     // null = sistem dili
    editor: { ...NPDEF.EDITOR_DEFAULTS },
    // cihaza özgü (senkronlanmaz)
    treeWidth: 300,
    treeOpen: true,
    minimizeToTray: true, // ana pencere küçültülünce sistem tepsisine gizlenir
    closeToTray: false,   // ana pencerenin kapat (X) düğmesi uygulamayı tepsiye gizler
    openAtLogin: false,   // Windows oturumu açılınca başlat
  },
});

let store = null;

const uid = () => crypto.randomBytes(8).toString('hex');

function loadStore() {
  applyLanguage();
  try {
    store = { ...defaultStore(), ...JSON.parse(fs.readFileSync(storePath(), 'utf8')) };
    store.settings = { ...defaultStore().settings, ...(store.settings || {}) };
    if (!store.syncMeta) store.syncMeta = {};
  } catch {
    store = defaultStore();
  }
  store.settings.editor = NPDEF.sanitizeEditor(store.settings.editor);
  applyAppTheme();
  applyLanguage();
}

// Gece / Gündüz / Sistem: tüm pencerelerin prefers-color-scheme'ini ve başlık çubuklarını belirler
function applyAppTheme() {
  const v = store.settings.appTheme;
  nativeTheme.themeSource = v === 'dark' || v === 'light' ? v : 'system';
}
const windowBg = () => (nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#eef2f7');

let saveTimer = null;
// Kütüphane değişikliği kaydedilir ve (3 sn sonra) senkron tetiklenir; cihaza özgü kayıtlar için { sync: false }
function saveStore({ sync = true } = {}) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeStore, 150);
  if (sync && account) account.onLocalChange();
}
function writeStore() {
  saveTimer = null;
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
}

function encrypt(text) {
  if (!text) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
  return 'b64:' + Buffer.from(text, 'utf8').toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
  return value;
}

// Arayüze gönderilen kopya: şifreler asla renderer'a gitmez.
function publicConn(c) {
  const { password, passphrase, hostKey, ...rest } = c;
  return { ...rest, hasPassword: !!password, hasPassphrase: !!passphrase, hasLocalPath: !!c.localPath && fs.existsSync(c.localPath) };
}
function publicStore() {
  return { folders: store.folders, settings: store.settings, connections: store.connections.map(publicConn), cacheDir: cacheDir() };
}

function broadcastStore() {
  if (tray) tray.setContextMenu(buildTrayMenu());
  const data = publicStore();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('store:changed', data);
}

// Kayıtlı bağlantının çözülmüş (şifreli alanları açılmış) hali
function resolveConnection(id) {
  const c = store.connections.find((x) => x.id === id);
  if (!c) throw new Error(t('main.errConnNotFound'));
  return { ...c, password: decrypt(c.password), passphrase: decrypt(c.passphrase) };
}

// Formdan gelen veri; boş şifre alanı düzenlemede "değiştirme" anlamına gelir.
function mergeFormWithStored(form) {
  const stored = form.id ? store.connections.find((x) => x.id === form.id) : null;
  const sameHost = stored && stored.host === form.host && Number(stored.port) === Number(form.port);
  return {
    ...form,
    id: form.id || 'test',
    password: form.password || (stored && !form.clearPassword ? decrypt(stored.password) : ''),
    passphrase: form.passphrase || (stored ? decrypt(stored.passphrase) : ''),
    hostKey: sameHost ? stored.hostKey : null,
  };
}

// ---------------------------------------------------------------------------
// Mastertool hesabı (notepadmaster.com) ve uçtan uca şifreli senkron
// ---------------------------------------------------------------------------
let account = null;
let loginWindow = null;
let loginNotice = null; // giriş ekranında gösterilecek bilgi (ör. oturum süresi doldu)

function initAccount() {
  account = createAccount({
    userDataDir: app.getPath('userData'),
    appVersion: app.getVersion(),
    encrypt,
    decrypt,
    getStore: () => store,
    // Senkrondan gelen kütüphaneyi uygula (yeni senkron tetiklemeden)
    replaceLibrary: ({ folders, connections, settings, syncMeta }) => {
      const prevLang = currentLang();
      Object.assign(store, { folders, connections, syncMeta });
      Object.assign(store.settings, settings);
      store.settings.editor = NPDEF.sanitizeEditor(store.settings.editor);
      writeStore();
      applyAppTheme();
      applyLanguage();
      broadcastStore();
      if (currentLang() !== prevLang && mainWindow) mainWindow.webContents.reload();
    },
    persistStore: writeStore,
    // Başka bir hesapla giriş: önceki kütüphaneyi yedekle, temiz başla (yerel kopya silinmez)
    backupAndClearLibrary: () => {
      const hasData = store.connections.length || store.folders.length;
      let file = null;
      if (hasData) {
        file = path.join(app.getPath('userData'), `store-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
      }
      Object.assign(store, { folders: [], connections: [], syncMeta: {} });
      writeStore();
      return file;
    },
    onStatus: (st) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('account:status', st);
    },
    onSessionExpired: (code) =>
      showLogin(t(code === 'app_disabled' ? 'auth.errAppDisabled' : code === 'wrong_app' ? 'auth.errWrongApp' : 'auth.errSessionExpired')),
    onUpdate: (info) => mainWindow && mainWindow.webContents.send('app:update', info),
  });
}

const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false };

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 440,
    height: 640,
    resizable: false,
    maximizable: false,
    backgroundColor: windowBg(),
    title: 'Notepad Master',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences,
  });
  loginWindow.setMenuBarVisibility(false);
  loginWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
  loginWindow.on('closed', () => (loginWindow = null));
}

// Oturum yoksa ya da düştüyse: giriş ekranını aç, diğer tüm pencereleri kapat.
// Proje pencereleri normal yolla kapatılır; kaydedilmemiş sekme varsa kullanıcıya sorulur (vazgeçerse açık kalır).
function showLogin(notice) {
  loginNotice = notice || null;
  destroyTray();
  if (!loginWindow) createLoginWindow();
  else loginWindow.focus();
  const projects = new Set(projectWindows.values());
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === loginWindow) continue;
    if (projects.has(w)) w.close(); else w.destroy();
  }
  mainWindow = null;
}

// ---------------------------------------------------------------------------
// Pencereler
// ---------------------------------------------------------------------------
let mainWindow = null;
const projectWindows = new Map(); // bağlantı id -> BrowserWindow

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: windowBg(),
    title: 'Notepad Master',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences,
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('minimize', (e) => {
    if (!store.settings.minimizeToTray) return;
    e.preventDefault();
    hideToTray();
  });
  mainWindow.on('close', (e) => {
    if (store.settings.closeToTray && !isQuitting) {
      e.preventDefault();
      hideToTray();
    }
  });
  mainWindow.on('show', destroyTray);
  mainWindow.on('closed', () => (mainWindow = null));
}

function showMainWindow() {
  if (!account || !account.isLoggedIn()) {
    if (loginWindow) loginWindow.focus(); else showLogin();
    return;
  }
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------------------
// Sistem tepsisi (Mastertool standardı; SSH Master ile aynı davranış)
// ---------------------------------------------------------------------------
let tray = null;
let isQuitting = false;

function hideToTray() {
  ensureTray();
  mainWindow.hide();
  if (!store.settings.trayHintShown) {
    store.settings.trayHintShown = true;
    saveStore({ sync: false });
    tray.displayBalloon({ iconType: 'info', title: t('main.balloonTitle'), content: t('main.balloonBody') });
  }
}

function buildTrayMenu() {
  // Hızlı aç: klasör yapısına göre alt menüler
  const connItems = (folderId) => {
    const items = [];
    for (const f of store.folders.filter((x) => (x.parentId || null) === folderId).sort((a, b) => a.name.localeCompare(b.name, currentLang()))) {
      const sub = connItems(f.id);
      if (sub.length) items.push({ label: f.name, submenu: sub });
    }
    for (const c of store.connections.filter((x) => (x.folderId || null) === folderId).sort((a, b) => a.name.localeCompare(b.name, currentLang()))) {
      items.push({ label: c.name, click: () => openProjectWindow(c.id) });
    }
    return items;
  };
  const conns = connItems(null);
  return Menu.buildFromTemplate([
    { label: t('main.trayShow'), click: showMainWindow },
    { type: 'separator' },
    { label: t('main.trayQuick'), submenu: conns.length ? conns : [{ label: t('main.trayNone'), enabled: false }] },
    { type: 'separator' },
    { label: t('main.trayQuit'), click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function ensureTray() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    return;
  }
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(img);
  tray.setToolTip('Notepad Master');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// Bir bağlantı tek pencerede açılır; zaten açıksa öne getirilir
function openProjectWindow(id) {
  if (!account || !account.isLoggedIn()) return;
  const c = store.connections.find((x) => x.id === id);
  if (!c) return;
  const existing = projectWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const single = c.kind === 'file';
  const win = new BrowserWindow({
    width: single ? 1100 : 1440,
    height: single ? 760 : 880,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: windowBg(),
    title: `${c.name} — Notepad Master`,
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences,
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'project.html'), { query: { id } });
  projectWindows.set(id, win);
  const wcId = win.webContents.id;
  // Kaydedilmemiş sekme varsa renderer "beforeunload" ile kapanmayı durdurur; burada kullanıcıya sorulur
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: [t('main.closeDiscard'), t('common.cancel')],
      defaultId: 1,
      cancelId: 1,
      title: 'Notepad Master',
      message: t('main.closeDirty'),
    });
    if (choice === 0) e.preventDefault(); // preventDefault burada "boşaltmaya izin ver" demektir
  });
  win.on('closed', () => {
    closeSession(wcId);
    if (projectWindows.get(id) === win) projectWindows.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Proje oturumları (her proje penceresi bir oturum)
// ---------------------------------------------------------------------------
const sessions = new Map(); // webContents.id -> ProjectSession

function closeSession(wcId) {
  const s = sessions.get(wcId);
  if (!s) return;
  sessions.delete(wcId);
  s.close();
}

function getSession(event) {
  const s = sessions.get(event.sender.id);
  if (!s) throw new Error(t('main.errNoSession'));
  return s;
}

function rememberHostKey(id, fingerprint) {
  const c = store.connections.find((x) => x.id === id);
  if (c && fingerprint && c.hostKey !== fingerprint) {
    c.hostKey = fingerprint;
    saveStore();
  }
}

// Hata mesajını kullanıcı dostu hale getirip fırlatır (renderer'a temiz metin gitsin)
const wrap = (fn) => async (event, arg) => {
  try {
    return await fn(event, arg);
  } catch (err) {
    throw new Error(errText(err));
  }
};

ipcMain.handle('proj:open', async (event) => {
  const wc = event.sender;
  const id = new URL(wc.getURL()).searchParams.get('id');
  closeSession(wc.id);
  let conn;
  try {
    conn = resolveConnection(id);
  } catch (err) {
    return { ok: false, message: err.message };
  }
  const session = new ProjectSession({
    conn,
    cacheDir: cacheDir(),
    onHostKey: (fp) => rememberHostKey(id, fp),
    onStatus: (st) => !wc.isDestroyed() && wc.send('proj:status', st),
  });
  session.trash = (p) => shell.trashItem(p); // yerelde silme Geri Dönüşüm Kutusu'na
  sessions.set(wc.id, session);
  try {
    const info = await session.open();
    return { ok: true, ...info, cacheRoot: session.cacheRoot };
  } catch (err) {
    return { ok: false, message: errText(err), code: err.code };
  }
});

ipcMain.handle('proj:reconnect', wrap(async (event) => { await getSession(event).connect(); }));
ipcMain.handle('proj:list', wrap((event, dir) => getSession(event).list(dir)));
ipcMain.handle('proj:read', wrap((event, { path: p, encoding, fallback }) => getSession(event).read(p, { encoding, fallback })));
ipcMain.handle('proj:save', wrap((event, { path: p, text, encoding, bom, expect, force, allowLossy }) =>
  getSession(event).save(p, text, { encoding, bom, expect, force, allowLossy })));
ipcMain.handle('proj:newFile', wrap((event, p) => getSession(event).createFile(p)));
ipcMain.handle('proj:mkdir', wrap((event, p) => getSession(event).mkdir(p)));
ipcMain.handle('proj:rename', wrap((event, { from, to }) => getSession(event).rename(from, to)));
ipcMain.handle('proj:delete', wrap((event, { path: p, isDir }) => getSession(event).remove(p, isDir)));

// Proje penceresinde açık sekmeler (cihaza özgü; bir sonraki açılışta geri yüklenir)
ipcMain.on('proj:tabs', (event, { openTabs, activeTab }) => {
  const s = sessions.get(event.sender.id);
  if (!s) return;
  const c = store.connections.find((x) => x.id === s.conn.id);
  if (!c) return;
  c.openTabs = (openTabs || []).filter((x) => typeof x === 'string').slice(0, 50);
  c.activeTab = typeof activeTab === 'string' ? activeTab : null;
  saveStore({ sync: false });
});

// Çalışma kopyasını Gezgin'de göster (dosya ya da bağlantının önbellek klasörü)
ipcMain.handle('proj:revealCache', (event, p) => {
  const s = sessions.get(event.sender.id);
  if (!s) return;
  const target = p ? s.cachePath(p) : s.cacheRoot;
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  else { fs.mkdirSync(s.cacheRoot, { recursive: true }); shell.openPath(s.cacheRoot); }
});

// ---------------------------------------------------------------------------
// Bağlantı formu: uzak klasör seçici (test edilen bağlantı üzerinden gezinilir)
// ---------------------------------------------------------------------------
const browsers = new Map(); // token -> { remote, owner }

function closeBrowser(token) {
  const b = browsers.get(token);
  if (!b) return;
  browsers.delete(token);
  b.remote.close();
}

ipcMain.handle('browse:open', async (event, form) => {
  const conn = mergeFormWithStored(form);
  try {
    const remote = createRemote(conn);
    await remote.connect();
    let home = '/';
    try { home = await remote.pwd(); } catch {}
    const token = uid();
    browsers.set(token, { remote, owner: event.sender.id });
    return { ok: true, token, home, fingerprint: remote.fingerprint || null };
  } catch (err) {
    return { ok: false, message: errText(err) };
  }
});

ipcMain.handle('browse:list', wrap(async (_e, { token, dir }) => {
  const b = browsers.get(token);
  if (!b) throw new Error(t('main.errNoSession'));
  return (await b.remote.list(dir)).filter((x) => x.isDir).map((x) => ({ name: x.name, path: x.path }));
}));

ipcMain.handle('browse:close', (_e, token) => closeBrowser(token));

// ---------------------------------------------------------------------------
// Diyaloglar ve yardımcılar
// ---------------------------------------------------------------------------
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));
ipcMain.handle('local:reveal', (_e, p) => p && shell.showItemInFolder(p));

ipcMain.handle('dialog:pickFolder', async (event, defaultPath) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    defaultPath: defaultPath || os.homedir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:pickFile', async (event, defaultPath) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    defaultPath: defaultPath || os.homedir(),
    properties: ['openFile'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:pickKey', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: t('main.pickKey'),
    defaultPath: path.join(os.homedir(), '.ssh'),
    properties: ['openFile', 'showHiddenFiles'],
  });
  return res.canceled ? null : res.filePaths[0];
});

// ---------------------------------------------------------------------------
// Depo ve hesap
// ---------------------------------------------------------------------------
ipcMain.handle('store:get', () => publicStore());

ipcMain.handle('account:state', () => ({ ...account.state(), notice: loginNotice, appVersion: app.getVersion() }));

ipcMain.handle('account:login', async (_e, { email, password, remember }) => {
  try {
    const { backupFile } = await account.login(email, password, remember);
    loginNotice = null;
    // Önce ana pencere açılır, sonra giriş penceresi kapanır (aksi halde uygulama kapanırdı)
    if (!mainWindow) createMainWindow();
    if (loginWindow) loginWindow.destroy();
    if (backupFile) mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('account:backup', backupFile));
    account.start();
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code || 'error', message: e.message };
  }
});

ipcMain.handle('account:logout', async () => {
  await account.logout();
  showLogin();
});

ipcMain.handle('account:syncNow', () => account.syncNow());
ipcMain.handle('account:setSync', async (_e, on) => {
  try { await account.setSyncEnabled(on); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
});
ipcMain.handle('account:deleteRemote', async () => {
  try { await account.deleteRemote(); return { ok: true }; } catch (e) { return { ok: false, code: e.code }; }
});

// Mastertool düğmesi: portal, uygulamanın dili ve o anki gece/gündüz temasıyla tarayıcıda açılır
ipcMain.handle('app:openMastertool', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  shell.openExternal(`https://mastertool.download/?lang=${encodeURIComponent(currentLang())}&theme=${theme}`);
});

// Hesap sayfaları varsayılan tarayıcıda, uygulamanın diliyle ve o anki temasıyla açılır (yalnız bu adresler)
ipcMain.handle('account:openWeb', (_e, page) => {
  const allowed = { forgot: '/sifremi-unuttum', register: '/kayit', account: '/hesabim' };
  if (!allowed[page]) return;
  const q = new URLSearchParams({ lang: currentLang(), theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light', app: 'np' });
  shell.openExternal(`${API_BASE}${allowed[page]}?${q}`);
});

// Windows oturumu açılınca başlat (yalnız paketlenmiş uygulamada; geliştirmede electron.exe kaydedilmesin)
function applyOpenAtLogin() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!store.settings.openAtLogin, args: ['--hidden'] });
}

ipcMain.handle('app:about', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  openAtLogin: app.isPackaged ? app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin : !!store.settings.openAtLogin,
}));

ipcMain.handle('app:checkUpdate', async () => {
  try {
    return { ok: true, ...(await account.checkUpdate({ manual: true })) };
  } catch (e) {
    return { ok: false, code: e.code || 'error', message: e.message };
  }
});

// Chromium/Electron lisans dosyaları kurulum klasöründe durur
ipcMain.handle('app:openLicenses', () => {
  const file = path.join(path.dirname(process.execPath), 'LICENSES.chromium.html');
  if (fs.existsSync(file)) return shell.openPath(file);
  return shell.openExternal('https://www.electronjs.org/docs/latest#license');
});
ipcMain.on('app:lang', (e) => { e.returnValue = currentLang(); });
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });

// ---------------------------------------------------------------------------
// Bağlantılar ve klasörler
// ---------------------------------------------------------------------------
const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

ipcMain.handle('conn:save', (_e, form) => {
  let c = form.id ? store.connections.find((x) => x.id === form.id) : null;
  if (!c) {
    c = { id: uid(), createdAt: Date.now(), openTabs: [] };
    store.connections.push(c);
  }
  const kind = oneOf(form.kind, KINDS, c.kind || 'ssh');
  const protocol = kind === 'ssh' ? 'sftp' : kind === 'ftp' ? oneOf(form.protocol, Object.keys(PROTOCOLS), 'ftp') : null;
  const remoteKind = kind === 'ssh' || kind === 'ftp';
  // Sunucu, port veya protokol değiştiyse eski SSH host anahtarını unut
  if (c.host && (c.host !== form.host || Number(c.port) !== Number(form.port) || c.protocol !== protocol)) c.hostKey = null;
  const localPath = remoteKind ? '' : str(form.localPath, 2000);
  Object.assign(c, {
    kind,
    name: str(form.name, 200) || (remoteKind ? str(form.host) : path.basename(localPath)) || '—',
    comments: String(form.comments || '').slice(0, 4000),
    folderId: form.folderId ?? c.folderId ?? null,
    color: /^#[0-9a-f]{6}$/i.test(form.color) ? form.color : c.color || '#22d3ee',
    // sunucu
    host: remoteKind ? str(form.host, 255) : '',
    protocol,
    port: remoteKind ? num(form.port, PROTOCOLS[protocol].port, 1, 65535) : null,
    username: remoteKind ? str(form.username, 200) : '',
    loginMethod: kind === 'ftp' && protocol !== 'sftp' ? oneOf(form.loginMethod, ['normal', 'anonymous'], 'normal') : 'normal',
    authType: protocol === 'sftp' && form.authType === 'key' ? 'key' : 'password',
    keyPath: protocol === 'sftp' && form.authType === 'key' ? str(form.keyPath, 2000) : '',
    nameEncoding: kind === 'ftp' ? oneOf(form.nameEncoding, ['auto', 'utf8', 'ascii'], 'auto') : 'auto',
    rootDir: remoteKind ? str(form.rootDir, 2000) : '',
    // yerel (cihaza özgü, senkronlanmaz)
    localPath,
    // gezgin
    showHidden: form.showHidden !== false,
    exclude: str(form.exclude, 1000),
    restoreTabs: form.restoreTabs !== false,
    // editör (Notepad++ ayarları)
    editorMode: form.editorMode === 'custom' ? 'custom' : 'global',
    editor: NPDEF.sanitizeEditor(form.editor, store.settings.editor),
  });
  if (!remoteKind) { c.password = ''; c.passphrase = ''; c.hostKey = null; }
  if (form.password) c.password = encrypt(form.password);
  if (form.clearPassword) c.password = '';
  if (form.passphrase) c.passphrase = encrypt(form.passphrase);
  if (form.testedHostKey && !c.hostKey) c.hostKey = form.testedHostKey;
  saveStore();
  broadcastStore();
  return c.id;
});

// Senkronla gelen yerel klasör/dosya bağlantısına bu cihazdaki yolu ata (senkronlanmaz)
ipcMain.handle('conn:setLocalPath', (_e, { id, localPath }) => {
  const c = store.connections.find((x) => x.id === id);
  if (!c || !['local', 'file'].includes(c.kind)) return;
  c.localPath = str(localPath, 2000);
  saveStore({ sync: false });
  broadcastStore();
});

ipcMain.handle('conn:delete', (_e, id) => {
  store.connections = store.connections.filter((c) => c.id !== id);
  const w = projectWindows.get(id);
  if (w && !w.isDestroyed()) w.close();
  fs.promises.rm(path.join(cacheDir(), id), { recursive: true, force: true }).catch(() => {});
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:duplicate', (_e, id) => {
  const c = store.connections.find((x) => x.id === id);
  if (!c) return;
  store.connections.push({ ...JSON.parse(JSON.stringify(c)), id: uid(), name: c.name + t('main.copySuffix'), createdAt: Date.now(), openTabs: [], activeTab: null });
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:move', (_e, { id, folderId }) => {
  const c = store.connections.find((x) => x.id === id);
  if (c) c.folderId = folderId || null;
  saveStore();
  broadcastStore();
});

ipcMain.handle('conn:test', async (_e, form) => {
  const conn = mergeFormWithStored(form);
  if (!conn.host) return { ok: false, message: t('main.errHost') };
  if (conn.loginMethod !== 'anonymous' && !conn.username) return { ok: false, message: t('main.errUser') };
  const started = Date.now();
  let remote;
  try {
    remote = createRemote(conn);
    await remote.connect();
    const ms = Date.now() - started;
    let info = '';
    let home = '';
    try { info = await remote.info(); } catch {}
    try { home = await remote.pwd(); } catch {}
    let rootOk = true;
    if (conn.rootDir) {
      try { await remote.list(conn.rootDir); } catch { rootOk = false; }
    }
    return { ok: true, ms, info, home, rootOk, fingerprint: remote.fingerprint, firstTime: remote.fingerprint && !conn.hostKey };
  } catch (err) {
    return { ok: false, message: errText(err) };
  } finally {
    if (remote) remote.close();
  }
});

ipcMain.handle('conn:open', (_e, id) => openProjectWindow(id));
ipcMain.handle('app:showMain', () => showMainWindow());

ipcMain.handle('folder:save', (_e, { id, name, parentId }) => {
  let f = id ? store.folders.find((x) => x.id === id) : null;
  if (!f) {
    f = { id: uid(), parentId: parentId || null };
    store.folders.push(f);
  }
  f.name = str(name, 200);
  saveStore();
  broadcastStore();
  return f.id;
});

ipcMain.handle('folder:move', (_e, { id, parentId }) => {
  // Bir klasörü kendi alt klasörüne taşımayı engelle
  let p = parentId;
  while (p) {
    if (p === id) return false;
    p = (store.folders.find((x) => x.id === p) || {}).parentId;
  }
  const f = store.folders.find((x) => x.id === id);
  if (f) f.parentId = parentId || null;
  saveStore();
  broadcastStore();
  return true;
});

ipcMain.handle('folder:delete', (_e, id) => {
  const f = store.folders.find((x) => x.id === id);
  if (!f) return;
  // İçerik üst klasöre taşınır
  for (const c of store.connections) if (c.folderId === id) c.folderId = f.parentId || null;
  for (const sub of store.folders) if (sub.parentId === id) sub.parentId = f.parentId || null;
  store.folders = store.folders.filter((x) => x.id !== id);
  saveStore();
  broadcastStore();
});

// Görünüm ayarları (panel genişliği vb.) sessizce kaydedilir, senkronlanmaz ve yayınlanmaz
const QUIET_SETTINGS = ['treeWidth', 'treeOpen', 'minimizeToTray', 'closeToTray', 'openAtLogin', 'trayHintShown'];

ipcMain.handle('settings:set', (_e, patch) => {
  if ('editor' in patch) patch.editor = NPDEF.sanitizeEditor(patch.editor, store.settings.editor);
  Object.assign(store.settings, patch);
  const loud = Object.keys(patch).some((k) => !QUIET_SETTINGS.includes(k));
  saveStore({ sync: loud });
  if ('openAtLogin' in patch) applyOpenAtLogin();
  if ('appTheme' in patch) applyAppTheme();
  if ('language' in patch) {
    applyLanguage();
    if (tray) tray.setContextMenu(buildTrayMenu());
    // Proje pencereleri yeniden yüklenirse kaydedilmemiş değişiklikler kaybolur; yalnız ana ve giriş penceresi yenilenir
    if (mainWindow) mainWindow.webContents.reload();
    if (loginWindow) loginWindow.webContents.reload();
    return;
  }
  if (loud || ['minimizeToTray', 'closeToTray'].some((k) => k in patch)) broadcastStore();
});

// Çalışma kopyalarını temizle (açık proje pencereleri yeniden açtıkça yeniden oluşur)
ipcMain.handle('cache:clear', async () => {
  await fs.promises.rm(cacheDir(), { recursive: true, force: true });
});
ipcMain.handle('cache:open', async () => {
  await fs.promises.mkdir(cacheDir(), { recursive: true });
  shell.openPath(cacheDir());
});

// ---------------------------------------------------------------------------
app.setAppUserModelId('com.notepadmaster.app');

app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('destroyed', () => {
    for (const [token, b] of browsers) if (b.owner === wc.id) closeBrowser(token);
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => (isQuitting = true));

  app.whenReady().then(() => {
    loadStore();
    initAccount();
    // Uygulama girişsiz açılmaz. "Beni hatırla" ile saklı oturum varsa doğrudan açılır
    // (çevrimdışıyken yerel kütüphaneyle), oturum sunucuda düşmüşse giriş ekranına dönülür.
    if (account.isLoggedIn()) {
      createMainWindow();
      // Windows oturumuyla başlatıldıysa ve tepsiye küçültme açıksa doğrudan tepside başla
      if (process.argv.includes('--hidden') && store.settings.minimizeToTray) {
        mainWindow.once('ready-to-show', () => hideToTray());
      }
      account.start();
    } else {
      createLoginWindow();
    }
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && showMainWindow());
  });

  app.on('window-all-closed', () => {
    if (saveTimer) { clearTimeout(saveTimer); writeStore(); }
    app.quit();
  });
}
