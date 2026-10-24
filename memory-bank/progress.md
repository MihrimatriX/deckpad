# İlerleme

**Son güncelleme**: 2026-10-24

## Sürüm geçmişi

| Sürüm | Ne geldi |
|---|---|
| v1 | DeckPad: OBS'e doğrudan bağlanan düzenlenebilir tuş ızgarası, makrolar, sahne/kaynak/filtre/ses/medya eylemleri, sahte OBS'e karşı testler. Koyu mavi düz tasarım. |
| v2 | "Fiziksel tuş" yeniden tasarımı; StudioHub (bilgisayar eylemleri, OBS'siz webcam, masaüstü/OBS paneli, OBS'i hazırla, QR eşleştirme, duyuru); 7 bilgisayar eylemi; Bilgisayar sayfası; düzen eşitleme; panel modu; OBS kurulum betiği; Ses efektleri sayfasının OBS'ten dolması. |
| depo (2026-10-24) | GitHub'a taşındı; FFmpeg indirme betikleri, `export:panel`, birleşik hafıza bankası, README'ler. Davranış değişikliği yok. |

## Doğrulanan

**DeckPad**
- 24 otomatik test (sahte OBS 14, sahte StudioHub 10); tsc temiz.
- Web derlemesi gerçek OBS 30.0.2 (Linux, Xvfb) ve StudioHub DevServer'a bağlı çalıştı: sahne/efekt sayfaları doldu, bilgisayar tuşları StudioHub'a ulaştı (slayt, ses, Win+Shift+S), ses efekti tuşu OBS'te medyayı baştan çaldı, düzen bilgisayara eşitlendi.
- APK derlendi; v2 imzası ve Hermes paketindeki yeni kod doğrulandı.

**StudioHub**
- 41 xUnit testi: KeyCombo, eşleştirme, eylem doğrulama, ayarlar, ini düzenleme, OBS yapılandırma (eski/yeni WebSocket), sunucu uçları, Host denetimi, WS kimlik doğrulama ve kilit, düzen paylaşımı, sürücü kurulumunun yükseltilmiş yoldan gitmesi, FFmpeg ile SRT → çevrilmiş RGBA kareler.
- DevServer + gerçek OBS 30.0.2: "OBS'i hazırla" dosyaları OBS tarafından okundu (WebSocket açıldı, betik ve eklenti yüklendi).
- Yayın çıktısı PE32+ GUI; WPF projesi Linux'ta derleniyor.

**OBS betiği** (gerçek OBS 30.0.2)
- 5 önerilen sahne, ses efektleri + tüm sahnelere iç içe bağlama, slayt gösterisi, kamera; ikinci çalıştırmada çoğaltma yok; efektler açılışta durur, DeckPad'in RESTART'ıyla çalar; "Sonraki" slaytı değiştirir.

## Doğrulanmayan

- DeckPad gerçek Android telefonda (QR kamerası, dokunma/titreşim, arka plandan dönüş). iOS.
- StudioHub gerçek Windows'ta: WPF/WebView2 kabuğu, tepsi, SendInput, Core Audio, PowerPoint COM, Unity Capture yazımı, regsvr32/netsh/UAC akışı, iş nesnesi.
- Betik OBS 31+'da (tür adları ve user.ini yolu kodda var).
- Depo düzeninde `scripts/hazirla.ps1` Windows'ta çalıştırılmadı (Bash sürümü ve `dotnet publish` Linux'ta denendi).

## Bilinen sorunlar ve sınırlar

- Dikey ekranda 4×4 ızgara ortada, üstte/altta boşluk fazla.
- İki cihaz aynı anda otomatik sayfa doldurursa ya da düzenlerse son yazan kazanır; düzenleme modundayken uzaktan gelen değişiklik açık düzenlemeyi bozabilir.
- DirectShow sanal kamera Windows 11 Kamera uygulamasında görünmez.
- Yönetici olarak çalışan pencerelere tuş gönderilemez (UIPI).
- Güvenlik duvarı durumu netsh ile 2 dk önbellekli; ilk sorguda "yok" görünebilir.
- StudioHub zip'i büyük (~117 MB; FFmpeg ~105 MB).
- APK'lar hata ayıklama anahtarıyla imzalı.
