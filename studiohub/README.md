# StudioHub (Windows yardımcısı)

> Deponun genel tanıtımı ve mimarisi için [kök README](../README.md).


DeckPad'in Windows tarafı. Tek uygulama, üç iş:

| İş | Ne yapar |
|---|---|
| **DeckPad yardımcısı** | Telefondaki DeckPad tuşlarıyla bilgisayarda kısayol, PowerPoint/slayt, medya, Windows ses düzeyi, uygulama ve web sayfası açma |
| **DeckPad masaüstü** | Aynı tuş düzeni bilgisayar penceresinde ve OBS'in içinde panel olarak |
| **OBS'i hazırla** | WebSocket'i açar, DeckPad panelini ve kurulum betiğini OBS'e ekler |

## Kurulum

1. Deponun kökünde `.\scripts\kur.ps1`. Paneli derler, StudioHub'ı `C:\Apps\StudioHub`'a yayınlar (`-Target` ile değişir), Başlat menüsüne ekler, Windows ile başlatır ve açar. .NET kurulumu gerekmez.
   - Windows SmartScreen "Windows bilgisayarınızı korudu" derse **Ek bilgi › Yine de çalıştır**. (Uygulama imzasız olduğu için çıkar.)
   - Güvenlik duvarı izin sorarsa **Özel ağlar**'ı işaretleyip izin ver.
2. Açılan pencerede:
   - **OBS'i hazırla**: OBS kapalıyken bas, sonra **OBS'i aç**.
   - **Güvenlik duvarı › İzin ver**: Telefonlar bağlanamıyorsa. Kural yalnızca aynı yerel ağdaki cihazlara izin verir.
3. Telefonda DeckPad › **QR kodu okut** ile ekrandaki kodu okut.

Pencereyi kapatınca StudioHub tepside çalışmaya devam eder (telefonlar bağlı kalır). Kapatmak için tepsi simgesi › **Çıkış**.

## Nasıl çalışır

```
Telefon (DeckPad) ──WebSocket 4466──▶ StudioHub ──SendInput / Core Audio / PowerPoint COM──▶ Windows
Telefon (DeckPad) ──WebSocket 4455──────────────────────────────────────────────────────────▶ OBS
```

- **Tek port (4466)**: DeckPad web paneli `/`, yönetim arayüzü `/hub/`, yerel API `/api/*`, telefon bağlantısı `/ws`.
- **Güvenlik**: Yönetim arayüzü ve API yalnızca bilgisayarın kendisinden açılır; API ayrıca özel bir başlık ister (tarayıcıdan sahte istekleri engeller). Host başlığı yalnızca IP ya da localhost olabilir (DNS rebinding'e karşı). Telefonlar QR'daki eşleştirme anahtarıyla bağlanır; 5 hatalı denemede 1 dakika kilit. **Kodu yenile** eski anahtarla bağlı herkesi düşürür.

## Ayarlar ve dosyalar

| Yer | İçerik |
|---|---|
| `%APPDATA%\StudioHub\settings.json` | Portlar, cihaz adı, eşleştirme anahtarı, OBS şifresi |
| `%APPDATA%\StudioHub\deck.json` | Bilgisayardaki DeckPad düzeni (panel, OBS paneli ve eşitlemeyi açan telefonlar ortak kullanır) |
| `%APPDATA%\StudioHub\studiohub.log` | Hata kaydı |
| `%LOCALAPPDATA%\StudioHub\WebView2` | Pencerelerin tarayıcı verisi |

**Kaldırma**: StudioHub › Ayarlar'da **Windows açılınca başlat**'ı kapat, sonra `C:\Apps\StudioHub` klasörünü ve Başlat menüsündeki kısayolu sil. Güvenlik duvarı kuralı "StudioHub (TCP)" adıyla görünür.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Telefon bilgisayara bağlanamıyor | Aynı Wi‑Fi'de olun; misafir ağları cihazları birbirinden yalıtır. **Güvenlik duvarı › İzin ver**. QR'ı yeniden okut. |
| "Port 4466 kullanımda" | StudioHub zaten açık olabilir; tepsiye bak. Değilse Ayarlar › Portlar'dan değiştir. |
| OBS ayarları yazılmadı | OBS açıkken yazılmaz; OBS'i kapatıp yeniden **OBS'i hazırla**. |
| Kısayol bir uygulamada çalışmıyor | Yönetici olarak çalışan pencerelere Windows normal uygulamaların tuş göndermesine izin vermez. |

## Kaynaktan derleme

Gerekenler: .NET 10 SDK, Node.js 20+ (panel için). Windows dışında da derlenir (`EnableWindowsTargeting`); WPF kabuğu yalnız Windows'ta çalışır.

```bash
# deponun kökünden
cd app && npm run export:panel && cd ..                   # DeckPad web derlemesi → studiohub/web/panel
dotnet test studiohub/tests/StudioHub.Core.Tests          # API, WebSocket, OBS ayarları
dotnet run --project studiohub/src/StudioHub.DevServer    # Linux/macOS'ta sahte platformla geliştirme sunucusu
dotnet publish studiohub/src/StudioHub -c Release -o studiohub/out/StudioHub   # Windows için tek StudioHub.exe, .NET gerektirmez
```

Windows'ta panel + yayın + kısayol tek komut: `.\scripts\kur.ps1`.

Proje yapısı:

```
src/StudioHub.Core        Platformdan bağımsız çekirdek (net10.0): Kestrel sunucu, eşleştirme,
                          bilgisayar eylemleri, OBS ayar düzenleyici
src/StudioHub             Windows kabuğu (WPF + WebView2): tepsi, pencereler, SendInput, Core Audio,
                          PowerPoint COM, yönetici işlemleri (güvenlik duvarı)
src/StudioHub.DevServer   Geliştirme sunucusu (sahte platform)
tests/                    xUnit testleri
web/hub                   Yönetim arayüzü (HTML/CSS/JS, bağımlılıksız)
web/panel                 DeckPad'in web derlemesi (depoda yok; npm run export:panel üretir)
../obs-script             OBS kurulum betiği
                          (web/hub, web/panel ve betik exe'ye gömülür; açılışta %LOCALAPPDATA%\StudioHub\web'e çıkarılır)
```

Unity karşılaştırması: Core ↔ oyun mantığı, WPF kabuğu ↔ platforma özel eklenti (ör. Android/iOS native plugin). Arayüz HTML olduğu için Linux'ta tarayıcıda test edilebiliyor; WPF yalnızca pencere ve Windows API'leri için.
