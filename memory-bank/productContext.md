# Ürün bağlamı

## Kullanıcı

Fullstack geliştirici (.NET, React/Next.js, Unity) ve dijital oyun tasarımı eğitmeni. Uygulamaları kendisi için istiyor: OBS'te kayıt ve yayın yaparken telefonu Stream Deck gibi kullanmak, ders/sunum sırasında slaytları ve bilgisayarı telefondan yönetmek.

## Kullanıcının verdiği kararlar (kronolojik)

1. Webcam ve kontrol paneli **iki ayrı uygulama** olacak.
2. Önce Android. Flutter ya da React Native'den hangisi uygunsa → **React Native (Expo)** önerildi, kullanıcı onayladı.
3. İki uygulama da **koyu mavi** tonlarda. Kontrol panelinin **tuşları düzenlenebilir** olmalı.
4. İstenen DeckPad özellikleri: geçişler, slaytlar, efektler, ses efektleri, uzaktan kontrol, yayını durdurma/duraklatma/devam ettirme.
5. Teslim biçimi: her uygulama için "tak çalıştır" zip (APK + kaynak + Türkçe BENİOKU).
6. v1 tasarımı "çok şık durmuyor" bulundu → **"Fiziksel tuş hissi"** seçildi (Stream Deck benzeri basılan tuşlar, lacivert korunarak).
7. Windows tarafı: **DeckPad yardımcısı**, **OBS'siz webcam**, **DeckPad masaüstü sürümü**. Üçü tek uygulamada birleşti: StudioHub. (Webcam 2026-10-26'da çıktı, bkz. 10.)
8. OBS tarafı: **DeckPad OBS paneli**, **CamLink OBS eklentisi**, **kurulum betiği**.
9. (2026-10-24) Projeler GitHub'a: MihrimatriX hesabı, **özel** depolar, **lisans yok**. "Kamera ve deck ayrı iki uygulama, ona göre dağıt": deckpad = DeckPad + StudioHub + OBS betiği; camlink = CamLink + OBS eklentisi.
10. (2026-10-26) "Burada webcam uygulaması olmayacak; sadece telefondan OBS'i kontrol etmek, ses oynatmak." StudioHub webcam'siz kalır, OBS'siz webcam alıcısı camlink'e taşınacak (K-016).
11. (2026-10-26) "Kurulum ve kullanım çok daha basit olmalı" → tek komut `scripts/kur.ps1`, telefonda Expo Go yerine APK (K-017).

## Kullanıcının çalışma tercihleri

- Cevaplar Türkçe; önce doğrudan cevap, sonra kısa neden/nasıl; farklı yaklaşımları artı/eksi ile karşılaştır.
- Ekran görüntüsüyle görmek istiyor; büyük tasarım değişikliğinden önce görsel karşılaştırma iyi karşılanıyor.
- Kod örneklerinde C# ve TypeScript; Unity karşılıklarıyla açıklama seviliyor (ör. StudioHub Core ↔ oyun mantığı, WPF kabuğu ↔ platform eklentisi).
- Temel kavramları uzun anlatma; ileri konularda ayrıntıya gir.

## Tasarım dili ("fiziksel tuş")

- Eloksal gövde degradesi, gömme yuvalar (well), basılınca çöken tuş kapağı (Keycap: koyu etek + degrade yüz), LED şeridi, cam durum ekranı.
- Tally ışıkları: kırmızı = yayında/kayıtta, yeşil = Studio Mode önizlemesi, amber = duraklatıldı.
- Yazı: Barlow (gövde) + Barlow Semi Condensed (tuş etiketi, başlık). Tuş etiketi en uzun kelimeye göre küçülür, kelime ortasından kırılmaz.
- Yatayda ızgara ekrana en büyük sığacak şekilde yeniden dizilir.
- Renk anahtarları `app/src/theme.ts` ve `studiohub/web/hub/app.css` `:root` içinde aynı.
- Metinler Türkçe ve cümle düzeninde (BÜYÜK HARF etiket yok). Hatalar ne olduğunu ve nasıl düzeleceğini söyler ("Eşleştirme kodu geçersiz. StudioHub'daki QR kodu yeniden okut.").

## Kullanıcı akışları

1. **İlk kurulum**: `.\scripts\kur.ps1 -Apk` (StudioHub kurulur ve açılır, DeckPad telefona yüklenir) → OBS kapalıyken "OBS'i hazırla" → "OBS'i aç" → telefonda DeckPad › QR okut → OBS ve bilgisayar birlikte bağlanır → Sahneler ve Ses efektleri sayfaları kendiliğinden dolar. Sonraki açılışlarda DeckPad kendiliğinden bağlanır.
2. **StudioHub'sız**: OBS'in WebSocket QR'ını okut; bilgisayar eylemleri devre dışı (tuş üzerinde bağlantı kapısı uyarır).
3. **Bilgisayardan kullanma**: StudioHub › DeckPad › masaüstü paneli ya da OBS'teki "DeckPad" paneli; düzen bilgisayarda (`deck.json`), telefonla eşitlenebilir.
4. **Sunum**: Bilgisayar sayfası › Sunumu başlat / Önceki / Sonraki / Siyah ekran (PowerPoint açıksa COM ile, değilse öndeki pencereye tuş).
