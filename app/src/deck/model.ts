// Deck veri modeli. React'tan bağımsız; web paneline aynen taşınabilir.

export type ToggleMode = 'toggle' | 'on' | 'off';

export type DeckAction =
  | { type: 'scene'; scene: string }
  | { type: 'previewScene'; scene: string }
  | { type: 'record'; mode: 'toggle' | 'start' | 'stop' }
  | { type: 'recordPause'; mode: 'toggle' | 'pause' | 'resume' }
  | { type: 'stream'; mode: 'toggle' | 'start' | 'stop' }
  | { type: 'mute'; input: string; mode: ToggleMode }
  | { type: 'volume'; input: string; db: number }
  | { type: 'sourceVisibility'; scene: string; source: string; mode: ToggleMode }
  | { type: 'filter'; source: string; filter: string; mode: ToggleMode }
  | { type: 'transition'; name: string; durationMs?: number }
  | { type: 'studioTransition' }
  | { type: 'studioMode'; mode: ToggleMode }
  | { type: 'media'; input: string; mode: 'restart' | 'playPause' | 'stop' | 'next' | 'previous' }
  | { type: 'notify'; text: string; seconds: number }
  | { type: 'replayBuffer'; mode: 'toggle' | 'start' | 'stop' }
  | { type: 'replaySave' }
  | { type: 'chapter'; name?: string }
  | { type: 'virtualCam'; mode: 'toggle' | 'start' | 'stop' }
  | { type: 'hotkey'; name: string }
  | { type: 'delay'; ms: number }
  | { type: 'page'; pageId: string }
  // Bilgisayar eylemleri: StudioHub üzerinden Windows'ta çalışır.
  | { type: 'pcKeys'; keys: string }
  | { type: 'pcText'; text: string }
  | { type: 'pcLaunch'; path: string; args?: string }
  | { type: 'pcUrl'; url: string }
  | { type: 'pcMedia'; key: 'playPause' | 'next' | 'previous' | 'stop' }
  | { type: 'pcVolume'; mode: 'up' | 'down' | 'set' | 'mute' | 'unmute' | 'toggleMute'; value?: number }
  | { type: 'pcSlide'; dir: 'next' | 'previous' | 'first' | 'last' | 'start' | 'end' | 'black' };

export type DeckActionType = DeckAction['type'];

export interface DeckButton {
  id: string;
  label: string;
  icon?: string;
  color: string;
  actions: DeckAction[];
  /** Yanlışlıkla basmayı önlemek için basılı tutmayı ister. */
  confirm?: boolean;
  /** Butonun OBS durumuna göre renk değiştirmesi (varsayılan açık). */
  showState?: boolean;
  /** Izgarada boşluk bırakmak için görünmez buton. */
  spacer?: boolean;
}

export interface DeckPage {
  id: string;
  name: string;
  cols: number;
  rows: number;
  buttons: DeckButton[];
}

export interface DeckProfile {
  version: 1;
  name: string;
  pages: DeckPage[];
  /** İlk bağlantıda OBS sahneleriyle doldurulacak sayfa; doldurulunca silinir. */
  autoScenesPageId?: string;
  /** OBS'te "Ses Efektleri" sahnesi bulununca efekt tuşlarıyla doldurulacak sayfa. */
  autoSfxPageId?: string;
}

export const isPcAction = (a: DeckAction) => a.type.startsWith('pc');

/** OBS kurulum betiğinin oluşturduğu adlar; DeckPad varsayılanları bunlarla eşleşir. */
export const OBS_NAMES = {
  sfxScene: 'Ses Efektleri',
  slideshow: 'Slayt gösterisi',
  /** Her sahnede duran boş metin kaynağı; "Ekrana yazı göster" bunu doldurup boşaltır. */
  notify: 'Bildirim',
} as const;

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Varsayılan desteden gelen özel girişler. Bağlanınca OBS'teki gerçek adla çözülür. */
export const SPECIAL_INPUTS = {
  $mic1: 'mic1',
  $mic2: 'mic2',
  $desktop1: 'desktop1',
  $desktop2: 'desktop2',
} as const;
export type SpecialInputToken = keyof typeof SPECIAL_INPUTS;

export const isSpecialToken = (s: string): s is SpecialInputToken => s in SPECIAL_INPUTS;
