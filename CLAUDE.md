# deckpad deposu

DeckPad (telefon, Expo) + StudioHub (Windows, .NET 10) + OBS kurulum betiği (Lua). Telefondan OBS'i ve bilgisayarı yöneten yayın paneli; webcam yok, başka depoya bağı yok (K-022).
Windows'ta kurulum: `.\scripts\kur.ps1 [-Apk]`.

**Oturum başında** `memory-bank/README.md`'yi ve oradaki okuma sırasını izle (en az projectbrief, activeContext, progress).
**Oturum sonunda** `memory-bank/activeContext.md` ve `progress.md`'yi güncelle; karar verdiysen `decisions.md`'ye, sinsi bir hatayı çözdüysen `lessons.md`'ye yaz.

## Kurallar

- Arayüz metinleri, belgeler ve kod yorumları **Türkçe**; tanımlayıcılar İngilizce. Kullanıcıyla Türkçe konuş.
- Protokol, port, QR ya da OBS adı değişirse `memory-bank/contracts.md`'yi aynı değişiklikte güncelle.
- Doğrulamadığın bir şeyi "çalışıyor" diye yazma; gerçek telefon henüz denenmedi, Windows'ta yalnızca `progress.md`'de yazanlar doğrulandı.
- Bitti demeden önce değişen parçanın kontrollerini çalıştır:
  - `app/`: `npm run typecheck && npm test`
  - `studiohub/`: `dotnet test studiohub/tests/StudioHub.Core.Tests` (kabuk değiştiyse `dotnet build studiohub/src/StudioHub`)
  - DeckPad'deki değişiklik paneli etkiliyorsa: `cd app && npm run export:panel`
- Üretilen dosyaları depoya ekleme: `studiohub/web/panel`, `app/android`, `bin/`, `obj/`, `out/`.

Alt klasörlerdeki `CLAUDE.md` dosyaları parçaya özgü kuralları içerir.
