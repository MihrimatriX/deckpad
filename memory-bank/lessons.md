# Öğrenilenler (tuzaklar)

Belirti → neden → çözüm. Buradakilerin hepsi geliştirme sırasında gerçekten yaşandı. Yeni bir tuzak çözdüğünde buraya ekle.

## DeckPad / React Native / Expo

- **Bileşen sonsuz render'a giriyor.** zustand v5 seçicisi her seferinde yeni nesne/dizi döndürüyor. → `useShallow` ile sar.
- **`StyleSheet.absoluteFillObject` tanımsız.** RN 0.88'de kaldırıldı. → `{position:'absolute', top:0, left:0, right:0, bottom:0}` yaz.
- **Yatay ScrollView dikeyde de büyüyor.** İçerik yüksekliği yüzünden. → `style={{flexGrow: 0}}`.
- **Web derlemesi açılmıyor, SecureStore hatası.** SecureStore web'de yok. → `settings.ts` web'de AsyncStorage'a düşer (yalnız panel için kabul edilebilir; panel bilgileri zaten loopback'ten gelir).
- **Paket boyutu şişti.** `@expo-google-fonts/barlow` kökten içe aktarılınca tüm ağırlıklar pakete giriyor. → Alt yoldan: `@expo-google-fonts/barlow/600SemiBold`.
- **`deviceName` undefined / modül sırası hatası.** `settings.ts` ↔ `hub` döngüsel içe aktarması. → `src/device.ts` ayrı dosya.
- **`npm test` kayboldu.** `npx expo prebuild` package.json `scripts`'ini sıfırlayabiliyor. → Prebuild sonrası `test`, `typecheck`, `export:panel` betiklerini kontrol et.
- **tsx ile üst düzey `await` hatası.** `.ts` dosyası CJS sayılıyor. → Betik dosyasını `.mts` yap.
- **Gradle derlemesi ölüyor.** Bulut ortamında bellek; Metro veya Chromium aynı anda açık. → Derlemeyi tek başına çalıştır, `-Xmx3g`, 2 işçi. Maven Central 429 verirse init betiğiyle Google aynası.
- **Release APK'da QR okunmuyor; uygulama çökmüyor, kamera önizlemesi geliyor.** Logcat'te `Failed to initialize BarcodeAnalyzer` ve `ComponentDiscovery: Could not instantiate …CommonComponentRegistrar … NoSuchMethodException <init> []`. Expo şablonu release'te R8'i açıyor; AGP 8'den beri R8 "full mode": üye belirtmeyen `-keep class * implements …ComponentRegistrar` kuralı parametresiz kurucuyu korumuyor, ML Kit kayıtçıları yansımayla oluşturamıyor. Debug derlemede sorun yok. → `app.json` › `expo-build-properties.android.extraProguardRules`: `-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }`. Doğrulama: logcat'te `barhopper … created successfully`.
- **Varsayılan "Sahneler" sayfasında "Ses Efektleri" tuşu çıktı.** Yardımcı sahne de OBS sahne listesinde. → `defaults.ts` sahne tuşlarından onu çıkarır; efektler `tr` yerelleştirmesiyle sıralanır.

## StudioHub / .NET

- **`/hub` için "AmbiguousMatchException".** Hem `/hub` hem `/hub/` MapGet. → Yönlendirme middleware'de; `/hub/` için açık MapGet `index.html` döndürür.
- **Statik dosyalar 404 / SPA geri dönüşü dosyaları yutuyor.** Yönlendirme statik dosya ara katmanından önce eşleşiyor. → Geri dönüş `{*path:nonfile}`.
- **Core değişti ama davranış eski.** DevServer yeniden derlenmemişti. → Core'u değiştirince DevServer'ı da derle.
- **WPF'de `Application`/`FontFamily` belirsiz, `File` bulunamıyor.** WinForms global using'leri. → csproj'da `System.Windows.Forms` ve `System.Drawing` using'den çıkarıldı, `System.IO` eklendi.
- **Yayın klasöründe içerik dosyaları (o zaman ffmpeg.exe ve sürücü) yok, exe çok büyük.** Tek dosya yayını `Content` öğelerini de exe'ye gömüyor. → O zaman `ExcludeFromSingleFile="true"`. 2026-10-29'dan beri içerik bilerek gömülü (K-019), bu madde yalnız tarihçe.
- **Yönetim arayüzünde QR'ın sağı ve altı kesik.** QRCoder `SvgQRCode.GetGraphic(int, …)` varsayılan `SizingMode.WidthHeightAttribute`: SVG'de `viewBox` yok, CSS küçültünce içerik ölçeklenmiyor. → `sizingMode: SvgQRCode.SizingMode.ViewBoxAttribute` (`HostTests.QrIsSvg` denetler).
- **Üst çubuk "OBS ayar bekliyor" ama OBS kontrol listesi tamamen yeşil.** İki yer ayrı hesaplıyordu; asıl neden `settings.json`'da OBS şifresinin olmaması (dosya yeniden oluşmuştu), QR şifresiz gidiyordu. → Şifre OBS'in kendi ayarından okunur, durum tek fonksiyondan (K-020).
- **Gömülü kaynak exe'de bulunamıyor.** MSBuild `AssignCulture`, adı `ad.<kültür>.uzantı` biçimindeki `EmbeddedResource`'ları (ör. `x.tr.js`, `x.ts.map`) sessizce uydu derlemesine taşır; `WithCulture` metadata'sı işe yaramaz. → Böyle ad kullanma (csproj'da not var).
- **Taşınabilir exe İndirilenler'den çalışınca oradaki `appsettings.json`'u okur ve klasörü izler.** `ContentRootPath = AppContext.BaseDirectory`. → İçerik kökü `%LOCALAPPDATA%\StudioHub\web` (`HubOptions.ContentRoot`).
- **Linux'ta `pkill -f ...` kendi kabuğunu öldürdü.** Desen kabuğun komut satırıyla da eşleşiyor. → PID'i komut adına göre seç.
- **StudioHub güncellenince yönetim penceresi "…" ile takılı, QR boş.** WebView2 sürümsüz `hub/app.js`'i 1 saat önbellekte tutmuş; yeni HTML eski JS ile çalışıp olmayan öğede hata veriyor. Temiz tarayıcı profilinde sorun yok. → Yönetim arayüzü dosyaları `no-cache`; yalnız adında sürüm taşıyan panel dosyaları önbellekte (`HostTests.AdminScriptIsRevalidated`). Eski kopya için pencerede bir kez Ctrl+F5.

### Webcam alıcısı (K-016 ile deckpad'den çıktı; camlink'e taşınınca geçerli)

- **Webcam testi rastgele asılı kalıyor.** Assert mesajındaki enterpolasyon `ReadToEnd`'i hemen çağırıyordu. → Mesajı tembel üret.
- **FPS düşük ölçülüyor.** Kronometre süreç başlangıcından; FFmpeg'in dinlemeye geçişi sayılıyordu. → İlk karede sıfırla; test fps≥20 bekler.
- **Port meşgul, test sonrası FFmpeg yaşıyor.** Öksüz alt süreç. → Windows'ta iş nesnesi (KILL_ON_JOB_CLOSE); testlerde süreç öldürülür.

## OBS

- **StudioHub WebSocket'i açtı ama OBS 30 açılınca kapalı.** obs-websocket 5.3.x `config.json`'u değil `global.ini [OBSWebSocket]`'i okuyor. → İkisini birlikte yaz (gerçek OBS 30.0.2 ile bulundu).
- **Otomasyonda OBS ilk açılış sihirbazında takılıyor.** → `global.ini [General] FirstRun=true` + `LastVersion` (adı ters anlamlı).
- **Betik sahne oluştururken OBS donuyor.** `timer_add` geri çağrısı grafik iş parçacığında; sahne oluşturmak arayüz kilidini bekliyor. → Kurulum işleri yalnız düğme ve ön yüz olaylarında; kendi kendine test FINISHED_LOADING'de.
- **Betikte "attempt to call a nil value".** `local function` tanımından önce yazılan bir fonksiyon onu çağırırsa Lua global adı arar (nil). → Çağrılanı çağırandan önce tanımla (`add_notify_everywhere`, `add_slides`'tan önce).
- **`obs.OBS_ALIGN_CENTER` nil.** obslua bu sabitleri dışa aktarmıyor. → Sayı (CENTER 0, LEFT 1, TOP 4).
- **"Slaytlar" kaynağı oluşturulamıyor.** Aynı adlı sahne var; sahne ve kaynak adları aynı ad alanında. → Kaynak "Slayt gösterisi".
- **Ses efektleri OBS açılınca hep birlikte çalıyor.** Medya kaynakları etkinleşince oynuyor. → Açılışta ve koleksiyon değişince `stop_sfx`; DeckPad "Baştan oynat" (RESTART) kullanır.
- **OBS 32'de "Kurulum betiği: Eklenmedi", betik koleksiyona girmiyor.** OBS 32 `user.ini`'ye `SceneCollectionFile=Untitled.json` yazıyor (uzantılı), OBS 30 uzantısız yazıyordu; kod `.json` ekleyip `Untitled.json.json` arıyordu. → Okurken `.json` atılır (gerçek OBS 32.2.2 dosyasında doğrulandı, `Obs32CollectionAndOldScriptName`).

## Windows geliştirme ortamı

- **`sdkmanager --install` çıkış kodu 0 verdi ama platform, build-tools, NDK ve sistem kalıbı kurulmadı.** cmdline-tools 23'te `sdkmanager` yeni `android` aracına yönlendiriyor; o `;` ayraçlı adları sessizce atlıyor (`--licenses` da "artık gerekmiyor"). → `android sdk install platforms/android-37.0 build-tools/37.0.0 ndk/27.1.12297006 system-images/android-37.0/google_apis_playstore/x86_64` (ayraç `/`). Kurulumdan sonra `android sdk list` ile doğrula.
- **`compileSdk 37` için `platforms;android-37` paketi yok.** Android 16'dan beri alt API sürümleri var. → Paket adı `platforms/android-37.0`.
- **`emulator -list-avds` boş, ama AVD var.** `avdmanager` AVD'yi `ANDROID_USER_HOME\avd`'ye yazıyor, emülatör ise oradan okumuyor. → `ANDROID_AVD_HOME`'u da ayarla.
- **`%USERPROFILE%\.android` taşınamıyor; taşınınca emülatör `unauthorized`.** adb anahtarı için `ANDROID_USER_HOME`'u dinlemiyor, `%USERPROFILE%\.android`'de yeni anahtar üretiyor. Emülatör ise `ANDROID_EMULATOR_HOME`'u dinliyor; ikisi ayrılınca anahtarlar uyuşmuyor. Ayrıca hızlı açılış anlık görüntüsü eski anahtarın durumunu taşıyor. → adb ile emülatör `%USERPROFILE%\.android`'i (~20 KB) paylaşsın, yalnız AVD'ler `ANDROID_AVD_HOME` ile taşınsın. Anahtar değişirse soğuk açılış (`-no-snapshot-load`) yap ve ekrandaki "Allow USB debugging" penceresini onayla (parmak izi = `adbkey.pub`'ın MD5'i).
- **`expo start --android` cihaz seçimini soruyor ve arka planda takılıyor.** USB'de ikinci cihaz (yetkisiz telefon) var. → Expo Go'yu `adb -s emulator-5554 install` ile kur, `adb -s ... shell am start -a android.intent.action.VIEW -d exp://<IP>:8081 host.exp.exponent` ile aç.
- **Kullanıcı PATH'i `REG_EXPAND_SZ`'dir ve `%LOCALAPPDATA%` gibi satırlar içerir.** `[Environment]::SetEnvironmentVariable` ile yazmak türü bozabilir. → `HKCU\Environment`'e `RegistryValueKind.ExpandString` ile yaz, `WM_SETTINGCHANGE` yayınla.
- **`android sdk install` "kuruldu" dedi ama paket DevKit'te yok; `%LOCALAPPDATA%\Android\Sdk` oluştu.** Kabuk, ortam değişkenleri ayarlanmadan önce açılmıştı; `ANDROID_HOME` boşken araç varsayılan klasöre kuruyor. → Her zaman `android --sdk=C:\Apps\DevKit\android-sdk sdk ...`.
- **APK derlemesi `ninja: error: mkdir(CMakeFiles/reanimated.dir/C_/Users/...): No such file or directory` ile düşüyor.** Nesne yolu proje yolunu iki kez içeriyor ve 260 karakteri aşıyor. SDK'daki CMake paketleri (3.22.1 ve 3.31.4 denendi) ninja 1.10.2 ile geliyor, o da `LongPathsEnabled=1` olsa bile uzun yol açamıyor. CMake sürümünü yükseltmek çözmüyor. → ninja 1.12+ (uzun yol destekli) ya da projeyi kısa bir yola taşı. 2026-10-27'de çözüldü: Visual Studio 18'in kendi ninja'sı (1.13.2, `Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja`) `cmake\3.22.1\bin\ninja.exe`'nin yerine kopyalandı, eskisi `ninja-1.10.2.exe` olarak duruyor. CMake önbelleği aynı yolu tuttuğundan `.cxx` silmeye gerek yok.

## Süreç

- **Düzenleme uygulandı sanıldı ama dosya değişmemişti.** `ls ... && düzenle` zincirinde ilk komut başarısız olunca sonrakiler sessizce çalışmadı. → Düzenlemeden sonra testi/derlemeyi gerçekten çalıştır; zincirde başarısızlığı görünür kıl.
