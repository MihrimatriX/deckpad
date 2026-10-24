# Aktif bağlam

**Son güncelleme**: 2026-10-24

## Şu an

- v2 kodu GitHub'a taşındı: `MihrimatriX/deckpad` (özel). Önceki dört ayrı klasör (deckpad, studiohub, obs-plugin'in betik kısmı) bu depoda birleşti; hafıza bankaları tek bankada toplandı.
- Kullanıcıya en son teslim edilen paketler: `DeckPad.zip` (APK + kaynak), `StudioHub-Windows.zip` (çalışmaya hazır klasör + kaynak), `OBS-Paketi.zip`. Depodaki kod bu paketlerle aynı; yalnız yollar ve derleme betikleri depo düzenine uyarlandı.
- Hiçbir parça henüz kullanıcının gerçek telefonunda ya da Windows bilgisayarında çalıştırılmadı. Kullanıcının geri bildirimi bekleniyor.

## Sıradaki adımlar

1. **Gerçek cihaz duman testi** (kullanıcıyla birlikte):
   - StudioHub: açılış (SmartScreen, güvenlik duvarı istemleri, tepsi, WebView2), OBS'i hazırla (OBS kapalı), sanal kamera sürücüsü (UAC), Zoom/Discord'da "CamLink Kamera" ve görüntü yönü, kısayol/PowerPoint/ses/medya/metin (Türkçe karakter). Hata olursa `%APPDATA%\StudioHub\studiohub.log`.
   - DeckPad: QR okuma, OBS'e bağlanma, otomatik sayfalar, makrolar, bilgisayar eylemleri, düzen eşitleme, arka plandan dönüş.
2. Geri bildirime göre ince ayar. Bilinen aday: dikey ekranda 4×4 ızgara ortada çok boşluk bırakıyor.
3. Depo iyileştirmeleri (istenirse): GitHub Actions ile test (`npm test`, `dotnet test`), Releases'a APK ve StudioHub zip'i.
4. İstenirse özellikler: pc eylemleri için durum göstergesi, çoklu profil, iOS denemesi; StudioHub için daha küçük FFmpeg, kod imzalama, Windows 11 Media Foundation sanal kamerası, SRT passphrase.

## Açık sorular

- Kullanıcı APK'yı ve StudioHub'ı denedi mi? Sonuç?
- Releases'a ikili dosya konulsun mu (özel depo; Actions dakikaları sınırlı)?
