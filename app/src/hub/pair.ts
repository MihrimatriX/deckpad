/**
 * StudioHub'ın eşleştirme kodu:
 * studiohub://pair?host=192.168.1.20&name=PC&hub=4466&token=..&obs=4455&pass=..&srt=9000&webcam=9100
 * Tek kodla hem OBS bağlantısı hem bilgisayar eylemleri ayarlanır.
 */
export interface PairInfo {
  host: string;
  name: string;
  hubPort: number;
  token: string;
  obsPort: number;
  obsPassword: string;
  obsSrtPort: number;
  webcamPort: number;
}

const num = (v: string | null, d: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : d;
};

export function parsePairQr(data: string): PairInfo | null {
  const text = data.trim();
  if (!/^studiohub:\/\/pair\?/i.test(text)) return null;
  const q = new URLSearchParams(text.slice(text.indexOf('?') + 1));
  const host = q.get('host');
  const token = q.get('token');
  if (!host || !token) return null;
  return {
    host,
    name: q.get('name') || host,
    hubPort: num(q.get('hub'), 4466),
    token,
    obsPort: num(q.get('obs'), 4455),
    obsPassword: q.get('pass') ?? '',
    obsSrtPort: num(q.get('srt'), 9000),
    webcamPort: num(q.get('webcam'), 9100),
  };
}
