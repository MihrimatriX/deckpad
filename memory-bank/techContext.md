# Teknik bağlam

## Sürümler

**DeckPad** (`app/`): Expo SDK 58 · React Native 0.88 (New Architecture) · React 19.3 · TypeScript 6 (strict) · zustand 5 · obs-websocket-js 5 ·
react-native-sortables · Reanimated 4 + worklets · Gesture Handler 3 · expo-secure-store, expo-camera (QR), expo-haptics, expo-keep-awake, expo-clipboard,
expo-linear-gradient, expo-font, expo-constants · @expo-google-fonts/barlow(-semi-condensed) · web: react-dom 19.3.0, react-native-web 0.21, @expo/metro-runtime.
Paket adı `dev.deckpad.app`. Test: Node test runner + tsx, `ws`.

**StudioHub** (`studiohub/`): .NET 10 SDK · ASP.NET Core (Kestrel) · WPF + WinForms (yalnız NotifyIcon) · Microsoft.Web.WebView2 1.0.4258.31 · QRCoder 1.6.0 · xUnit 2.9.
FFmpeg 9.0.2 essentials (gyan.dev, libsrt'li, GPL; `ffmpeg.exe` SHA-256 `3256173f…8edec`) · Unity Capture (MIT, 32+64 bit filtre).

**OBS**: hedef OBS 30.0+ (obs-websocket 5.3+). Betik obslua.

## Komutlar

```bash
# DeckPad
cd app && npm ci
npm run typecheck                  # tsc --noEmit -p .
npm test                           # 24 test (obs.test.ts 14, hub.test.ts 10)
npx tsx test/serve-mock.ts 4455    # elle deneme için sahte OBS
npm run export:panel               # web derlemesi → ../studiohub/web/panel
npx expo prebuild -p android && cd android && ./gradlew assembleRelease   # APK (~35 MB, hata ayıklama anahtarıyla imzalı)

# StudioHub (kökten)
scripts/hazirla.sh                 # Windows: .\scripts\hazirla.ps1  → FFmpeg indir + doğrula, paneli derle
dotnet test studiohub/tests/StudioHub.Core.Tests                     # 41 test; Linux'ta /usr/local/bin/ffmpeg (libsrt) varsa SRT uçtan uca da koşar
dotnet run --project studiohub/src/StudioHub.DevServer -- <veri> <panel> <hub> [obs-paketi]   # http://127.0.0.1:4466/hub/
dotnet publish studiohub/src/StudioHub -c Release -o studiohub/out/StudioHub                  # win-x64, self-contained, tek dosya (~79 MB exe)
```

Expo paketlerini `npx expo install` ile ekle (`app/AGENTS.md`). `npx expo prebuild` package.json'daki `scripts`'i sıfırlayabilir; `test`, `typecheck`, `export:panel` betiklerini kontrol et.

## Derleme ayrıntıları

- **app.json** (`expo-build-properties`): `usesCleartextTraffic: true` (ws:// için), `buildArchs: ["arm64-v8a"]`, `blockedPermissions` (RECORD_AUDIO, depolama, SYSTEM_ALERT_WINDOW).
- `android/` ve `ios/` üretilir (CNG), depoda yok. APK hata ayıklama anahtarıyla imzalanır (kişisel kullanım).
- **StudioHub yayını**: web, vendor ve betik içerikleri `ExcludeFromSingleFile="true"` (yoksa ffmpeg.exe exe'nin içine gömülür). XML belge ve pdb yayınlanmaz (`Directory.Build.props`).
  WinForms+WPF birlikte: `System.Windows.Forms` ve `System.Drawing` global using'den çıkarıldı, `System.IO` eklendi, WFO0003 susturuldu.
  Betik `../../../obs-script/*.lua` yolundan `obs/obs-script` olarak yayına eklenir. Yayın klasörü ~184 MB, zip ~117 MB (FFmpeg ~105 MB).
- **Linux'ta derleme**: WPF projesi `EnableWindowsTargeting` ile derlenir ama çalışmaz; çalıştırmak için DevServer.

## Çalışma zamanı yerleri (Windows)

| Yer | İçerik |
|---|---|
| `%APPDATA%\StudioHub\settings.json` | portlar, ad, eşleştirme anahtarı, OBS şifresi, webcam ayarları |
| `%APPDATA%\StudioHub\deck.json` | bilgisayardaki DeckPad düzeni |
| `%APPDATA%\StudioHub\studiohub.log` | hata kaydı (ilk bakılacak yer) |
| `%LOCALAPPDATA%\StudioHub\WebView2` | WebView2 verisi |
| `%ProgramFiles%\StudioHub\driver` | kayıtlı sanal kamera filtreleri |
| `%ProgramData%\obs-studio\plugins\camlink` | CamLink OBS eklentisi |
| `HKCU\...\Run\StudioHub` | Windows ile başlat (`--minimized`) |
| Güvenlik duvarı | "StudioHub (TCP)", "StudioHub (UDP)" (yalnız yerel alt ağ) |

## OBS yapılandırma bilgisi (gerçek OBS'te doğrulandı)

- **WebSocket**: obs-websocket 5.3 (OBS 30.0/30.1) ayarı `global.ini` `[OBSWebSocket]` içinde okur (FirstLoad, ServerEnabled, ServerPort, AuthRequired, ServerPassword, AlertsEnabled).
  Yeni sürümler `plugin_config/obs-websocket/config.json` (first_load, server_enabled, server_port, auth_required, server_password, alerts_enabled) kullanır ve global.ini'de değer bulursa taşır → StudioHub ikisini birlikte yazar.
- **Paneller**: `[BasicWindow] ExtraBrowserDocks=[{"title","url","uuid"}]`; OBS 31+ `user.ini`, öncesi `global.ini`. Yeni panel Paneller menüsünden açılır.
- **Betikler**: sahne koleksiyonu JSON'unda `modules["scripts-tool"] = [{path, settings}]`.
- **İlk açılış sihirbazı**: `global.ini` `[General] FirstRun=true` **ve** `LastVersion` varsa çıkmaz (ad ters anlamlı).
- OBS açıkken ayar dosyaları yazılmaz: OBS kapanırken kendi belleğindekini yazıp değişikliği ezer.

## Test ortamı (bulut, Linux)

- Gerçek OBS: `apt-get install obs-studio libobs-dev` (Ubuntu noble: OBS 30.0.2, obs-websocket 5.3.4, obslua var, tarayıcı kaynağı yok);
  `Xvfb :99` + `LIBGL_ALWAYS_SOFTWARE=1 obs --disable-shutdown-check --disable-updater`, ayrı `HOME`.
- StudioHub DevServer + gerçek OBS; FFmpeg ile SRT test göndericisi; Node WebSocket betiğiyle telefon taklidi; Playwright + Chromium ile ekran görüntüsü
  (telefon 412×892 / 892×412, DPR 2.5).
- Android derlemesi: Maven Central 429 verdiğinde Gradle init betiğiyle Google aynasına yönlendirme; `org.gradle.jvmargs=-Xmx3g`, `workers.max=2`, `kotlin.daemon.jvmargs=-Xmx1536m`. Metro/Chromium ile aynı anda derleme belleği tüketir.
