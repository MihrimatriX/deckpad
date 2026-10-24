# DeckPad (telefon uygulaması)

> Deponun genel tanıtımı ve mimarisi için [kök README](../README.md).

Telefonu OBS için Stream Deck'e çeviren Android uygulaması. OBS'in kendi WebSocket sunucusuna bağlanır. Bilgisayarda **StudioHub** açıksa sunum, medya, ses ve klavye kısayolları gibi bilgisayar eylemleri de çalışır; aynı tuş düzeni bilgisayar penceresinde ve OBS'in içinde panel olarak kullanılabilir.

## Hızlı başlangıç (APK)

1. APK'yı telefona at ve kur (aşağıdaki **APK derleme** ile üretilir). Android "bilinmeyen kaynak" izni isterse ver.
2. **StudioHub ile (önerilen):** bilgisayarda StudioHub'ı aç, **OBS'i hazırla**'ya bas. DeckPad'de **QR kodu okut** ile StudioHub'daki kodu okut. OBS ve bilgisayar eylemleri birlikte bağlanır.
3. **Yalnızca OBS:** OBS'te **Araçlar › WebSocket Sunucu Ayarları**'nı aç, sunucuyu etkinleştir, **Bağlantı bilgilerini göster**'deki QR'ı okut.

Telefon ve bilgisayar aynı Wi-Fi ağında olmalı. Bağlantı koparsa uygulama kendisi yeniden bağlanır.

## Neler var

- **Kayıt ve yayın:** başlat, durdur, duraklat, devam ettir. Butonlarda canlı süre görünür.
- **Sahneler:** ilk bağlantıda "Sahneler" sayfası OBS'teki sahnelerle kendiliğinden dolar. Yayındaki sahne kırmızı, Studio Mode önizlemesi yeşil yanar.
- **Geçişler:** geçiş türü ve süresi seçme, Studio Mode, önizlemeyi yayına alma.
- **Kaynaklar ve efektler:** logo, alt yazı, kamera gibi kaynakları göster/gizle; filtre aç/kapat (blur, renk düzeltme, chroma key...).
- **Ses:** mikrofon ve masaüstü sesini kapat/aç, ses seviyesi ayarla. Kapalıyken buton kırmızı yanar.
- **Ses efektleri:** OBS kurulum betiği "Ses Efektleri" sahnesini oluşturduysa sayfa kendiliğinden dolar. Elle: OBS'te ses dosyasıyla bir Medya Kaynağı ekle, butonuna "Medya kontrolü › Baştan oynat" ver.
- **Slaytlar:** Önceki/Sonraki tuşları betiğin oluşturduğu "Slayt gösterisi" kaynağını ilerletir.
- **Bilgisayar eylemleri (StudioHub):** PowerPoint ya da tarayıcıdaki sunumu ilerletme, siyah ekran; klavye kısayolu (Teams/Zoom mikrofon, ekran alıntısı…); Spotify/YouTube medya tuşları; Windows ses düzeyi; uygulama, dosya ya da web sayfası açma; hazır metin yazma.
- **Bilgisayarla aynı düzen:** Ayarlar › Bilgisayar'dan düzeni gönder/al ya da otomatik eşitle. StudioHub'ın masaüstü paneli ve OBS paneli aynı düzeni kullanır.
- **Replay, kayda işaret koyma, sanal kamera, OBS kısayolları.**
- **Makrolar:** bir butona istediğin kadar eylem ekle, araya "Bekle" koy. Ardışık OBS istekleri tek mesajda gider.
- **Canlı bilgi çubuğu:** kayıt ve yayın süresi, yayın hızı, CPU, FPS, düşen kareler.
- **Güvenlik:** "Basılı tutarak çalıştır" ile yayını yanlışlıkla kapatmayı önle. Şifre telefonun güvenli deposunda tutulur.
- **Yatay ve dikey:** yatayda butonlar ekrana en büyük sığacak şekilde yeniden dizilir.

## Butonları düzenleme

Sağ üstteki kalem simgesine bas:

- Butonları **sürükleyerek** yer değiştir.
- Bir butona **dokun**: etiket, ikon, renk ve eylemleri düzenle; sil veya çoğalt.
- **+** ile yeni buton, alt kısımdaki **+ Sayfa** ile yeni sayfa ekle.
- Izgara simgesiyle sayfanın adını, sütun ve satır sayısını değiştir.
- Geri al simgesiyle son değişikliği geri al.

Eylem seçerken sahne, kaynak, filtre ve kısayol listeleri OBS'ten canlı gelir. OBS bağlı değilken "Elle yaz" ile adı girebilirsin.

**Ayarlar › Deste** ile tüm desteyi panoya kopyalayıp yedekleyebilir veya başka telefona aktarabilirsin.

## Kaynaktan çalıştırma

Gerekenler: Node.js 20+.

```bash
npm ci
npx expo start
```

DeckPad yalnızca Expo Go'nun içindeki modülleri kullanır. Telefona Play Store'dan **Expo Go**'yu kurup terminaldeki QR'ı okutursan derlemeden çalışır.

### APK derleme

Bulutta, bilgisayara Android araçları kurmadan:

```bash
npx eas-cli@latest build -p android --profile preview
```

Yerelde (Android Studio ve JDK 17+ gerekir):

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# çıktı: android/app/build/outputs/apk/release/app-release.apk
```

## Test

```bash
npm run typecheck
npm test
```

Testler gerçek OBS yerine `test/mock-obs.ts` içindeki sahte bir obs-websocket v5 sunucusuna bağlanır: şifre doğrulama, durum senkronu, makrolar, toggle'lar, medya, hatalar ve kopma sonrası yeniden bağlanma. `test/hub.test.ts` StudioHub protokolünü (eşleştirme, eylem sırası, düzen paylaşımı) test eder. Elle denemek için sahte OBS'i ayrıca çalıştırabilirsin:

```bash
npx tsx test/serve-mock.ts 4455
```

## Bilgisayar paneli (web derlemesi)

Aynı kod tarayıcı için de derlenir; StudioHub bunu `/?mode=desktop` (pencere) ve `/?mode=dock` (OBS paneli) adresinde sunar.
Panel bağlantı bilgilerini StudioHub'ın yalnızca o bilgisayara verdiği `/panel-config.json`'dan alır, düzeni bilgisayarda tutar.

```bash
npm run export:panel   # çıktı doğrudan ../studiohub/web/panel'e yazılır
```

## Proje yapısı

```text
App.tsx                     ana ekran, açılış ve bağlantı akışı
src/hub/client.ts           StudioHub bağlantısı (eşleştirme, bilgisayar eylemleri, düzen paylaşımı)
src/hub/sync.ts             düzeni bilgisayarla eşitleme
src/hub/pair.ts, keys.ts    StudioHub QR kodu, kısayol doğrulama
src/panel.ts                bilgisayar paneli modu
src/theme.ts                koyu mavi palet
src/settings.ts             bağlantı ve tercih ayarları
src/obs/client.ts           OBS bağlantısı, yeniden bağlanma, durum senkronu
src/obs/store.ts            canlı OBS durumu (zustand)
src/obs/qr.ts               OBS QR kodu çözücü
src/deck/model.ts           buton, sayfa ve eylem tipleri
src/deck/actions.ts         eylem kataloğu ve açıklamalar
src/deck/run.ts             eylem yürütücü ve butonun canlı durumu
src/deck/store.ts, ops.ts   deste, kayıt ve geri alma
src/components/             ızgara, buton, düzenleyiciler, paneller
test/                       sahte OBS ve testler
```

## Notlar

- APK yalnızca 64 bit ARM telefonlar içindir (2017 sonrası neredeyse tüm Android telefonlar). Daha eski cihazlar için `app.json` içindeki `buildArchs` listesine `armeabi-v7a` ekleyip yeniden derle.
- APK hata ayıklama anahtarıyla imzalıdır; kişisel kullanım için uygundur. Play Store'a yüklemek için kendi imza anahtarınla derle.
- Kod iOS için de derlenebilir (`npx expo run:ios`), ancak iOS'ta denenmedi.
