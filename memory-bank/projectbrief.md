# Proje özeti

## Amaç

Telefonu OBS için bir Stream Deck'e çevirmek (**DeckPad**) ve bilgisayar tarafında bunu tamamlayan bir Windows yardımcısı (**StudioHub**) sağlamak.
Kullanıcı bunu kendi kayıt ve yayınları için istiyor. Mağazada yayın şimdilik hedef değil.

Takımın tamamı dört parçadan oluşur, iki depoya ayrılmıştır:

| Parça | Depo | Ne |
|---|---|---|
| DeckPad | **deckpad** `app/` | Telefon: düzenlenebilir tuş ızgarası, OBS ve bilgisayar eylemleri |
| StudioHub | **deckpad** `studiohub/` | Windows: bilgisayar eylemleri, masaüstü/OBS paneli, OBS'i hazırla |
| OBS kurulum betiği | **deckpad** `obs-script/` | DeckPad'in beklediği sahne/kaynakları OBS'te kurar |
| CamLink | camlink `app/` | Telefon: kablosuz kamera (SRT) |
| CamLink OBS eklentisi | camlink `obs-plugin/` | OBS: telefon kamerası kaynağı + ağ duyurusu |

deckpad deposunda webcam yok (K-016): yalnız telefondan OBS'i ve bilgisayarı yönetmek. OBS'siz webcam alıcısı camlink'e taşınacak.

## Kapsam

**DeckPad**
- OBS'e obs-websocket v5 ile **doğrudan** bağlanır; StudioHub olmadan da tam çalışır.
- Sayfalar, sürükle-bırak, etiket/ikon/renk, çok adımlı makrolar, "basılı tutarak çalıştır" onayı, geri alma.
- OBS eylemleri: kayıt/yayın/duraklatma, sahne ve önizleme, geçişler, Studio Mode, kaynak göster/gizle, filtre, ses (sustur, düzey), medya (ses efekti, slayt), replay, kayda işaret, sanal kamera, OBS kısayolu, bekle, sayfaya git.
- Bilgisayar eylemleri (StudioHub üzerinden): sunum, klavye kısayolu, medya tuşları, Windows ses düzeyi, uygulama/web aç, metin yaz.
- Aynı kod web'e derlenir; StudioHub bunu masaüstü penceresi ve OBS paneli olarak sunar. Düzen bilgisayarla eşitlenebilir.

**StudioHub**
- DeckPad yardımcısı (bilgisayar eylemleri), DeckPad masaüstü ve OBS paneli, "OBS'i hazırla".
- Eşleştirme QR'ı, güvenlik duvarı kuralı, Windows ile başlatma, tepsi simgesi.
- Tek komutla kurulum (`scripts/kur.ps1`); .NET kurulumu gerektirmez.

**OBS betiği**
- Ses efektleri sahnesi (tüm sahnelere iç içe), slayt gösterisi, önerilen sahneler. Tekrar çalıştırmak güvenli.

## Kapsam dışı (şimdilik)

- iOS'ta deneme (DeckPad derlenir ama denenmedi), Play Store/Microsoft Store yayını, kod imzalama.
- Birden çok OBS'e aynı anda bağlanma, birden çok profil.
- macOS/Linux için StudioHub kabuğu (Core platformdan bağımsız; kabuk yalnız Windows).

## Başarı ölçütü

Kullanıcı telefonla OBS'te sahne değiştirip, ses efekti çalıp, kaydı yönetip, sunumu ilerletebilmeli ve bunu kurulum belgesi okumadan, QR okutarak başlatabilmeli.
