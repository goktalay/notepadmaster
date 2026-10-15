'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  // arayüz dili (açılışta senkron alınır ki ilk çizim doğru dilde olsun)
  lang: ipcRenderer.sendSync('app:lang'),
  version: ipcRenderer.sendSync('app:version'),

  // Mastertool hesabı ve senkron
  accountState: () => ipcRenderer.invoke('account:state'),
  login: (email, password, remember) => ipcRenderer.invoke('account:login', { email, password, remember }),
  logout: () => ipcRenderer.invoke('account:logout'),
  syncNow: () => ipcRenderer.invoke('account:syncNow'),
  setSyncEnabled: (on) => ipcRenderer.invoke('account:setSync', on),
  deleteRemoteLibrary: () => ipcRenderer.invoke('account:deleteRemote'),
  openWeb: (page) => ipcRenderer.invoke('account:openWeb', page), // 'forgot' | 'register' | 'account'
  onAccountStatus: on('account:status'),
  onUpdateAvailable: on('app:update'),
  onLibraryBackup: on('account:backup'),
  openMastertool: () => ipcRenderer.invoke('app:openMastertool'),

  // depo
  getStore: () => ipcRenderer.invoke('store:get'),
  onStoreChanged: on('store:changed'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  showMain: () => ipcRenderer.invoke('app:showMain'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  openCacheDir: () => ipcRenderer.invoke('cache:open'),

  // bağlantılar
  saveConnection: (form) => ipcRenderer.invoke('conn:save', form),
  deleteConnection: (id) => ipcRenderer.invoke('conn:delete', id),
  duplicateConnection: (id) => ipcRenderer.invoke('conn:duplicate', id),
  moveConnection: (id, folderId) => ipcRenderer.invoke('conn:move', { id, folderId }),
  setLocalPath: (id, localPath) => ipcRenderer.invoke('conn:setLocalPath', { id, localPath }),
  testConnection: (form) => ipcRenderer.invoke('conn:test', form),
  openConnection: (id) => ipcRenderer.invoke('conn:open', id),
  pickKeyFile: () => ipcRenderer.invoke('dialog:pickKey'),
  pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
  pickFile: (defaultPath) => ipcRenderer.invoke('dialog:pickFile', defaultPath),

  // bağlantı formu: uzak klasör seçici
  browseOpen: (form) => ipcRenderer.invoke('browse:open', form),
  browseList: (token, dir) => ipcRenderer.invoke('browse:list', { token, dir }),
  browseClose: (token) => ipcRenderer.invoke('browse:close', token),

  // klasörler
  saveFolder: (f) => ipcRenderer.invoke('folder:save', f),
  moveFolder: (id, parentId) => ipcRenderer.invoke('folder:move', { id, parentId }),
  deleteFolder: (id) => ipcRenderer.invoke('folder:delete', id),

  // proje penceresi
  projOpen: () => ipcRenderer.invoke('proj:open'),
  projReconnect: () => ipcRenderer.invoke('proj:reconnect'),
  projList: (dir) => ipcRenderer.invoke('proj:list', dir),
  projRead: (path, encoding, fallback) => ipcRenderer.invoke('proj:read', { path, encoding, fallback }),
  projSave: (args) => ipcRenderer.invoke('proj:save', args),
  projNewFile: (p) => ipcRenderer.invoke('proj:newFile', p),
  projMkdir: (p) => ipcRenderer.invoke('proj:mkdir', p),
  projRename: (from, to) => ipcRenderer.invoke('proj:rename', { from, to }),
  projDelete: (path, isDir) => ipcRenderer.invoke('proj:delete', { path, isDir }),
  projTabs: (openTabs, activeTab) => ipcRenderer.send('proj:tabs', { openTabs, activeTab }),
  projRevealCache: (p) => ipcRenderer.invoke('proj:revealCache', p),
  onProjStatus: on('proj:status'),

  revealLocal: (p) => ipcRenderer.invoke('local:reveal', p),
  clipboardWrite: (t) => ipcRenderer.invoke('clipboard:write', t),
});
