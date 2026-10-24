import { buttonColors } from '../theme';
import { newId, OBS_NAMES, type DeckButton, type DeckPage, type DeckProfile } from './model';

const btn = (b: Omit<DeckButton, 'id'>): DeckButton => ({ id: newId(), ...b });

export function defaultProfile(): DeckProfile {
  const scenesId = newId();
  const sfxId = newId();
  const slidesId = newId();
  const pcId = newId();
  const homeId = newId();

  const home: DeckPage = {
    id: homeId,
    name: 'Ana',
    cols: 4,
    rows: 4,
    buttons: [
      btn({ label: 'Kayıt', icon: 'radio-button-on', color: '#C0283A', actions: [{ type: 'record', mode: 'toggle' }] }),
      btn({ label: 'Duraklat', icon: 'pause', color: '#B07A12', actions: [{ type: 'recordPause', mode: 'toggle' }] }),
      btn({
        label: 'Yayın',
        icon: 'radio',
        color: '#B8236B',
        confirm: true,
        actions: [{ type: 'stream', mode: 'toggle' }],
      }),
      btn({ label: 'İşaret', icon: 'bookmark', color: buttonColors[0], actions: [{ type: 'chapter' }] }),
      btn({ label: 'Mikrofon', icon: 'mic', color: buttonColors[0], actions: [{ type: 'mute', input: '$mic1', mode: 'toggle' }] }),
      btn({
        label: 'Masaüstü',
        icon: 'volume-high',
        color: buttonColors[0],
        actions: [{ type: 'mute', input: '$desktop1', mode: 'toggle' }],
      }),
      btn({ label: 'Replay', icon: 'refresh-circle', color: buttonColors[0], actions: [{ type: 'replaySave' }] }),
      btn({ label: 'Sanal kamera', icon: 'videocam', color: buttonColors[0], actions: [{ type: 'virtualCam', mode: 'toggle' }] }),
      btn({ label: 'Studio', icon: 'tablet-landscape', color: '#1A3FA6', actions: [{ type: 'studioMode', mode: 'toggle' }] }),
      btn({ label: 'Yayına al', icon: 'swap-horizontal', color: '#1A3FA6', actions: [{ type: 'studioTransition' }] }),
      btn({ label: 'Sahneler', icon: 'albums', color: '#0F7891', actions: [{ type: 'page', pageId: scenesId }] }),
      btn({ label: 'Ses efektleri', icon: 'musical-notes', color: '#6D3BE0', actions: [{ type: 'page', pageId: sfxId }] }),
      btn({ label: 'Slaytlar', icon: 'images', color: '#0E8072', actions: [{ type: 'page', pageId: slidesId }] }),
      btn({ label: 'Bilgisayar', icon: 'desktop', color: '#3A4660', actions: [{ type: 'page', pageId: pcId }] }),
    ],
  };

  const back = (): DeckButton =>
    btn({ label: 'Ana sayfa', icon: 'home', color: '#3A4660', showState: false, actions: [{ type: 'page', pageId: homeId }] });

  return {
    version: 1,
    name: 'Varsayılan',
    autoScenesPageId: scenesId,
    autoSfxPageId: sfxId,
    pages: [
      home,
      // Bağlanınca OBS'teki sahnelerle otomatik dolar.
      { id: scenesId, name: 'Sahneler', cols: 3, rows: 4, buttons: [back()] },
      {
        id: sfxId,
        name: 'Ses efektleri',
        cols: 3,
        rows: 4,
        buttons: [back()],
      },
      {
        id: slidesId,
        name: 'Slaytlar',
        cols: 2,
        rows: 3,
        buttons: [
          back(),
          btn({
            label: 'Önceki',
            icon: 'chevron-back',
            color: '#0E8072',
            actions: [{ type: 'media', input: OBS_NAMES.slideshow, mode: 'previous' }],
          }),
          btn({
            label: 'Sonraki',
            icon: 'chevron-forward',
            color: '#0E8072',
            actions: [{ type: 'media', input: OBS_NAMES.slideshow, mode: 'next' }],
          }),
          btn({ label: 'Slaytlara geç', icon: 'images', color: '#1A3FA6', actions: [{ type: 'scene', scene: 'Slaytlar' }] }),
        ],
      },
      {
        // StudioHub ile eşleşince çalışır: sunum, medya, ses ve kısayollar.
        id: pcId,
        name: 'Bilgisayar',
        cols: 4,
        rows: 3,
        buttons: [
          back(),
          btn({ label: 'Önceki slayt', icon: 'chevron-back', color: '#0F7891', actions: [{ type: 'pcSlide', dir: 'previous' }] }),
          btn({ label: 'Sonraki slayt', icon: 'chevron-forward', color: '#0F7891', actions: [{ type: 'pcSlide', dir: 'next' }] }),
          btn({ label: 'Sunumu başlat', icon: 'easel', color: '#1A3FA6', actions: [{ type: 'pcSlide', dir: 'start' }] }),
          btn({ label: 'Oynat', icon: 'play', color: '#16834A', actions: [{ type: 'pcMedia', key: 'playPause' }] }),
          btn({ label: 'Sonraki parça', icon: 'play-skip-forward', color: '#16834A', actions: [{ type: 'pcMedia', key: 'next' }] }),
          btn({ label: 'Ses −', icon: 'volume-low', color: buttonColors[0], actions: [{ type: 'pcVolume', mode: 'down', value: 5 }] }),
          btn({ label: 'Ses +', icon: 'volume-high', color: buttonColors[0], actions: [{ type: 'pcVolume', mode: 'up', value: 5 }] }),
          btn({ label: 'Sessiz', icon: 'volume-mute', color: '#C0283A', actions: [{ type: 'pcVolume', mode: 'toggleMute' }] }),
          btn({ label: 'Siyah ekran', icon: 'moon', color: '#3A4660', actions: [{ type: 'pcSlide', dir: 'black' }] }),
          btn({ label: 'Ekran alıntısı', icon: 'cut', color: '#6D3BE0', actions: [{ type: 'pcKeys', keys: 'Win+Shift+S' }] }),
          btn({ label: 'Masaüstü', icon: 'desktop', color: '#6D3BE0', actions: [{ type: 'pcKeys', keys: 'Win+D' }] }),
        ],
      },
    ],
  };
}

/** OBS'teki "Ses Efektleri" sahnesindeki kaynaklardan baştan oynatma tuşları üretir. */
export function sfxButtons(names: string[]): DeckButton[] {
  const colors = ['#6D3BE0', '#B8236B', '#C4501A', '#B07A12', '#0E8072', '#2457D6'];
  return [...names].sort((a, b) => a.localeCompare(b, 'tr')).map((name, i) =>
    btn({
      label: name,
      icon: 'musical-notes',
      color: colors[i % colors.length],
      showState: false,
      actions: [{ type: 'media', input: name, mode: 'restart' }],
    }),
  );
}

/** OBS'teki sahnelerden buton listesi üretir. Yardımcı "Ses Efektleri" sahnesi atlanır. */
export function sceneButtons(scenes: string[]): DeckButton[] {
  return scenes.filter((s) => s !== OBS_NAMES.sfxScene).map((scene, i) =>
    btn({
      label: scene,
      icon: 'albums',
      color: i % 2 ? '#1A3FA6' : '#1B2D55',
      actions: [{ type: 'scene', scene }],
    }),
  );
}

/** Ses kaynaklarından susturma butonları üretir. */
export function muteButtons(inputs: string[]): DeckButton[] {
  return inputs.map((input) =>
    btn({ label: input, icon: 'mic', color: buttonColors[0], actions: [{ type: 'mute', input, mode: 'toggle' }] }),
  );
}
