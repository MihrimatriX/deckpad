// Mikser sayfasının saf yardımcıları: fader eğrisi, dB yazımı, kanal listesi. React'tan bağımsız.

/** OBS'in kabul ettiği en düşük düzey; bunun altı "-∞" (sessiz) sayılır. */
export const MIN_DB = -100;
/** OBS'in kabul ettiği en yüksek kazanç. */
export const MAX_DB = 26;

/**
 * Fader konumu (0–1) → dB. Kübik eğri: kulağın duyduğuna yakın; orta nokta ≈ -18 dB, 3/4 ≈ -7,5 dB.
 * Kaydırıcı en çok 0 dB'ye çıkar; üstü OBS'in gelişmiş ses ayarlarından verilir.
 */
export function posToDb(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  if (c <= 0.001) return MIN_DB;
  return Math.max(MIN_DB, 60 * Math.log10(c));
}

/** dB → fader konumu (0–1). 0 dB üstü sona yapışır. */
export function dbToPos(db: number): number {
  if (!Number.isFinite(db) || db <= MIN_DB + 0.5) return 0;
  return Math.max(0, Math.min(1, Math.pow(10, db / 60)));
}

/** Ekranda dB: "-∞", "-12,5 dB", "0,0 dB", "+3,0 dB". */
export function formatDb(db: number | undefined): string {
  if (db === undefined) return '—';
  if (!Number.isFinite(db) || db <= MIN_DB + 0.5) return '-∞';
  const v = Math.round(db * 10) / 10;
  const s = Math.abs(v).toFixed(1).replace('.', ',');
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${s} dB`;
}

export interface MixerChannel {
  name: string;
  /** Masaüstü sesi ya da mikrofon gibi OBS'in genel ses aygıtı mı. */
  special: boolean;
}

/**
 * Mikserde gösterilecek kanallar: OBS'te sesi olan kaynaklar (sustur durumu okunabilenler).
 * Genel aygıtlar (masaüstü, mikrofon) başta; ses efektleri (tek seferlik klipler) gizlenir, onların sayfası ayrı.
 */
export function mixerChannels(
  inputs: { name: string }[],
  muted: Record<string, boolean>,
  special: Partial<Record<string, string>>,
  hidden: string[] = [],
): MixerChannel[] {
  const order = ['desktop1', 'desktop2', 'mic1', 'mic2'].map((k) => special[k]).filter((n): n is string => !!n);
  const audio = inputs.map((i) => i.name).filter((n) => n in muted && !hidden.includes(n));
  const first = order.filter((n) => audio.includes(n));
  const rest = audio.filter((n) => !first.includes(n));
  return [...first.map((name) => ({ name, special: true })), ...rest.map((name) => ({ name, special: false }))];
}
