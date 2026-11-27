// Ekran görüntüsü ve elle deneme için sahte OBS'i çalıştırır: npx tsx test/serve-mock.ts [port] [şifre]
import { MockObs } from './mock-obs';

const port = Number(process.argv[2] ?? 4455);
const password = process.argv[3] ?? '';
const obs = new MockObs(port, password);
const s = obs.state;
// Gerçekçi bir yayın anı: kayıt 12 dakikadır sürüyor, mikrofon kapalı, logo görünür.
s.scenes = ['Başlıyoruz', 'Kamera', 'Oyun', 'Ekran + Kamera', 'Ara', 'Kapanış'];
for (const sc of s.scenes) s.items[sc] ??= [];
s.record.active = true;
obs.recordStartedAt = Date.now() - (12 * 60 + 47) * 1000;
s.stream.active = true;
obs.streamStartedAt = Date.now() - (34 * 60 + 5) * 1000;
s.inputs[0].muted = true;
// Mikser sayfası için gerçekçi düzeyler.
s.inputs[0].db = -4.5;
s.inputs[1].db = -12;
s.inputs[2].db = -20;
s.items.Kamera[1].enabled = true;
console.log(`Sahte OBS ws://127.0.0.1:${port} üzerinde ${password ? 'şifreli' : 'şifresiz'} çalışıyor`);

// Mikser ölçerleri: konuşma benzeri dalgalanan düzeyler (yalnız mikser açıkken abone olunur).
const t0 = Date.now();
setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  const wave = (f: number, base: number) => Math.max(0, base * (0.55 + 0.45 * Math.sin(t * f)) * (0.8 + 0.2 * Math.random()));
  obs.emitMeters(
    s.inputs
      .filter((i) => i.audio)
      .map((i, k) => {
        const m = i.muted ? 0 : wave(2.3 + k, [0.5, 0.35, 0.2][k] ?? 0.2);
        return { inputName: i.name, inputLevelsMul: [[m, Math.min(1, m * 1.3), m], [m * 0.9, Math.min(1, m * 1.2), m]] };
      }),
  );
}, 50);
