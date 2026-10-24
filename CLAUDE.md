# deckpad deposu

DeckPad (telefon, Expo) + StudioHub (Windows, .NET 10) + OBS kurulum betiği (Lua). Kardeş depo: `MihrimatriX/camlink`.

**Oturum başında** `memory-bank/README.md`'yi ve oradaki okuma sırasını izle (en az projectbrief, activeContext, progress).
**Oturum sonunda** `memory-bank/activeContext.md` ve `progress.md`'yi güncelle; karar verdiysen `decisions.md`'ye, sinsi bir hatayı çözdüysen `lessons.md`'ye yaz.

## Kurallar

- Arayüz metinleri, belgeler ve kod yorumları **Türkçe**; tanımlayıcılar İngilizce. Kullanıcıyla Türkçe konuş.
- Protokol, port, QR, duyuru ya da OBS adı değişirse `memory-bank/suite-contracts.md`'yi **iki depoda** (deckpad ve camlink) birlikte güncelle.
- Doğrulamadığın bir şeyi "çalışıyor" diye yazma; gerçek telefon ve gerçek Windows henüz denenmedi.
- Bitti demeden önce değişen parçanın kontrollerini çalıştır:
  - `app/`: `npm run typecheck && npm test`
  - `studiohub/`: `dotnet test studiohub/tests/StudioHub.Core.Tests` (kabuk değiştiyse `dotnet build studiohub/src/StudioHub`)
  - DeckPad'deki değişiklik paneli etkiliyorsa: `cd app && npm run export:panel`
- Üretilen dosyaları depoya ekleme: `studiohub/web/panel`, `studiohub/vendor/ffmpeg/ffmpeg.exe`, `app/android`, `bin/`, `obj/`, `out/`.

Alt klasörlerdeki `CLAUDE.md` dosyaları parçaya özgü kuralları içerir.
