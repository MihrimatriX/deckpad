# Sistem kalıpları

## Genel akış

```
Telefon DeckPad ──obs-websocket v5 (4455)──────────────────────────▶ OBS
        │
        └──WS /ws (4466, hello+token)──▶ StudioHub.Core HelperHub ──▶ PcActionDispatcher ──▶ IPcPlatform (WindowsPc)
                                              │                                              SendInput · Core Audio · PowerPoint COM
                                              └──deckGet/deckPut/deckChanged──▶ DeckStore (%APPDATA%\StudioHub\deck.json)
StudioHub HubHost (Kestrel 0.0.0.0:4466)
  /               DeckPad web derlemesi (web/panel)  ?mode=desktop → PanelWindow (WebView2), ?mode=dock → OBS tarayıcı paneli
  /panel-config.json  yalnız loopback: OBS ve hub bağlantı bilgisi (panel kendini bununla yapılandırır)
  /hub/           yönetim arayüzü (web/hub, yalnız loopback) → MainWindow (WebView2)
  /api/*          yalnız loopback + X-StudioHub başlığı
CamLink (telefon) ──SRT 9100──▶ WebcamService (FFmpeg süreci) ──RGBA kareler──▶ IFrameSink (UnityCaptureSink) ──▶ "CamLink Kamera"
Beacon ──UDP 4467 (2 sn)──▶ telefonlar
"OBS'i hazırla" ──▶ ObsConfigurator: OBS kapalıyken global.ini / config.json / user.ini / sahne koleksiyonu JSON / plugins klasörü
```

## DeckPad (`app/`)

```
App.tsx                 açılış: ayarlar + deste yükle → panel modu mu? → OBS/StudioHub bağlan → otomatik sayfa doldurma
src/obs/client.ts       ObsController (tekil): bağlan (7 sn zaman aşımı), gen sayacı, üstel yeniden bağlanma,
                        auth hatası (4009) denemeyi durdurur, syncAll RequestBatch, olaylar, 1 sn yoklama (kayıt/yayın/istatistik)
src/obs/store.ts        zustand: canlı OBS durumu (sahneler, girdiler, susturma, kayıt/yayın, sceneItems, filtreler)
src/obs/qr.ts           obsws://IP:PORT/ŞİFRE çözücü
src/hub/client.ts       HubClient (tekil hubClient): hello/welcome, istek-id eşleme (8 sn), artan aralıkla yeniden deneme;
                        4001/4003/4029 kapanışlarında denemeyi bırakır; deckChanged dinleyicileri
src/hub/sync.ts         startDeckSync: bağlanınca bilgisayardakini al (yoksa gönder), değişince 700 ms sonra gönder, gelen değişiklikte çek
src/hub/pair.ts         studiohub://pair QR çözücü
src/hub/keys.ts         KeyCombo doğrulamasının TS kopyası + COMMON_COMBOS (düzenleyicideki hazır kısayollar)
src/panel.ts            ?mode=desktop|dock algılama, /panel-config.json okuma
src/device.ts           StudioHub'da görünen cihaz adı (expo-constants deviceName); döngüsel içe aktarmayı kırmak için ayrı dosya
src/deck/model.ts       DeckAction birleşimi (OBS türleri + pcKeys/pcText/pcLaunch/pcUrl/pcMedia/pcVolume/pcSlide), DeckButton/Page/Profile,
                        OBS_NAMES (betikle ortak adlar), isPcAction
src/deck/actions.ts     ACTION_GROUPS, ACTION_META, describeAction, actionIncomplete, etiket tabloları, ICONS
src/deck/run.ts         runButton: ardışık OBS istekleri tek RequestBatch; "Bekle" → batch içindeyse OBS Sleep, değilse yerel bekleme;
                        pc* eyleminden önce birikmiş OBS istekleri gönderilir (sıra korunur); toPcAction; buttonState (tally/alt etiket)
src/deck/store.ts       deste (AsyncStorage, 250 ms gecikmeli kayıt), geri alma (40 adım), applyRemote (geçmişe eklemez)
src/deck/ops.ts         saf yardımcılar, validateProfile (dışarıdan gelen desteyi doğrular)
src/deck/defaults.ts    varsayılan deste: Ana, Sahneler (otomatik), Ses efektleri (otomatik), Slaytlar, Bilgisayar
src/settings.ts         ayarlar AsyncStorage'da; OBS şifresi ve StudioHub anahtarı SecureStore'da (web'de AsyncStorage'a düşer)
src/theme.ts            renk ve yazı anahtarları
src/components/         ui.tsx (Keycap, Sheet, Btn, Chip, Field…), DeckGrid (+ bağlantı kapısı), DeckButtonView, Chrome (TopBar,
                        StatusDisplay, PageTabs), ButtonEditor, ActionEditor (OBS ve PC formları), Sheets (Bağlantı, Ayarlar, Sayfa)
test/                   mock-obs.ts (sahte obs-websocket v5), obs.test.ts (14), hub.test.ts (10, MockHub), serve-mock.ts (elle deneme)
```

### Kalıplar
- **Durum**: zustand v5. Seçici yeni nesne/dizi döndürüyorsa `useShallow` (yoksa sonsuz render).
- **Otomatik sayfa doldurma**: profilde `autoScenesPageId` / `autoSfxPageId` doluysa bağlantıda doldurulur ve alan silinir; bir daha dolmaz. "Ses Efektleri" sahnesi sahne tuşlarından çıkarılır, efektler Türkçe sıralanır.
- **Panel modu**: `panelMode` varsa ayarlar /panel-config.json'dan gelir, `deckSync` zorla açık; başlıklar "OBS paneli" / "Masaüstü paneli".
- **Bağlantı kapısı**: tuş OBS eylemi içeriyorsa OBS, pc eylemi içeriyorsa StudioHub bağlı olmalı (DeckGrid.PlayButton uyarır).
- **Keycap**: dış görünüm (etek rengi `shade(-0.5)`) + degrade yüz; esneme `flexGrow/flexShrink` ile (flex:1 değil).
- **Yazı tipleri**: Barlow ağırlıkları alt yoldan içe aktarılır (`@expo-google-fonts/barlow/600SemiBold`); paket kökünden almak tüm ağırlıkları pakete ekler.

## StudioHub (`studiohub/`)

```
src/StudioHub.Core (net10.0, platformdan bağımsız; Microsoft.AspNetCore.App + QRCoder)
  HubSettings.cs          %APPDATA%\StudioHub\settings.json (camelCase), Normalize (port aralığı, webcam 1280×720 | 1920×1080 | 640×360, 30/60)
  Pairing.cs              PairInfo ↔ studiohub://pair?...
  Net/NetInfo.cs          LAN adresi puanlama (192.168 > 10 > 172.16-31, sanal bağdaştırıcı cezası, ağ geçidi bonusu), yayın adresleri
  Discovery/Beacon.cs     UDP 4467 duyurusu (2 sn)
  Helper/KeyCombo.cs      "Ctrl+Shift+F5" → VK kodları (Türkçe tuş adları dahil), KeyNames görüntü adları
  Helper/PcActions.cs     PcAction (JSON), IPcPlatform, PcActionDispatcher (doğrulama: url yalnız http/https, metin ≤2000, ses kısıtları)
  Webcam/WebcamService.cs FFmpeg süreci: SRT dinle → ölçekle/pad/fps/[hflip][vflip] → rawvideo RGBA → IFrameSink; EOF'ta yeniden dinler;
                          FPS ilk kareden ölçülür; 10 karede bir 320 px BMP önizleme; görüntü yokken IdleFrame 250 ms'de bir;
                          ProcessStarted kancası (Windows'ta iş nesnesine ekler)
  Obs/IniFile.cs          satırları, yorumları ve BOM'u koruyan ini düzenleyici
  Obs/ObsConfigurator.cs  WebSocket (global.ini [OBSWebSocket] + plugin_config/obs-websocket/config.json birlikte), panel
                          ([BasicWindow] ExtraBrowserDocks; OBS 31+ user.ini, öncesi global.ini), eklenti kopyalama
                          (%ProgramData%\obs-studio\plugins\camlink), betik (scripts klasörü + geçerli sahne koleksiyonunun
                          modules["scripts-tool"] listesi, .deckpad-yedek yedeği). OBS açıkken yazmaz.
  Server/HubHost.cs       Kestrel; Host başlığı denetimi (yalnız IP/localhost, değilse 421); /hub → /hub/ yönlendirmesi middleware'de;
                          panel SPA geri dönüşü {*path:nonfile}; MapApi (tüm /api uçları); /panel-config.json
  Server/HelperHub.cs     telefon WS oturumları, kimlik doğrulama, kilit (5 hata → 1 dk), Caps listesi, deck yayınları, son eylem açıklamaları
  Server/DeckStore.cs     deck.json (2 MB sınırı, Changed olayı)
  Server/IHubPlatform.cs  Windows'a özgü işler arayüzü + ElevatedRequest
src/StudioHub (net10.0-windows; WPF, WinForms yalnız NotifyIcon için, WebView2)
  App.xaml.cs             tek kopya (Mutex + "Göster" olayı), --elevated modu, --minimized (Windows ile başlarken), HubHost kurulumu
  WebShell.cs, MainWindow, PanelWindow   WebView2 (veri %LOCALAPPDATA%\StudioHub\WebView2), koyu başlık çubuğu, WebView2 yoksa yedek ekran;
                          ana pencere kapanınca tepsiye gizlenir; panel penceresi konum/boyut/hep üstte hatırlar
  Tray.cs                 durum, aç, panel, hep üstte, webcam başlat/durdur, çıkış
  Platform/WindowsPc.cs   SendInput (tarama kodu + genişletilmiş tuş bayrağı; INPUT x64'te 40 bayt), Unicode metin, Core Audio
                          (IAudioEndpointVolume), PowerPoint COM (oleaut32 GetActiveObject + dynamic; yoksa öndeki pencereye tuş)
  Platform/UnityCaptureSink.cs  paylaşılan bellek göndericisi (aşağıda)
  Platform/WindowsPlatform.cs   OBS süreci/yolu (HKLM\SOFTWARE\OBS Studio), güvenlik duvarı (netsh, 2 dk önbellek), yükseltilmiş yardımcı, Run anahtarı
  Platform/Elevated.cs    "StudioHub.exe --elevated istek.json sonuc.json": sürücüyü Program Files\StudioHub\driver'a kopyalayıp regsvr32
                          (64+32 bit, "/i:UnityCaptureName=CamLink Kamera"), güvenlik duvarı (remoteip=localsubnet), eklenti kopyalama
  Platform/IdleFrames.cs  WPF RenderTargetBitmap ile "Telefon bekleniyor / Kamera kapalı" karesi (STA iş parçacığında, önbellekli)
  Platform/JobObject.cs   KILL_ON_JOB_CLOSE: StudioHub çökerse FFmpeg de kapanır
  Platform/Native.cs      P/Invoke bildirimleri
src/StudioHub.DevServer   Linux/macOS'ta sahte platformla sunucu (Fakes.cs testlerde de kullanılır).
                          Ortam: OBS_CONFIG_DIR, OBS_PLUGIN_ROOT, HUB_ALL_LOCAL=1 (LAN'dan yönetime izin), FFMPEG
tests/StudioHub.Core.Tests UnitTests.cs + HostTests.cs (41)
web/hub                   yönetim arayüzü: bağımlılıksız HTML/CSS/JS, Barlow TTF'leri yerel
vendor/                   driver (Unity Capture, depoda), ffmpeg (indirilir), obs/obs-plugin (camlink deposundan derlenmiş kopya)
```

### Unity Capture protokolü (gönderici tarafı)
Adlar (cihaz 0): `UnityCapture_Mutx`, `_Want`, `_Sent`, `_Data`. Sıra: OpenMutex(SYNCHRONIZE) → kilitle → CreateEvent(Want) → OpenEvent(Sent, EVENT_MODIFY_STATE) → OpenFileMapping(FILE_MAP_WRITE) → MapViewOfFile.
Başlık: DWORD maxSize; int width, height, stride (piksel), format (0=RGBA8), resizemode (1=lineer), mirrormode, timeout (ms); veri ofset 32.
Yaz → ReleaseMutex → SetEvent(Sent); Want işaretliyse tüketici var. Filtre satırları alttan üste DIB'e kopyalar → FFmpeg'de `vflip` (varsayılan açık, arayüzde "Ters çıkarsa çevir").
Nesneler yalnız kamerayı açan bir uygulama varken oluşur; tüketici yokken 400 ms'de bir yoklanır. CLSID x64 `{5C2CD55C-92AD-4999-8666-912BD3E70010}`, x86 `…0020`.

### Kurallar
- Windows'a özgü her şey `IHubPlatform` / `IPcPlatform` / `IFrameSink` arkasında ve yalnız `src/StudioHub/Platform` içinde. Core testleri sahtelerle çalışır.
- Yönetici izni gereken işler (sürücü kaydı, güvenlik duvarı, eklentiyi ProgramData'ya kopyalama) ana süreçte yapılmaz; `ElevatedRequest` JSON'u ile `--elevated` alt sürecine gider. Ana uygulama yönetici olarak çalışmaz (UIPI yüzünden tuş gönderme bozulurdu).
- Telefondan gelen her veri doğrulanır (PcActionDispatcher, DeckStore boyut sınırı, validateProfile).

## OBS betiği (`obs-script/deckpad-camlink.lua`)
- Yardımcılar: `with_scene` (bul ya da oluştur, referansları bırakır), `add_source` (öğe, yeni mi oluşturuldu, bu sahneye yeni mi eklendi), `fit` (SCALE_INNER sınır kutusu), `nest_sfx_everywhere`, `stop_sfx` (açılışta ve koleksiyon değişince).
- Tür seçimi sürüme/platforma göre ilk var olan: renk `color_source_v3…`, yazı `text_gdiplus_v3…`/`text_ft2_source_v2`, ekran `monitor_capture`/`xshm_input…`; kamera `camlink_source` yoksa SRT dinleyen `ffmpeg_source`.
- Kurulum işleri yalnız düğme geri çağrılarında ve ön yüz olaylarında (arayüz iş parçacığı). Zamanlayıcı yalnız medya durdurma gibi hafif işler için.

## Tarifler

**Yeni OBS eylemi (DeckPad)**: `model.ts` birleşimine tür → `actions.ts` (ACTION_GROUPS, ACTION_META, describeAction, actionIncomplete) → `ActionEditor` formu → `run.ts` `toRequests` → gerekirse `buttonState` → `test/obs.test.ts`'e test (gerekirse `mock-obs.ts`'e istek).

**Yeni bilgisayar eylemi (iki taraf birlikte)**:
1. Core: `PcActions.cs` (alan, enum, `IPcPlatform` yöntemi, `PcActionDispatcher` doğrulama + case), `HelperHub.Caps`, `HelperHub` açıklama metni.
2. Windows: `WindowsPc.cs`; sahte: `DevServer/Fakes.cs` (`FakePc`). Test: `UnitTests.cs`.
3. DeckPad: `hub/client.ts` `PcAction` tipi, `model.ts` pc* türü + `isPcAction`, `actions.ts`, `ActionEditor`, `run.ts` `toPcAction`, `test/hub.test.ts`.
4. `suite-contracts.md` › PcAction (iki depoda).

**Yeni StudioHub API ucu**: `HubHost.MapApi` → `web/hub/app.js` → `HostTests` (loopback + başlık denetimi dahil).

**OBS'te yeni ad gerektiren varsayılan tuş**: betikte oluştur → `model.ts` OBS_NAMES → `defaults.ts` → `suite-contracts.md` › OBS'teki adlar.

**Panel değişikliği**: DeckPad'i değiştir → `npm run export:panel` → StudioHub'ı yeniden derle/yayınla.
