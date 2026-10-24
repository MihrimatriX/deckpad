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
s.items.Kamera[1].enabled = true;
console.log(`Sahte OBS ws://127.0.0.1:${port} üzerinde ${password ? 'şifreli' : 'şifresiz'} çalışıyor`);
