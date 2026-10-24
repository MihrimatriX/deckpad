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
- **Varsayılan "Sahneler" sayfasında "Ses Efektleri" tuşu çıktı.** Yardımcı sahne de OBS sahne listesinde. → `defaults.ts` sahne tuşlarından onu çıkarır; efektler `tr` yerelleştirmesiyle sıralanır.

## StudioHub / .NET

- **`/hub` için "AmbiguousMatchException".** Hem `/hub` hem `/hub/` MapGet. → Yönlendirme middleware'de; `/hub/` için açık MapGet `index.html` döndürür.
- **Statik dosyalar 404 / SPA geri dönüşü dosyaları yutuyor.** Yönlendirme statik dosya ara katmanından önce eşleşiyor. → Geri dönüş `{*path:nonfile}`.
- **Webcam testi rastgele asılı kalıyor.** Assert mesajındaki enterpolasyon `ReadToEnd`'i hemen çağırıyordu. → Mesajı tembel üret.
- **FPS düşük ölçülüyor.** Kronometre süreç başlangıcından; FFmpeg'in dinlemeye geçişi sayılıyordu. → İlk karede sıfırla; test fps≥20 bekler.
- **Port meşgul, test sonrası FFmpeg yaşıyor.** Öksüz alt süreç. → Windows'ta iş nesnesi (KILL_ON_JOB_CLOSE); testlerde süreç öldürülür.
- **Core değişti ama davranış eski.** DevServer yeniden derlenmemişti. → Core'u değiştirince DevServer'ı da derle.
- **WPF'de `Application`/`FontFamily` belirsiz, `File` bulunamıyor.** WinForms global using'leri. → csproj'da `System.Windows.Forms` ve `System.Drawing` using'den çıkarıldı, `System.IO` eklendi.
- **Yayın klasöründe ffmpeg.exe ve sürücü yok, exe çok büyük.** Tek dosya yayını `Content` öğelerini de exe'ye gömüyor. → İçeriklerde `ExcludeFromSingleFile="true"`.
- **Linux'ta `pkill -f ...` kendi kabuğunu öldürdü.** Desen kabuğun komut satırıyla da eşleşiyor. → PID'i komut adına göre seç.

## OBS

- **StudioHub WebSocket'i açtı ama OBS 30 açılınca kapalı.** obs-websocket 5.3.x `config.json`'u değil `global.ini [OBSWebSocket]`'i okuyor. → İkisini birlikte yaz (gerçek OBS 30.0.2 ile bulundu).
- **Otomasyonda OBS ilk açılış sihirbazında takılıyor.** → `global.ini [General] FirstRun=true` + `LastVersion` (adı ters anlamlı).
- **Betik sahne oluştururken OBS donuyor.** `timer_add` geri çağrısı grafik iş parçacığında; sahne oluşturmak arayüz kilidini bekliyor. → Kurulum işleri yalnız düğme ve ön yüz olaylarında; kendi kendine test FINISHED_LOADING'de.
- **`obs.OBS_ALIGN_CENTER` nil.** obslua bu sabitleri dışa aktarmıyor. → Sayı (CENTER 0, LEFT 1, TOP 4).
- **"Slaytlar" kaynağı oluşturulamıyor.** Aynı adlı sahne var; sahne ve kaynak adları aynı ad alanında. → Kaynak "Slayt gösterisi".
- **Ses efektleri OBS açılınca hep birlikte çalıyor.** Medya kaynakları etkinleşince oynuyor. → Açılışta ve koleksiyon değişince `stop_sfx`; DeckPad "Baştan oynat" (RESTART) kullanır.

## Süreç

- **Düzenleme uygulandı sanıldı ama dosya değişmemişti.** `ls ... && düzenle` zincirinde ilk komut başarısız olunca sonrakiler sessizce çalışmadı. → Düzenlemeden sonra testi/derlemeyi gerçekten çalıştır; zincirde başarısızlığı görünür kıl.
