# StudioHub (Windows yardımcısı)

> Deponun genel tanıtımı ve mimarisi için [kök README](../README.md).


DeckPad ve CamLink'in Windows tarafı. Tek uygulama, dört iş:

| İş | Ne yapar |
|---|---|
| **DeckPad yardımcısı** | Telefondaki DeckPad tuşlarıyla bilgisayarda kısayol, PowerPoint/slayt, medya, Windows ses düzeyi, uygulama ve web sayfası açma |
| **OBS'siz webcam** | CamLink'in görüntüsünü Zoom, Discord, Teams, Meet ve tarayıcıda **CamLink Kamera** adlı sanal kamera olarak gösterir |
| **DeckPad masaüstü** | Aynı tuş düzeni bilgisayar penceresinde ve OBS'in içinde panel olarak |
| **OBS'i hazırla** | WebSocket'i açar, DeckPad panelini OBS'e ekler, CamLink eklentisini ve kurulum betiğini kurar |

## Kurulum

1. Hazır klasörü (`StudioHub-Windows.zip` ya da `dotnet publish` çıktısı) bir yere koy (ör. `Belgeler\StudioHub`). Klasör yapısını bozma: `ffmpeg`, `driver`, `hub`, `panel`, `obs` klasörleri uygulamanın yanında durmalı.
2. `StudioHub.exe`'yi çalıştır. .NET kurulumu gerekmez.
   - Windows SmartScreen "Windows bilgisayarınızı korudu" derse **Ek bilgi › Yine de çalıştır**. (Uygulama imzasız olduğu için çıkar.)
   - Güvenlik duvarı izin sorarsa **Özel ağlar**'ı işaretleyip izin ver.
3. Açılan pencerede:
   - **OBS'i hazırla**: OBS kapalıyken bas. Eklenti kopyalanırken yönetici izni istenebilir.
   - **Sanal kamera sürücüsü › Kur**: OBS'siz webcam için bir kez. Yönetici izni ister.
   - **Güvenlik duvarı › İzin ver**: Telefonlar bağlanamıyorsa. Kurallar yalnızca aynı yerel ağdaki cihazlara izin verir.
4. Telefonda DeckPad ya da CamLink'te **QR kodu okut** ile ekrandaki kodu okut.

Pencereyi kapatınca StudioHub tepside çalışmaya devam eder (telefonlar bağlı kalır). Kapatmak için tepsi simgesi › **Çıkış**.

## Nasıl çalışır

```
Telefon (DeckPad) ──WebSocket 4466──▶ StudioHub ──SendInput / Core Audio / PowerPoint COM──▶ Windows
Telefon (DeckPad) ──WebSocket 4455──────────────────────────────────────────────────────────▶ OBS
Telefon (CamLink) ──SRT 9100 (UDP)──▶ StudioHub ─▶ FFmpeg (çözme) ─▶ paylaşılan bellek ─▶ CamLink Kamera
Telefon (CamLink) ──SRT 9000 (UDP)──────────────────────────────▶ OBS "CamLink telefon kamerası" kaynağı
StudioHub ve OBS eklentisi ──UDP 4467 yayını──▶ telefonlar bilgisayarı kendiliğinden bulur
```

- **Tek port (4466)**: DeckPad web paneli `/`, yönetim arayüzü `/hub/`, yerel API `/api/*`, telefon bağlantısı `/ws`.
- **Güvenlik**: Yönetim arayüzü ve API yalnızca bilgisayarın kendisinden açılır; API ayrıca özel bir başlık ister (tarayıcıdan sahte istekleri engeller). Host başlığı yalnızca IP ya da localhost olabilir (DNS rebinding'e karşı). Telefonlar QR'daki eşleştirme anahtarıyla bağlanır; 5 hatalı denemede 1 dakika kilit. **Kodu yenile** eski anahtarla bağlı herkesi düşürür.
- **Sanal kamera**: [Unity Capture](https://github.com/schellingb/UnityCapture) DirectShow filtresi (MIT). Sürücü `Program Files\StudioHub\driver`'a kopyalanıp "CamLink Kamera" adıyla kaydedilir; StudioHub klasörünü taşısan da kamera çalışır. Telefon görüntüsü yokken kamerada "Telefon bekleniyor" ekranı görünür.
- **FFmpeg**: gyan.dev'in GPL derlemesi, ayrı süreç olarak çalışır; StudioHub kapanınca (çökse bile) iş nesnesi sayesinde o da kapanır.

## Ayarlar ve dosyalar

| Yer | İçerik |
|---|---|
| `%APPDATA%\StudioHub\settings.json` | Portlar, cihaz adı, eşleştirme anahtarı, OBS şifresi |
| `%APPDATA%\StudioHub\deck.json` | Bilgisayardaki DeckPad düzeni (panel, OBS paneli ve eşitlemeyi açan telefonlar ortak kullanır) |
| `%APPDATA%\StudioHub\studiohub.log` | Hata kaydı |
| `%LOCALAPPDATA%\StudioHub\WebView2` | Pencerelerin tarayıcı verisi |

**Kaldırma**: Uygulamada sürücüyü **Kaldır**, sonra klasörü sil. Güvenlik duvarı kuralları "StudioHub (TCP)" ve "StudioHub (UDP)" adıyla görünür.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Telefon bilgisayarı bulamıyor | Aynı Wi‑Fi'de olun; misafir ağları cihazları birbirinden yalıtır. **Güvenlik duvarı › İzin ver**. QR ile bağlan. |
| Zoom/Discord'da "CamLink Kamera" yok | Sürücüyü kur, uygulamayı yeniden başlat. Windows 11'in **Kamera** uygulaması yalnızca Media Foundation kameralarını gösterir; DirectShow sanal kameralar (OBS'in sanal kamerası dahil) orada görünmez. |
| Kamerada görüntü ters | StudioHub › Webcam › **Ters çıkarsa çevir** anahtarını değiştir. |
| "Port 4466 kullanımda" | StudioHub zaten açık olabilir; tepsiye bak. Değilse Ayarlar › Portlar'dan değiştir. |
| OBS ayarları yazılmadı | OBS açıkken yazılmaz; OBS'i kapatıp yeniden **OBS'i hazırla**. |
| Kısayol bir uygulamada çalışmıyor | Yönetici olarak çalışan pencerelere Windows normal uygulamaların tuş göndermesine izin vermez. |

## Kaynaktan derleme

Gerekenler: .NET 10 SDK, Node.js 20+ (panel için). Windows dışında da derlenir (`EnableWindowsTargeting`); WPF kabuğu yalnız Windows'ta çalışır.

```bash
# deponun kökünden
scripts/hazirla.sh                       # Windows: .\scripts\hazirla.ps1
                                         #  - FFmpeg 9.0.2'yi indirir, SHA-256 doğrular → studiohub/vendor/ffmpeg/ffmpeg.exe
                                         #  - DeckPad web derlemesini üretir → studiohub/web/panel
dotnet test studiohub/tests/StudioHub.Core.Tests          # 41 test: API, WebSocket, OBS ayarları, FFmpeg ile SRT uçtan uca
dotnet run --project studiohub/src/StudioHub.DevServer    # Linux/macOS'ta sahte platformla geliştirme sunucusu
dotnet publish studiohub/src/StudioHub -c Release -o studiohub/out/StudioHub   # Windows için tek dosya, .NET gerektirmez
```

SRT uçtan uca testi Linux'ta `/usr/local/bin/ffmpeg` (libsrt'li) varsa koşar, yoksa atlanır. DevServer'ın FFmpeg yolu `FFMPEG` ortam değişkeniyle değiştirilir.

Proje yapısı:

```
src/StudioHub.Core        Platformdan bağımsız çekirdek (net10.0): Kestrel sunucu, eşleştirme, duyuru,
                          bilgisayar eylemleri, OBS ayar düzenleyici, FFmpeg webcam alıcısı
src/StudioHub             Windows kabuğu (WPF + WebView2): tepsi, pencereler, SendInput, Core Audio,
                          PowerPoint COM, Unity Capture paylaşılan bellek, yönetici işlemleri
src/StudioHub.DevServer   Geliştirme sunucusu (sahte platform)
tests/                    xUnit testleri
web/hub                   Yönetim arayüzü (HTML/CSS/JS, bağımlılıksız)
web/panel                 DeckPad'in web derlemesi (depoda yok; npm run export:panel üretir)
vendor/driver             Unity Capture sanal kamera filtresi (MIT)
vendor/ffmpeg             FFmpeg (depoda yalnız lisans ve kaynak notu; exe indirilir)
vendor/obs/obs-plugin     CamLink OBS eklentisinin derlenmiş hali (camlink deposundan)
../obs-script             OBS kurulum betiği; yayına obs/obs-script olarak eklenir
```

Unity karşılaştırması: Core ↔ oyun mantığı, WPF kabuğu ↔ platforma özel eklenti (ör. Android/iOS native plugin). Arayüz HTML olduğu için Linux'ta tarayıcıda test edilebiliyor; WPF yalnızca pencere ve Windows API'leri için.
