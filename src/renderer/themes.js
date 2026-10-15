'use strict';

// Editör renk temaları (Monaco). "Mastertool" temaları uygulamanın Gece/Gündüz renkleriyle uyumludur;
// Obsidian ve Monokai Notepad++ kullanıcılarının alışık olduğu temalardır.

function themeRules(c) {
  return [
    { token: '', foreground: c.fg },
    { token: 'comment', foreground: c.comment, fontStyle: 'italic' },
    { token: 'keyword', foreground: c.keyword },
    { token: 'keyword.flow', foreground: c.keyword },
    { token: 'storage', foreground: c.keyword },
    { token: 'string', foreground: c.string },
    { token: 'string.escape', foreground: c.number },
    { token: 'number', foreground: c.number },
    { token: 'constant', foreground: c.number },
    { token: 'regexp', foreground: c.regexp || c.string },
    { token: 'type', foreground: c.type },
    { token: 'type.identifier', foreground: c.type },
    { token: 'predefined', foreground: c.func },
    { token: 'function', foreground: c.func },
    { token: 'variable', foreground: c.variable || c.fg },
    { token: 'variable.predefined', foreground: c.type },
    { token: 'identifier', foreground: c.fg },
    { token: 'delimiter', foreground: c.delim },
    { token: 'operator', foreground: c.delim },
    { token: 'tag', foreground: c.tag },
    { token: 'metatag', foreground: c.tag },
    { token: 'attribute.name', foreground: c.attr },
    { token: 'attribute.value', foreground: c.string },
    { token: 'key', foreground: c.attr },
    { token: 'string.key.json', foreground: c.attr },
    { token: 'string.value.json', foreground: c.string },
  ].map((r) => ({ ...r, foreground: r.foreground.replace('#', '') }));
}

function themeColors(c) {
  return {
    'editor.background': c.bg,
    'editor.foreground': c.fg,
    'editorLineNumber.foreground': c.lineNo,
    'editorLineNumber.activeForeground': c.fg,
    'editor.lineHighlightBackground': c.line,
    'editor.lineHighlightBorder': c.line,
    'editor.selectionBackground': c.sel,
    'editor.inactiveSelectionBackground': c.sel + '99',
    'editor.wordHighlightBackground': c.word,
    'editor.findMatchHighlightBackground': c.word,
    'editorCursor.foreground': c.cursor,
    'editorWhitespace.foreground': c.ws,
    'editorIndentGuide.background1': c.ws,
    'editorIndentGuide.activeBackground1': c.lineNo,
    'editorRuler.foreground': c.ws,
    'editorGutter.background': c.bg,
    'minimap.background': c.bg,
    'scrollbarSlider.background': '#22d3ee33',
    'scrollbarSlider.hoverBackground': '#22d3ee66',
    'scrollbarSlider.activeBackground': '#6366f199',
    'editorWidget.background': c.widget,
    'editorWidget.border': c.lineNo,
  };
}

const NP_THEMES = {
  'mastertool-dark': {
    base: 'vs-dark', bg: '#0b0f17', fg: '#e6edf6', line: '#141b28', sel: '#22d3ee40', word: '#6366f140', cursor: '#22d3ee',
    lineNo: '#4b5870', ws: '#243047', widget: '#141b28',
    comment: '#6f7d93', keyword: '#a78bfa', string: '#5eead4', number: '#fbbf24', type: '#22d3ee', func: '#93c5fd',
    delim: '#a5b2c6', tag: '#f472b6', attr: '#fbbf24', regexp: '#fb923c',
  },
  'mastertool-light': {
    base: 'vs', bg: '#ffffff', fg: '#0f172a', line: '#f1f5f9', sel: '#0891b233', word: '#4f46e522', cursor: '#0891b2',
    lineNo: '#9aa5b5', ws: '#d9e0ea', widget: '#f8fafc',
    comment: '#7b8799', keyword: '#6d28d9', string: '#0f766e', number: '#b45309', type: '#0e7490', func: '#1d4ed8',
    delim: '#475569', tag: '#be185d', attr: '#b45309', regexp: '#c2410c',
  },
  obsidian: {
    base: 'vs-dark', bg: '#293134', fg: '#e0e2e4', line: '#2f393c', sel: '#4f5b62', word: '#3c4a50', cursor: '#e0e2e4',
    lineNo: '#81969a', ws: '#3f4b4e', widget: '#2f393c',
    comment: '#66747b', keyword: '#93c763', string: '#ec7600', number: '#ffcd22', type: '#678cb1', func: '#a082bd',
    delim: '#e8e2b7', tag: '#93c763', attr: '#678cb1', regexp: '#d39745',
  },
  monokai: {
    base: 'vs-dark', bg: '#272822', fg: '#f8f8f2', line: '#3e3d32', sel: '#49483e', word: '#49483e', cursor: '#f8f8f0',
    lineNo: '#90908a', ws: '#464741', widget: '#1e1f1c',
    comment: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', type: '#66d9ef', func: '#a6e22e',
    delim: '#f8f8f2', tag: '#f92672', attr: '#a6e22e', regexp: '#e6db74',
  },
  'solarized-light': {
    base: 'vs', bg: '#fdf6e3', fg: '#657b83', line: '#eee8d5', sel: '#eee8d5', word: '#e4ddc8', cursor: '#657b83',
    lineNo: '#93a1a1', ws: '#e4ddc8', widget: '#eee8d5',
    comment: '#93a1a1', keyword: '#859900', string: '#2aa198', number: '#d33682', type: '#b58900', func: '#268bd2',
    delim: '#657b83', tag: '#268bd2', attr: '#93a1a1', regexp: '#dc322f',
  },
};

function defineThemes(monaco) {
  for (const [name, c] of Object.entries(NP_THEMES)) {
    monaco.editor.defineTheme(name, { base: c.base, inherit: true, rules: themeRules(c), colors: themeColors(c) });
  }
}

// "auto": uygulamanın o anki Gece/Gündüz temasına göre Mastertool teması
function resolveTheme(name) {
  if (!name || name === 'auto') return matchMedia('(prefers-color-scheme: light)').matches ? 'mastertool-light' : 'mastertool-dark';
  return name;
}
