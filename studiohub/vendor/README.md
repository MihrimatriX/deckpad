# vendor

StudioHub'ın yanında dağıtılan üçüncü taraf ve kardeş depo dosyaları. Yayında `ffmpeg/`, `driver/`, `obs/` olarak uygulamanın yanına kopyalanır.

| Klasör | Ne | Depoda mı |
|---|---|---|
| `ffmpeg/` | FFmpeg 9.0.2 essentials (gyan.dev, GPL v3). `KAYNAK.txt` ve `LICENSE.txt` depoda; `ffmpeg.exe`'yi kökten `scripts/hazirla.sh` / `hazirla.ps1` indirir ve SHA-256'sını doğrular. | Kısmen |
| `driver/` | [Unity Capture](https://github.com/schellingb/UnityCapture) DirectShow filtresi, 32 ve 64 bit (MIT). "CamLink Kamera" adıyla kaydedilir. | Evet |
| `obs/obs-plugin/camlink/` | CamLink OBS eklentisinin derlenmiş hali (`MihrimatriX/camlink` deposu, `obs-plugin/`). Güncellemek için orada `./build.sh` çalıştır, `out/camlink`'i buraya kopyala. | Evet |

OBS kurulum betiği (`deckpad-camlink.lua`) burada değil; deponun kökündeki `obs-script/` klasöründen yayına `obs/obs-script` olarak eklenir.
