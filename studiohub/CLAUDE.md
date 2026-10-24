# StudioHub (studiohub/)

DeckPad ve CamLink'in Windows yardımcısı: .NET 10 Core (Kestrel, platformdan bağımsız) + WPF/WebView2 kabuğu + HTML yönetim arayüzü.
Mimari ve tarifler: `../memory-bank/systemPatterns.md` › StudioHub.

- Windows'a özgü kod yalnız `src/StudioHub/Platform` içinde, `IHubPlatform` / `IPcPlatform` / `IFrameSink` arkasında. Core platformdan bağımsız kalmalı.
- Yönetici izni gereken işler `--elevated` alt sürecine gider; ana uygulama yönetici olarak çalışmaz.
- Yeni API ucu: `HubHost.MapApi` + `web/hub/app.js` + `HostTests`. `/api` ve `/hub` yalnız loopback kalmalı.
- OBS ayar dosyalarına OBS açıkken yazma.
- Kontroller: `dotnet test tests/StudioHub.Core.Tests`; kabuk değiştiyse `dotnet build src/StudioHub` (Linux'ta da derlenir).
- Linux'ta denemek için `src/StudioHub.DevServer`. Süreç öldürürken `pkill -f` kullanma.
- Derlemeden önce kökten `scripts/hazirla.sh` (FFmpeg + panel).
