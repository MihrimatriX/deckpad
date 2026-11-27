# Sözleşmeler (DeckPad · StudioHub · OBS betiği)

Parçaların birbirine verdiği sözler: portlar, QR, WebSocket mesajları, OBS'teki adlar. Bir protokolü değiştirirsen iki taraftaki kodu ve bu dosyayı aynı değişiklikte güncelle. Geriye uyumsuz bir değişiklikte mesajlardaki `v` alanını artır.

| Parça | Klasör |
|---|---|
| DeckPad | `app/` |
| StudioHub | `studiohub/` |
| OBS kurulum betiği | `obs-script/` |

Bu depo başka bir uygulamayla sözleşme paylaşmaz (K-022). StudioHub'da webcam yok (K-016) ve UDP duyurusu yapmaz.

## Parçalar ve kim kiminle konuşur

```
DeckPad (telefon) ──WS 4455──────────────────────────────▶ OBS (obs-websocket v5)
DeckPad (telefon) ──WS 4466 /ws──▶ StudioHub ──SendInput / Core Audio / PowerPoint COM──▶ Windows
StudioHub ──http://127.0.0.1:4466/?mode=desktop|dock──▶ DeckPad web derlemesi (masaüstü penceresi / OBS paneli)
```

## Portlar (varsayılan)

| Port | Protokol | Sahibi | Ne |
|---|---|---|---|
| 4455 | TCP/WS | OBS | obs-websocket |
| 4466 | TCP (HTTP+WS) | StudioHub | panel `/`, yönetim `/hub/`, API `/api/*`, telefon `/ws` |

## QR kodları

- StudioHub: `studiohub://pair?host=IP&name=PC&hub=4466&token=…&obs=4455&pass=…`
  (`pass` yalnız OBS şifresi biliniyorsa var). DeckPad hem OBS'i hem StudioHub'ı buradan alır. Eski kodlardaki `srt` ve `webcam` alanları yok sayılır.
- OBS'in kendi QR'ı: `obsws://IP:PORT/ŞİFRE` (DeckPad tanır; bilgisayar eylemleri olmadan bağlanır).
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
`media {key: playPause|next|previous|stop}` · `volume {mode: get|set|up|down|mute|unmute|toggleMute, value?}` (set 0–100, adım 1–50; `get` hiçbir şeyi değiştirmez, DeckPad bağlanınca ve öne gelince düzeyi okur; sonuç her modda `data: {level, muted}`) ·
`slide {dir: next|previous|first|last|start|end|black}` (önce PowerPoint COM, yoksa öndeki pencereye tuş).

Kısayol adları: Ctrl/Alt/Shift/Win; A–Z, 0–9, F1–F24, Enter, Esc, Space/Boşluk, Tab, Sol/Sağ/Yukarı/Aşağı (İngilizcesi de), PageUp/Down, Home, End, Delete, Insert, medya ve ses tuşları; `Ctrl++` artı tuşudur. Doğrulama iki yerde aynı kurallarla: `studiohub/src/StudioHub.Core/Helper/KeyCombo.cs` ve `app/src/hub/keys.ts`.

## StudioHub yerel uçları (yalnız 127.0.0.1)

- `/panel-config.json` → `{"obs":{"host":"127.0.0.1","port":4455,"password":"…"},"hub":{"url":"ws://127.0.0.1:4466/ws","token":"…","name":"PC"},"storage":"hub"}`
- `/api/*` ayrıca `X-StudioHub` başlığı ister: `status`, `qr.svg?host=`, `obs/setup` (`{webSocket, dock, script}`), `obs/launch`, `firewall` (yalnız TCP), `settings`, `token/regenerate`, `panel/open`, `open`, `deck` (GET/PUT).
- Host başlığı yalnız IP ya da `localhost` olabilir (DNS rebinding'e karşı 421).

## OBS'teki adlar (DeckPad varsayılanları bunlara bağlı)

| Ad | Tür | Kullanan |
|---|---|---|
| `Ses Efektleri` | sahne (tüm sahnelere iç içe eklenir) | DeckPad "Ses efektleri" sayfası kendiliğinden dolar |
| `Slaytlar` | sahne | DeckPad "Slaytlara geç" |
| `Slayt gösterisi` | slideshow kaynağı (elle ilerletme) | DeckPad Önceki/Sonraki (`media next/previous`) |
| `Bildirim` | boş metin kaynağı, OBS açılınca her sahneye eklenir (`Ses Efektleri` hariç) | DeckPad "Ekrana yazı göster" (`notify`: `SetInputSettings` text → bekle → boş) |
| Başlangıç, Kamera, Ekran, Ara, Bitiş | önerilen sahneler (betik: `deckpad.lua`; "Kamera" boş gelir) | DeckPad "Sahneler" sayfası |

OBS'te sahne ve kaynak adları **aynı ad alanındadır**: bir kaynağa sahneyle aynı adı verme.

## Tasarım dili

Koyu mavi "fiziksel tuş" donanım hissi: eloksal gövde degradesi, gömme yuvalar (well), basılınca çöken tuş kapağı (Keycap: etek + degrade yüz), LED şeridi, tally ışıkları (kırmızı canlı, yeşil önizleme, amber duraklatıldı), cam durum ekranı.
Yazı: Barlow (gövde) + Barlow Semi Condensed (tuş etiketi, başlık). Renk anahtarları DeckPad `app/src/theme.ts` ile StudioHub `web/hub/app.css` `:root` içinde aynı.
Metinler Türkçe, cümle düzeni (büyük harf etiket yok), kod yorumları Türkçe.
