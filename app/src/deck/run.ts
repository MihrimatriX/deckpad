import { hubClient, type PcAction } from '../hub/client';
import { obsClient, type BatchResult } from '../obs/client';
import { filterKey, itemKey, useObs, type ObsState } from '../obs/store';
import { isPcAction, OBS_NAMES, type DeckAction, type DeckButton } from './model';

type Req = { requestType: string; requestData?: Record<string, unknown> };

const MEDIA = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_';

export interface RunContext {
  goToPage: (pageId: string) => void;
}

/**
 * Butonun eylemlerini sırayla çalıştırır.
 * Ardışık OBS istekleri tek bir RequestBatch ile gider; "bekle" adımı OBS'in Sleep isteğine dönüşür.
 * Durum okuması gereken toggle'lar önce mevcut durumu bulur, sonra kesin Set isteği üretir.
 */
export async function runButton(button: DeckButton, ctx: RunContext): Promise<string[]> {
  const errors: string[] = [];
  let batch: Req[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const sent = batch;
    batch = [];
    const results: BatchResult[] = await obsClient.batch(sent, false);
    results.forEach((r) => {
      if (!r.requestStatus.result) errors.push(r.requestStatus.comment || `${r.requestType} başarısız`);
    });
  };

  for (const action of button.actions) {
    try {
      if (action.type === 'page') {
        await flush();
        if (action.pageId) ctx.goToPage(action.pageId);
        continue;
      }
      if (isPcAction(action)) {
        // Sıra korunur: önce birikmiş OBS istekleri, sonra bilgisayar eylemi.
        await flush();
        const r = await hubClient.run(toPcAction(action));
        if (!r.ok) errors.push(r.message ?? 'Bilgisayar eylemi başarısız');
        continue;
      }
      if (action.type === 'delay' && !batch.length) {
        // Bilgisayar eylemlerinden sonra beklemek için OBS'e gerek yok.
        await new Promise((res) => setTimeout(res, Math.max(0, Math.min(action.ms, 50000))));
        continue;
      }
      const reqs = await toRequests(action, useObs.getState());
      batch.push(...reqs);
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
    }
  }
  try {
    await flush();
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
  }
  return errors;
}

/** Deste eylemini StudioHub'ın beklediği biçime çevirir. */
export function toPcAction(a: DeckAction): PcAction {
  switch (a.type) {
    case 'pcKeys':
      return { op: 'keys', keys: a.keys };
    case 'pcText':
      return { op: 'text', text: a.text };
    case 'pcLaunch':
      return { op: 'launch', path: a.path, args: a.args };
    case 'pcUrl':
      return { op: 'url', url: a.url };
    case 'pcMedia':
      return { op: 'media', key: a.key };
    case 'pcVolume':
      return { op: 'volume', mode: a.mode, value: a.value };
    case 'pcSlide':
      return { op: 'slide', dir: a.dir };
    default:
      throw new Error(`${a.type} bir bilgisayar eylemi değil`);
  }
}

const pick = <T>(mode: string, map: Record<string, T>): T => {
  const v = map[mode];
  if (v === undefined) throw new Error(`Bilinmeyen mod: ${mode}`);
  return v;
};

async function toRequests(a: DeckAction, s: ObsState): Promise<Req[]> {
  switch (a.type) {
    case 'scene':
      return [{ requestType: 'SetCurrentProgramScene', requestData: { sceneName: a.scene } }];
    case 'previewScene':
      return [{ requestType: 'SetCurrentPreviewScene', requestData: { sceneName: a.scene } }];
    case 'record':
      return [{ requestType: pick(a.mode, { toggle: 'ToggleRecord', start: 'StartRecord', stop: 'StopRecord' }) }];
    case 'recordPause':
      return [
        { requestType: pick(a.mode, { toggle: 'ToggleRecordPause', pause: 'PauseRecord', resume: 'ResumeRecord' }) },
      ];
    case 'stream':
      return [{ requestType: pick(a.mode, { toggle: 'ToggleStream', start: 'StartStream', stop: 'StopStream' }) }];
    case 'mute': {
      const inputName = obsClient.resolveInput(a.input);
      if (a.mode === 'toggle') return [{ requestType: 'ToggleInputMute', requestData: { inputName } }];
      return [{ requestType: 'SetInputMute', requestData: { inputName, inputMuted: a.mode === 'on' } }];
    }
    case 'volume':
      return [
        {
          requestType: 'SetInputVolume',
          requestData: { inputName: obsClient.resolveInput(a.input), inputVolumeDb: a.db },
        },
      ];
    case 'sourceVisibility': {
      const sceneItemId = await obsClient.sceneItemId(a.scene, a.source);
      let enabled: boolean;
      if (a.mode === 'toggle') {
        const known = s.sceneItems[itemKey(a.scene, a.source)];
        const current =
          known ??
          (await obsClient.call<{ sceneItemEnabled: boolean }>('GetSceneItemEnabled', {
            sceneName: a.scene,
            sceneItemId,
          })).sceneItemEnabled;
        enabled = !current;
      } else enabled = a.mode === 'on';
      return [
        {
          requestType: 'SetSceneItemEnabled',
          requestData: { sceneName: a.scene, sceneItemId, sceneItemEnabled: enabled },
        },
      ];
    }
    case 'filter': {
      const sourceName = obsClient.resolveInput(a.source);
      let enabled: boolean;
      if (a.mode === 'toggle') {
        const known = s.filters[filterKey(sourceName, a.filter)];
        const current =
          known ??
          (await obsClient.call<{ filterEnabled: boolean }>('GetSourceFilter', {
            sourceName,
            filterName: a.filter,
          })).filterEnabled;
        enabled = !current;
      } else enabled = a.mode === 'on';
      return [
        {
          requestType: 'SetSourceFilterEnabled',
          requestData: { sourceName, filterName: a.filter, filterEnabled: enabled },
        },
      ];
    }
    case 'transition': {
      const reqs: Req[] = [{ requestType: 'SetCurrentSceneTransition', requestData: { transitionName: a.name } }];
      if (a.durationMs && a.durationMs >= 50)
        reqs.push({
          requestType: 'SetCurrentSceneTransitionDuration',
          requestData: { transitionDuration: Math.min(a.durationMs, 20000) },
        });
      return reqs;
    }
    case 'studioTransition':
      return [{ requestType: 'TriggerStudioModeTransition' }];
    case 'studioMode': {
      const enabled = a.mode === 'toggle' ? !s.studioMode : a.mode === 'on';
      return [{ requestType: 'SetStudioModeEnabled', requestData: { studioModeEnabled: enabled } }];
    }
    case 'media': {
      const inputName = obsClient.resolveInput(a.input);
      let action: string;
      if (a.mode === 'playPause') {
        const st = await obsClient.call<{ mediaState: string }>('GetMediaInputStatus', { inputName });
        if (st.mediaState === 'OBS_MEDIA_STATE_PLAYING') action = 'PAUSE';
        else if (st.mediaState === 'OBS_MEDIA_STATE_PAUSED') action = 'PLAY';
        else action = 'RESTART';
      } else {
        action = pick(a.mode, { restart: 'RESTART', stop: 'STOP', next: 'NEXT', previous: 'PREVIOUS' });
      }
      return [{ requestType: 'TriggerMediaInputAction', requestData: { inputName, mediaAction: MEDIA + action } }];
    }
    case 'notify': {
      // ponytail: üst üste basılınca öncekinin silme adımı yenisini erken siler; sıra gerekirse kuyruk ekle.
      const text = (t: string) => ({ requestType: 'SetInputSettings', requestData: { inputName: OBS_NAMES.notify, inputSettings: { text: t } } });
      return [text(a.text), { requestType: 'Sleep', requestData: { sleepMillis: Math.min(a.seconds, 50) * 1000 } }, text('')];
    }
    case 'replayBuffer':
      return [
        {
          requestType: pick(a.mode, {
            toggle: 'ToggleReplayBuffer',
            start: 'StartReplayBuffer',
            stop: 'StopReplayBuffer',
          }),
        },
      ];
    case 'replaySave':
      return [{ requestType: 'SaveReplayBuffer' }];
    case 'chapter':
      return [{ requestType: 'CreateRecordChapter', requestData: a.name ? { chapterName: a.name } : {} }];
    case 'virtualCam':
      return [
        { requestType: pick(a.mode, { toggle: 'ToggleVirtualCam', start: 'StartVirtualCam', stop: 'StopVirtualCam' }) },
      ];
    case 'hotkey':
      return [{ requestType: 'TriggerHotkeyByName', requestData: { hotkeyName: a.name } }];
    case 'delay':
      return [{ requestType: 'Sleep', requestData: { sleepMillis: Math.max(0, Math.min(a.ms, 50000)) } }];
    case 'page':
      return [];
    default:
      return [];
  }
}

// ---------- Butonun canlı durumu ----------

export type Tone = 'accent' | 'live' | 'warning' | 'success';
export interface ButtonState {
  active: boolean;
  tone?: Tone;
  sub?: string;
  iconOverride?: string;
}

const OFF_ICONS: Record<string, string> = {
  mic: 'mic-off',
  'volume-high': 'volume-mute',
  'volume-medium': 'volume-mute',
  videocam: 'videocam-off',
  eye: 'eye-off',
};

export function buttonState(b: DeckButton, s: ObsState): ButtonState {
  const none: ButtonState = { active: false };
  if (b.showState === false || b.spacer || s.status !== 'connected') return none;
  const a = b.actions.find((x) => x.type !== 'delay');
  if (!a) return none;
  switch (a.type) {
    case 'record':
      if (!s.record.active) return none;
      return s.record.paused
        ? { active: true, tone: 'warning', sub: `DURAKLATILDI ${s.record.timecode ?? ''}`.trim() }
        : { active: true, tone: 'live', sub: s.record.timecode ?? 'KAYIT' };
    case 'recordPause':
      return s.record.paused ? { active: true, tone: 'warning', sub: 'DURAKLATILDI', iconOverride: 'play' } : none;
    case 'stream':
      return s.stream.active ? { active: true, tone: 'live', sub: s.stream.timecode ?? 'CANLI' } : none;
    case 'scene':
      if (s.programScene === a.scene) return { active: true, tone: 'live', sub: 'YAYINDA' };
      if (s.studioMode && s.previewScene === a.scene) return { active: true, tone: 'success', sub: 'ÖNİZLEME' };
      return none;
    case 'previewScene':
      if (s.studioMode && s.previewScene === a.scene) return { active: true, tone: 'success', sub: 'ÖNİZLEME' };
      if (s.programScene === a.scene) return { active: true, tone: 'live', sub: 'YAYINDA' };
      return none;
    case 'mute': {
      let name: string;
      try {
        name = obsClient.resolveInput(a.input);
      } catch {
        return none;
      }
      const muted = s.muted[name];
      if (muted === undefined) return none;
      return muted
        ? { active: true, tone: 'live', sub: 'KAPALI', iconOverride: b.icon ? OFF_ICONS[b.icon] : undefined }
        : { active: false };
    }
    case 'sourceVisibility': {
      const v = s.sceneItems[itemKey(a.scene, a.source)];
      if (v === undefined) return none;
      return v ? { active: true, tone: 'accent', sub: 'GÖRÜNÜR' } : { active: false, iconOverride: b.icon ? OFF_ICONS[b.icon] : undefined };
    }
    case 'filter': {
      let src: string;
      try {
        src = obsClient.resolveInput(a.source);
      } catch {
        return none;
      }
      return s.filters[filterKey(src, a.filter)] ? { active: true, tone: 'accent', sub: 'AÇIK' } : none;
    }
    case 'studioMode':
      return s.studioMode ? { active: true, tone: 'accent', sub: 'AÇIK' } : none;
    case 'replayBuffer':
      return s.replayBuffer.active ? { active: true, tone: 'accent', sub: 'AÇIK' } : none;
    case 'virtualCam':
      return s.virtualCam ? { active: true, tone: 'accent', sub: 'AÇIK' } : none;
    case 'transition':
      return s.currentTransition === a.name ? { active: true, tone: 'accent', sub: 'SEÇİLİ' } : none;
    default:
      return none;
  }
}

/** Durumu OBS'ten okunması gereken bağlamaları toplar. */
export function collectBindings(buttons: DeckButton[]) {
  const items: { scene: string; source: string }[] = [];
  const filters: { source: string; filter: string }[] = [];
  for (const b of buttons) {
    if (b.showState === false) continue;
    const a = b.actions.find((x) => x.type !== 'delay');
    if (a?.type === 'sourceVisibility' && a.scene && a.source) items.push({ scene: a.scene, source: a.source });
    if (a?.type === 'filter' && a.source && a.filter) {
      try {
        filters.push({ source: obsClient.resolveInput(a.source), filter: a.filter });
      } catch {}
    }
  }
  return { items, filters };
}
