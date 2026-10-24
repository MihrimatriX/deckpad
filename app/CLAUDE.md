# DeckPad (app/)

Telefonu OBS için Stream Deck'e çeviren Expo/React Native uygulaması; aynı kod StudioHub'ın masaüstü ve OBS paneli olarak web'e derlenir.
Mimari ve tarifler: `../memory-bank/systemPatterns.md` › DeckPad.

@AGENTS.md

- Expo paketlerini `npx expo install` ile ekle; `android/` ve `ios/` üretilir, elle düzenleme.
- zustand seçicisi yeni nesne döndürüyorsa `useShallow`.
- Yeni eylem türü: model.ts → actions.ts → ActionEditor → run.ts → test (bkz. tarifler). Bilgisayar eylemi StudioHub'da da değişiklik ister.
- Kontroller: `npm run typecheck && npm test`. Panel etkileniyorsa `npm run export:panel`.
- `npx expo prebuild` sonrası package.json `scripts`'ini kontrol et (test, typecheck, export:panel).
