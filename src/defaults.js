// Editör ayarlarının varsayılanları ve doğrulaması. Hem ana süreçte (require) hem pencerelerde (<script>) çalışır.
// Notepad++ "Tercihler" karşılıkları: Yeni Belge (kodlama, satır sonu), Dil (sekme ayarları), Düzenleme, Kenar boşlukları,
// Yazı tipi/Tema (Stil Yapılandırıcı), Yedekleme/Otomatik kaydetme.
(function (root) {
  'use strict';

  const EDITOR_DEFAULTS = {
    encoding: 'auto',            // auto (BOM / UTF-8 algıla) | utf8 | utf8bom | utf16le | utf16be | windows-1254 | …
    fallbackEncoding: 'windows-1254', // otomatikte UTF-8 olmayan dosyalar için ANSI kod sayfası
    newEncoding: 'utf8',         // yeni dosyaların kodlaması: utf8 | utf8bom | windows-1254 …
    eol: 'auto',                 // auto (dosyanınkini koru) | crlf | lf | cr — "auto" dışı seçim açılışta dönüştürür
    newEol: 'lf',                // yeni dosyaların satır sonu
    tabSize: 4,
    insertSpaces: true,          // sekme yerine boşluk
    detectIndentation: true,     // girinti biçimini dosyadan algıla
    autoIndent: true,
    wordWrap: false,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
    fontSize: 14,
    lineHeight: 0,               // 0 = otomatik
    theme: 'auto',               // auto (uygulama temasına göre) | mastertool-dark | mastertool-light | vs-dark | vs | hc-black | monokai | obsidian | solarized-light
    language: 'auto',            // auto (uzantı / ilk satır) ya da Monaco dil kimliği
    renderWhitespace: 'none',    // none | boundary | trailing | all  (Notepad++ "Boşluk ve sekmeleri göster")
    renderControlChars: false,   // görünmez karakterler
    lineNumbers: true,
    minimap: true,
    highlightLine: true,
    indentGuides: true,
    folding: true,
    bracketColors: true,
    autoClose: true,             // parantez / tırnak otomatik kapatma
    smartHighlight: true,        // seçili sözcüğün diğer geçişlerini vurgula (Notepad++ "Akıllı vurgulama")
    rulers: '',                  // dikey kenar çizgileri, örn. "80,120"
    trimTrailing: false,         // kaydederken satır sonu boşluklarını sil
    finalNewline: false,         // kaydederken dosya sonuna satır sonu ekle
    checkRemoteChange: true,     // kaydetmeden önce dosya başka yerde değişmiş mi bak
    autoSave: 0,                 // sn; 0 = kapalı
  };

  const ENCODINGS = [
    ['utf8', 'UTF-8'], ['utf8bom', 'UTF-8 BOM'], ['utf16le', 'UTF-16 LE BOM'], ['utf16be', 'UTF-16 BE BOM'],
    ['windows-1254', 'ANSI — Windows-1254 (Türkçe)'], ['iso-8859-9', 'ISO-8859-9 (Türkçe)'], ['windows-1252', 'ANSI — Windows-1252 (Batı)'],
    ['iso-8859-1', 'ISO-8859-1 (Latin-1)'], ['windows-1251', 'Windows-1251 (Kiril)'], ['windows-1256', 'Windows-1256 (Arapça)'],
  ];
  const THEMES = [
    ['mastertool-dark', 'Mastertool Gece'], ['mastertool-light', 'Mastertool Gündüz'], ['obsidian', 'Obsidian'], ['monokai', 'Monokai'],
    ['vs-dark', 'Visual Studio Dark'], ['vs', 'Visual Studio Light'], ['solarized-light', 'Solarized Light'], ['hc-black', 'High Contrast'],
  ];

  // Monaco dil kimlikleri (Notepad++ "Dil" menüsü); "auto" uzantıdan / ilk satırdan algılar
  const LANGUAGES = [
    ['plaintext', 'Normal Text'], ['bat', 'Batch'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['css', 'CSS'],
    ['dart', 'Dart'], ['dockerfile', 'Dockerfile'], ['go', 'Go'], ['graphql', 'GraphQL'], ['handlebars', 'Handlebars'],
    ['html', 'HTML'], ['ini', 'INI / Config'], ['java', 'Java'], ['javascript', 'JavaScript'], ['json', 'JSON'],
    ['kotlin', 'Kotlin'], ['less', 'LESS'], ['lua', 'Lua'], ['markdown', 'Markdown'], ['mysql', 'MySQL'],
    ['objective-c', 'Objective-C'], ['pascal', 'Pascal'], ['perl', 'Perl'], ['pgsql', 'PostgreSQL'], ['php', 'PHP'],
    ['powershell', 'PowerShell'], ['python', 'Python'], ['r', 'R'], ['razor', 'Razor'], ['ruby', 'Ruby'], ['rust', 'Rust'],
    ['scss', 'SCSS'], ['shell', 'Shell (bash/sh)'], ['sql', 'SQL'], ['swift', 'Swift'], ['twig', 'Twig'],
    ['typescript', 'TypeScript'], ['vb', 'Visual Basic'], ['xml', 'XML'], ['yaml', 'YAML'],
  ];

  const oneOf = (v, list, def) => (list.includes(v) ? v : def);
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
  };
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);

  // Gelen (formdan ya da senkrondan) ayar nesnesini güvenli hale getirir; eksikler varsayılanla dolar
  function sanitizeEditor(e, base) {
    const d = { ...EDITOR_DEFAULTS, ...(base || {}) };
    e = e && typeof e === 'object' ? e : {};
    const encs = ENCODINGS.map((x) => x[0]);
    return {
      encoding: oneOf(e.encoding, ['auto', ...encs], d.encoding),
      fallbackEncoding: oneOf(e.fallbackEncoding, encs.filter((x) => !x.startsWith('utf')), d.fallbackEncoding),
      newEncoding: oneOf(e.newEncoding, encs, d.newEncoding),
      eol: oneOf(e.eol, ['auto', 'crlf', 'lf', 'cr'], d.eol),
      newEol: oneOf(e.newEol, ['crlf', 'lf', 'cr'], d.newEol),
      tabSize: num(e.tabSize, d.tabSize, 1, 16),
      insertSpaces: bool(e.insertSpaces, d.insertSpaces),
      detectIndentation: bool(e.detectIndentation, d.detectIndentation),
      autoIndent: bool(e.autoIndent, d.autoIndent),
      wordWrap: bool(e.wordWrap, d.wordWrap),
      fontFamily: typeof e.fontFamily === 'string' && e.fontFamily.trim() ? e.fontFamily.slice(0, 200) : d.fontFamily,
      fontSize: num(e.fontSize, d.fontSize, 6, 48),
      lineHeight: num(e.lineHeight, d.lineHeight, 0, 80),
      theme: oneOf(e.theme, ['auto', ...THEMES.map((x) => x[0])], d.theme),
      language: typeof e.language === 'string' && /^[\w.+-]{1,40}$/.test(e.language) ? e.language : d.language,
      renderWhitespace: oneOf(e.renderWhitespace, ['none', 'boundary', 'trailing', 'all'], d.renderWhitespace),
      renderControlChars: bool(e.renderControlChars, d.renderControlChars),
      lineNumbers: bool(e.lineNumbers, d.lineNumbers),
      minimap: bool(e.minimap, d.minimap),
      highlightLine: bool(e.highlightLine, d.highlightLine),
      indentGuides: bool(e.indentGuides, d.indentGuides),
      folding: bool(e.folding, d.folding),
      bracketColors: bool(e.bracketColors, d.bracketColors),
      autoClose: bool(e.autoClose, d.autoClose),
      smartHighlight: bool(e.smartHighlight, d.smartHighlight),
      rulers: typeof e.rulers === 'string' ? e.rulers.replace(/[^\d,\s]/g, '').slice(0, 40) : d.rulers,
      trimTrailing: bool(e.trimTrailing, d.trimTrailing),
      finalNewline: bool(e.finalNewline, d.finalNewline),
      checkRemoteChange: bool(e.checkRemoteChange, d.checkRemoteChange),
      autoSave: num(e.autoSave, d.autoSave, 0, 3600),
    };
  }

  // Bağlantının geçerli editör ayarları: "Genel ayarları kullan" ise uygulama ayarları
  function effectiveEditor(conn, settings) {
    const g = sanitizeEditor(settings && settings.editor);
    if (!conn || conn.editorMode !== 'custom') return g;
    return sanitizeEditor(conn.editor, g);
  }

  const api = { EDITOR_DEFAULTS, ENCODINGS, THEMES, LANGUAGES, sanitizeEditor, effectiveEditor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NPDEF = api;
})(typeof window !== 'undefined' ? window : globalThis);
