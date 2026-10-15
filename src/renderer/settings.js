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
    const dark = !matchMedia('(prefers-color-scheme: light)').matches; // o anki gerçek tema (Sistem tercihi dahil)
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

// Açık kaynak bileşenleri (Hakkında › lisanslar)
const OSS = [
  ['Notepad Master', 'MIT'], ['Electron', 'MIT'], ['Chromium', 'BSD-3-Clause +'], ['Node.js', 'MIT'],
  ['Monaco Editor', 'MIT'], ['ssh2', 'MIT'], ['basic-ftp', 'MIT'], ['iconv-lite', 'MIT'],
];

// Ayarlar penceresi — Mastertool ortak iskeleti: Genel · Hesap · uygulamaya özel (Editör) · Hakkında
async function openSettings(s, startTab = 'general') {
  s = s || {};
  let appTheme = s.appTheme || 'system';
  const about = await window.api.about();
  const langOptions = Object.entries(I18N.LANGUAGES)
    .map(([code, l]) => `<option value="${code}" ${code === LANG ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const tabs = [
    ['general', 'gear', t('set.general')],
    ['account', 'user', t('set.account')],
    ['editor', 'code', t('set.tabEditor')],
    ['about', 'bolt', t('set.about')],
  ];
  const email = (acct.user && acct.user.email) || acct.email || '';
  const ed = editorForm(s.editor);

  const body = h(`<div class="set-wrap">
    <nav class="set-nav">${tabs.map(([k, ic, label]) => `<button type="button" data-tab="${k}">${icon(ic)}<span>${esc(label)}</span></button>`).join('')}</nav>
    <div class="set-pages">
      <section data-page="general">
        <div class="field"><label>${esc(t('set.language'))}</label><select class="input" id="s-lang">${langOptions}</select>
          <small class="set-hint">${esc(t('set.languageHint'))}</small></div>
        <div class="field"><label>${esc(t('set.theme'))}</label>
          <div class="seg" id="s-theme">
            <button type="button" data-v="dark">${icon('moon')}${esc(t('set.themeDark'))}</button>
            <button type="button" data-v="light">${icon('sun')}${esc(t('set.themeLight'))}</button>
            <button type="button" data-v="system">${icon('monitor')}${esc(t('set.themeSystem'))}</button>
          </div></div>
        <div class="section-title">${esc(t('set.startup'))}</div>
        <label class="check"><input type="checkbox" id="s-login" ${about.openAtLogin ? 'checked' : ''}>
          <span>${esc(t('set.openAtLogin'))}<small>${esc(t('set.openAtLoginHint'))}</small></span></label>
        <label class="check"><input type="checkbox" id="s-min" ${s.minimizeToTray !== false ? 'checked' : ''}>
          <span>${esc(t('set.minTray'))}<small>${esc(t('set.minTrayHint'))}</small></span></label>
        <label class="check"><input type="checkbox" id="s-close" ${s.closeToTray ? 'checked' : ''}>
          <span>${esc(t('set.closeTray'))}<small>${esc(t('set.closeTrayHint'))}</small></span></label>
      </section>

      <section data-page="account">
        <div class="acct-box">
          <div class="acct-who">${icon('user')}<span>${esc(t('acct.signedInAs', { email }))}</span></div>
          <label class="check"><input type="checkbox" id="s-sync" ${acct.syncEnabled ? 'checked' : ''}>
            <span>${esc(t('acct.syncToggle'))}<small>${esc(t('acct.syncHint'))}</small></span></label>
          <div class="acct-status">${icon('cloud')}<span id="acct-status">${esc(syncText(acct))}</span></div>
          <div class="acct-actions">
            <button class="btn sm" type="button" id="s-syncnow">${icon('refresh')}${esc(t('acct.syncNow'))}</button>
            <button class="btn sm" type="button" id="s-delremote">${icon('trash')}${esc(t('acct.deleteRemote'))}</button>
          </div>
          <div class="acct-actions">
            <button class="btn sm" type="button" id="s-web">${icon('open')}${esc(t('acct.myAccount'))}</button>
            <span style="flex:1"></span>
            <button class="btn sm danger" type="button" id="s-logout">${icon('logout')}${esc(t('acct.logout'))}</button>
          </div>
        </div>
      </section>

      <section data-page="editor">
        <div class="set-hint">${esc(t('set.editorHint'))}</div>
        <div id="s-ed"></div>
        <div class="section-title">${esc(t('set.cache'))}</div>
        <div class="set-hint">${esc(t('set.cacheHint'))} <code>${esc(window.__cacheDir || '')}</code></div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-cacheopen">${icon('folderOpen')}${esc(t('set.cacheOpen'))}</button>
          <button class="btn sm" type="button" id="s-cacheclear">${icon('broom')}${esc(t('set.cacheClear'))}</button>
        </div>
      </section>

      <section data-page="about">
        <div class="about-head">
          <img src="../../build/icon.png" alt="">
          <div><div class="about-name">Notepad Master</div>
            <div class="about-ver">${esc(t('about.version', { version: about.version }))}</div></div>
        </div>
        <div class="set-hint">${esc(t('about.family'))}</div>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-update">${icon('refresh')}${esc(t('about.checkUpdate'))}</button>
          <span class="about-update" id="s-update-result"></span>
        </div>
        <div class="section-title">${esc(t('about.licenses'))}</div>
        <div class="set-hint">${esc(t('about.licensesIntro'))}</div>
        <ul class="oss">${OSS.map(([n, l]) => `<li><span>${esc(n)}</span><span>${esc(l)}</span></li>`).join('')}</ul>
        <div class="acct-actions">
          <button class="btn sm" type="button" id="s-licenses">${icon('file')}${esc(t('about.chromium'))}</button>
          <span class="set-hint">Electron ${esc(about.electron)} · Chromium ${esc(about.chrome)}</span>
        </div>
      </section>
    </div>
  </div>`);

  const q = (sel) => body.querySelector(sel);
  q('#s-ed').replaceWith(ed.el);
  const showTab = (k) => {
    body.querySelectorAll('.set-nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    body.querySelectorAll('.set-pages > section').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== k));
  };
  body.querySelectorAll('.set-nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(startTab);

  // Tema seçimi anında uygulanır (önizleme); İptal edilirse eski temaya döner
  const originalTheme = appTheme;
  const setTheme = (v) => {
    appTheme = v;
    body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    window.api.setSettings({ appTheme: v });
  };
  body.querySelectorAll('#s-theme button').forEach((b) => (b.onclick = () => setTheme(b.dataset.v)));
  body.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === appTheme));

  // Hesap bölümündeki işlemler anında uygulanır (Kaydet beklemez)
  q('#s-sync').onchange = async (e) => {
    const on = e.target.checked;
    const r = await window.api.setSyncEnabled(on);
    if (!r.ok) { e.target.checked = !on; toast(t('sync.error', { msg: r.code }), { type: 'err' }); }
  };
  q('#s-syncnow').onclick = () => window.api.syncNow();
  q('#s-delremote').onclick = async () => {
    const ok = await confirmBox(t('acct.deleteRemote'), esc(t('acct.deleteRemoteMsg')));
    if (!ok) return;
    const r = await window.api.deleteRemoteLibrary();
    if (r.ok) { q('#s-sync').checked = false; toast(t('acct.deleteRemoteDone'), { type: 'ok' }); }
    else toast(t('sync.error', { msg: r.code }), { type: 'err' });
  };
  q('#s-web').onclick = () => window.api.openWeb('account');
  q('#s-logout').onclick = logout;

  q('#s-cacheopen').onclick = () => window.api.openCacheDir();
  q('#s-cacheclear').onclick = async () => {
    const ok = await confirmBox(t('set.cacheClear'), esc(t('set.cacheClearMsg')), { okText: t('set.cacheClear') });
    if (!ok) return;
    await window.api.clearCache();
    toast(t('set.cacheCleared'), { type: 'ok' });
  };

  // Hakkında: yeni sürüm denetimi ve lisanslar
  q('#s-update').onclick = async () => {
    const out = q('#s-update-result');
    out.className = 'about-update';
    out.textContent = t('about.checking');
    const r = await window.api.checkUpdate();
    if (!r.ok) { out.classList.add('err'); out.textContent = t('about.checkFailed', { msg: r.message || r.code }); return; }
    if (r.newer) { out.classList.add('new'); out.textContent = `${t('update.available', { version: r.latest })} — ${t('update.hint')}`; }
    else { out.classList.add('ok'); out.textContent = t('about.upToDate'); }
  };
  q('#s-licenses').onclick = () => window.api.openLicenses();

  const res = await openModal({
    title: t('set.title'), iconName: 'gear', width: 760, body,
    buttons: [
      { label: t('common.cancel'), value: null },
      {
        label: t('common.save'), cls: 'primary',
        onClick: () => ({
          appTheme,
          language: q('#s-lang').value,
          openAtLogin: q('#s-login').checked,
          minimizeToTray: q('#s-min').checked,
          closeToTray: q('#s-close').checked,
          editor: ed.read(),
        }),
      },
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
