# İlerleme

**Son güncelleme**: 2026-11-26

## Sürüm geçmişi

| Sürüm | Ne geldi |
|---|---|
| v1 | DeckPad: OBS'e doğrudan bağlanan düzenlenebilir tuş ızgarası, makrolar, sahne/kaynak/filtre/ses/medya eylemleri, sahte OBS'e karşı testler. Koyu mavi düz tasarım. |
| v2 | "Fiziksel tuş" yeniden tasarımı; StudioHub (bilgisayar eylemleri, OBS'siz webcam, masaüstü/OBS paneli, OBS'i hazırla, QR eşleştirme, duyuru); 7 bilgisayar eylemi; Bilgisayar sayfası; düzen eşitleme; panel modu; OBS kurulum betiği; Ses efektleri sayfasının OBS'ten dolması. |
| depo (2026-10-24) | GitHub'a taşındı; FFmpeg indirme betikleri, `export:panel`, birleşik hafıza bankası, README'ler. Davranış değişikliği yok. |
| webcam ayrımı (2026-10-26) | Webcam deckpad'den çıktı (K-016): FFmpeg, sanal kamera sürücüsü, CamLink eklentisi kopyası, SRT ayarları, UDP duyurusu, QR'daki `srt`/`webcam`, betikteki telefon kamerası. Betik `deckpad.lua`. `scripts/hazirla.*` yerine tek komut `scripts/kur.ps1` (K-017). |
| bildirim (2026-10-27) | "Ekrana yazı göster" eylemi ve betiğin her sahneye eklediği boş `Bildirim` metni (K-018); ilk açılışta doğrudan QR kamerası, QR okununca bağlantı ekranı kapanır; `kur.ps1` Run anahtarı yazmaz, yalnız arm64 derler. |
| v1.0.0 (2026-10-29) | Depo açık; Releases (`StudioHub.exe`, `DeckPad.apk`) ve GitHub Pages indirme sayfası (K-019). StudioHub tek dosya (içerik gömülü). Sade yönetim arayüzü (K-020); QR kırpılması ve OBS şifresi düzeltmeleri; release APK'da QR çözücü (R8) düzeltmesi. |
| canlı otomatik sayfalar (2026-11-15) | Sahneler ve Ses efektleri sayfaları OBS'i izler (K-021): bağlıyken OBS'e eklenen sahne ya da efekt yeniden bağlanmadan tuş olur; doldurma geri alma geçmişine girmez. |
| camlink ayrımı (2026-11-26) | camlink'le her bağ koptu (K-022): `contracts.md` yalnız bu depo; eski `deckpad-camlink.lua` taşıma kodu silindi. Davranış değişikliği yok. |
| günlük pürüzler (2026-11-26) | Bilgisayar ses tuşları Windows düzeyini gösterir (`volume get`); dikey telefonda tuşlar uzar, durum ekranı iki satıra çıkar ve yayındaki sahneyi gösterir; tanınmayan QR'da ne yapılacağı yazar; QR dinlenen portu taşır. |

## Doğrulanan

**DeckPad**
- 26 otomatik test (sahte OBS 16, sahte StudioHub 10); tsc temiz.
- Web derlemesi gerçek OBS 30.0.2 (Linux, Xvfb) ve StudioHub DevServer'a bağlı çalıştı: sahne/efekt sayfaları doldu, bilgisayar tuşları StudioHub'a ulaştı (slayt, ses, Win+Shift+S), ses efekti tuşu OBS'te medyayı baştan çaldı, düzen bilgisayara eşitlendi.
- APK derlendi; v2 imzası ve Hermes paketindeki yeni kod doğrulandı.
- 2026-10-26, kullanıcının Windows 11'i: `npm ci`, tsc temiz, 24/24 test, `export:panel`.
- 2026-10-26: Expo Go 58.0.5 içinde Android 17 emülatöründe (x86_64, WHPX) açıldı; Bağlantı ekranı doğru çizildi. OBS'e bağlanma henüz denenmedi.
- 2026-10-26, webcam ayrımından sonra: 24/24 test (eski biçimli QR'ın hâlâ okunduğu dahil), tsc temiz, `export:panel`. Masaüstü paneli gerçek WebView2'de tuşlarıyla çizildi.
- 2026-10-27: `kur.ps1 -Apk` baştan sona çalıştı: panel, StudioHub `C:AppsStudioHub`, APK (arm64, ilk derleme 27 dk, sonraki 9 dk) ve `adb install` ile gerçek telefona (Huawei SNE-LX1, Android 10) kurulum "Success". Uygulamanın telefonda açılışı ve QR ile bağlanma henüz görülmedi.
- 2026-10-27, gerçek OBS 32.2.2 içindeki DeckPad paneli: Bildirim tuşuna basınca "Merhaba!" önizlemede altta göründü, 5 sn sonra silindi.
- 2026-10-29: 25/25 test, tsc temiz. Release APK (arm64, 33,9 MB, prebuild dahil ~9 dk artımlı / ~21 dk baştan) gerçek telefona kuruldu ve **açıldı**: QR ekranı, Android kamera izni, canlı kamera önizlemesi; logcat'te FATAL ve JS hatası yok.
  İlk derlemede `Failed to initialize BarcodeAnalyzer` (R8, `lessons.md`); keep kuralından sonra 0, `barhopper ... created successfully`. **Gerçek bir QR'ın okunup bağlanması henüz görülmedi.**
- 2026-10-29: `v1.0.0` Release'inin `latest/download` bağlantıları 200 ve yereldeki dosyalarla aynı boyutta; Pages (`/docs`) derlendi, https://mihrimatrix.github.io/deckpad/ 200. Sayfa Playwright'ta 1280/375 px, açık/koyu temada denetlendi; sayfadaki APK QR'ı zxing ile çözüldü (telefon kamerasıyla denenmedi).
- 2026-11-15, canlı otomatik sayfalar (K-021): 26/26 test, tsc temiz. StudioHub'ın sunduğu yeni web paketi (`/`, mod'suz) Playwright'ta sahte OBS'e elle bağlandı: Sahneler (Başlıyoruz, Kamera, Oyun) ve Ses efektleri (Alkış) doldu, "Ses Efektleri" sahnesi atlandı; bağlıyken eklenen sahne (`SceneListChanged`) ve efekt (`InputCreated`) yeniden bağlanmadan tuş oldu, `autoScenesPageId`/`autoSfxPageId` kayıtlı profilde kaldı. **Gerçek OBS'te ve telefonda henüz görülmedi.**
  Aynı kodla release APK derlendi (arm64, 35,5 MB; `app/android` baştan, prebuild + gradle 15 dk 43 sn; `package.json` değişmedi). Telefona kurulmadı: adb `unauthorized`.
- 2026-11-15, **gerçek OBS 33.0.1** (Windows) + StudioHub'ın WebView2 masaüstü paneli: panel OBS'e ve StudioHub'a bağlandı, Sahneler sayfası "Scene" ile doldu, deste `deck.json`'a yazıldı. WebSocket'ten `CreateScene` ile sahne eklenince OBS `SceneCreated` + `SceneListChanged` yolladı; panel 2,5 sn içinde tuşu ekleyip desteyi StudioHub'a gönderdi. `RemoveScene`'de de `SceneListChanged` geldi, tuş kaldı (K-021 sınırı). Deneme sahnesi ve tuşu geri alındı. **Telefonda henüz görülmedi; Ses efektleri sayfası gerçek OBS'te denenmedi.**

- 2026-11-26, günlük pürüzler: 31/31 test, tsc temiz, `export:panel`. StudioHub DevServer + sahte OBS + Playwright (390×844 ve 1000×600): dikeyde tuşlar uzadı, durum ekranı "OBS · PC · Kamera" ve altında kayıt/yayın/CPU satırları; Bilgisayar sayfasında Ses −/+ "%40" gösterdi, Ses + ile %45, Sessiz'e basınca üç tuş "SESSİZ" oldu (DevServer günlüğünde `volume Get/Up/ToggleMute`). Tanınmayan QR uyarısı yalnız birim testte; **telefon kamerasında görülmedi**.

**StudioHub**
- xUnit testleri (40): KeyCombo, eşleştirme, eylem doğrulama, ayarlar, ini düzenleme, OBS yapılandırma (eski/yeni WebSocket), sunucu uçları, Host denetimi, WS kimlik doğrulama ve kilit, düzen paylaşımı.
- DevServer + gerçek OBS 30.0.2: "OBS'i hazırla" dosyaları OBS tarafından okundu (WebSocket açıldı, betik yüklendi).
- Yayın çıktısı PE32+ GUI; WPF projesi Linux'ta derleniyor.
- 2026-10-26, kullanıcının Windows 11'i, **webcam'li sürümle** (K-016'dan önce): 41/41 test; `dotnet build` (Debug) 0 uyarı.
  WPF + WebView2 kabuğu açıldı ve tam çizildi; `/hub/` loopback'ten 200, LAN IP'den 403; açık OBS 32.2.2'yi "açık, ayar gerekli" diye doğru algıladı.
  Debug çıktısı `hub/panel/obs` içeriklerini de kopyaladığından `publish` gerekmeden çalışır.
- 2026-10-26, **webcam'siz sürüm**, aynı bilgisayar: 40/40 test, kabuk 0 uyarı. `dotnet publish` Windows'ta çalıştı: klasör 82,3 MB (yalnız `hub`, `obs`, `panel`), exe 78,8 MB.
  Yayınlanan exe açıldı: `/api/status`'ta webcam alanı yok, QR'da `srt`/`webcam` yok, betik pakette. Yönetim arayüzü temiz Chrome profilinde QR, IP ve "OBS hazır" ile çizildi.
  "OBS'i hazırla" gerçek OBS 32.2.2 dosyalarına yazdı: WebSocket 4455 (mevcut şifre korundu), `user.ini` paneli, betik `Untitled` koleksiyonuna `scripts/deckpad.lua` olarak; eski `deckpad-camlink.lua` kaydı taşındı, yedek `Untitled.json.deckpad-yedek`.
  2026-10-27: OBS 32.2.2 açıldı ve yazılanları okudu: WebSocket 4455'te başladı, `deckpad.lua` yüklendi (günlükte hata yok), DeckPad paneli bağlandı.
  Bu sırada bulunup düzeltildi: OBS 32'nin uzantılı `SceneCollectionFile`'ı, WebView2'nin bayat `app.js`'i (bkz. `lessons.md`).
- 2026-10-29, **tek dosya exe** (K-019): 41/41 test (yeni: `PairUsesObsOwnPassword`, `QrIsSvg` viewBox'ı da denetler), kabuk 0 hata. `dotnet publish` klasöründe yalnız `StudioHub.exe` (83,9 MB). Boş klasörden açıldı: `/api/status`, `/hub/`, panel, `/api/qr.svg` 200; exe'nin yanında dosya oluşmadı; ikinci açılışta gömülü dosyalar yeniden yazılmadı; WebView2 verisi `%LOCALAPPDATA%`.
  Yeni exe'nin sunduğu `app.js` `obsSummary`'yi içeriyor, QR SVG'si viewBox'lı, gerçek OBS ayarıyla `obsHasPassword=true` ve QR `pass=` taşıyor. Sade arayüz DevServer + gerçek OBS ayarlarıyla 1230 ve 520 px'te Playwright'ta denetlendi.
  "Windows ile başlat" ve `--elevated` için `Environment.ProcessPath`'in gerçek exe yolu olduğu belgeye ve süreç yoluna dayanıyor; anahtar açılıp denenmedi.
- 2026-11-15: `kur.ps1` (APK'sız) temizlenmiş bilgisayarda çalıştı (`C:\Apps\StudioHub`, `%APPDATA%\StudioHub` ve derleme çıktıları yoktu): panel, yayın, kısayol, açılış; `/api/status` 200, 4466 dinleniyor, `firewall: true`, yeni eşleştirme kodu üretildi.
  OBS programı kurulu değilken (`obs64.exe` yok, ayarlar duruyor) `obsCanLaunch: false` ve `running: false` doğru döndü. "OBS'i hazırla" OBS 33.0.1'in bıraktığı ayarlara yazdı: WebSocket 4455 (şifreli), panel adresi, betik `Untitled` koleksiyonuna; `scriptAdded: true`. OBS 33 betik listesini hâlâ `modules["scripts-tool"]`'da tutuyor.
  Kullanıcı OBS 33.0.1'i kurup açınca yazılanlar okundu: günlükte `Server started successfully on port 4455`, `Loaded lua script: deckpad.lua` ve betiğin eklediği `Bildirim` (text_gdiplus_v3); `/api/status` `running: true`, `obsCanLaunch: true`. `PUT /api/deck` (REST) açık panele `deckChanged` olarak ulaştı.

**OBS betiği** (gerçek OBS 30.0.2)
- 5 önerilen sahne, ses efektleri + tüm sahnelere iç içe bağlama, slayt gösterisi; ikinci çalıştırmada çoğaltma yok; efektler açılışta durur, DeckPad'in RESTART'ıyla çalar; "Sonraki" slaytı değiştirir.
  (Kamera adımı o zaman da doğrulanmıştı; 2026-10-26'da çıkarıldı. 2026-10-27: gerçek OBS 32.2.2'de yüklendi ve `Bildirim` kaynağını sahneye ekledi; sahne/efekt/slayt düğmeleri bu sürümde denenmedi.)

## Doğrulanmayan

- DeckPad gerçek telefonda: QR okutup bağlanma, dokunma/titreşim, arka plandan dönüş (açılış ve kamera görüldü). iOS. Emülatörde OBS/StudioHub bağlantısı.
- Release'teki exe ve APK'nın başka bir bilgisayarda/telefonda sıfırdan kurulumu (SmartScreen, bilinmeyen kaynak akışı).
- ExpoModulesV2 "does not implement Enumerable" (release/R8) uyarısının etkisi.
- StudioHub gerçek Windows'ta: tepsi, SendInput, Core Audio, PowerPoint COM, netsh/UAC akışı.
- Betik OBS 31+'da (tür adları ve user.ini yolu kodda var).
- Canlı otomatik sayfa eşitlemesi telefonda (masaüstü panelinde gerçek OBS 33.0.1 ile görüldü); sahne yeniden adlandırma ve gerçek OBS'te Ses efektleri sayfası denenmedi.
- OBS, StudioHub kapalıyken açılırsa OBS içindeki DeckPad panelinin sonradan kendiliğinden bağlanıp bağlanmadığı (2026-11-15'te bu durumda "OBS paneli" bağlı cihazlarda görünmedi; panele bakılmadı).
- `kur.ps1`'in telefon takılı değilken uyarı verip StudioHub'ı yine açması (kod var, denenmedi).
- Üst üste iki bildirimde ilkinin silme adımı ikincisini erken siler (K-018).
- Ekran görüntüleri eskidi: `docs/screenshots/studiohub-1-yonetim.png` (webcam kartı var) ve `obs-eklenti-ve-betik.png` (CamLink kaynağı ve kamera düğmesi var); yenilenmeli.

## Bilinen sorunlar ve sınırlar

- Dikey ekranda tuşlar en çok 1,4 kat uzar; az tuşlu sayfalarda üstte/altta yine boşluk kalır.
- Windows ses düzeyi bilgisayarda (klavye, tepsi) değişirse telefon bunu ancak bir ses tuşuna basınca ya da uygulama öne gelince görür (StudioHub düzey değişimini yollamaz).
- İki cihaz aynı anda otomatik sayfa doldurursa ya da düzenlerse son yazan kazanır; düzenleme modundayken uzaktan gelen değişiklik açık düzenlemeyi bozabilir.
- Otomatik sayfada OBS'te silinen ya da adı değişen sahnenin tuşu kalır (elle silinir); OBS'te duran bir sahnenin silinen tuşu sonraki eşitlemede geri gelir (K-021).
- Yönetici olarak çalışan pencerelere tuş gönderilemez (UIPI).
- Güvenlik duvarı durumu netsh ile 2 dk önbellekli; ilk sorguda "yok" görünebilir.
- Eski kurulumlarda `%ProgramFiles%\StudioHub\driver` ve `%ProgramData%\obs-studio\plugins\camlink` kalabilir (kullanıcının bilgisayarında eklenti var); StudioHub bunlara dokunmaz. Eski `deckpad-camlink.lua` kaydı artık taşınmaz (K-022): o adla kalmış bir betik varsa OBS › Araçlar › Betikler'den elle kaldırılır. "StudioHub (UDP)" kuralı Güvenlik duvarı › İzin ver'e basınca silinir.
- APK'lar hata ayıklama anahtarıyla imzalı: başka makinede derlenen APK mevcut kurulumu güncelleyemez (önce kaldırmak gerekir).
- Eski `kur.ps1` kurulumundan kalan `hub`, `panel`, `obs` klasörleri artık okunmuyor ama silinmiyor.
- APK yalnız arm64-v8a; 32-bit ARM ve x86_64 emülatörde çalışmaz (`-PreactNativeArchitectures` ile değiştirilebilir).
