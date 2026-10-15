'use strict';

// Proje penceresinin solundaki klasör/dosya ağacı. Klasörler açıldıkça (tembel) listelenir.
//
//   const tree = new FileTree(el, { sep, list, onOpen, onContext, onSelect, filter })
//   tree.setRoot(path, label)  tree.refresh(path)  tree.reveal(path)  tree.collapseAll()

// Uzantıya göre dosya simgesi rengi
const EXT_COLORS = {
  js: '#facc15', mjs: '#facc15', cjs: '#facc15', jsx: '#38bdf8', ts: '#3b82f6', tsx: '#38bdf8', json: '#fbbf24',
  php: '#a78bfa', py: '#60a5fa', rb: '#f87171', go: '#22d3ee', rs: '#fb923c', java: '#f97316', kt: '#a855f7', cs: '#8b5cf6',
  c: '#60a5fa', h: '#60a5fa', cpp: '#3b82f6', hpp: '#3b82f6', html: '#fb923c', htm: '#fb923c', css: '#38bdf8', scss: '#ec4899',
  less: '#6366f1', md: '#94a3b8', sql: '#f472b6', sh: '#34d399', bash: '#34d399', ps1: '#60a5fa', bat: '#34d399',
  yml: '#f87171', yaml: '#f87171', xml: '#fb923c', ini: '#94a3b8', conf: '#94a3b8', env: '#fbbf24', vue: '#34d399', twig: '#a3e635',
  txt: '#94a3b8', log: '#64748b', svg: '#fbbf24', lua: '#3b82f6', pl: '#60a5fa', swift: '#fb923c', dart: '#22d3ee',
};

class FileTree {
  constructor(el, opts) {
    this.el = el;
    this.o = opts;
    this.sep = opts.sep || '/';
    this.nodes = new Map();
    this.root = null;
    this.selected = null;
    this.rows = [];
    el.addEventListener('keydown', (e) => this.onKey(e));
    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tr-row')) return;
      e.preventDefault();
      this.o.onContext(null, e.clientX, e.clientY);
    });
  }

  join(dir, name) {
    if (this.sep === '/') return dir.replace(/\/+$/, '') + '/' + name;
    return dir.replace(/[\\/]+$/, '') + '\\' + name;
  }

  parentOf(p) {
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    if (i <= 0) return this.sep === '/' ? '/' : p.slice(0, i + 1);
    return p.slice(0, i);
  }

  setRoot(path, label) {
    this.nodes.clear();
    this.root = { path, name: label || path, isDir: true, depth: -1, children: null, expanded: true };
    this.nodes.set(path, this.root);
    return this.load(this.root);
  }

  async load(node) {
    node.loading = true;
    node.error = null;
    this.render();
    try {
      const items = await this.o.list(node.path);
      const old = new Map((node.children || []).map((c) => [c.path, c]));
      node.children = items
        .filter((it) => this.o.filter(it.name, it.isDir))
        .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })))
        .map((it) => {
          const prev = old.get(it.path);
          const n = prev ? Object.assign(prev, { size: it.size, mtime: it.mtime, isDir: it.isDir }) :
            { path: it.path, name: it.name, isDir: it.isDir, isLink: it.isLink, size: it.size, mtime: it.mtime, children: null, expanded: false };
          n.parent = node;
          n.depth = node.depth + 1;
          this.nodes.set(n.path, n);
          return n;
        });
      // Silinmiş alt düğümleri unut
      for (const p of old.keys()) if (!node.children.some((c) => c.path === p)) this.forget(old.get(p));
    } catch (err) {
      node.error = err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    }
    node.loading = false;
    this.render();
  }

  forget(n) {
    this.nodes.delete(n.path);
    for (const c of n.children || []) this.forget(c);
  }

  async toggle(n, open = !n.expanded) {
    if (!n.isDir) return;
    n.expanded = open;
    if (open && !n.children) await this.load(n);
    else this.render();
  }

  // Bir klasörü yeniden listele (açık alt klasörler korunur ve onlar da yenilenir)
  async refresh(path) {
    const n = this.nodes.get(path) || this.root;
    if (!n || !n.isDir) return;
    await this.load(n);
    await Promise.all((n.children || []).filter((c) => c.isDir && c.expanded && c.children).map((c) => this.refresh(c.path)));
  }

  // Yolu görünür yap: kökten itibaren klasörleri aç
  async reveal(path) {
    if (!this.root) return;
    const chain = [];
    let p = path;
    while (p && p !== this.root.path && chain.length < 64) {
      chain.unshift(p);
      const up = this.parentOf(p);
      if (up === p) break;
      p = up;
    }
    let cur = this.root;
    for (const step of chain) {
      if (!cur.children) await this.load(cur);
      cur.expanded = true;
      const next = (cur.children || []).find((c) => c.path === step);
      if (!next) break;
      cur = next;
    }
    this.select(cur.path);
    this.render();
    const row = this.el.querySelector('.tr-row.sel');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  collapseAll() {
    for (const n of this.nodes.values()) if (n !== this.root) n.expanded = false;
    this.render();
  }

  select(path) {
    this.selected = path;
    this.el.querySelectorAll('.tr-row').forEach((r) => r.classList.toggle('sel', r.dataset.path === path));
    if (this.o.onSelect) this.o.onSelect(this.nodes.get(path) || null);
  }

  selectedNode() { return this.nodes.get(this.selected) || null; }

  // Seçili düğümün klasörü (yeni dosya/klasör buraya)
  targetDir() {
    const n = this.selectedNode();
    if (!n) return this.root.path;
    return n.isDir ? n.path : n.parent ? n.parent.path : this.root.path;
  }

  visible() {
    const out = [];
    const walk = (n) => {
      for (const c of n.children || []) {
        out.push(c);
        if (c.isDir && c.expanded) walk(c);
      }
    };
    if (this.root) walk(this.root);
    return out;
  }

  fileIcon(n) {
    if (n.isDir) return icon(n.expanded ? 'folderOpen' : 'folder', 'ti-dir');
    const ext = (n.name.split('.').pop() || '').toLowerCase();
    return `<span class="ti-file" style="color:${EXT_COLORS[ext] || 'var(--text-3)'}">${icon('file')}</span>`;
  }

  render() {
    if (!this.root) { this.el.innerHTML = ''; return; }
    const frag = document.createDocumentFragment();
    const pad = (d) => `padding-inline-start:${8 + d * 14}px`;
    if (this.root.loading && !this.root.children) frag.appendChild(h(`<div class="tr-note"><span class="spin"></span></div>`));
    if (this.root.error) frag.appendChild(h(`<div class="tr-note err">${esc(this.root.error)}</div>`));
    for (const n of this.visible()) {
      const row = h(`<div class="tr-row ${n.path === this.selected ? 'sel' : ''} ${this.o.isOpen && this.o.isOpen(n.path) ? 'open' : ''}" data-path="${esc(n.path)}" style="${pad(n.depth)}" title="${esc(n.path)}">
        <span class="tr-chev">${n.isDir ? icon(n.expanded ? 'chevronDown' : 'chevronRight') : ''}</span>
        ${this.fileIcon(n)}<span class="tr-name">${esc(n.name)}</span>${n.loading ? '<span class="spin"></span>' : ''}</div>`);
      row.addEventListener('click', (e) => {
        this.select(n.path);
        if (n.isDir && (e.target.closest('.tr-chev') || e.detail === 1)) this.toggle(n);
      });
      row.addEventListener('dblclick', () => { if (!n.isDir) this.o.onOpen(n); });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.select(n.path);
        this.o.onContext(n, e.clientX, e.clientY);
      });
      frag.appendChild(row);
      if (n.isDir && n.expanded && n.error) frag.appendChild(h(`<div class="tr-note err" style="${pad(n.depth + 1)}">${esc(n.error)}</div>`));
      if (n.isDir && n.expanded && n.children && !n.children.length) frag.appendChild(h(`<div class="tr-note" style="${pad(n.depth + 1)}">${esc(t('tree.empty'))}</div>`));
    }
    if (this.root.children && !this.root.children.length) frag.appendChild(h(`<div class="tr-note">${esc(t('tree.empty'))}</div>`));
    this.el.replaceChildren(frag);
  }

  onKey(e) {
    const list = this.visible();
    const i = list.findIndex((n) => n.path === this.selected);
    const n = list[i];
    const go = (j) => { const m = list[Math.max(0, Math.min(list.length - 1, j))]; if (m) { this.select(m.path); this.el.querySelector('.tr-row.sel')?.scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'ArrowRight' && n && n.isDir) { e.preventDefault(); this.toggle(n, true); }
    else if (e.key === 'ArrowLeft' && n) { e.preventDefault(); if (n.isDir && n.expanded) this.toggle(n, false); else if (n.parent && n.parent !== this.root) go(list.indexOf(n.parent)); }
    else if (e.key === 'Enter' && n) { e.preventDefault(); if (n.isDir) this.toggle(n); else this.o.onOpen(n); }
    else if (this.o.onKey) this.o.onKey(e, n);
  }
}
