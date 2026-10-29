# Teknik bağlam

## Sürümler

**DeckPad** (`app/`): Expo SDK 58 · React Native 0.88 (New Architecture) · React 19.3 · TypeScript 6 (strict) · zustand 5 · obs-websocket-js 5 ·
react-native-sortables · Reanimated 4 + worklets · Gesture Handler 3 · expo-secure-store, expo-camera (QR), expo-haptics, expo-keep-awake, expo-clipboard,
expo-linear-gradient, expo-font, expo-constants · @expo-google-fonts/barlow(-semi-condensed) · web: react-dom 19.3.0, react-native-web 0.21, @expo/metro-runtime.
Paket adı `dev.deckpad.app`. Test: Node test runner + tsx, `ws`.

**StudioHub** (`studiohub/`): .NET 10 SDK · ASP.NET Core (Kestrel) · WPF + WinForms (yalnız NotifyIcon) · Microsoft.Web.WebView2 1.0.4258.31 · QRCoder 1.6.0 · xUnit 2.9.
FFmpeg ve Unity Capture K-016 ile çıktı.

**OBS**: hedef OBS 30.0+ (obs-websocket 5.3+). Betik obslua.

## Komutlar

```bash
# DeckPad
cd app && npm ci
npm run typecheck                  # tsc --noEmit -p .
npm test                           # 25 test (obs.test.ts 15, hub.test.ts 10)
npx tsx test/serve-mock.ts 4455    # elle deneme için sahte OBS
npm run export:panel               # web derlemesi → ../studiohub/web/panel
npx expo prebuild -p android && cd android && ./gradlew assembleRelease   # APK (~35 MB, hata ayıklama anahtarıyla imzalı)

# StudioHub (kökten)
dotnet test studiohub/tests/StudioHub.Core.Tests                     # 41 test
dotnet run --project studiohub/src/StudioHub.DevServer -- <veri> <panel> <hub> [obs-paketi]   # http://127.0.0.1:4466/hub/
dotnet publish studiohub/src/StudioHub -c Release -o studiohub/out/dist                       # win-x64, self-contained; klasörde yalnız StudioHub.exe (~80 MB)

# Sürüm: gh release create vX.Y.Z studiohub/out/dist/StudioHub.exe studiohub/out/dist/DeckPad.apk (adlar sabit; Pages bunlara bağlanır)

# Windows'ta hepsi (panel + yayın C:\Apps\StudioHub + Başlat menüsü; -Apk: APK derle, telefona kur)
.\scripts\kur.ps1 [-Apk] [-Target C:\Apps\StudioHub]
```

Expo paketlerini `npx expo install` ile ekle (`app/AGENTS.md`). `npx expo prebuild` package.json'daki `scripts`'i sıfırlayabilir; `test`, `typecheck`, `export:panel` betiklerini kontrol et.

## Derleme ayrıntıları

- **app.json** (`expo-build-properties`): `usesCleartextTraffic: true` (ws:// için), `extraProguardRules` (ML Kit kayıtçılarının kurucusu; yoksa release'te QR okunmaz, `lessons.md`), `buildArchs: ["arm64-v8a"]`, `blockedPermissions` (RECORD_AUDIO, depolama, SYSTEM_ALERT_WINDOW).
- `android/` ve `ios/` üretilir (CNG), depoda yok. APK hata ayıklama anahtarıyla imzalanır (kişisel kullanım).
- **StudioHub yayını** (K-019): web/hub, web/panel ve `deckpad.lua` exe'ye `EmbeddedResource` olarak gömülü (`web/` önekli adlar); `App.ExtractWebContent` açılışta `%LOCALAPPDATA%\StudioHub\web`'e çıkarır. Yalnız yerel DLL'ler (WPF, WebView2Loader) `%TEMP%\.net\StudioHub`'a çıkar (`IncludeNativeLibrariesForSelfExtract`). XML belge ve pdb yayınlanmaz (`Directory.Build.props`).
  WinForms+WPF birlikte: `System.Windows.Forms` ve `System.Drawing` global using'den çıkarıldı, `System.IO` eklendi, WFO0003 susturuldu.
  Betik `../../../obs-script/*.lua` yolundan `web/obs/` adıyla gömülür. Exe 83,9 MB (Windows 11, 2026-10-29).
- **Linux'ta derleme**: WPF projesi `EnableWindowsTargeting` ile derlenir ama çalışmaz; çalıştırmak için DevServer.

## Çalışma zamanı yerleri (Windows)

| Yer | İçerik |
|---|---|
| `C:\Apps\StudioHub` | `kur.ps1`'in yayın klasörü (yalnız `StudioHub.exe`, `-Apk` ile `DeckPad.apk`; eski kurulumdan kalan `hub`/`panel`/`obs` okunmaz) |
| `%LOCALAPPDATA%\StudioHub\web` | exe'den çıkarılan arayüz, panel ve betik (`.surum` damgası değişince yeniden yazılır) |
| `%TEMP%\.net\StudioHub` | tek dosya yayının yerel DLL'leri (~9 MB) |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\StudioHub.lnk` | `kur.ps1`'in kısayolu |
| `%APPDATA%\StudioHub\settings.json` | portlar, ad, eşleştirme anahtarı, OBS şifresi (eski dosyalardaki webcam alanları yok sayılır) |
| `%APPDATA%\StudioHub\deck.json` | bilgisayardaki DeckPad düzeni |
| `%APPDATA%\StudioHub\studiohub.log` | hata kaydı (ilk bakılacak yer) |
| `%LOCALAPPDATA%\StudioHub\WebView2` | WebView2 verisi |
| `HKCU\...\Run\StudioHub` | Windows ile başlat (`--minimized`) |
| Güvenlik duvarı | "StudioHub (TCP)" (yalnız yerel alt ağ). Eski kurulumdan kalan "StudioHub (UDP)" kuralı artık gereksiz |

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
- StudioHub DevServer + gerçek OBS; Node WebSocket betiğiyle telefon taklidi; Playwright + Chromium ile ekran görüntüsü
  (telefon 412×892 / 892×412, DPR 2.5).
- Android derlemesi: Maven Central 429 verdiğinde Gradle init betiğiyle Google aynasına yönlendirme; `org.gradle.jvmargs=-Xmx3g`, `workers.max=2`, `kotlin.daemon.jvmargs=-Xmx1536m`. Metro/Chromium ile aynı anda derleme belleği tüketir.

## Windows geliştirme ortamı (kullanıcının bilgisayarı, 2026-10-26)

Windows 11 25H2 · i7-6700K · 32 GB · Node 26.7 / npm 12 · .NET 10.0.403 · OBS 32.2.2 · Oracle JDK 17.0.5 (`C:\Program Files\Java\jdk-17.0.5`) · Visual Studio 2026 Community.
Kullanıcı: araçlar tek klasörde, az PATH satırıyla kurulsun. Her şey `C:\Apps\DevKit` altında (kaldırmak için klasörü sil, aşağıdaki değişkenleri ve PATH satırlarını kaldır):

| Klasör | Değişken (Kullanıcı) | İçerik |
|---|---|---|
| `android-sdk` | `ANDROID_HOME` | cmdline-tools 23, platform-tools 37.0.1, emulator 37.2.12, `platforms/android-37.0`, build-tools 37.0.0, NDK 27.1.12297006, `system-images/android-37.0/google_apis_playstore/x86_64` |
| `android-user` | `ANDROID_USER_HOME`, `ANDROID_AVD_HOME` (`…\avd`) | AVD `DeckPad_Pixel` (pixel_10, 4 GB RAM, GPU açık; anlık görüntüyle ~7 GB), Android CLI ayarları |
| `gradle` | `GRADLE_USER_HOME` | Gradle önbelleği |
| `flutter` | (PATH) | Flutter 3.47.8 stable, Dart 3.13.7 |
| `pub-cache` | `PUB_CACHE` | Dart paketleri |

`JAVA_HOME` = Oracle JDK 17.0.5. PATH'e eklenenler: `android-sdk\platform-tools`, `android-sdk\emulator`, `android-sdk\cmdline-tools\latest\bin`, `flutter\bin`.
Önceki PATH'in yedeği `C:\Apps\DevKit\PATH-yedek-2026-10-26.txt`. Emülatör hızlandırması: WHPX (yönetici izni gerekmedi). `flutter doctor` temiz.
Kullanıcı klasöründe bilerek kalanlar (araçlarda sabit kodlu): `%USERPROFILE%\.android` (adb anahtarı + emülatör durumu, ~20 KB), `%USERPROFILE%\.expo` (Expo CLI), `%APPDATA%\.dart-tool` (telemetri kapalı kaydı).
Eski `%USERPROFILE%\.gradle` (12 GB) kullanıcının onayıyla silindi. Flutter/Dart telemetrisi kapalı; Android araçlarında zaten kapalı.
Expo Go'yu emülatörde açma: `npx expo start --lan` → `adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d exp://192.168.1.110:8081 host.exp.exponent`.
