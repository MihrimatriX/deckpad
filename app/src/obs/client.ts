import OBSWebSocket, { EventSubscription } from 'obs-websocket-js/json';
import { initialObsState, itemKey, filterKey, setObs, useObs, type ObsStats } from './store';
import { isSpecialToken, SPECIAL_INPUTS } from '../deck/model';

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

type Req = { requestType: string; requestData?: Record<string, unknown> };
export type BatchResult = {
  requestType: string;
  requestStatus: { result: boolean; code: number; comment?: string };
  responseData?: any;
};

const OUTPUT_PAUSED = 'OBS_WEBSOCKET_OUTPUT_PAUSED';
const OUTPUT_RESUMED = 'OBS_WEBSOCKET_OUTPUT_RESUMED';

const shortTimecode = (tc?: string) => (tc ? tc.split('.')[0] : undefined);

/**
 * OBS bağlantısını yöneten tekil sınıf.
 * Bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır ve durumu baştan senkronlar.
 */
class ObsController {
  private obs = new OBSWebSocket();
  private config?: ObsConfig;
  private running = false;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private pollTick = 0;
  private lastStreamBytes?: { bytes: number; at: number };
  /** `${sahne}::${kaynak}` -> sceneItemId */
  private itemIds = new Map<string, number>();
  /** `${sahne}::${sceneItemId}` -> kaynak adı */
  private itemNames = new Map<string, string>();

  constructor() {
    this.bindEvents();
  }

  get connected() {
    return this.obs.identified;
  }

  start(config: ObsConfig) {
    this.config = config;
    this.running = true;
    this.retry = 0;
    clearTimeout(this.retryTimer);
    void this.connectOnce();
  }

  async stop() {
    this.running = false;
    this.gen++;
    clearTimeout(this.retryTimer);
    this.stopPolling();
    await this.obs.disconnect().catch(() => {});
    setObs({ ...initialObsState });
  }

  /** Her bağlanma denemesine numara verir; eski denemelerin sonuçları yok sayılır. */
  private gen = 0;
  private connecting = false;

  private async connectOnce() {
    if (!this.config || !this.running) return;
    const myGen = ++this.gen;
    const { host, port, password } = this.config;
    this.connecting = true;
    setObs({ status: 'connecting', error: undefined });
    try {
      await withTimeout(
        this.obs.connect(`ws://${host.trim()}:${port}`, password || undefined, {
          rpcVersion: 1,
          eventSubscriptions: EventSubscription.All,
        }),
        7000,
        'Zaman aşımı: OBS bulunamadı',
      );
      if (myGen !== this.gen) return;
      this.retry = 0;
      this.itemIds.clear();
      this.itemNames.clear();
      await this.syncAll();
      setObs({ status: 'connected' });
      this.startPolling();
    } catch (e: any) {
      if (myGen !== this.gen) return;
      void this.obs.disconnect().catch(() => {});
      const authFailed = e?.code === 4009;
      setObs({
        status: 'error',
        error: authFailed ? 'Şifre yanlış' : e?.message || 'Bağlanılamadı',
      });
      // Şifre yanlışsa tekrar denemenin anlamı yok.
      if (authFailed) this.running = false;
      this.scheduleReconnect();
    } finally {
      if (myGen === this.gen) this.connecting = false;
    }
  }

  /** Uygulama ön plana dönünce hemen yeniden dene. */
  nudge() {
    if (this.running && !this.connected && !this.connecting) {
      this.retry = 0;
      clearTimeout(this.retryTimer);
      void this.connectOnce();
    }
  }

  private scheduleReconnect() {
    if (!this.running) return;
    clearTimeout(this.retryTimer);
    const delay = Math.min(1000 * 2 ** this.retry, 10000);
    this.retry++;
    this.retryTimer = setTimeout(() => void this.connectOnce(), delay);
  }

  private bindEvents() {
    const o = this.obs;
    o.on('ConnectionClosed', (err) => {
      this.stopPolling();
      // Bağlanma sırasındaki kopmaları connectOnce kendisi ele alır.
      if (!this.running || this.connecting) return;
      setObs({ status: 'connecting', error: err?.message || 'Bağlantı koptu' });
      this.scheduleReconnect();
    });

    o.on('CurrentProgramSceneChanged', (e) => setObs({ programScene: e.sceneName }));
    o.on('CurrentPreviewSceneChanged', (e) => setObs({ previewScene: e.sceneName }));
    o.on('SceneListChanged', (e) =>
      setObs({ scenes: sortScenes(e.scenes as any[]) }),
    );
    o.on('StudioModeStateChanged', (e) => setObs({ studioMode: e.studioModeEnabled }));
    o.on('InputMuteStateChanged', (e) =>
      setObs((s) => ({ muted: { ...s.muted, [e.inputName]: e.inputMuted } })),
    );
    o.on('InputCreated', () => void this.syncInputs());
    o.on('InputRemoved', () => void this.syncInputs());
    o.on('InputNameChanged', () => {
      this.itemIds.clear();
      void this.syncInputs();
    });
    o.on('RecordStateChanged', (e) =>
      setObs((s) => ({
        record: {
          active: e.outputActive,
          paused:
            e.outputState === OUTPUT_PAUSED
              ? true
              : e.outputState === OUTPUT_RESUMED || !e.outputActive
                ? false
                : s.record.paused,
          timecode: e.outputActive ? s.record.timecode : undefined,
        },
      })),
    );
    o.on('StreamStateChanged', (e) =>
      setObs((s) => ({
        stream: e.outputActive ? { ...s.stream, active: true } : { active: false },
      })),
    );
    o.on('ReplayBufferStateChanged', (e) =>
      setObs({ replayBuffer: { active: e.outputActive, available: true } }),
    );
    o.on('VirtualcamStateChanged', (e) => setObs({ virtualCam: e.outputActive }));
    o.on('CurrentSceneTransitionChanged', (e) => setObs({ currentTransition: e.transitionName }));
    o.on('SceneItemEnableStateChanged', (e) => {
      const source = this.itemNames.get(`${e.sceneName}::${e.sceneItemId}`);
      if (!source) return;
      setObs((s) => ({
        sceneItems: { ...s.sceneItems, [itemKey(e.sceneName, source)]: e.sceneItemEnabled },
      }));
    });
    o.on('SourceFilterEnableStateChanged', (e) =>
      setObs((s) => ({
        filters: { ...s.filters, [filterKey(e.sourceName, e.filterName)]: e.filterEnabled },
      })),
    );
    o.on('ExitStarted', () => setObs({ status: 'connecting', error: 'OBS kapandı' }));
  }

  // ---------- Durum senkronu ----------

  private async syncAll() {
    const res = await this.batch(
      [
        { requestType: 'GetVersion' },
        { requestType: 'GetSceneList' },
        { requestType: 'GetStudioModeEnabled' },
        { requestType: 'GetRecordStatus' },
        { requestType: 'GetStreamStatus' },
        { requestType: 'GetReplayBufferStatus' },
        { requestType: 'GetVirtualCamStatus' },
        { requestType: 'GetSceneTransitionList' },
      ],
      false,
    );
    const d = (i: number) => (res[i]?.requestStatus.result ? res[i].responseData : undefined);
    const version = d(0);
    const scenes = d(1);
    const studio = d(2);
    const rec = d(3);
    const stream = d(4);
    const replay = d(5);
    const vcam = d(6);
    const trans = d(7);
    setObs({
      obsVersion: version?.obsVersion,
      scenes: scenes ? sortScenes(scenes.scenes) : [],
      programScene: scenes?.currentProgramSceneName,
      previewScene: scenes?.currentPreviewSceneName ?? undefined,
      studioMode: !!studio?.studioModeEnabled,
      record: {
        active: !!rec?.outputActive,
        paused: !!rec?.outputPaused,
        timecode: rec?.outputActive ? shortTimecode(rec.outputTimecode) : undefined,
      },
      stream: { active: !!stream?.outputActive, timecode: shortTimecode(stream?.outputTimecode) },
      replayBuffer: { active: !!replay?.outputActive, available: !!replay },
      virtualCam: !!vcam?.outputActive,
      transitions: trans ? trans.transitions.map((t: any) => t.transitionName) : [],
      currentTransition: trans?.currentSceneTransitionName ?? undefined,
    });
    await this.syncInputs();
  }

  private async syncInputs() {
    const [list, special] = await this.batch(
      [{ requestType: 'GetInputList' }, { requestType: 'GetSpecialInputs' }],
      false,
    );
    const inputs: { name: string; kind: string }[] = list?.requestStatus.result
      ? list.responseData.inputs.map((i: any) => ({ name: i.inputName, kind: i.inputKind }))
      : [];
    const sp = special?.requestStatus.result ? special.responseData : {};
    const specialInputs: Record<string, string> = {};
    for (const k of ['mic1', 'mic2', 'desktop1', 'desktop2']) if (sp[k]) specialInputs[k] = sp[k];

    // Ses kaynağı olmayanlar GetInputMute'ta hata verir; batch onları atlar.
    const mutes = inputs.length
      ? await this.batch(
          inputs.map((i) => ({ requestType: 'GetInputMute', requestData: { inputName: i.name } })),
          false,
        )
      : [];
    const muted: Record<string, boolean> = {};
    mutes.forEach((r, i) => {
      if (r.requestStatus.result) muted[inputs[i].name] = r.responseData.inputMuted;
    });
    setObs({ inputs, specialInputs, muted });
  }

  /** Butonlara bağlı kaynak ve filtre durumlarını OBS'ten okur. */
  async watchBindings(items: { scene: string; source: string }[], filters: { source: string; filter: string }[]) {
    if (!this.connected) return;
    const sceneItems: Record<string, boolean> = {};
    for (const it of items) {
      try {
        const id = await this.sceneItemId(it.scene, it.source);
        const r: any = await this.call('GetSceneItemEnabled', { sceneName: it.scene, sceneItemId: id });
        sceneItems[itemKey(it.scene, it.source)] = r.sceneItemEnabled;
      } catch {}
    }
    const fs: Record<string, boolean> = {};
    if (filters.length) {
      const res = await this.batch(
        filters.map((f) => ({
          requestType: 'GetSourceFilter',
          requestData: { sourceName: f.source, filterName: f.filter },
        })),
        false,
      );
      res.forEach((r, i) => {
        if (r.requestStatus.result) fs[filterKey(filters[i].source, filters[i].filter)] = r.responseData.filterEnabled;
      });
    }
    setObs((s) => ({ sceneItems: { ...s.sceneItems, ...sceneItems }, filters: { ...s.filters, ...fs } }));
  }

  // ---------- Periyodik durum ----------

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.poll(), 1000);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.lastStreamBytes = undefined;
  }

  private async poll() {
    if (!this.connected) return;
    this.pollTick++;
    const s = useObs.getState();
    const reqs: Req[] = [];
    if (s.record.active) reqs.push({ requestType: 'GetRecordStatus' });
    if (s.stream.active) reqs.push({ requestType: 'GetStreamStatus' });
    if (this.pollTick % 2 === 0) reqs.push({ requestType: 'GetStats' });
    if (!reqs.length) return;
    try {
      const res = await this.batch(reqs, false);
      const patch: Partial<typeof s> = {};
      for (const r of res) {
        if (!r.requestStatus.result) continue;
        const d = r.responseData;
        if (r.requestType === 'GetRecordStatus') {
          patch.record = {
            active: d.outputActive,
            paused: d.outputPaused,
            timecode: shortTimecode(d.outputTimecode),
          };
        } else if (r.requestType === 'GetStreamStatus') {
          const now = Date.now();
          let kbps = s.stream.kbps;
          if (this.lastStreamBytes && d.outputBytes >= this.lastStreamBytes.bytes) {
            const dt = (now - this.lastStreamBytes.at) / 1000;
            if (dt > 0) kbps = Math.round(((d.outputBytes - this.lastStreamBytes.bytes) * 8) / 1000 / dt);
          }
          this.lastStreamBytes = { bytes: d.outputBytes, at: now };
          patch.stream = {
            active: d.outputActive,
            timecode: shortTimecode(d.outputTimecode),
            kbps,
            dropped: d.outputSkippedFrames,
          };
        } else if (r.requestType === 'GetStats') {
          const st: ObsStats = {
            cpu: d.cpuUsage,
            fps: d.activeFps,
            renderSkipped: d.renderSkippedFrames,
            renderTotal: d.renderTotalFrames,
            outputSkipped: d.outputSkippedFrames,
            outputTotal: d.outputTotalFrames,
          };
          patch.stats = st;
        }
      }
      setObs(patch);
    } catch {}
  }

  // ---------- İstek yardımcıları ----------

  async call<T = any>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    return (this.obs.call as any)(requestType, requestData);
  }

  async batch(requests: Req[], haltOnFailure = false): Promise<BatchResult[]> {
    if (!requests.length) return [];
    return (await this.obs.callBatch(requests as any, { haltOnFailure })) as unknown as BatchResult[];
  }

  resolveInput(name: string): string {
    if (!isSpecialToken(name)) return name;
    const real = useObs.getState().specialInputs[SPECIAL_INPUTS[name]];
    if (!real) throw new Error('OBS ayarlarında bu ses aygıtı tanımlı değil');
    return real;
  }

  async sceneItemId(scene: string, source: string): Promise<number> {
    const key = itemKey(scene, source);
    const cached = this.itemIds.get(key);
    if (cached !== undefined) return cached;
    const r: any = await this.call('GetSceneItemId', { sceneName: scene, sourceName: source });
    this.itemIds.set(key, r.sceneItemId);
    this.itemNames.set(`${scene}::${r.sceneItemId}`, source);
    return r.sceneItemId;
  }

  // ---------- Düzenleyici için canlı listeler ----------

  async listSceneItems(scene: string): Promise<string[]> {
    const r: any = await this.call('GetSceneItemList', { sceneName: scene });
    const items = (r.sceneItems as any[]).slice().reverse();
    for (const it of items) {
      this.itemIds.set(itemKey(scene, it.sourceName), it.sceneItemId);
      this.itemNames.set(`${scene}::${it.sceneItemId}`, it.sourceName);
    }
    return items.map((it) => it.sourceName as string);
  }

  async listFilters(source: string): Promise<string[]> {
    const r: any = await this.call('GetSourceFilterList', { sourceName: this.resolveInput(source) });
    return (r.filters as any[]).map((f) => f.filterName as string);
  }

  async listHotkeys(): Promise<string[]> {
    const r: any = await this.call('GetHotkeyList');
    return (r.hotkeys as string[]).filter((h) => !h.startsWith('libobs.'));
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function sortScenes(scenes: { sceneName: string; sceneIndex: number }[]): string[] {
  // OBS listeyi alttan üste verir; arayüzdeki sırayla göstermek için ters çeviriyoruz.
  return scenes
    .slice()
    .sort((a, b) => b.sceneIndex - a.sceneIndex)
    .map((s) => s.sceneName);
}

export const obsClient = new ObsController();
