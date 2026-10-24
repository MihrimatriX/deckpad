import { create } from 'zustand';

/** StudioHub'a gönderilen bilgisayar eylemi. Alan adları StudioHub'daki PcAction ile aynıdır. */
export type PcAction =
  | { op: 'keys'; keys: string }
  | { op: 'text'; text: string }
  | { op: 'launch'; path: string; args?: string }
  | { op: 'url'; url: string }
  | { op: 'media'; key: 'playPause' | 'next' | 'previous' | 'stop' }
  | { op: 'volume'; mode: 'up' | 'down' | 'set' | 'mute' | 'unmute' | 'toggleMute'; value?: number }
  | { op: 'slide'; dir: 'next' | 'previous' | 'first' | 'last' | 'start' | 'end' | 'black' };

export interface PcResult {
  ok: boolean;
  message?: string;
  data?: any;
}

export type HubStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface HubState {
  status: HubStatus;
  error?: string;
  /** Bilgisayarın adı (StudioHub ayarlarındaki ad). */
  pcName?: string;
  /** Son ses düzeyi; ses tuşlarında gösterilir. */
  volume?: { level: number; muted: boolean };
}

export const useHub = create<HubState>(() => ({ status: 'off' }));

export interface HubConfig {
  url: string;
  token: string;
  /** StudioHub'da görünecek cihaz adı. */
  clientName: string;
  app?: string;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

const REQUEST_TIMEOUT = 8000;

/**
 * StudioHub'ın WebSocket'ine bağlanır: önce eşleştirme anahtarıyla "hello", sonra istek/yanıt.
 * Bağlantı koparsa artan aralıklarla yeniden dener; anahtar reddedilirse denemeyi bırakır.
 */
export class HubClient {
  private ws?: WebSocket;
  private config?: HubConfig;
  private running = false;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private deckListeners = new Set<() => void>();
  clientId?: string;

  constructor(private readonly socketFactory: (url: string) => WebSocket = (url) => new WebSocket(url)) {}

  get connected() {
    return useHub.getState().status === 'connected';
  }

  start(config: HubConfig) {
    this.stop(false);
    this.config = config;
    this.running = true;
    this.retry = 0;
    this.open();
  }

  stop(reset = true) {
    this.running = false;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {}
    }
    this.failAll('Bağlantı kapandı');
    if (reset) useHub.setState({ status: 'off', error: undefined, pcName: undefined });
  }

  /** Uygulama öne gelince beklemeden yeniden dener. */
  nudge() {
    if (this.running && useHub.getState().status !== 'connected' && useHub.getState().status !== 'connecting') {
      clearTimeout(this.retryTimer);
      this.open();
    }
  }

  onDeckChanged(fn: () => void) {
    this.deckListeners.add(fn);
    return () => this.deckListeners.delete(fn);
  }

  private open() {
    if (!this.config || !this.running) return;
    useHub.setState({ status: 'connecting', error: undefined });
    let ws: WebSocket;
    try {
      ws = this.socketFactory(this.config.url);
    } catch (e: any) {
      this.scheduleRetry(e?.message ?? 'Adres geçersiz');
      return;
    }
    this.ws = ws;
    const helloTimer = setTimeout(() => {
      if (useHub.getState().status === 'connecting') ws.close();
    }, 7000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ t: 'hello', token: this.config!.token, name: this.config!.clientName, app: this.config!.app ?? 'deckpad', v: 1 }),
      );
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        clearTimeout(helloTimer);
        this.retry = 0;
        this.clientId = msg.clientId;
        useHub.setState({ status: 'connected', error: undefined, pcName: msg.name });
        return;
      }
      if (msg.t === 'error' && msg.code === 'auth') {
        // Yanlış anahtarla tekrar denemek kilitlenmeye yol açar; kullanıcı QR'ı yeniden okutmalı.
        this.running = false;
        useHub.setState({ status: 'error', error: 'Eşleştirme kodu geçersiz. StudioHub\'daki QR kodu yeniden okut.' });
        return;
      }
      if (msg.t === 'deckChanged') {
        this.deckListeners.forEach((fn) => fn());
        return;
      }
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          p.resolve(msg);
        }
      }
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      clearTimeout(helloTimer);
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.failAll('Bağlantı koptu');
      if (ev.code === 4029) {
        this.running = false;
        useHub.setState({ status: 'error', error: 'Çok fazla hatalı deneme. Bir dakika sonra yeniden dene.' });
        return;
      }
      if (ev.code === 4003) {
        this.running = false;
        useHub.setState({ status: 'error', error: 'Eşleştirme kodu yenilendi. Yeni QR kodu okut.' });
        return;
      }
      if (!this.running) return;
      this.scheduleRetry('StudioHub\'a ulaşılamıyor');
    };
  }

  private scheduleRetry(error: string) {
    if (!this.running) return;
    const delay = Math.min(10000, 1000 * 2 ** Math.min(this.retry, 4));
    this.retry++;
    useHub.setState({ status: 'error', error });
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private failAll(reason: string) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private request<T>(msg: Record<string, unknown>): Promise<T> {
    const ws = this.ws;
    if (!ws || useHub.getState().status !== 'connected') {
      return Promise.reject(new Error('Bilgisayar bağlı değil. StudioHub açık mı?'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Bilgisayar yanıt vermedi'));
      }, REQUEST_TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  async run(action: PcAction): Promise<PcResult> {
    const r = await this.request<{ ok: boolean; message?: string; data?: any }>({ t: 'run', action });
    if (r.ok && action.op === 'volume' && r.data) useHub.setState({ volume: { level: r.data.level, muted: r.data.muted } });
    return { ok: r.ok, message: r.message, data: r.data };
  }

  async getDeck(): Promise<{ deck: unknown | null; updatedAt?: number }> {
    const r = await this.request<{ deck: unknown | null; updatedAt?: number }>({ t: 'deckGet' });
    return { deck: r.deck ?? null, updatedAt: r.updatedAt };
  }

  async putDeck(deck: unknown): Promise<void> {
    const r = await this.request<{ ok: boolean; message?: string }>({ t: 'deckPut', deck });
    if (!r.ok) throw new Error(r.message ?? 'Düzen kaydedilemedi');
  }
}

export const hubClient = new HubClient();

/** Ayarlardaki adres ve porttan WebSocket adresi üretir. */
export const hubUrl = (host: string, port: number) => `ws://${host.trim()}:${port}/ws`;
