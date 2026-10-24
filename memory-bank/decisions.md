# Karar kaydı

Her kayıt: bağlam, karar, neden, değerlendirilen seçenekler, sonuçları. **Kaynak** "Kullanıcı" ise kullanıcı açıkça seçti; "Teknik" ise uygulama sırasında gerekçeyle alındı ve kullanıcıya sunuldu.
Bir kararı değiştirirken eski kaydı silme; yeni kayıt aç, eskisine "Yerini aldı: K-0xx" yaz.

---

### K-001 · İki ayrı uygulama: DeckPad ve CamLink
**Kaynak**: Kullanıcı · **Durum**: geçerli
Webcam ile kontrol paneli tek uygulamada değil. Kamera uygulaması ekranı ve donanımı (kamera, kodlayıcı, ısı) tamamen kullanır; kontrol paneli ise başka bir telefonda ya da tablette açık durur. İkisi aynı tasarım dilini ve ortak sözleşmeleri paylaşır.

### K-002 · React Native (Expo), Flutter değil
**Kaynak**: Kullanıcı onayladı · **Durum**: geçerli
- **Neden**: Kullanıcının React/TypeScript bilgisi; Expo'nun web derlemesi sayesinde DeckPad'in **aynı kodu** StudioHub'da masaüstü ve OBS paneli olarak kullanılabiliyor; Expo modülleriyle (CamLink) yerel Kotlin kodu eklemek kolay.
- **Flutter**: performans ve tutarlı çizim artısı; ama web paneli için ikinci bir kod tabanı ya da Flutter web gerekirdi, kullanıcının ekosistemi değil.
- **Sonuç**: DeckPad yalnız Expo Go modülleriyle çalışır (Expo Go'da denenebilir); CNG ile `android/` üretilir, depoya girmez.

### K-003 · "Fiziksel tuş" tasarım dili
**Kaynak**: Kullanıcı · **Durum**: geçerli
v1 düz koyu mavi kartlar "şık değil" bulundu. Kullanıcı seçenekler arasından Stream Deck benzeri, basılınca çöken tuşları seçti; lacivert korundu. Ayrıntı: `productContext.md` › Tasarım dili.

### K-004 · DeckPad OBS'e doğrudan bağlanır (StudioHub üzerinden değil)
**Kaynak**: Teknik · **Durum**: geçerli
- **Neden**: StudioHub yokken (ör. macOS/Linux'ta OBS ya da başka bilgisayar) de tam çalışsın; obs-websocket zaten kimlik doğrulama ve olay akışı veriyor; araya ikinci bir aktarım katmanı gecikme ve hata noktası ekler.
- **Seçenek**: StudioHub'ı tek kapı yapmak; tek QR, tek bağlantı artısı vardı. Tek QR'ı `studiohub://pair` içine OBS bilgisini koyarak zaten sağladık.
- **Sonuç**: İki bağımsız bağlantı ve iki durum ışığı (OBS, PC). Tuş başına bağlantı kapısı.

### K-005 · Makrolarda ardışık OBS istekleri tek RequestBatch
**Kaynak**: Teknik · **Durum**: geçerli
Ağ gidiş-dönüşünü azaltır, sahne+kaynak değişiklikleri aynı karede olur. "Bekle" batch içindeyse OBS'in `Sleep` isteğine dönüşür. Bilgisayar eylemi araya girerse birikmiş batch önce gönderilir; sıra korunur.

### K-006 · StudioHub: .NET Core + ince WPF/WebView2 kabuğu + HTML arayüz
**Kaynak**: Teknik · **Durum**: geçerli
- **Neden**: Kullanıcı .NET geliştiricisi. Core platformdan bağımsız olduğu için Linux bulut ortamında test ediliyor. Arayüz HTML olduğu için tarayıcıda denenip ekran görüntüsü alınabiliyor; WebView2 Windows 10/11'de hazır. Self-contained tek dosya yayını .NET kurulumu istemiyor.
- **Seçenekler**: WinUI 3 (paketleme/yayın karmaşası, Linux'ta test yok), Avalonia (çapraz platform artısı ama Windows API'leri yine gerekir, arayüz testi zor), Electron/Tauri (ikinci çalışma zamanı, .NET ile köprü gerekir).
- **Sonuç**: WPF yalnız pencere, tepsi ve Windows API'leri için; her şey `IHubPlatform` arkasında.

### K-007 · Tek port (4466): panel, yönetim, API ve telefon WebSocket'i
**Kaynak**: Teknik · **Durum**: geçerli
Tek güvenlik duvarı kuralı, tek eşleştirme bilgisi. Ayrım yol ve kaynak adresle yapılır: `/hub/` ve `/api/*` yalnız loopback, `/api` ayrıca `X-StudioHub` başlığı (tarayıcıdan sahte istekleri engeller), Host başlığı yalnız IP/localhost (DNS rebinding'e karşı).

### K-008 · Eşleştirme: QR'daki rastgele anahtar, kilitli deneme
**Kaynak**: Teknik · **Durum**: geçerli
Anahtar yalnız QR'da ve yerel API'de; ağ duyurusunda asla yok. Yanlış anahtarda istemci yeniden denemez (kilitlenmesin); 5 hatalı denemede 1 dk kilit; "Kodu yenile" eski anahtarla bağlı herkesi 4003 ile düşürür.

### K-009 · OBS'siz webcam: FFmpeg alt süreci + Unity Capture (DirectShow)
**Kaynak**: Kullanıcı (özellik) + Teknik (yöntem) · **Durum**: geçerli
- **Neden**: FFmpeg SRT + H.264 çözmeyi hazır veriyor, ayrı süreç olduğu için GPL'i StudioHub'a bulaştırmıyor ve çökerse StudioHub'ı düşürmüyor. Unity Capture MIT, sürücü yazmadan DirectShow sanal kamera veriyor; Zoom, Discord, Teams, Chrome görür.
- **Seçenekler**: Windows 11 `MFCreateVirtualCamera` (Kamera uygulamasında da görünür ama yalnız Windows 11, COM sunucusu ve paketleme gerekir), OBS Virtual Camera'ya yazmak (OBS'e bağımlı), FFmpeg'i kitaplık olarak gömmek (GPL ve yerel bağımlılık).
- **Sonuç**: Windows 11 Kamera uygulamasında görünmez (OBS sanal kamerası gibi). Görüntü alttan üste geldiği için `vflip` varsayılan. İş nesnesiyle FFmpeg StudioHub'la birlikte kapanır.

### K-010 · "OBS'i hazırla" OBS'in dosyalarını OBS kapalıyken yazar
**Kaynak**: Teknik · **Durum**: geçerli
OBS'in dışarıdan ayar değiştirme API'si yok (WebSocket'i açmak için WebSocket'e bağlanamazsın). OBS açıkken yazılan ayar kapanışta ezilir; bu yüzden OBS açıksa yazmayı reddeder ve kullanıcıya kapatmasını söyler. Eski ve yeni obs-websocket ayar dosyaları birlikte yazılır.

### K-011 · Düzen eşitleme: StudioHub'daki deck.json ortak kaynak, son yazan kazanır
**Kaynak**: Teknik · **Durum**: geçerli
Panel, OBS paneli ve eşitlemeyi açan telefonlar aynı `deck.json`'u kullanır. Değişiklik 700 ms sonra gönderilir, diğerlerine `deckChanged` gider, onlar çeker. Birleştirme (CRDT vb.) kişisel kullanım için gereksiz bulundu. Bilinen sınır: aynı anda düzenleyen iki cihazdan biri ötekini ezer.

### K-012 · OBS kurulumu Lua betiğiyle
**Kaynak**: Kullanıcı (kurulum betiği istedi) + Teknik (dil) · **Durum**: geçerli
Lua OBS'in içinde hazır; Python betikleri Windows'ta kullanıcının ayrıca Python kurmasını ve OBS'te yolunu ayarlamasını ister. Betiğin oluşturduğu adlar DeckPad varsayılanlarıyla sözleşmedir (`suite-contracts.md`).

### K-013 · Arayüz ve kod yorumları Türkçe
**Kaynak**: Kullanıcı (Türkçe çalışıyor) · **Durum**: geçerli
Kullanıcıya görünen her metin, BENİOKU'lar, hafıza bankası ve kod yorumları Türkçe. Tanımlayıcılar İngilizce.

### K-014 · GitHub düzeni: iki özel depo, lisans yok
**Kaynak**: Kullanıcı (2026-10-24) · **Durum**: geçerli
- `MihrimatriX/deckpad`: DeckPad + StudioHub + OBS betiği. `MihrimatriX/camlink`: CamLink + CamLink OBS eklentisi.
- StudioHub iki uygulamaya da hizmet ettiği hâlde DeckPad deposunda; çünkü DeckPad'in web derlemesini barındırıyor ve en çok onunla birlikte değişiyor. CamLink eklentisinin derlenmiş hali `studiohub/vendor/obs/obs-plugin`'de kopya olarak durur.
- Lua betiği eklentinin değil DeckPad'in parçası sayıldı (sahne adları DeckPad varsayılanlarına bağlı).
- `suite-contracts.md` iki depoda aynı kopyadır.
- Lisans yok: tüm hakları saklı. Üçüncü taraf lisansları README'de listeli.

### K-015 · FFmpeg depoya girmez; betik indirir ve özetini doğrular
**Kaynak**: Teknik · **Durum**: geçerli
`ffmpeg.exe` 105 MB (GitHub'ın 100 MB dosya sınırı üstünde) ve GPL. `scripts/hazirla.*` gyan.dev 9.0.2 essentials'ı GitHub aynasından (yedek gyan.dev) indirir, `ffmpeg.exe` SHA-256'sını doğrular. Sürüm yükseltirken iki betikteki sürüm ve özeti birlikte değiştir.
