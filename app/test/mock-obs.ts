// obs-websocket v5 protokolünü taklit eden küçük sunucu. Gerçek OBS olmadan istemciyi test etmek için.
import { createHash, randomBytes } from 'node:crypto';
import WebSocket from 'ws';

// ws 7 ve 8 farklı dışa aktarım kullanıyor; ikisini de destekle.
const WebSocketServer: any = (WebSocket as any).Server ?? (WebSocket as any).WebSocketServer;

const b64sha = (s: string) => createHash('sha256').update(s).digest('base64');

export interface MockState {
  programScene: string;
  previewScene: string;
  studioMode: boolean;
  scenes: string[]; // OBS arayüzündeki sıra (üstten alta)
  inputs: { name: string; kind: string; audio: boolean; muted: boolean; media?: string }[];
  special: Record<string, string | null>;
  record: { active: boolean; paused: boolean };
  stream: { active: boolean; bytes: number };
  items: Record<string, { id: number; source: string; enabled: boolean }[]>;
  filters: Record<string, { name: string; enabled: boolean }[]>;
  transitions: string[];
  currentTransition: string;
}

export function defaultMockState(): MockState {
  return {
    programScene: 'Kamera',
    previewScene: 'Oyun',
    studioMode: false,
    scenes: ['Başlıyoruz', 'Kamera', 'Oyun'],
    inputs: [
      { name: 'Mic/Aux', kind: 'wasapi_input_capture', audio: true, muted: false },
      { name: 'Desktop Audio', kind: 'wasapi_output_capture', audio: true, muted: false },
      { name: 'Alkış', kind: 'ffmpeg_source', audio: true, muted: false, media: 'OBS_MEDIA_STATE_ENDED' },
      { name: 'Slaytlar', kind: 'slideshow', audio: false, muted: false, media: 'OBS_MEDIA_STATE_PLAYING' },
      { name: 'Webcam', kind: 'dshow_input', audio: false, muted: false },
    ],
    special: { desktop1: 'Desktop Audio', desktop2: null, mic1: 'Mic/Aux', mic2: null },
    record: { active: false, paused: false },
    stream: { active: false, bytes: 0 },
    items: {
      Kamera: [
        { id: 3, source: 'Webcam', enabled: true },
        { id: 5, source: 'Logo', enabled: false },
      ],
      Oyun: [{ id: 1, source: 'Webcam', enabled: false }],
      Başlıyoruz: [],
    },
    filters: { Webcam: [{ name: 'Blur', enabled: false }] },
    transitions: ['Fade', 'Cut', 'Stinger'],
    currentTransition: 'Fade',
  };
}

const tc = (since: number) => {
  const ms = Date.now() - since;
  const p = (n: number) => String(Math.floor(n)).padStart(2, '0');
  return `${p(ms / 3600000)}:${p((ms / 60000) % 60)}:${p((ms / 1000) % 60)}.${String(ms % 1000).padStart(3, '0')}`;
};

export class MockObs {
  wss: any;
  state = defaultMockState();
  /** Gelen tüm istekler (batch içindekiler dahil) sırasıyla. */
  log: { type: string; data?: any }[] = [];
  recordStartedAt = Date.now();
  streamStartedAt = Date.now();
  private clients = new Set<WebSocket>();

  constructor(
    public port: number,
    public password: string,
  ) {
    this.wss = new WebSocketServer({
      port,
      handleProtocols: (protocols: any) => (Array.from(protocols as Iterable<string>).includes('obswebsocket.json') ? 'obswebsocket.json' : false),
    });
    this.wss.on('connection', (ws: WebSocket) => this.onConnection(ws));
  }

  close() {
    for (const c of this.clients) c.terminate();
    return new Promise<void>((r) => this.wss.close(() => r()));
  }

  private onConnection(ws: WebSocket) {
    const salt = randomBytes(16).toString('base64');
    const challenge = randomBytes(16).toString('base64');
    let identified = false;
    ws.send(
      JSON.stringify({
        op: 0,
        d: { obsWebSocketVersion: '5.5.4', rpcVersion: 1, authentication: this.password ? { salt, challenge } : undefined },
      }),
    );
    ws.on('message', async (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === 1) {
        if (this.password) {
          const expected = b64sha(b64sha(this.password + salt) + challenge);
          if (msg.d.authentication !== expected) {
            ws.close(4009, 'Authentication failed.');
            return;
          }
        }
        identified = true;
        this.clients.add(ws);
        ws.on('close', () => this.clients.delete(ws));
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (!identified) return ws.close(4007, 'Not identified');
      if (msg.op === 6) {
        const r = await this.handle(msg.d.requestType, msg.d.requestData ?? {});
        ws.send(JSON.stringify({ op: 7, d: { requestType: msg.d.requestType, requestId: msg.d.requestId, ...r } }));
      } else if (msg.op === 8) {
        const results: any[] = [];
        for (const req of msg.d.requests) {
          const r = await this.handle(req.requestType, req.requestData ?? {});
          results.push({ requestType: req.requestType, requestId: req.requestId, ...r });
          if (!r.requestStatus.result && msg.d.haltOnFailure) break;
        }
        ws.send(JSON.stringify({ op: 9, d: { requestId: msg.d.requestId, results } }));
      }
    });
  }

  emit(eventType: string, eventData: any) {
    for (const c of this.clients) c.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }));
  }

  private ok(responseData?: any) {
    return { requestStatus: { result: true, code: 100 }, responseData };
  }
  private fail(comment: string, code = 600) {
    return { requestStatus: { result: false, code, comment } };
  }

  private input(name: string) {
    return this.state.inputs.find((i) => i.name === name);
  }

  private async handle(type: string, d: any): Promise<any> {
    if (!type.startsWith('Get')) this.log.push({ type, data: d });
    const s = this.state;
    switch (type) {
      case 'GetVersion':
        return this.ok({ obsVersion: '31.1.0', obsWebSocketVersion: '5.5.4' });
      case 'GetSceneList':
        return this.ok({
          currentProgramSceneName: s.programScene,
          currentPreviewSceneName: s.studioMode ? s.previewScene : null,
          // OBS listeyi alttan üste verir: index 0 en alttaki sahne
          scenes: s.scenes.map((sceneName, i) => ({ sceneName, sceneIndex: s.scenes.length - 1 - i })).reverse(),
        });
      case 'GetStudioModeEnabled':
        return this.ok({ studioModeEnabled: s.studioMode });
      case 'GetRecordStatus':
        return this.ok({ outputActive: s.record.active, outputPaused: s.record.paused, outputTimecode: tc(this.recordStartedAt) });
      case 'GetStreamStatus':
        s.stream.bytes += 750_000;
        return this.ok({ outputActive: s.stream.active, outputTimecode: tc(this.streamStartedAt), outputBytes: s.stream.bytes, outputSkippedFrames: 0 });
      case 'GetReplayBufferStatus':
        return this.fail('Replay buffer is not available.', 501);
      case 'GetVirtualCamStatus':
        return this.ok({ outputActive: false });
      case 'GetSceneTransitionList':
        return this.ok({ currentSceneTransitionName: s.currentTransition, transitions: s.transitions.map((transitionName) => ({ transitionName })) });
      case 'GetInputList':
        return this.ok({ inputs: s.inputs.map((i) => ({ inputName: i.name, inputKind: i.kind })) });
      case 'GetSpecialInputs':
        return this.ok(s.special);
      case 'GetInputMute': {
        const i = this.input(d.inputName);
        if (!i) return this.fail('No source was found', 600);
        if (!i.audio) return this.fail('The specified input does not support audio.', 604);
        return this.ok({ inputMuted: i.muted });
      }
      case 'GetStats':
        return this.ok({ cpuUsage: 12.4, activeFps: 60, renderSkippedFrames: 0, renderTotalFrames: 1000, outputSkippedFrames: 0, outputTotalFrames: 1000 });
      case 'GetSceneItemId': {
        const it = s.items[d.sceneName]?.find((x) => x.source === d.sourceName);
        return it ? this.ok({ sceneItemId: it.id }) : this.fail('No scene items were found', 600);
      }
      case 'GetSceneItemList':
        return this.ok({ sceneItems: (s.items[d.sceneName] ?? []).map((x, i) => ({ sourceName: x.source, sceneItemId: x.id, sceneItemIndex: i })) });
      case 'GetSceneItemEnabled': {
        const it = s.items[d.sceneName]?.find((x) => x.id === d.sceneItemId);
        return it ? this.ok({ sceneItemEnabled: it.enabled }) : this.fail('not found');
      }
      case 'SetSceneItemEnabled': {
        const it = s.items[d.sceneName]?.find((x) => x.id === d.sceneItemId);
        if (!it) return this.fail('not found');
        it.enabled = d.sceneItemEnabled;
        this.emit('SceneItemEnableStateChanged', { sceneName: d.sceneName, sceneItemId: it.id, sceneItemEnabled: it.enabled });
        return this.ok();
      }
      case 'GetSourceFilterList':
        return this.ok({ filters: (s.filters[d.sourceName] ?? []).map((f) => ({ filterName: f.name, filterEnabled: f.enabled })) });
      case 'GetSourceFilter': {
        const f = s.filters[d.sourceName]?.find((x) => x.name === d.filterName);
        return f ? this.ok({ filterEnabled: f.enabled }) : this.fail('No filter was found');
      }
      case 'SetSourceFilterEnabled': {
        const f = s.filters[d.sourceName]?.find((x) => x.name === d.filterName);
        if (!f) return this.fail('No filter was found');
        f.enabled = d.filterEnabled;
        this.emit('SourceFilterEnableStateChanged', { sourceName: d.sourceName, filterName: f.name, filterEnabled: f.enabled });
        return this.ok();
      }
      case 'GetMediaInputStatus': {
        const i = this.input(d.inputName);
        return i?.media ? this.ok({ mediaState: i.media }) : this.fail('not media');
      }
      case 'TriggerMediaInputAction':
        return this.input(d.inputName) ? this.ok() : this.fail('No source was found');
      case 'SetCurrentProgramScene':
        if (!s.scenes.includes(d.sceneName)) return this.fail('No source was found by the name of `' + d.sceneName + '`.');
        s.programScene = d.sceneName;
        this.emit('CurrentProgramSceneChanged', { sceneName: d.sceneName });
        return this.ok();
      case 'ToggleRecord':
        s.record.active = !s.record.active;
        this.recordStartedAt = Date.now();
        s.record.paused = false;
        this.emit('RecordStateChanged', {
          outputActive: s.record.active,
          outputState: s.record.active ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED',
        });
        return this.ok({ outputActive: s.record.active });
      case 'ToggleRecordPause':
        if (!s.record.active) return this.fail('Record is not active', 501);
        s.record.paused = !s.record.paused;
        this.emit('RecordStateChanged', {
          outputActive: true,
          outputState: s.record.paused ? 'OBS_WEBSOCKET_OUTPUT_PAUSED' : 'OBS_WEBSOCKET_OUTPUT_RESUMED',
        });
        return this.ok();
      case 'ToggleStream':
        s.stream.active = !s.stream.active;
        this.streamStartedAt = Date.now();
        this.emit('StreamStateChanged', { outputActive: s.stream.active, outputState: 'x' });
        return this.ok({ outputActive: s.stream.active });
      case 'ToggleInputMute': {
        const i = this.input(d.inputName);
        if (!i?.audio) return this.fail('No source was found');
        i.muted = !i.muted;
        this.emit('InputMuteStateChanged', { inputName: i.name, inputMuted: i.muted });
        return this.ok({ inputMuted: i.muted });
      }
      case 'SetStudioModeEnabled':
        s.studioMode = d.studioModeEnabled;
        this.emit('StudioModeStateChanged', { studioModeEnabled: s.studioMode });
        return this.ok();
      case 'SetCurrentSceneTransition':
        if (!s.transitions.includes(d.transitionName)) return this.fail('No transition');
        s.currentTransition = d.transitionName;
        this.emit('CurrentSceneTransitionChanged', { transitionName: d.transitionName });
        return this.ok();
      case 'SetCurrentSceneTransitionDuration':
      case 'TriggerHotkeyByName':
      case 'CreateRecordChapter':
        return this.ok();
      case 'Sleep':
        await new Promise((r) => setTimeout(r, d.sleepMillis));
        return this.ok();
      default:
        return this.fail(`Unknown request type ${type}`, 204);
    }
  }
}
