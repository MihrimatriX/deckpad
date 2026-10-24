import type { DeckAction, DeckActionType, DeckButton } from './model';
import { isSpecialToken } from './model';

/** Eylem seçicide görünen kategoriler. */
export const ACTION_GROUPS: { title: string; types: DeckActionType[] }[] = [
  { title: 'Kayıt ve yayın', types: ['record', 'recordPause', 'stream', 'chapter', 'replaySave', 'replayBuffer', 'virtualCam'] },
  { title: 'Sahneler ve geçişler', types: ['scene', 'previewScene', 'studioTransition', 'studioMode', 'transition'] },
  { title: 'Kaynaklar ve efektler', types: ['sourceVisibility', 'filter'] },
  { title: 'Ses', types: ['mute', 'volume'] },
  { title: 'Ses efektleri ve slaytlar', types: ['media'] },
  { title: 'Bilgisayar (StudioHub)', types: ['pcSlide', 'pcKeys', 'pcMedia', 'pcVolume', 'pcLaunch', 'pcUrl', 'pcText'] },
  { title: 'Diğer', types: ['hotkey', 'delay', 'page'] },
];

type Meta = { label: string; icon: string; hint?: string; create: () => DeckAction };

export const ACTION_META: Record<DeckActionType, Meta> = {
  record: { label: 'Kayıt', icon: 'radio-button-on', create: () => ({ type: 'record', mode: 'toggle' }) },
  recordPause: {
    label: 'Kaydı duraklat',
    icon: 'pause',
    create: () => ({ type: 'recordPause', mode: 'toggle' }),
  },
  stream: { label: 'Yayın', icon: 'radio', create: () => ({ type: 'stream', mode: 'toggle' }) },
  chapter: {
    label: 'Kayda işaret koy',
    icon: 'bookmark',
    hint: 'OBS 30.2+ ve Hybrid MP4 kayıt biçimi gerekir',
    create: () => ({ type: 'chapter' }),
  },
  replaySave: {
    label: 'Son anı kaydet (Replay)',
    icon: 'refresh-circle',
    hint: 'OBS ayarlarında Replay Buffer açık olmalı',
    create: () => ({ type: 'replaySave' }),
  },
  replayBuffer: {
    label: 'Replay Buffer aç/kapat',
    icon: 'timer',
    create: () => ({ type: 'replayBuffer', mode: 'toggle' }),
  },
  virtualCam: {
    label: 'Sanal kamera',
    icon: 'videocam',
    create: () => ({ type: 'virtualCam', mode: 'toggle' }),
  },
  scene: { label: 'Sahneye geç', icon: 'albums', create: () => ({ type: 'scene', scene: '' }) },
  previewScene: {
    label: 'Önizlemeye al (Studio)',
    icon: 'eye',
    create: () => ({ type: 'previewScene', scene: '' }),
  },
  studioTransition: {
    label: 'Önizlemeyi yayına al',
    icon: 'swap-horizontal',
    hint: 'Studio Mode açıkken çalışır',
    create: () => ({ type: 'studioTransition' }),
  },
  studioMode: {
    label: 'Studio Mode',
    icon: 'tablet-landscape',
    create: () => ({ type: 'studioMode', mode: 'toggle' }),
  },
  transition: {
    label: 'Geçiş türünü seç',
    icon: 'git-compare',
    create: () => ({ type: 'transition', name: '' }),
  },
  sourceVisibility: {
    label: 'Kaynağı göster/gizle',
    icon: 'layers',
    hint: 'Logo, alt yazı, kamera gibi',
    create: () => ({ type: 'sourceVisibility', scene: '', source: '', mode: 'toggle' }),
  },
  filter: {
    label: 'Filtreyi aç/kapat',
    icon: 'color-filter',
    hint: 'Blur, renk düzeltme, chroma key',
    create: () => ({ type: 'filter', source: '', filter: '', mode: 'toggle' }),
  },
  mute: { label: 'Sesi kapat/aç', icon: 'mic', create: () => ({ type: 'mute', input: '', mode: 'toggle' }) },
  volume: {
    label: 'Ses seviyesi ayarla',
    icon: 'volume-medium',
    create: () => ({ type: 'volume', input: '', db: 0 }),
  },
  media: {
    label: 'Medya kontrolü',
    icon: 'musical-notes',
    hint: 'Ses efekti için Media Source, slayt için Image Slide Show',
    create: () => ({ type: 'media', input: '', mode: 'restart' }),
  },
  hotkey: {
    label: 'OBS kısayolunu tetikle',
    icon: 'keypad',
    create: () => ({ type: 'hotkey', name: '' }),
  },
  delay: { label: 'Bekle', icon: 'hourglass', create: () => ({ type: 'delay', ms: 500 }) },
  page: { label: 'Sayfaya git', icon: 'documents', create: () => ({ type: 'page', pageId: '' }) },
  pcSlide: {
    label: 'Sunum kontrolü',
    icon: 'easel',
    hint: 'PowerPoint açıksa onu, değilse öndeki pencereyi (tarayıcıda slayt, PDF) yönetir',
    create: () => ({ type: 'pcSlide', dir: 'next' }),
  },
  pcKeys: {
    label: 'Klavye kısayolu',
    icon: 'keypad',
    hint: 'Bilgisayarda öndeki uygulamaya tuş gönderir, ör. Ctrl+Shift+M',
    create: () => ({ type: 'pcKeys', keys: '' }),
  },
  pcMedia: {
    label: 'Müzik ve video',
    icon: 'play-skip-forward',
    hint: 'Spotify, YouTube gibi uygulamalar için medya tuşları',
    create: () => ({ type: 'pcMedia', key: 'playPause' }),
  },
  pcVolume: {
    label: 'Bilgisayar sesi',
    icon: 'volume-high',
    hint: 'Windows ana ses düzeyi',
    create: () => ({ type: 'pcVolume', mode: 'up', value: 5 }),
  },
  pcLaunch: {
    label: 'Uygulama ya da dosya aç',
    icon: 'open',
    create: () => ({ type: 'pcLaunch', path: '' }),
  },
  pcUrl: { label: 'Web sayfası aç', icon: 'globe', create: () => ({ type: 'pcUrl', url: 'https://' }) },
  pcText: {
    label: 'Metin yaz',
    icon: 'text',
    hint: 'Hazır mesajlar, e-posta imzası, sohbet cevapları',
    create: () => ({ type: 'pcText', text: '' }),
  },
};

export const PC_SLIDE_LABELS: Record<string, string> = {
  next: 'Sonraki slayt',
  previous: 'Önceki slayt',
  first: 'İlk slayt',
  last: 'Son slayt',
  start: 'Sunumu başlat',
  end: 'Sunumu bitir',
  black: 'Siyah ekran',
};

export const PC_MEDIA_LABELS: Record<string, string> = {
  playPause: 'Oynat/duraklat',
  next: 'Sonraki parça',
  previous: 'Önceki parça',
  stop: 'Durdur',
};

export const PC_VOLUME_LABELS: Record<string, string> = {
  up: 'Sesi artır',
  down: 'Sesi azalt',
  set: 'Düzeye ayarla',
  toggleMute: 'Sessiz aç/kapat',
  mute: 'Sessize al',
  unmute: 'Sesi aç',
};

export const MODE_LABELS: Record<string, string> = {
  toggle: 'Aç/kapat',
  start: 'Başlat',
  stop: 'Durdur',
  pause: 'Duraklat',
  resume: 'Devam ettir',
  on: 'Aç',
  off: 'Kapat',
  restart: 'Baştan oynat',
  playPause: 'Oynat/duraklat',
  next: 'Sonraki',
  previous: 'Önceki',
};

export const SPECIAL_INPUT_LABELS: Record<string, string> = {
  $mic1: 'Mikrofon (OBS varsayılanı)',
  $mic2: 'Mikrofon 2 (OBS varsayılanı)',
  $desktop1: 'Masaüstü sesi (OBS varsayılanı)',
  $desktop2: 'Masaüstü sesi 2 (OBS varsayılanı)',
};

export const inputLabel = (name: string) => (isSpecialToken(name) ? SPECIAL_INPUT_LABELS[name] : name);

/** Eylem satırında gösterilen kısa açıklama. */
export function describeAction(a: DeckAction, pageName: (id: string) => string): string {
  const m = (mode: string) => MODE_LABELS[mode] ?? mode;
  const missing = '— seçilmedi —';
  switch (a.type) {
    case 'scene':
      return `Sahne: ${a.scene || missing}`;
    case 'previewScene':
      return `Önizleme: ${a.scene || missing}`;
    case 'record':
      return `Kayıt: ${m(a.mode)}`;
    case 'recordPause':
      return `Kayıt duraklatma: ${m(a.mode)}`;
    case 'stream':
      return `Yayın: ${m(a.mode)}`;
    case 'mute':
      return `${a.input ? inputLabel(a.input) : missing}: ${a.mode === 'on' ? 'Sustur' : a.mode === 'off' ? 'Sesi aç' : 'Sustur/aç'}`;
    case 'volume':
      return `${a.input ? inputLabel(a.input) : missing}: ${a.db} dB`;
    case 'sourceVisibility':
      return `${a.source || missing} (${a.scene || missing}): ${m(a.mode)}`;
    case 'filter':
      return `${a.filter || missing} @ ${a.source || missing}: ${m(a.mode)}`;
    case 'transition':
      return `Geçiş: ${a.name || missing}${a.durationMs ? ` · ${a.durationMs} ms` : ''}`;
    case 'studioTransition':
      return 'Önizlemeyi yayına al';
    case 'studioMode':
      return `Studio Mode: ${m(a.mode)}`;
    case 'media':
      return `${a.input || missing}: ${m(a.mode)}`;
    case 'replayBuffer':
      return `Replay Buffer: ${m(a.mode)}`;
    case 'replaySave':
      return 'Replay kaydet';
    case 'chapter':
      return `İşaret koy${a.name ? `: ${a.name}` : ''}`;
    case 'virtualCam':
      return `Sanal kamera: ${m(a.mode)}`;
    case 'hotkey':
      return `Kısayol: ${a.name || missing}`;
    case 'delay':
      return `Bekle ${a.ms} ms`;
    case 'page':
      return `Sayfa: ${a.pageId ? pageName(a.pageId) : missing}`;
    case 'pcKeys':
      return `Kısayol: ${a.keys || missing}`;
    case 'pcText':
      return `Yaz: ${a.text ? (a.text.length > 28 ? a.text.slice(0, 28) + '…' : a.text) : missing}`;
    case 'pcLaunch':
      return `Aç: ${a.path ? a.path.split(/[\\/]/).pop() : missing}`;
    case 'pcUrl':
      return `Web: ${a.url.replace(/^https?:\/\//, '') || missing}`;
    case 'pcMedia':
      return PC_MEDIA_LABELS[a.key] ?? a.key;
    case 'pcVolume':
      return a.mode === 'set' ? `Ses %${a.value ?? 50}` : a.mode === 'up' || a.mode === 'down' ? `${PC_VOLUME_LABELS[a.mode]} (%${a.value ?? 5})` : PC_VOLUME_LABELS[a.mode];
    case 'pcSlide':
      return PC_SLIDE_LABELS[a.dir] ?? a.dir;
  }
}

/** Ayarlanmamış alan varsa true döner; butonda uyarı simgesi gösterilir. */
export function actionIncomplete(a: DeckAction): boolean {
  switch (a.type) {
    case 'scene':
    case 'previewScene':
      return !a.scene;
    case 'mute':
    case 'volume':
    case 'media':
      return !a.input;
    case 'sourceVisibility':
      return !a.scene || !a.source;
    case 'filter':
      return !a.source || !a.filter;
    case 'transition':
      return !a.name;
    case 'hotkey':
      return !a.name;
    case 'page':
      return !a.pageId;
    case 'pcKeys':
      return !a.keys.trim();
    case 'pcText':
      return !a.text;
    case 'pcLaunch':
      return !a.path.trim();
    case 'pcUrl':
      return !/^https?:\/\/.+/.test(a.url);
    default:
      return false;
  }
}

export const buttonIncomplete = (b: DeckButton) => !b.spacer && b.actions.some(actionIncomplete);

/** Buton düzenleyicide seçilebilir ikonlar (Ionicons). */
export const ICONS = [
  'radio-button-on', 'pause', 'play', 'stop', 'radio', 'videocam', 'videocam-off', 'camera',
  'mic', 'mic-off', 'volume-high', 'volume-mute', 'headset', 'musical-notes', 'musical-note', 'megaphone',
  'albums', 'layers', 'image', 'images', 'tv', 'desktop', 'laptop', 'tablet-landscape',
  'eye', 'eye-off', 'color-filter', 'color-palette', 'sparkles', 'flash', 'contrast', 'sunny',
  'swap-horizontal', 'git-compare', 'shuffle', 'repeat', 'refresh-circle', 'timer', 'hourglass', 'alarm',
  'bookmark', 'flag', 'star', 'heart', 'thumbs-up', 'happy', 'chatbubbles', 'text',
  'arrow-forward', 'arrow-back', 'chevron-forward', 'chevron-back', 'home', 'documents', 'keypad', 'game-controller',
  'cafe', 'moon', 'hand-left', 'notifications', 'code-slash', 'terminal', 'globe', 'logo-youtube',
  'easel', 'play-skip-forward', 'play-skip-back', 'volume-low', 'open', 'mail', 'cut', 'copy',
] as const;
