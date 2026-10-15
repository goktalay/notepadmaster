'use strict';

// Uygulama ayarları penceresi, Gece/Gündüz düğmesi ve hesap durumu (ana pencere ve proje penceresi ortak)

// --- Mastertool hesabı ve senkron durumu -------------------------------------------
let acct = { loggedIn: false };
const acctListeners = [];

function syncText(st) {
  if (!st.syncEnabled || st.state === 'off') return t('sync.off');
  if (st.state === 'syncing') return t('sync.syncing');
  if (st.state === 'offline') return t('sync.offline');
  if (st.state === 'error') {
    if (st.error === 'decrypt_failed') return t('sync.errDecrypt');
    if (st.error === 'too_large') return t('sync.errTooLarge');
    return t('sync.error', { msg: st.errorMessage || st.error });
  }
  return st.lastSyncAt ? t('acct.lastSync', { time: formatDate(st.lastSyncAt) }) : t('acct.never');
}

function onAcct(fn) { acctListeners.push(fn); fn(acct); }
function setAcct(st) {
  acct = st;
  const live = document.querySelector('#acct-status');
  if (live) live.textContent = syncText(acct);
  acctListeners.forEach((fn) => fn(acct));
}
window.api.onAccountStatus(setAcct);
window.api.accountState().then(setAcct);

async function logout() {
  const ok = await confirmBox(t('acct.logout'), esc(t('acct.logoutMsg')), { okText: t('acct.logout') });
  if (ok) window.api.logout();
}

// Hızlı tema düğmesi: Gece ↔ Gündüz
function themeButton(btn, getSettings) {
  const paint = () => {
    const dark = (getSettings().appTheme || 'dark') !== 'light' && !(getSettings().appTheme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.title = dark ? t('set.toLight') : t('set.toDark');
  };
  btn.onclick = async () => {
    const dark = !matchMedia('(prefers-color-scheme: light)').matches;
    await window.api.setSettings({ appTheme: dark ? 'light' : 'dark' });
  };
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', paint);
  paint();
  return paint;
}

async function openSettings(s) {
  let appTheme = s.appTheme || 'dark';
  const langOptions = Object.entries(I18N.LANGUAGES)
    .map(([code, l]) => `<option value="${code}" ${code === LANG ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const ed = editorForm(s.editor);
  const body = h(`<div style="display:grid;gap:16px">
    <div class="tabs" id="s-tabs">
      <button data-tab="general" class="on">${icon('gear')}${esc(t('set.tabGeneral'))}</button>
      <button data-tab="editor">${icon('code')}${esc(t('set.tabEditor'))}</button>
    </div>
    <section class="tab-panel" data-panel="general">
      <div class="section-title" style="margin:0">${esc(t('acct.section'))}</div>
      <div class="acct-box">
        <div class="acct-who">${icon('user')}<span>${esc(t('acct.signedInAs', { email: (acct.user && acct.user.email) || acct.email || '' }))}</span></div>
        <label class="check"><input type="checkbox" id="s-sync" ${acct.syncEnabled ? 'checked' : ''}>
          <span>${esc(t('acct.syncToggle'))}<small>${esc(t('acct.syncHint'))}</small></span></label>
        <div class="acct-status">${icon('cloud')}<span id="acct-status">${esc(syncText(acct))}</span></div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-syncnow">${icon('refresh')}${esc(t('acct.syncNow'))}</button>
          <button class="btn sm" type="button" id="s-delremote">${icon('trash')}${esc(t('acct.deleteRemote'))}</button>
          <button class="btn sm" type="button" id="s-web">${icon('open')}${esc(t('acct.myAccount'))}</button>
          <span style="flex:1"></span>
          <button class="btn sm danger" type="button" id="s-logout">${icon('logout')}${esc(t('acct.logout'))}</button>
        </div>
      </div>

      <div class="section-title" style="margin:6px 0 0">${esc(t('set.appearance'))}</div>
      <div class="row c-1-1">
        <div class="field"><label>${esc(t('set.theme'))}</label>
          <div class="seg" id="s-theme">
            <button data-v="dark">${icon('moon')}${esc(t('set.themeDark'))}</button>
            <button data-v="light">${icon('sun')}${esc(t('set.themeLight'))}</button>
            <button data-v="system">${icon('monitor')}${esc(t('set.themeSystem'))}</button>
          </div></div>
        <div class="field"><label>${esc(t('set.language'))}</label><select class="input" id="s-lang">${langOptions}</select></div>
      </div>

      <div class="section-title" style="margin:6px 0 0">${esc(t('set.cache'))}</div>
      <div class="proto-note secure">${icon('info')}<span>${esc(t('set.cacheHint'))}<br><code>${esc(window.__cacheDir || '')}</code></span></div>
      <div class="acct-actions">
        <button class="btn sm" type="button" id="s-cacheopen">${icon('folderOpen')}${esc(t('set.cacheOpen'))}</button>
        <button class="btn sm" type="button" id="s-cacheclear">${icon('broom')}${esc(t('set.cacheClear'))}</button>
      </div>
      <div class="about">${icon('info')} Notepad Master ${esc(window.api.version || '')}</div>
    </section>
    <section class="tab-panel hidden" data-panel="editor">
      <div class="proto-note secure">${icon('info')}<span>${esc(t('set.editorHint'))}</span></div>
    </section>
  </div>`);

  const q = (sel) => body.querySelector(sel);
  q('[data-panel="editor"]').appendChild(ed.el);
  body.querySelectorAll('#s-tabs button').forEach((b) => (b.onclick = () => {
    body.querySelectorAll('#s-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    body.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== b.dataset.tab));
  }));

  // Hesap bölümündeki işlemler anında uygulanır (Kaydet beklemez)
  q('#s-sync').onchange = async (e) => {
    const on = e.target.checked;
    const r = await window.api.setSyncEnabled(on);
    if (!r.ok) { e.target.checked = !on; toast(t('sync.error', { msg: r.code }), { type: 'err' }); }
  };
  q('#s-syncnow').onclick = () => window.api.syncNow();
  q('#s-web').onclick = () => window.api.openWeb('account');
  q('#s-delremote').onclick = async () => {
    const ok = await confirmBox(t('acct.deleteRemote'), esc(t('acct.deleteRemoteMsg')));
    if (!ok) return;
    const r = await window.api.deleteRemoteLibrary();
    if (r.ok) { q('#s-sync').checked = false; toast(t('acct.deleteRemoteDone'), { type: 'ok' }); }
    else toast(t('sync.error', { msg: r.code }), { type: 'err' });
  };
  q('#s-logout').onclick = logout;
  q('#s-cacheopen').onclick = () => window.api.openCacheDir();
  q('#s-cacheclear').onclick = async () => {
    const ok = await confirmBox(t('set.cacheClear'), esc(t('set.cacheClearMsg')), { okText: t('set.cacheClear') });
    if (!ok) return;
    await window.api.clearCache();
    toast(t('set.cacheCleared'), { type: 'ok' });
  };

  // Tema seçimi anında uygulanır (önizleme); İptal edilirse eski temaya döner
  const setTheme = (v) => {
    appTheme = v;
    body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    window.api.setSettings({ appTheme: v });
  };
  body.querySelectorAll('#s-theme button').forEach((b) => (b.onclick = () => setTheme(b.dataset.v)));
  body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === appTheme));
  const originalTheme = appTheme;

  const res = await openModal({
    title: t('set.title'), iconName: 'gear', width: 680, body,
    buttons: [
      { label: t('common.cancel'), value: null },
      { label: t('common.save'), cls: 'primary', onClick: () => ({ appTheme, language: q('#s-lang').value, editor: ed.read() }) },
    ],
  });
  if (!res) {
    if (appTheme !== originalTheme) window.api.setSettings({ appTheme: originalTheme });
    return null;
  }
  const langChanged = res.language !== LANG;
  if (!langChanged) delete res.language; // dil değişmediyse pencereyi yeniden yükleme
  await window.api.setSettings(res);
  if (!langChanged) toast(t('set.saved'), { type: 'ok' });
  return res;
}
