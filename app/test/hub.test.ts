// StudioHub istemcisini, StudioHub'ın protokolünü taklit eden bir sunucuya karşı test eder.
// Gerçek StudioHub ile aynı mesajlar: hello/welcome, run/result, deckGet/deck, deckPut/deckSaved, deckChanged.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import * as WS from 'ws';
import { HubClient, useHub } from '../src/hub/client';
import { parsePairQr } from '../src/hub/pair';
import { validateCombo } from '../src/hub/keys';
import { actionIncomplete, describeAction } from '../src/deck/actions';
import { toPcAction, runButton } from '../src/deck/run';
import { defaultProfile } from '../src/deck/defaults';
import { validateProfile } from '../src/deck/ops';

const PORT = 47466;
const TOKEN = 'eslesme-anahtari';

class MockHub {
  server: any;
  runs: any[] = [];
  deck: any = null;
  sockets = new Set<any>();

  start() {
    const Server = (WS as any).WebSocketServer ?? (WS as any).Server;
    this.server = new Server({ port: PORT });
    this.server.on('connection', (ws: any) => {
      let authed = false;
      ws.on('message', (raw: Buffer) => {
        const m = JSON.parse(String(raw));
        if (!authed) {
          if (m.t !== 'hello' || m.token !== TOKEN) {
            ws.send(JSON.stringify({ t: 'error', code: 'auth', message: 'Eşleştirme kodu geçersiz.' }));
            ws.close(4001, 'auth');
            return;
          }
          authed = true;
          this.sockets.add(ws);
          ws.send(JSON.stringify({ t: 'welcome', v: 1, name: 'Stüdyo PC', caps: [], clientId: 'c' + this.sockets.size }));
          return;
        }
        if (m.t === 'run') {
          this.runs.push(m.action);
          const ok = m.action.op !== 'keys' || m.action.keys !== 'Ctrl+Zz';
          const data = m.action.op === 'volume' ? { level: 35, muted: false } : undefined;
          ws.send(JSON.stringify({ t: 'result', id: m.id, ok, message: ok ? undefined : 'Tanınmayan tuş: Zz', data }));
        } else if (m.t === 'deckGet') {
          ws.send(JSON.stringify({ t: 'deck', id: m.id, deck: this.deck }));
        } else if (m.t === 'deckPut') {
          this.deck = m.deck;
          ws.send(JSON.stringify({ t: 'deckSaved', id: m.id, ok: true }));
          for (const other of this.sockets) if (other !== ws) other.send(JSON.stringify({ t: 'deckChanged' }));
        }
      });
      ws.on('close', () => this.sockets.delete(ws));
    });
  }

  stop() {
    for (const s of this.sockets) s.terminate();
    this.server.close();
  }
}

async function waitFor(cond: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zaman aşımı: ' + cond.toString());
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('StudioHub bağlantısı', () => {
  const hub = new MockHub();
  const url = `ws://127.0.0.1:${PORT}/ws`;

  before(() => hub.start());
  after(() => hub.stop());

  test('eşleştirme kodu ayrıştırılır', () => {
    const p = parsePairQr('studiohub://pair?host=192.168.1.20&name=St%C3%BCdyo+PC&hub=4466&token=abc&obs=4455&pass=p%40ss%26&srt=9000&webcam=9100');
    assert.deepEqual(p, {
      host: '192.168.1.20',
      name: 'Stüdyo PC',
      hubPort: 4466,
      token: 'abc',
      obsPort: 4455,
      obsPassword: 'p@ss&',
      obsSrtPort: 9000,
      webcamPort: 9100,
    });
    assert.equal(parsePairQr('obsws://1.2.3.4:4455/x'), null);
    assert.equal(parsePairQr('studiohub://pair?host=1.2.3.4'), null);
  });

  test('yanlış anahtar denemeyi durdurur', async () => {
    const c = new HubClient();
    c.start({ url, token: 'yanlis', clientName: 'test' });
    await waitFor(() => useHub.getState().status === 'error');
    assert.match(useHub.getState().error ?? '', /QR/);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(useHub.getState().status, 'error', 'yanlış anahtarla tekrar denememeli');
    c.stop();
  });

  test('bilgisayar eylemleri gider ve sonuç döner', async () => {
    const c = new HubClient();
    c.start({ url, token: TOKEN, clientName: 'Pixel' });
    await waitFor(() => useHub.getState().status === 'connected');
    assert.equal(useHub.getState().pcName, 'Stüdyo PC');

    const r = await c.run({ op: 'volume', mode: 'up', value: 5 });
    assert.equal(r.ok, true);
    assert.deepEqual(useHub.getState().volume, { level: 35, muted: false });

    const bad = await c.run({ op: 'keys', keys: 'Ctrl+Zz' });
    assert.equal(bad.ok, false);
    assert.match(bad.message ?? '', /Zz/);
    c.stop();
    assert.equal(useHub.getState().status, 'off');
  });

  test('buton sırası korunur: OBS dışı eylemler bilgisayara gider', async () => {
    // Paylaşılan istemci (run.ts'nin kullandığı) ile tam buton çalıştırma
    const { hubClient } = await import('../src/hub/client');
    hub.runs = [];
    hubClient.start({ url, token: TOKEN, clientName: 'Pixel' });
    await waitFor(() => useHub.getState().status === 'connected');
    const errors = await runButton(
      {
        id: 'b',
        label: 'Sunum',
        color: '#000',
        actions: [
          { type: 'pcSlide', dir: 'start' },
          { type: 'delay', ms: 50 },
          { type: 'pcKeys', keys: 'Ctrl+Shift+M' },
          { type: 'pcText', text: 'Merhaba\nDünya' },
        ],
      },
      { goToPage: () => {} },
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(hub.runs, [
      { op: 'slide', dir: 'start' },
      { op: 'keys', keys: 'Ctrl+Shift+M' },
      { op: 'text', text: 'Merhaba\nDünya' },
    ]);
    hubClient.stop();
  });

  test('bağlı değilken anlaşılır hata', async () => {
    const c = new HubClient();
    await assert.rejects(() => c.run({ op: 'slide', dir: 'next' }), /StudioHub/);
  });

  test('düzen paylaşımı ve değişiklik bildirimi', async () => {
    const a = new HubClient();
    const b = new HubClient();
    a.start({ url, token: TOKEN, clientName: 'A' });
    await waitFor(() => a.connected);
    b.start({ url, token: TOKEN, clientName: 'B' });
    await new Promise((r) => setTimeout(r, 300));
    let notified = 0;
    b.onDeckChanged(() => notified++);
    assert.equal((await a.getDeck()).deck, null);
    const deck = defaultProfile();
    await a.putDeck(deck);
    await waitFor(() => notified === 1);
    const got = await b.getDeck();
    assert.equal(validateProfile(got.deck).pages.length, deck.pages.length);
    a.stop();
    b.stop();
  });
});

describe('Bilgisayar eylemleri', () => {
  test('kısayol doğrulama StudioHub ile aynı kuralları uygular', () => {
    assert.equal(validateCombo('Ctrl+Shift+F5'), null);
    assert.equal(validateCombo('Ctrl++'), null);
    assert.equal(validateCombo('Alt+Sağ'), null);
    assert.equal(validateCombo('Win'), null);
    assert.equal(validateCombo('MediaPlayPause'), null);
    assert.match(validateCombo('Ctrl+Foo') ?? '', /Tanınmayan/);
    assert.match(validateCombo('A+B') ?? '', /bir ana tuş/);
    assert.match(validateCombo('  ') ?? '', /boş/);
  });

  test('eylemler StudioHub biçimine çevrilir', () => {
    assert.deepEqual(toPcAction({ type: 'pcVolume', mode: 'set', value: 40 }), { op: 'volume', mode: 'set', value: 40 });
    assert.deepEqual(toPcAction({ type: 'pcLaunch', path: 'spotify:' }), { op: 'launch', path: 'spotify:', args: undefined });
    assert.throws(() => toPcAction({ type: 'record', mode: 'toggle' }));
  });

  test('eksik alanlar işaretlenir ve açıklamalar okunur', () => {
    assert.equal(actionIncomplete({ type: 'pcUrl', url: 'https://' }), true);
    assert.equal(actionIncomplete({ type: 'pcUrl', url: 'https://example.com' }), false);
    assert.equal(actionIncomplete({ type: 'pcKeys', keys: ' ' }), true);
    assert.equal(describeAction({ type: 'pcSlide', dir: 'black' }, () => ''), 'Siyah ekran');
    assert.equal(describeAction({ type: 'pcLaunch', path: 'C:\\Program Files\\Spotify\\Spotify.exe' }, () => ''), 'Aç: Spotify.exe');
  });

  test('varsayılan destede bilgisayar sayfası ve OBS betiğiyle uyumlu adlar var', () => {
    const p = defaultProfile();
    const pc = p.pages.find((pg) => pg.name === 'Bilgisayar');
    assert.ok(pc && pc.buttons.some((b) => b.actions[0]?.type === 'pcSlide'));
    const slides = p.pages.find((pg) => pg.name === 'Slaytlar')!;
    assert.ok(slides.buttons.some((b) => b.actions[0]?.type === 'media' && (b.actions[0] as any).input === 'Slayt gösterisi'));
    assert.ok(p.autoSfxPageId);
    assert.equal(validateProfile(JSON.parse(JSON.stringify(p))).autoSfxPageId, p.autoSfxPageId);
  });
});
