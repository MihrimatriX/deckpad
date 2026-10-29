# Takım sözleşmeleri (DeckPad · StudioHub · OBS betiği · CamLink · CamLink OBS eklentisi · CamLink masaüstü)

Bu dosya iki depoda **birebir aynıdır**: `MihrimatriX/deckpad` ve `MihrimatriX/camlink`, ikisinde de `memory-bank/suite-contracts.md`.
Bir protokolü değiştirirsen iki taraftaki kodu ve bu dosyanın iki kopyasını aynı anda güncelle. Geriye uyumsuz bir değişiklikte mesajlardaki `v` alanını artır.

| Parça | Depo / klasör |
|---|---|
| DeckPad | deckpad `app/` |
| StudioHub | deckpad `studiohub/` |
| OBS kurulum betiği | deckpad `obs-script/` |
| CamLink | camlink `app/` |
| CamLink OBS eklentisi | camlink `obs-plugin/` |
| CamLink masaüstü | camlink `desktop/` (Windows 11 sanal kamerası "CamLink Kamera", telefon kontrolü, USB) |

**2026-10-26**: StudioHub'da webcam yok (deckpad K-016). StudioHub UDP duyurusu yapmaz.
**2026-10-27**: OBS'siz webcam alıcısı camlink'e taşındı: **CamLink masaüstü** (`desktop/`, camlink K-014). StudioHub'dan bağımsız ayrı uygulamadır; SRT 9100 / RTMP 9101 / kontrol 4468 ve `camlink-desktop` duyurusu onundur.

## Parçalar ve kim kiminle konuşur

```
DeckPad (telefon) ──WS 4455──────────────────────────────▶ OBS (obs-websocket v5)
DeckPad (telefon) ──WS 4466 /ws──▶ StudioHub ──SendInput / Core Audio / PowerPoint COM──▶ Windows
CamLink (telefon) ──SRT 9000+ (UDP)──────────────────────▶ OBS "CamLink telefon kamerası" (eklenti) ya da Medya Kaynağı
CamLink (telefon) ──WS 4468 /phone (kontrol)─────────────▶ CamLink masaüstü
CamLink (telefon) ──SRT 9100 (Wi‑Fi) ya da RTMP 9101 (USB, adb reverse)──▶ CamLink masaüstü ─▶ FFmpeg ─▶ paylaşılan bellek ─▶ camlink-vcam.dll ─▶ "CamLink Kamera"
OBS eklentisi + CamLink masaüstü ──UDP 4467 yayın──▶ telefonlar (bilgisayarı bulma)
StudioHub ──http://127.0.0.1:4466/?mode=desktop|dock──▶ DeckPad web derlemesi (masaüstü penceresi / OBS paneli)
```

## Portlar (varsayılan)

| Port | Protokol | Sahibi | Ne |
|---|---|---|---|
| 4455 | TCP/WS | OBS | obs-websocket |
| 4466 | TCP (HTTP+WS) | StudioHub | panel `/`, yönetim `/hub/`, API `/api/*`, telefon `/ws` |
| 4467 | UDP yayın | OBS eklentisi, CamLink masaüstü | duyuru (2 sn'de bir) |
| 4468 | TCP (HTTP+WS) | CamLink masaüstü | `/phone` telefon WS, `/info` (duyuruyla aynı JSON), `/` arayüz ve `/api/*` yalnız 127.0.0.1 |
| 9000, 9001… | UDP (SRT dinleyici) | OBS | her CamLink kaynağı bir port; eklenti 9000'den başlayarak boş olanı seçer |
| 9100 | UDP (SRT dinleyici) | CamLink masaüstü (FFmpeg) | OBS'siz webcam, Wi‑Fi görüntü+ses |
| 9101 | TCP (RTMP dinleyici) | CamLink masaüstü (FFmpeg) | OBS'siz webcam, USB görüntü+ses (adb reverse; adb yalnız TCP taşır, SRT UDP) |

## QR kodları

- StudioHub: `studiohub://pair?host=IP&name=PC&hub=4466&token=…&obs=4455&pass=…`
  (`pass` yalnız OBS şifresi biliniyorsa var). DeckPad hem OBS'i hem StudioHub'ı buradan alır. `srt` ve `webcam` artık yazılmıyor;
  CamLink bu kodu okursa adres ve OBS bilgisini alır; OBS SRT portu 9000 sabittir (webcam için bu kod kullanılmaz).
- OBS'in kendi QR'ı: `obsws://IP:PORT/ŞİFRE` (iki uygulama da tanır).
- CamLink masaüstü: `camlink://pair?host=IP&name=PC&ctl=4468&srt=9100`. Masaüstü penceresinde bekleme ekranının ortasında büyük gösterilir; telefonun CamLink'i bunu okutunca bilgisayarı kaydeder, kontrol kanalına bağlanır ve yayını kendiliğinden başlatır.
  `name` yüzde-kodlu, en çok 40 karakter; `host` yalnız IPv4/ad karakterleri; `ctl`/`srt` yoksa 4468/9100, varsa 1–65535 olmalı (aksi halde kod reddedilir). Çok ağ kartında en yüksek puanlı (192.168.x + ağ geçidi) adres yazılır.

## Duyuru paketleri (UDP 4467, JSON, UTF-8)

- OBS eklentisi: `{"app":"camlink-obs","v":1,"name":"PC","cams":[{"name":"Telefon kamerası","port":9000,"live":false}]}`
- CamLink masaüstü: `{"app":"camlink-desktop","v":1,"name":"PC","srt":9100,"rtmp":9101,"ctl":4468,"busy":false}`; `busy`: başka bir telefon bağlı. `GET /info` aynı JSON'u verir (USB yoklaması bunu kullanır). `rtmp` ilk tasarımda yoktu, geriye uyumlu ek alan; eksik/geçersiz `srt`/`rtmp`/`ctl` alıcıda 9100/9101/4468'e düşer.
- (`{"app":"studiohub",…}` paketi 2026-10-26'da kalktı.)
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
- `/api/*` ayrıca `X-StudioHub` başlığı ister: `status`, `qr.svg?host=`, `obs/setup` (`{webSocket, dock, script}`), `obs/launch`, `firewall` (yalnız TCP), `settings`, `token/regenerate`, `panel/open`, `open`, `deck` (GET/PUT).
- Host başlığı yalnız IP ya da `localhost` olabilir (DNS rebinding'e karşı 421).

## CamLink masaüstü kontrol protokolü (`ws://PC:4468/phone`, JSON)

Anahtar yok (yerel ağ güveni, SRT ile aynı model). Tek telefon: yuva `hello`'da alınır; sahibi 6 sn hiçbir ileti yollamazsa (telefon `state`'i 2 sn'de bir yollar) yeni `hello` yuvayı devralır ve eski soket kapatılır.

| Yön | Mesaj |
|---|---|
| → | `{"t":"hello","v":1,"app":"camlink","name":"Pixel 8"}` (bağlandıktan sonra 10 sn içinde; yoksa kapanış 1008) |
| ← | `{"t":"welcome","v":1,"name":"PC"}`; yuva doluysa welcome yok, kapanış **4009** ("başka telefon bağlı") |
| → | `{"t":"caps","lenses":[{"id":"0/2","facing":"back","label":"Geniş açı"}],"filters":[{"id","label","adjustable"}],"torch":true,"exposure":{"min":-12,"max":12},"wb":["auto","daylight","cloudy","incandescent","fluorescent"],"stabilization":true,"qualities":["720p30","1080p30"]}` (lens/yön değişince yeniden). Masaüstü yolunda `qualities` yalnız ≤30 fps |
| → | `{"t":"state","lens","zoom","zoomMin","zoomMax","filter","filterValue","torch","af","exposure","wb","stabilization","mirror","quality","mic","streaming","battery","charging","thermal","bitrate"?}`: her değişimde ve 2 sn'de bir. `battery` 0–100 (bilinmiyorsa −1), `thermal` Android termal durumu (0 normal), `bitrate` bps (isteğe bağlı; arayüz Mb/s gösterir) |
| ← | `{"t":"set","key":K,"value":V}`; K ∈ lens, zoom, filter, filterValue, torch, af, exposure, wb, stabilization, mirror, quality, mic. Telefon doğrular (anahtar, tür, aralık, `caps` listesi), uygular, güncel `state` yollar; geçersiz komut yok sayılır |
| ← | `{"t":"start"}` / `{"t":"stop"}`: yayını başlat/durdur (CamLink telefonda açık ve ön planda ya da ön plan hizmeti açık olmalı) |
| ↔ | `{"t":"ping"}` / `{"t":"pong"}` |

Kurallar: lens kimliği `kameraId` ya da `kameraId/fizikselId`. `quality` yayın sürerken değişirse telefon durdurur, yapılandırır, yeniden başlatır (~1 sn kesinti). `mic` yayını yeniden kurmaz: ses izi hep vardır (izin varsa), mikrofon susturulur ya da açılır. Masaüstü yolunda telefon en çok **30 fps** gönderir (60 fps seçimi 30'a iner) ve bit hızı seçilen kalitenin önerisini aşmaz (1080p30 → 8 Mb/s). Diğer kapanış kodları: 1009 (64 KB üstü ileti). Hello'dan önce `hello` dışı iletiler yok sayılır.
Sanal kamera çıkışı **1920×1080@30'a sabittir** (telefonun kalitesinden bağımsız; FFmpeg ölçekler ve doldurur).

## USB akışı (adb reverse)

1. Masaüstü 2 sn'de bir `adb devices`; `device` durumundaki her seri no için `adb -s S reverse tcp:4468 tcp:4468` ve `tcp:9101 tcp:9101` (bir kez; cihaz düşüp gelince yeniden). `unauthorized` ise masaüstü "Telefonda USB hata ayıklamaya izin ver" der.
2. Telefon, açıkken 2 sn'de bir `GET http://127.0.0.1:4468/info` (800 ms zaman aşımı). Yanıt gelirse "Webcam · USB" hedefi (`via: 'usb'`, host `127.0.0.1`), görüntü `rtmp://127.0.0.1:9101/camlink`. Wi‑Fi'de aynı PC `srt://PC:9100/camlink?latency=120` ile gider; iki ayrı satır olur, USB üstte.
3. Kayıtlı PC'ye eşleşmişse yol kullanıcıya sorulmadan seçilir: kablo takılınca canlı yayın USB 4 sn kararlı kaldıktan sonra RTMP'ye taşınır, çekilince SRT'ye döner; USB'de 10 sn canlıya geçemeyen yayın Wi‑Fi'a kaçar.

## CamLink masaüstü yerel uçları (yalnız 127.0.0.1)

- Ağdan erişilen yalnız `/info` ve `/phone`. Geri kalanı (`/` arayüz dahil) yalnız bilgisayarın kendisinden açılır, uzaktan gelen 403.
- `/api/*` ve `/phone` ayrıca `Sec-Fetch-Site: cross-site|same-site` isteklerini 403 ile reddeder (tarayıcıdaki başka bir sayfa kullanamasın). Host başlığı yalnız IP ya da `localhost` olabilir (DNS rebinding'e karşı 421).
- `/api/*`: `status`, `phone/set` (`{key,value}`), `phone/start`, `phone/stop`, `preview.bmp`, `qr.svg`, `camera/install`, `firewall`, `settings` (yalnız `pcName`). Arayüz WebView2'de `http://127.0.0.1:4468/` adresinden yüklenir.
- Güvenlik duvarı kuralları: "CamLink (TCP)" 4468 ve "CamLink (UDP)" 9100 (`localsubnet`).

## SRT ve RTMP

- Telefon (çağıran): `srt://PC:PORT/camlink?latency=120` (RootEncoder, ms). USB'de RTMP: `rtmp://127.0.0.1:9101/camlink` (yayın adı boş; RootEncoder 2.8.0 ve FFmpeg 9.0.2 dinleyicisi bunu kabul eder).
- Dinleyici (OBS eklentisi / Medya Kaynağı): `srt://0.0.0.0:PORT?mode=listener&latency=120000` (FFmpeg'de mikrosaniye), biçim `mpegts`.
- CamLink masaüstü: SRT `srt://0.0.0.0:9100?mode=listener&latency=120000`, RTMP `-listen 1 -i rtmp://0.0.0.0:9101/camlink`; iki dinleyici her zaman açıktır, kareyi ilk getiren sanal kameraya yazar.
- Video H.264, anahtar kare 1 sn, B-kare yok. Ses AAC (isteğe bağlı).

## OBS'teki adlar (DeckPad varsayılanları bunlara bağlı)

| Ad | Tür | Kullanan |
|---|---|---|
| `Ses Efektleri` | sahne (tüm sahnelere iç içe eklenir) | DeckPad "Ses efektleri" sayfası kendiliğinden dolar |
| `Slaytlar` | sahne | DeckPad "Slaytlara geç" |
| `Slayt gösterisi` | slideshow kaynağı (elle ilerletme) | DeckPad Önceki/Sonraki (`media next/previous`) |
| `Bildirim` | boş metin kaynağı, OBS açılınca her sahneye eklenir (`Ses Efektleri` hariç) | DeckPad "Ekrana yazı göster" (`notify`: `SetInputSettings` text → bekle → boş) |
| Başlangıç, Kamera, Ekran, Ara, Bitiş | önerilen sahneler (betik: `deckpad.lua`; "Kamera" boş gelir) | DeckPad "Sahneler" sayfası |

OBS'te sahne ve kaynak adları **aynı ad alanındadır**: bir kaynağa sahneyle aynı adı verme.

## Ortak tasarım dili

Koyu mavi "fiziksel tuş" donanım hissi: eloksal gövde degradesi, gömme yuvalar (well), basılınca çöken tuş kapağı (Keycap: etek + degrade yüz), LED şeridi, tally ışıkları (kırmızı canlı, yeşil önizleme, amber duraklatıldı), cam durum ekranı.
Yazı: Barlow (gövde) + Barlow Semi Condensed (tuş etiketi, başlık). Renk anahtarları DeckPad ve CamLink `app/src/theme.ts` ile StudioHub `web/hub/app.css` ve CamLink masaüstü `desktop/web/app.css` `:root` içinde aynı.
Metinler Türkçe, cümle düzeni (büyük harf etiket yok), kod yorumları Türkçe.
