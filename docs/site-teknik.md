# Notepad Master — teknik bilgiler

Bu sayfadaki her bilgi kaynak koddan (goktalay/notepadmaster) ve v1.1.0 derlemesinden doğrulanmıştır.

## Sistem gereksinimleri

| | |
|---|---|
| İşletim sistemi | Windows 10 ve 11, 64 bit (x64) |
| Paketler | Kurulum (`Notepad-Master-Setup-x.y.z.exe`, ~84 MB) ve kurulumsuz taşınabilir sürüm (`Notepad-Master-Portable-x.y.z.exe`, ~84 MB) |
| Kurulum klasörü | `Program Files\Mastertool\Notepad Master` (yalnız bu kullanıcı için kurulumda `%LOCALAPPDATA%\Programs\Mastertool\Notepad Master`); kurulumda değiştirilebilir |
| Başlat menüsü | Master Tool › Notepad Master |
| Hesap | Mastertool hesabı (SSH Master, FTP Masters, SQL Master ile aynı hesap) |
| İnternet | Giriş ve senkron için gerekir; oturum hatırlanıyorsa çevrimdışıyken yerel bağlantılarla çalışır |

## Teknoloji

| Bileşen | Sürüm | Görevi |
|---|---|---|
| Electron | 33.4.11 (Chromium 130, Node.js 20.18) | Masaüstü uygulama çatısı |
| Monaco Editor | 0.52.2 | Editör bileşeni (Visual Studio Code'un editörü) |
| ssh2 | 1.17.0 | SSH ve SFTP bağlantıları |
| basic-ftp | 5.3.1 | FTP ve FTPS bağlantıları |
| iconv-lite | 0.6.3 | Metin kodlamaları (ANSI kod sayfaları, UTF-16) |
| electron-builder | 25.1.8 | Windows kurulum ve taşınabilir paketleri |

## Bağlantı türleri ve protokoller

| Tür | Ne açar | Ayrıntı |
|---|---|---|
| SSH Projesi | Sunucudaki bir klasör | SSH üzerinden SFTP alt sistemi, varsayılan port 22 |
| FTP Projesi | FTP/FTPS/SFTP sunucusundaki bir klasör | Aşağıdaki beş protokol |
| Lokal Klasör | Bu bilgisayardaki bir klasör | Yol yalnız bu bilgisayarda saklanır |
| Proje Dosyası | Tek bir dosya | Ayrı pencerede, ağaçsız açılır |

**FTP Projesi protokolleri:**

| Protokol | Varsayılan port |
|---|---|
| FTP (düz) | 21 |
| FTPS Implicit (TLS/SSL baştan) | 990 |
| FTPS Explicit — AUTH SSL | 21 |
| FTPS Explicit — AUTH TLS | 21 |
| SFTP (SSH2) | 22 |

- **SSH/SFTP kimlik doğrulama:** şifre, özel anahtar dosyası (parolalı anahtar desteklenir) ve klavye etkileşimli (keyboard-interactive) giriş.
- **SSH host anahtarı:** İlk bağlantıda SHA256 parmak izi kaydedilir; sonra değişirse bağlantı reddedilir.
- **FTP:** Normal ya da anonim giriş. Dosya adı kodlaması Otomatik / UTF-8 / ASCII. Veri bağlantısı yalnız pasif kipte (PASV/EPSV).
- **Klasör seçimi:** "Bağlantıyı dene" başarılı olunca proje klasörü sunucuda gezinilerek seçilir.
- **Yeniden bağlanma:** Bağlantı koparsa sıradaki işlem bir kez otomatik yeniden bağlanır; ayrıca "Yeniden bağlan" düğmesi var.
- **Dosya işlemleri (ağaçtan):** yeni dosya, yeni klasör, yeniden adlandırma, silme. Yerelde silinen dosya Geri Dönüşüm Kutusu'na gider.

## Çalışma kopyası

- Açılan her dosya, sunucudaki klasör yapısıyla birlikte şuraya kopyalanır: `%APPDATA%\Notepad Master\cache\<bağlantı>\<uzak yol>`.
- Kaydedince dosya önce sunucuya yüklenir; yükleme başarılıysa çalışma kopyası güncellenir.
- Ayarlar › Editör'den klasör açılabilir ya da önbellek temizlenebilir.

## Editör

- **Diller:** Monaco'nun 91 dil kaydı (FreeMarker türevleri ve düz metin dahil):
  ABAP, Apex, Azure CLI, Batch, Bicep, C, C++, C#, Cameligo, Clojure, CoffeeScript, CSP, CSS, Cypher, Dart, DAX, Dockerfile, ECL, Elixir, F#, Flow9, FreeMarker, Go, GraphQL, Handlebars, HTML, INI, Java, JavaScript, JSON, Julia, Kotlin, Less, Lexon, Liquid, Lua, Markdown, MDX, MIPS, Modula-3, MySQL, Objective-C, Pascal, Pascaligo, Perl, PHP, PLA, PostgreSQL, ATS, Power Query, PowerShell, Protobuf, Pug, Python, Q#, R, Razor, Redis, Redshift, reStructuredText, Ruby, Rust, Sass/SCSS, Scala, Scheme, Shell, Small Basic, Solidity, Sophia (aes), SPARQL, SQL, StructuredText, Swift, SystemVerilog, Verilog, Tcl, Terraform (HCL), Twig, TypeScript, TypeSpec, Visual Basic, WGSL, XML, YAML ve düz metin.
- **Dil algılama:** dosya uzantısı, dosya adı (`.htaccess`, `.env`, `Dockerfile`…) ve ilk satır (`#!/bin/bash`, `#!/usr/bin/env python`, `<?php`, `<?xml`, `<!doctype html>`). Dil elle de seçilebilir ya da bağlantı ayarında zorlanabilir.
- **Kodlamalar:** UTF-8, UTF-8 BOM, UTF-16 LE, UTF-16 BE, Windows-1254 (Türkçe ANSI), ISO-8859-9, Windows-1252, ISO-8859-1, Windows-1251, Windows-1256.
  - Otomatik algılama sırası: BOM, geçerli UTF-8, ANSI yedeği (varsayılan Windows-1254).
  - Durum çubuğundan başka kodlamaya çevirme ya da dosyayı başka kodlamayla yeniden açma.
  - Seçilen kodlamada saklanamayan karakter varsa kaydetmeden önce uyarır.
- **Satır sonları:** CRLF (Windows), LF (Unix), CR (eski Mac). Algılanır ve korunur; durum çubuğundan ya da ayardan dönüştürülür.
- **Düzenleme:** bul/değiştir (düzenli ifade, büyük/küçük harf, tam sözcük), satıra git, çoklu imleç, kod katlama, parantez eşleme ve renklendirme, komut paleti, yakınlaştırma.

### Notepad++ ayarları (bağlantı başına ya da genel varsayılan)

| Grup | Ayarlar |
|---|---|
| Kodlama | Açarken kodlama (otomatik / sabit) · UTF-8 değilse ANSI kod sayfası · yeni dosya kodlaması |
| Satır sonu | Dosyanınkini koru ya da açarken CRLF/LF/CR'ye çevir · yeni dosya satır sonu |
| Girinti | Sekme genişliği (1–16) · sekme yerine boşluk · girintiyi dosyadan algıla · otomatik girinti · parantez/tırnak otomatik kapatma |
| Dil | Otomatik ya da zorla seçilen dil |
| Görünüm | Renk teması (Mastertool Gece/Gündüz otomatik, Obsidian, Monokai, VS Dark, VS Light, Solarized Light, Yüksek Kontrast) · yazı tipi · boyut (6–48) · kenar çizgileri (ör. 80,120) · satır kaydırma · satır numaraları · geçerli satır vurgusu · akıllı vurgulama · girinti kılavuzları · kod katlama · parantez renklendirme · mini harita · boşluk/sekme gösterimi (yok / sözcük arası hariç / satır sonu / tümü) · görünmez karakterler |
| Kaydetme | Satır sonu boşluklarını sil · dosya sonuna satır sonu ekle · kaydetmeden önce sunucuda değişiklik kontrolü · otomatik kaydetme (0–3600 sn) |
| Proje | Gizli dosyaları göster · ağaçta gösterilmeyecek adlar/kalıplar (`node_modules, .git, *.log`) · açık sekmeleri hatırla |

## Çakışma koruması nasıl çalışır

1. Dosya açılırken sunucudaki boyutu ve değiştirilme zamanı not edilir.
2. Kaydet'e basınca, yüklemeden önce bu iki değer sunucudan yeniden okunur. Zaman farkı ±1,5 sn'yi aşarsa ya da boyut değiştiyse dosya başkası tarafından değiştirilmiş sayılır. FTP'de değiştirilme zamanı, sunucu MDTM komutunu destekliyorsa kullanılır.
3. Değişmişse sorulur: **Üzerine yaz** · **Sunucudakini yükle** · **İptal**.
4. Otomatik kaydetme çakışmada üzerine yazmaz; yalnız uyarı gösterir.
5. Kaydedilmemiş sekme varken pencere kapatılırsa ya da sekme kapatılırsa sorulur.

Bu kontrol bağlantı ayarından kapatılabilir.

## Güvenlik

- **Şifreler:** Bağlantı şifreleri ve anahtar parolaları Windows DPAPI (Electron `safeStorage`) ile şifreli saklanır ve arayüz katmanına hiç gönderilmez.
- **Hesap girişi:** Şifre sunucuya gitmez; cihazda türetilen bir doğrulama özeti (`auth_hash`) gider. Türetme PBKDF2-SHA256 ile 310.000 tur.
- **Uçtan uca şifreli senkron:**
  - Bağlantılar, klasörler ve ayarlar cihazda AES-256-GCM ile şifrelenir.
  - Anahtar şifrenizden türetilir (PBKDF2 + HKDF) ve cihazdan çıkmaz; sunucu içeriği okuyamaz.
  - Senkronlanmayanlar: yerel klasör yolları, açık sekmeler, çalışma kopyaları, pencere düzeni.
- **Oturum:** "Beni hatırla" seçiliyse oturum anahtarı DPAPI ile şifreli saklanır.
- **Özel anahtarlar:** Senkronla gelen özel anahtar dosyaları yalnız kullanıcıya açık izinlerle yazılır.
- **SSH:** Host anahtarı doğrulanır (ilk bağlantıda kaydedilir, değişirse reddedilir).
- **FTPS:** Sunucu sertifikası doğrulanmaz. Kendinden imzalı sertifikalı sunucular da kabul edilir (FileZilla / FTP Masters davranışı); bağlantı yine şifrelidir.

## Performans ve sınırlar

| | |
|---|---|
| En büyük dosya | 50 MB (daha büyükler editörde açılmaz) |
| İkili dosyalar | İlk 8 KB'ta NUL baytı varsa ikili sayılır, editörde açılmaz |
| Açık sekme | Çalışırken sınır yok; bir sonraki açılış için en fazla 50 sekme hatırlanır |
| Klasör ağacı | Klasörler açıldıkça listelenir (tembel yükleme) |
| FTP zaman aşımı | 30 sn |
| SSH bağlantı zaman aşımı | 20 sn · bağlantıyı canlı tutma 20 sn'de bir |
| Hesap/senkron istekleri | 20 sn zaman aşımı |
| Senkron | girişte, açılışta, değişiklikten 3 sn sonra ve açıkken 5 dk'da bir |
| Senkron kütüphanesi | en fazla 5 MB (şifreli) · silinen kayıtlar 30 gün tutulur |
| Bilinen sınırlar | FTP aktif kip yok; proxy/SOCKS yok; dosyalarda arama (Find in Files) yok |

## Klavye kısayolları

**Proje penceresi**

| Kısayol | İşlev |
|---|---|
| Ctrl+S | Kaydet (sunucuya yükle) |
| Ctrl+Shift+S | Tümünü kaydet |
| Ctrl+W / Ctrl+F4 | Sekmeyi kapat |
| Ctrl+Tab / Ctrl+Shift+Tab | Sonraki / önceki sekme |
| Ctrl+N | Yeni dosya |
| Ctrl+B | Klasör ağacını aç/kapat |
| Ctrl+F | Bul |
| Ctrl+H | Değiştir |
| F3 / Shift+F3 | Sonraki / önceki eşleşme |
| Ctrl+G | Satıra git |
| F1 | Komut paleti |
| Alt+Z | Satır kaydır |
| Ctrl+= / Ctrl+- / Ctrl+0 | Yakınlaştır / uzaklaştır / sıfırla (Ctrl+tekerlek de çalışır) |
| Ctrl+Z / Ctrl+Y | Geri al / yinele |
| Ctrl+D | Sonraki eşleşmeyi seçime ekle |
| Ctrl+Shift+L | Tüm eşleşmeleri seç |
| Alt+tık · Ctrl+Alt+↑/↓ | Çoklu imleç |
| Alt+↑/↓ | Satırı taşı |
| Shift+Alt+↑/↓ | Satırı çoğalt |
| Ctrl+Shift+K | Satırı sil |
| Ctrl+/ | Yorum satırı aç/kapat |
| Ctrl+Shift+[ / ] | Katla / aç |
| Ağaçta: ↑ ↓ ← → · Enter · F2 · Del | Gezin · aç · yeniden adlandır · sil |

**Ana pencere**

| Kısayol | İşlev |
|---|---|
| Ctrl+N | Yeni bağlantı |
| Ctrl+F | Bağlantılarda ara |
| Enter | Seçili bağlantıyı aç |
| F2 | Düzenle |
| Del | Sil |
| Backspace | Üst klasöre çık |

## Arayüz dilleri

Türkçe, English, Français, Deutsch, Español, العربية (sağdan sola; editör içeriği ve yollar soldan sağa), 中文, Русский. İlk açılışta Windows dili kullanılır; listede yoksa İngilizce.

## Sürüm geçmişi

**1.1.0** — 15 Ekim 2026
- 8 arayüz dili (Arapça sağdan sola).
- Tema varsayılanı "Sistem tercihi".
- Yeni ayarlar penceresi: Genel · Hesap · Editör · Hakkında.
- Sistem tepsisi: küçültünce/kapatınca tepsiye gizleme, tepsiden projeleri hızlı açma.
- Windows oturumu açılınca başlatma.
- Hakkında: güncellemeleri denetleme ve açık kaynak lisansları.
- Hesap sayfaları uygulamanın diliyle ve temasıyla açılır.
- Başlat menüsü klasörü "Master Tool".
- Düzeltmeler: FTP formunda taşan düğmeler; Bul/Değiştir açılınca editörün üstünde kalan boşluk.

**1.0.0** — 15 Ekim 2026 — ilk sürüm
- SSH Projesi, FTP Projesi (FTP/FTPS/SFTP), Lokal Klasör, Proje Dosyası.
- Bağlantı testi ve sunucuda klasör seçme.
- Ayrı proje penceresi: klasör ağacı + sekmeli editör.
- Çalışma kopyası (önbellek).
- Kaydedince yükleme ve çakışma koruması.
- Bağlantı başına Notepad++ ayarları.
- Kodlama ve satır sonu denetimi.
- Mastertool hesabı ve uçtan uca şifreli senkron.
- Mastertool kurulum klasörü.
