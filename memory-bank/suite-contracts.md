# Takım sözleşmeleri (DeckPad · StudioHub · OBS betiği · CamLink · CamLink OBS eklentisi)

Bu dosya iki depoda **birebir aynıdır**: `MihrimatriX/deckpad` ve `MihrimatriX/camlink`, ikisinde de `memory-bank/suite-contracts.md`.
Bir protokolü değiştirirsen iki taraftaki kodu ve bu dosyanın iki kopyasını aynı anda güncelle. Geriye uyumsuz bir değişiklikte mesajlardaki `v` alanını artır.

| Parça | Depo / klasör |
|---|---|
| DeckPad | deckpad `app/` |
| StudioHub | deckpad `studiohub/` |
| OBS kurulum betiği | deckpad `obs-script/` |
| CamLink | camlink `app/` |
| CamLink OBS eklentisi | camlink `obs-plugin/` (derlenmiş kopyası deckpad `studiohub/vendor/obs/obs-plugin`) |

## Parçalar ve kim kiminle konuşur

```
DeckPad (telefon) ──WS 4455──────────────────────────────▶ OBS (obs-websocket v5)
DeckPad (telefon) ──WS 4466 /ws──▶ StudioHub ──SendInput / Core Audio / PowerPoint COM──▶ Windows
CamLink (telefon) ──SRT 9000+ (UDP)──────────────────────▶ OBS "CamLink telefon kamerası" (eklenti) ya da Medya Kaynağı
CamLink (telefon) ──SRT 9100 (UDP)──▶ StudioHub ─▶ FFmpeg ─▶ Unity Capture paylaşılan bellek ─▶ "CamLink Kamera"
StudioHub + OBS eklentisi ──UDP 4467 yayın──▶ telefonlar (bilgisayarı bulma)
StudioHub ──http://127.0.0.1:4466/?mode=desktop|dock──▶ DeckPad web derlemesi (masaüstü penceresi / OBS paneli)
```

## Portlar (varsayılan)

| Port | Protokol | Sahibi | Ne |
|---|---|---|---|
| 4455 | TCP/WS | OBS | obs-websocket |
| 4466 | TCP (HTTP+WS) | StudioHub | panel `/`, yönetim `/hub/`, API `/api/*`, telefon `/ws` |
| 4467 | UDP yayın | StudioHub, OBS eklentisi | duyuru (2 sn'de bir) |
| 9000, 9001… | UDP (SRT dinleyici) | OBS | her CamLink kaynağı bir port; eklenti 9000'den başlayarak boş olanı seçer |
| 9100 | UDP (SRT dinleyici) | StudioHub (FFmpeg) | OBS'siz webcam |

## QR kodları

- StudioHub: `studiohub://pair?host=IP&name=PC&hub=4466&token=…&obs=4455&pass=…&srt=9000&webcam=9100`
  (`pass` yalnız OBS şifresi biliniyorsa var). DeckPad hem OBS'i hem StudioHub'ı, CamLink adres ve portları buradan alır.
- OBS'in kendi QR'ı: `obsws://IP:PORT/ŞİFRE` (iki uygulama da tanır).

## Duyuru paketleri (UDP 4467, JSON, UTF-8)

- StudioHub: `{"app":"studiohub","v":1,"name":"PC","hub":4466,"webcam":9100,"webcamOn":true,"webcamBusy":false,"obsSrt":9000,"obsWs":4455}`
- OBS eklentisi: `{"app":"camlink-obs","v":1,"name":"PC","cams":[{"name":"Telefon kamerası","port":9000,"live":false}]}`
- Anahtar (token) **asla** duyuruda yok. Alıcı göndericinin IP'sini paket kaynağından alır. Hedefler 7 sn duyuru gelmezse listeden düşer.
- Gönderim: her bağdaştırıcının yönlendirilmiş yayın adresi + 255.255.255.255. Android'de almak için MulticastLock gerekir.

## StudioHub WebSocket protokolü (`ws://PC:4466/ws`)

| Yön | Mesaj |
|---|---|
| → | `{"t":"hello","token":"…","name":"Pixel 8","app":"deckpad","v":1}` (ilk mesaj, 10 sn içinde) |
| ← | `{"t":"welcome","v":1,"name":"PC","caps":["keys","text","launch","url","media","volume","slide","deck"],"clientId":"…"}` |
| ← | `{"t":"error","code":"auth"}` ve kapanış 4001 (yanlış anahtar) |
| → | `{"t":"run","id":7,"action":{PcAction}}` |
| ← | `{"t":"result","id":7,"ok":true,"message":"…","data":{…}}` |
| → / ← | `deckGet` → `{"t":"deck","id","deck","updatedAt"}`; `deckPut {deck}` → `{"t":"deckSaved","id","ok","message"}` |
| ← | `{"t":"deckChanged"}` (başka biri düzeni kaydetti; gönderen hariç herkese) |
| → / ← | `ping` / `pong` |

Kapanış kodları: 4001 yanlış anahtar (istemci yeniden denemez), 4003 anahtar yenilendi, 4029 kilit (5 hatalı denemede 1 dk).

**PcAction** (`op` alanı türü belirler):
`keys {keys:"Ctrl+Shift+M"}` · `text {text}` (≤2000) · `launch {path,args?}` · `url {url}` (yalnız http/https) ·
`media {key: playPause|next|previous|stop}` · `volume {mode: set|up|down|mute|unmute|toggleMute, value?}` (set 0–100, adım 1–50) ·
`slide {dir: next|previous|first|last|start|end|black}` (önce PowerPoint COM, yoksa öndeki pencereye tuş).

Kısayol adları: Ctrl/Alt/Shift/Win; A–Z, 0–9, F1–F24, Enter, Esc, Space/Boşluk, Tab, Sol/Sağ/Yukarı/Aşağı (İngilizcesi de), PageUp/Down, Home, End, Delete, Insert, medya ve ses tuşları; `Ctrl++` artı tuşudur. Doğrulama iki yerde aynı kurallarla: deckpad `studiohub/src/StudioHub.Core/Helper/KeyCombo.cs` ve deckpad `app/src/hub/keys.ts`.

## StudioHub yerel uçları (yalnız 127.0.0.1)

- `/panel-config.json` → `{"obs":{"host":"127.0.0.1","port":4455,"password":"…"},"hub":{"url":"ws://127.0.0.1:4466/ws","token":"…","name":"PC"},"storage":"hub"}`
- `/api/*` ayrıca `X-StudioHub` başlığı ister: `status`, `qr.svg?host=`, `obs/setup`, `obs/launch`, `webcam/start|stop|settings|driver|preview.bmp`, `firewall`, `settings`, `token/regenerate`, `panel/open`, `open`, `deck` (GET/PUT).
- Host başlığı yalnız IP ya da `localhost` olabilir (DNS rebinding'e karşı 421).

## SRT

- Telefon (çağıran): `srt://PC:PORT/camlink?latency=120` (RootEncoder, ms).
- Dinleyici (OBS/FFmpeg): `srt://0.0.0.0:PORT?mode=listener&latency=120000` (FFmpeg'de mikrosaniye), biçim `mpegts`.
- Video H.264, anahtar kare 1 sn, B-kare yok. Ses AAC (isteğe bağlı).

## OBS'teki adlar (DeckPad varsayılanları bunlara bağlı)

| Ad | Tür | Kullanan |
|---|---|---|
| `Ses Efektleri` | sahne (tüm sahnelere iç içe eklenir) | DeckPad "Ses efektleri" sayfası kendiliğinden dolar |
| `Slaytlar` | sahne | DeckPad "Slaytlara geç" |
| `Slayt gösterisi` | slideshow kaynağı (elle ilerletme) | DeckPad Önceki/Sonraki (`media next/previous`) |
| `Telefon kamerası` | `camlink_source` ya da SRT Medya Kaynağı | — |
| Başlangıç, Kamera, Ekran, Ara, Bitiş | önerilen sahneler | DeckPad "Sahneler" sayfası |

OBS'te sahne ve kaynak adları **aynı ad alanındadır**: bir kaynağa sahneyle aynı adı verme.

## Ortak tasarım dili

Koyu mavi "fiziksel tuş" donanım hissi: eloksal gövde degradesi, gömme yuvalar (well), basılınca çöken tuş kapağı (Keycap: etek + degrade yüz), LED şeridi, tally ışıkları (kırmızı canlı, yeşil önizleme, amber duraklatıldı), cam durum ekranı.
Yazı: Barlow (gövde) + Barlow Semi Condensed (tuş etiketi, başlık). Renk anahtarları DeckPad ve CamLink `app/src/theme.ts` ile StudioHub `web/hub/app.css` `:root` içinde aynı.
Metinler Türkçe, cümle düzeni (büyük harf etiket yok), kod yorumları Türkçe.
