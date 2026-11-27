import { create } from 'zustand';

// Canlı ses ölçerleri. OBS saniyede ~20 kez yollar; ana durum deposunu (useObs) her seferinde
// değiştirmemek için ayrı, küçük bir depoda tutulur: yalnız ölçer çubukları buna abone olur.

/** Ölçerin alt sınırı; OBS'in mikser ölçeri de -60 dB'den başlar. */
export const METER_FLOOR_DB = -60;
/** Tepe göstergesinin düşme hızı (dB/s). */
const HOLD_FALL_DB_PER_S = 20;

export interface MeterChannel {
  /** Anlık düzey (dBFS, en az METER_FLOOR_DB). */
  level: number;
  /** Bir süre tutulan tepe değeri; yavaşça düşer. */
  hold: number;
}

export const useMeters = create<{ levels: Record<string, MeterChannel[]> }>(() => ({ levels: {} }));

const toDb = (mul: number) => (mul > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(mul)) : METER_FLOOR_DB);

/**
 * OBS'in `inputLevelsMul` dizisinden (kanal başına [büyüklük, tepe, giriş tepesi], çarpan) ölçer değeri üretir.
 * En çok iki kanal tutulur (stereo); tepe göstergesi `dtMs` içinde HOLD_FALL_DB_PER_S hızıyla düşer.
 */
export function nextMeter(prev: MeterChannel[] | undefined, levelsMul: number[][], dtMs: number): MeterChannel[] {
  const fall = (HOLD_FALL_DB_PER_S * Math.max(0, dtMs)) / 1000;
  return levelsMul.slice(0, 2).map((ch, i) => {
    const level = toDb(ch?.[0] ?? 0);
    const peak = toDb(ch?.[1] ?? ch?.[0] ?? 0);
    const before = prev?.[i]?.hold ?? METER_FLOOR_DB;
    return { level, hold: Math.max(peak, before - fall, METER_FLOOR_DB) };
  });
}

/** dB → ölçer çubuğundaki konum (0–1), dB'de doğrusal. */
export const meterPos = (db: number) => Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));

let lastAt = 0;

/** OBS'in InputVolumeMeters olayını depoya işler. */
export function applyMeters(inputs: { inputName: string; inputLevelsMul: number[][] }[], now = Date.now()) {
  const dt = lastAt ? now - lastAt : 0;
  lastAt = now;
  const prev = useMeters.getState().levels;
  const levels: Record<string, MeterChannel[]> = {};
  for (const i of inputs) levels[i.inputName] = nextMeter(prev[i.inputName], i.inputLevelsMul ?? [], dt);
  useMeters.setState({ levels });
}

export function clearMeters() {
  lastAt = 0;
  useMeters.setState({ levels: {} });
}
