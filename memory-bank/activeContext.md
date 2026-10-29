# Aktif bağlam

**Son güncelleme**: 2026-10-29

## Şu an

- **Depo herkese açık** (K-019): `MihrimatriX/deckpad`. Sürüm `v1.0.0` Releases'ta: `StudioHub.exe` (tek dosya) ve `DeckPad.apk`. İndirme sayfası GitHub Pages: https://mihrimatrix.github.io/deckpad/ (`main` › `/docs`). Bağlantılar `releases/latest/download/<ad>` biçiminde; yeni sürümde aynı adlarla yükle.
- Commit yazarı `28717150+MihrimatriX@users.noreply.github.com` (yalnız bu depoda `git config`). İlk commit de buna yeniden yazıldı (`48923a0` → `59760de`, force-push).
- 2026-10-29'da yapılanlar:
  - StudioHub tek dosya: arayüz, panel ve betik exe'ye gömülü, açılışta `%LOCALAPPDATA%\StudioHub\web`'e çıkarılır (K-019).
  - Yönetim arayüzü sadeleşti (K-020): büyük QR + "DeckPad'i aç, kodu okut", tek satır OBS durumu (`obsSummary`), bağlı cihazlar; geri kalanı "Gelişmiş" altında.
  - QR kırpılıyordu (SVG'de viewBox yok) → düzeltildi. QR ve durum OBS şifresini OBS'in kendi ayarından okur (`HubHost.CurrentObsPassword`).
  - Release APK'da QR çözücü kurulamıyordu (R8 full mode) → `app.json` `extraProguardRules`; logcat'te hata kayboldu (`lessons.md`).
  - Yeni APK telefona (Huawei SNE-LX1) kuruldu ve açıldı; StudioHub yeni exe ile `C:\Apps\StudioHub`'dan çalışıyor (klasör kaybolmuştu, yeniden kondu).

## Sıradaki adımlar

1. **Kullanıcıyla gerçek QR denemesi**: telefonda DeckPad zaten açık ve kamera izni verili; StudioHub'daki QR'ı okut → bağlı cihazlarda görünmeli; Bildirim tuşu, sahne geçişi, ses efekti (önce OBS › Araçlar › Betikler › DeckPad'de ses klasörü). Telefonda uçak modu açık görünüyordu (Wi‑Fi açık); yerel ağ için sorun değil.
2. ExpoModulesV2 "does not implement Enumerable" uyarısı (release, R8): hangi modül olduğu `mapping.txt`'ten bulunmalı; şimdilik görünür etkisi yok.
3. Ses efektlerini düğmesiz yapmak (istenirse), dikey ekranda 4×4 ızgara boşluğu, eskiyen ekran görüntüleri (`studiohub-1-yonetim.png`, `obs-eklenti-ve-betik.png`; sayfa bunları kullanmıyor).
4. İsteğe bağlı: GitHub Actions ile test ve Release'e otomatik yükleme; APK için kalıcı imza anahtarı (şu an hata ayıklama anahtarı: başka makinede derlenen APK güncelleme olarak kurulmaz).

## Açık sorular

- Eski CamLink eklentisi (`%ProgramData%\obs-studio\plugins\camlink`) ve `scripts/deckpad-camlink.lua` kopyası kaldırılsın mı? Eklenti için yönetici izni gerekir.
- README'deki camlink bağlantısı: camlink deposu özel kaldıkça ziyaretçiye 404.
