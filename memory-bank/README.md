# Hafıza bankası: deckpad deposu

Bu klasör, projeye yeni başlayan birinin (insan ya da yapay zekâ) kodu baştan okumadan doğru yerden devam edebilmesi için yazıldı.
Depoda üç parça var: **DeckPad** (`app/`), **StudioHub** (`studiohub/`), **OBS kurulum betiği** (`obs-script/`).
Kardeş depo `MihrimatriX/camlink`: CamLink uygulaması ve CamLink OBS eklentisi. Webcam bu depoda yok (K-016).

## Okuma sırası

| # | Dosya | Ne zaman |
|---|---|---|
| 1 | [`projectbrief.md`](projectbrief.md) | Her oturumda; kapsam ve sınırlar |
| 2 | [`activeContext.md`](activeContext.md) | Her oturumda; şu an ne durumda, sıradaki iş |
| 3 | [`progress.md`](progress.md) | Her oturumda; ne doğrulandı, ne doğrulanmadı, bilinen sorunlar |
| 4 | [`systemPatterns.md`](systemPatterns.md) | Koda dokunmadan önce; dosya haritası, kalıplar, tarifler |
| 5 | [`techContext.md`](techContext.md) | Derleme/test/ortam işlerinde; sürümler, komutlar, OBS ayar bilgisi |
| 6 | [`suite-contracts.md`](suite-contracts.md) | Protokole, porta, QR'a, OBS adlarına dokunurken; **iki depoda aynı** |
| 7 | [`productContext.md`](productContext.md) | Arayüz ya da özellik kararı verirken; kullanıcı ve tasarım dili |
| 8 | [`decisions.md`](decisions.md) | "Neden böyle?" sorusunda; bir kararı değiştirmeden önce mutlaka |
| 9 | [`lessons.md`](lessons.md) | Hata ayıklarken; daha önce düşülen tuzaklar |

## Güncelleme kuralları

- **Her oturumun sonunda**: `activeContext.md` (durum, sıradaki adımlar, açık sorular) ve `progress.md` (doğrulanan/doğrulanmayan, sorunlar). Başlıktaki tarihi değiştir.
- **Mimari ya da ürün kararı** verildiğinde `decisions.md`'ye yeni bir kayıt ekle. Eski kaydı silme; "Yerini aldı: K-0xx" diye işaretle.
- **Sinsi bir hata** (bir saatten uzun süren, belirtisi nedeninden uzak) çözüldüğünde `lessons.md`'ye belirti → neden → çözüm olarak yaz.
- **Ortak protokol** değiştiğinde `suite-contracts.md`'yi iki depoda birlikte güncelle ve iki tarafın kodunu aynı değişiklikte düzelt.
- Dosya taşındıysa `systemPatterns.md`'deki haritayı düzelt. Test sayısı değiştiyse `progress.md` ve `techContext.md`'yi düzelt.
- Doğrulanmamış bir şeyi "çalışıyor" diye yazma. "Testte geçti", "gerçek OBS'te denendi", "gerçek cihazda denenmedi" gibi kanıt düzeyini belirt.

## Yazım kuralları

Türkçe, kısa, olgusal. Kullanıcının söylediği kararlar "Kullanıcı:" ile, teknik çıkarımlar gerekçesiyle yazılır. Tarihler `YYYY-AA-GG`.

## İlgili belgeler

- Kök [`README.md`](../README.md): vitrin, kurulum, geliştirme komutları.
- Alt README'ler: [`app/`](../app/README.md), [`studiohub/`](../studiohub/README.md), [`obs-script/`](../obs-script/README.md).
- Mimari belge (dört parçanın ayrıntılı tasarımı; webcam kısmı K-016'dan önceki hâli): https://claude.ai/artifact/8T9gYWmcSdAtKg3iusUf5K
