# Notepad Master

Windows için kod ve metin editörü. Notepad++'ın yaptığı işi, [SSH Master](https://github.com/goktalay/sshmasters) ve [FTP Masters](https://github.com/goktalay/ftpmasters) ile ortak Mastertool tasarımında yapar. Dosyalar SSH, FTP / FTPS / SFTP sunucularında ya da bu bilgisayardaki bir klasörde olabilir.

## İndirme

Derlenmiş exe'ler [Releases](https://github.com/goktalay/notepadmaster/releases) sayfasındadır:

- `Notepad-Master-Setup-x.y.z.exe`: kurulum (Mastertool klasörüne kurulur, Başlat menüsünde Master Tool › Notepad Master)
- `Notepad-Master-Portable-x.y.z.exe`: kurulumsuz, tek dosya

## Özellikler

- **Ana ekran:** her bağlantı bir kart. Kartlar **klasörlere** sürüklenip bırakılabilir (iç içe klasörler). Arama (Ctrl+F), çift tıkla açma, kopyasını oluşturma.
- **Yeni bağlantı:** dört seçenek. Seçilen türün alanları altında açılır:
  - **SSH Projesi:** sunucu, port, kullanıcı, şifre ya da özel anahtar (+ parola). **Bağlantıyı dene**'den sonra **Klasör seç** düğmesiyle proje klasörü sunucuda gezinilerek seçilir.
  - **FTP Projesi:** FTP Masters'ın protokolleri: FTP, FTPS Implicit (990), FTPS Explicit (AUTH SSL), FTPS Explicit (AUTH TLS), SFTP. Anonim giriş ve dosya adı kodlaması (Otomatik / UTF-8 / ASCII) seçilebilir. Klasör seçimi SSH'deki gibi.
  - **Lokal Klasör:** bu bilgisayardaki bir klasör.
  - **Proje Dosyası:** tek bir dosya seçilir; karta çift tıklayınca ayrı pencerede, kendi sözdizimi renklendirmesiyle açılır.
- **Proje penceresi** (karta çift tıklayınca ayrı pencerede açılır):
  - **Sol: klasör ağacı.** Klasörler açıldıkça listelenir. Sağ tık menüsünde yeni dosya, yeni klasör, yeniden adlandır, sil, yolu kopyala ve yenile var. Gizli dosyalar ve hariç tutma kalıpları (`node_modules, .git, *.log`) bağlantı ayarından gelir. Genişliği sürüklenerek değişir; Ctrl+B ile açılıp kapanır.
  - **Sağ: sekmeli editör** (Monaco, VS Code'un editörü). Dosyaya çift tıklayınca sekmede açılır. Dil uzantıdan, dosya adından ya da ilk satırdan (`#!/bin/bash`, `<?php`…) algılanır. 80'i aşkın dil desteklenir: PHP, JS/TS, HTML, CSS/SCSS, SQL, Python, Shell, JSON, YAML, XML, Markdown, C/C++/C#, Java, Go, Rust, INI/conf…
  - **Çalışma kopyası ("template klasörü"):** dosya açılır açılmaz içeriği, sunucudaki klasör yapısıyla birlikte `%APPDATA%\Notepad Master\cache\<bağlantı>\…` altına kopyalanır.
  - **Kaydet (Ctrl+S):** dosya sunucuya yüklenir (yerelde diske yazılır), ardından çalışma kopyası güncellenir. Dosya açıldıktan sonra sunucuda değişmişse **Üzerine yaz / Sunucudakini yükle / İptal** diye sorulur. Seçilen kodlamada saklanamayan karakter varsa uyarılır.
  - Bul / Değiştir (Ctrl+F / Ctrl+H, düzenli ifade destekli), satıra git (Ctrl+G), çoklu imleç, kod katlama, parantez eşleme, komut paleti (F1), tümünü kaydet (Ctrl+Shift+S), sekme kapatma (Ctrl+W), sekmeler arası geçiş (Ctrl+Tab), yakınlaştırma (Ctrl + / −).
  - **Durum çubuğu:** satır/sütun, girinti (boşluk/sekme), **kodlama** (çevir ya da başka kodlamayla yeniden aç), **satır sonu** (CRLF / LF / CR'ye çevir), **dil** (elle seç). Hepsi tıklanarak değiştirilir.
  - Kaydedilmemiş sekme varken pencere kapatılırsa sorulur. Açık sekmeler bir sonraki açılışta geri gelir.
  - Bağlantı koparsa sonraki işlemde kendiliğinden yeniden bağlanır; üst çubukta **Yeniden bağlan** düğmesi de var.
- **Bağlantı başına Notepad++ ayarları** (bağlantı formu › Editör; ya da Ayarlar › Editör'deki genel varsayılanlar):
  - Kodlama: otomatik algılama (BOM / UTF-8), UTF-8 değilse kullanılacak ANSI kod sayfası (varsayılan Windows-1254 Türkçe), yeni dosya kodlaması (UTF-8, UTF-8 BOM, UTF-16 LE/BE, Windows-1254, ISO-8859-9, Windows-1252…)
  - Satır sonu: dosyanınkini koru ya da açarken CRLF / LF / CR'ye çevir; yeni dosyaların satır sonu
  - Sekme genişliği, sekme yerine boşluk, girintiyi dosyadan algılama, otomatik girinti, parantez/tırnak otomatik kapatma
  - Dil zorlama (otomatik algılama yerine sabit dil)
  - Renk teması: Mastertool Gece/Gündüz (otomatik), Obsidian, Monokai, VS Dark/Light, Solarized Light, Yüksek Kontrast
  - Yazı tipi ve boyutu, kenar çizgileri (ör. 80,120), satır kaydırma, satır numaraları, geçerli satır vurgusu, akıllı vurgulama, girinti kılavuzları, kod katlama, parantez renklendirme, mini harita, boşluk/sekme gösterimi, görünmez karakterler
  - Kaydetme: satır sonu boşluklarını silme, dosya sonuna satır sonu ekleme, kaydetmeden önce sunucuda değişiklik kontrolü, otomatik kaydetme (sn)
- **Ayarlar** (Mastertool ortak iskeleti, solda sekmeler):
  - **Genel:** 8 dil (Türkçe, English, Français, Deutsch, Español, العربية, 中文, Русский; Arapçada arayüz sağdan sola, editör içeriği ve yollar soldan sağa), tema Gece / Gündüz / Sistem tercihi (varsayılan Sistem; üst çubuktaki güneş/ay düğmesiyle de değişir), Windows açılınca başlatma, küçültünce ve kapatınca sistem tepsisine gizleme. Tepsi menüsünden projeler hızlıca açılır.
  - **Hesap:** senkronu açma/kapatma, şimdi senkronize etme, sunucu kopyasını silme, Hesabım (web), çıkış.
  - **Editör:** Notepad++ ayarlarının genel varsayılanları, çalışma kopyası klasörünü açma ve temizleme.
  - **Hakkında:** sürüm, güncellemeleri denetleme, açık kaynak lisansları.
- **Mastertool hesabı:** uygulama Mastertool hesabıyla (e-posta ve şifre) açılır. "Beni hatırla" ile oturum saklanır; çevrimdışıyken son oturumla yerel bağlantılarla çalışılır. Kayıt, şifremi unuttum ve hesap sayfaları [notepadmaster.com](https://notepadmaster.com) üzerinden uygulamanın diliyle ve temasıyla açılır.
- **Uçtan uca şifreli senkron:** bağlantılar, klasörler, editör ayarları ve genel ayarlar AES-256-GCM ile şifrelenip hesaba yedeklenir. Anahtar şifrenizden cihazda türetilir (PBKDF2 + HKDF); sunucu içeriği okuyamaz. Özel anahtarlar içerikleriyle taşınır. Yerel klasör/dosya yolları, açık sekmeler ve çalışma kopyaları her cihazda ayrı kalır: başka bilgisayarda yerel bir kart ilk açılışta yolu sorar. Ayarlar › Genel'den kapatılabilir ya da sunucu kopyası silinebilir.
- **Mastertool düğmesi:** ana pencerenin ve proje penceresinin sağ üst köşesinde, SSH Master / FTP Masters / SQL Master ile aynı animasyonlu düğme. Tıklanınca mastertool.download uygulamanın dili ve gece/gündüz temasıyla açılır.
- **Yeni sürüm bildirimi:** yeni sürüm çıkınca ana pencerede şerit görünür; indirme notepadmaster.com hesabınızdandır.
- **Güvenlik:** şifreler Windows DPAPI (Electron `safeStorage`) ile şifrelenir. SSH host anahtarı ilk bağlantıda kaydedilir; değişirse bağlantı reddedilir. Yerelde silme Geri Dönüşüm Kutusu'na taşır.

## Yerel veri modeli

Tüm veriler `%APPDATA%\Notepad Master\` altındadır:

| Yol | İçerik |
|---|---|
| `store.json` | bağlantılar, klasörler, ayarlar, senkron meta verisi |
| `account.json` | cihaz kimliği, e-posta; "Beni hatırla" açıksa DPAPI ile şifreli oturum anahtarı |
| `cache\<bağlantı id>\…` | çalışma kopyaları (sunucudaki klasör yapısıyla) |
| `keys\<bağlantı id>.key` | senkronla gelen özel anahtarlar |

`store.json`:

```jsonc
{
  "folders": [{ "id": "…", "name": "Müşteriler", "parentId": null }],
  "connections": [{
    "id": "…", "createdAt": 0, "name": "Şirket sitesi", "kind": "ssh",      // ssh | ftp | local | file
    "folderId": null, "color": "#22d3ee", "comments": "",
    // ssh / ftp
    "host": "ornek.com", "port": 22, "protocol": "sftp",                       // ftp | ftps-implicit | ftps-ssl | ftps-tls | sftp
    "username": "deploy", "loginMethod": "normal", "authType": "password",    // password | key
    "password": "enc:…", "passphrase": "", "keyPath": "", "hostKey": "SHA256 base64",
    "nameEncoding": "auto", "rootDir": "/var/www/html",
    // local / file (cihaza özgü)
    "localPath": "",
    // proje
    "showHidden": true, "exclude": "node_modules, .git", "restoreTabs": true,
    "openTabs": ["/var/www/html/index.php"], "activeTab": "/var/www/html/index.php",   // cihaza özgü
    // editör (Notepad++ ayarları); editorMode "global" ise settings.editor kullanılır
    "editorMode": "custom",
    "editor": { "encoding": "auto", "fallbackEncoding": "windows-1254", "newEncoding": "utf8", "eol": "auto", "newEol": "lf",
                "tabSize": 4, "insertSpaces": true, "detectIndentation": true, "autoIndent": true, "wordWrap": false,
                "fontFamily": "…", "fontSize": 14, "lineHeight": 0, "theme": "auto", "language": "auto",
                "renderWhitespace": "none", "renderControlChars": false, "lineNumbers": true, "minimap": true,
                "highlightLine": true, "indentGuides": true, "folding": true, "bracketColors": true, "autoClose": true,
                "smartHighlight": true, "rulers": "", "trimTrailing": false, "finalNewline": false,
                "checkRemoteChange": true, "autoSave": 0 }
  }],
  "settings": { "appTheme": "system", "language": null, "editor": { /* yukarıdaki alanlar */ },
                "treeWidth": 300, "treeOpen": true, "minimizeToTray": true, "closeToTray": false, "openAtLogin": false },
  "syncMeta": { "<öğe id>": { "kind": "connection", "hash": "…", "updated_at": 0, "rev": 1, "device": "…", "deleted": false } }
}
```

### Senkron öğeleri (notepadmaster.com `/api/np/library`, açık metin `{ schema: 1, items: [...] }`)

- `kind: "connection"`: `data` alanları `createdAt, name, kind, host, port, protocol, username, loginMethod, authType, comments, folderId, color, rootDir, nameEncoding, showHidden, exclude, restoreTabs, editorMode, editor, hostKey` ile açık metin `password`, `passphrase` ve `privateKey` (anahtar dosyasının içeriği, yalnız SSH/SFTP + anahtar). **Gönderilmez:** `keyPath`, `localPath`, `openTabs`, `activeTab`.
- `kind: "folder"`: `{ name, parentId }`
- `kind: "settings"` (id `settings`): `{ appTheme, language, editor }`. **Gönderilmez:** `treeWidth`, `treeOpen`, `minimizeToTray`, `closeToTray`, `openAtLogin`.

Birleştirme FTP Masters ile aynıdır: aynı id'de büyük `updated_at`, sonra büyük `rev`, sonra büyük cihaz id'si kazanır; silinenler 30 gün mezar taşı olarak tutulur.

## Geliştirme

```bash
npm install
npm start
npm test
```

## Exe derleme

```bash
npm run dist
```

`dist/` altında kurulum ve taşınabilir exe oluşur. Simgeyi değiştirmek için `build/icon.svg` dosyasını düzenleyip `npm run icon` çalıştırın. `build/installer.nsh` tüm Mastertool uygulamalarında ortaktır (kurulum klasörü ve Başlat menüsünde "Master Tool" klasörü).

## Sürüm yayınlama

Yeni sürüm için bir etiket göndermek yeterli. GitHub Actions testleri çalıştırır, exe'leri derler ve Release'e ekler:

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

Sürüm numarası etiketten alınır; `package.json`'ı elle değiştirmek gerekmez.

Etiket göndermek yerine Actions › Release › **Run workflow** ile `version` alanına sürüm (ör. `1.0.1`) yazılarak da yayınlanabilir; `v1.0.1` etiketi o commit'te otomatik oluşturulur. Alan boş bırakılırsa yalnız derlenir.

Etiketle yayınlanan sürüm ayrıca notepadmaster.com'a yüklenir (`scripts/upload-notepadmaster.sh`, ≤ 90 MB parçalar halinde; depo secret'ı `NOTEPADM_RELEASE_KEY`).

## Bilinen sınırlar

- FTP veri bağlantısı yalnız pasif moddadır (PASV/EPSV).
- Proxy / SOCKS desteği yok.
- 50 MB'tan büyük ve ikili (binary) dosyalar editörde açılmaz.
- Dosyalarda arama (Find in Files) henüz yok.
