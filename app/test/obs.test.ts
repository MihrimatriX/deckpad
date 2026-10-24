// OBS istemcisini ve buton yürütücüsünü sahte bir OBS sunucusuna karşı uçtan uca test eder.
// Çalıştırma: npm test
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { obsClient } from '../src/obs/client';
import { useObs } from '../src/obs/store';
import { parseObsQr } from '../src/obs/qr';
import { buttonState, runButton } from '../src/deck/run';
import type { DeckButton } from '../src/deck/model';
import { validateProfile } from '../src/deck/ops';
import { defaultProfile } from '../src/deck/defaults';
import { MockObs } from './mock-obs';

const PORT = 45455;
const PASS = 'gizli-şifre';
const ctx = { goToPage: (_: string) => {} };

async function waitFor(cond: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zaman aşımı: ' + cond.toString());
    await new Promise((r) => setTimeout(r, 20));
  }
}

const btn = (actions: DeckButton['actions'], extra: Partial<DeckButton> = {}): DeckButton => ({
  id: 'b',
  label: 't',
  color: '#000',
  actions,
  ...extra,
});

let obs: MockObs;

describe('DeckPad ↔ OBS', () => {
  before(() => {
    obs = new MockObs(PORT, PASS);
  });
  after(async () => {
    await obsClient.stop();
    await obs.close();
  });

  test('yanlış şifre: hata verir ve tekrar denemez', async () => {
    obsClient.start({ host: '127.0.0.1', port: PORT, password: 'yanlis' });
    await waitFor(() => useObs.getState().status === 'error');
    assert.equal(useObs.getState().error, 'Şifre yanlış');
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(useObs.getState().status, 'error');
  });

  test('doğru şifreyle bağlanır ve durumu senkronlar', async () => {
    obsClient.start({ host: '127.0.0.1', port: PORT, password: PASS });
    await waitFor(() => useObs.getState().status === 'connected');
    const s = useObs.getState();
    assert.equal(s.obsVersion, '31.1.0');
    assert.deepEqual(s.scenes, ['Başlıyoruz', 'Kamera', 'Oyun'], 'sahneler OBS arayüzündeki sırada');
    assert.equal(s.programScene, 'Kamera');
    assert.equal(s.specialInputs.mic1, 'Mic/Aux');
    assert.deepEqual(Object.keys(s.muted).sort(), ['Alkış', 'Desktop Audio', 'Mic/Aux'], 'sadece ses kaynakları');
    assert.deepEqual(s.transitions, ['Fade', 'Cut', 'Stinger']);
    assert.equal(s.replayBuffer.available, false);
  });

  test('kayıt butonu: başlatır, durum kırmızı yanar, duraklatma turuncu olur', async () => {
    const rec = btn([{ type: 'record', mode: 'toggle' }]);
    const pause = btn([{ type: 'recordPause', mode: 'toggle' }]);
    assert.deepEqual(await runButton(rec, ctx), []);
    await waitFor(() => useObs.getState().record.active);
    assert.equal(buttonState(rec, useObs.getState()).tone, 'live');
    await runButton(pause, ctx);
    await waitFor(() => useObs.getState().record.paused);
    assert.equal(buttonState(rec, useObs.getState()).tone, 'warning');
    assert.equal(buttonState(pause, useObs.getState()).iconOverride, 'play');
    await runButton(pause, ctx);
    await waitFor(() => !useObs.getState().record.paused);
    await runButton(rec, ctx);
    await waitFor(() => !useObs.getState().record.active);
  });

  test('makro: sahne + bekle + mikrofon tek batch, sırayla ve beklemeyle çalışır', async () => {
    obs.log = [];
    const macro = btn([
      { type: 'scene', scene: 'Oyun' },
      { type: 'delay', ms: 300 },
      { type: 'mute', input: '$mic1', mode: 'toggle' },
    ]);
    const t0 = Date.now();
    assert.deepEqual(await runButton(macro, ctx), []);
    assert.ok(Date.now() - t0 >= 280, 'bekleme uygulandı');
    assert.deepEqual(
      obs.log.map((l) => l.type),
      ['SetCurrentProgramScene', 'Sleep', 'ToggleInputMute'],
    );
    assert.equal(obs.log[2].data.inputName, 'Mic/Aux', '$mic1 gerçek ada çözüldü');
    await waitFor(() => useObs.getState().programScene === 'Oyun' && useObs.getState().muted['Mic/Aux'] === true);
    const micBtn = btn([{ type: 'mute', input: '$mic1', mode: 'toggle' }], { icon: 'mic' });
    const st = buttonState(micBtn, useObs.getState());
    assert.equal(st.tone, 'live');
    assert.equal(st.iconOverride, 'mic-off');
    assert.equal(buttonState(btn([{ type: 'scene', scene: 'Oyun' }]), useObs.getState()).sub, 'YAYINDA');
  });

  test('kaynak göster/gizle: mevcut durumu okuyup tersine çevirir', async () => {
    const logo = btn([{ type: 'sourceVisibility', scene: 'Kamera', source: 'Logo', mode: 'toggle' }]);
    await obsClient.watchBindings([{ scene: 'Kamera', source: 'Logo' }], []);
    assert.equal(useObs.getState().sceneItems['Kamera::Logo'], false);
    assert.deepEqual(await runButton(logo, ctx), []);
    await waitFor(() => useObs.getState().sceneItems['Kamera::Logo'] === true);
    assert.equal(obs.state.items.Kamera[1].enabled, true);
    assert.equal(buttonState(logo, useObs.getState()).active, true);
    await runButton(logo, ctx);
    await waitFor(() => useObs.getState().sceneItems['Kamera::Logo'] === false);
  });

  test('filtre aç/kapat ve olayla durum güncellemesi', async () => {
    const blur = btn([{ type: 'filter', source: 'Webcam', filter: 'Blur', mode: 'toggle' }]);
    assert.deepEqual(await runButton(blur, ctx), []);
    await waitFor(() => useObs.getState().filters['Webcam::Blur'] === true);
    assert.equal(buttonState(blur, useObs.getState()).sub, 'AÇIK');
  });

  test('medya: bitmiş sesi baştan oynatır, slaytta sonraki', async () => {
    obs.log = [];
    await runButton(btn([{ type: 'media', input: 'Alkış', mode: 'playPause' }]), ctx);
    await runButton(btn([{ type: 'media', input: 'Slaytlar', mode: 'next' }]), ctx);
    assert.deepEqual(
      obs.log.map((l) => l.data.mediaAction),
      ['OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART', 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT'],
    );
  });

  test('geçiş ve süre, studio mode', async () => {
    obs.log = [];
    await runButton(btn([{ type: 'transition', name: 'Cut', durationMs: 500 }, { type: 'studioMode', mode: 'toggle' }]), ctx);
    assert.deepEqual(obs.log.map((l) => l.type), ['SetCurrentSceneTransition', 'SetCurrentSceneTransitionDuration', 'SetStudioModeEnabled']);
    await waitFor(() => useObs.getState().currentTransition === 'Cut' && useObs.getState().studioMode);
  });

  test('hatalar kullanıcıya döner, sonraki adımlar yine çalışır', async () => {
    obs.log = [];
    const errors = await runButton(
      btn([
        { type: 'scene', scene: 'Olmayan Sahne' },
        { type: 'mute', input: 'Desktop Audio', mode: 'toggle' },
      ]),
      ctx,
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Olmayan Sahne/);
    assert.ok(obs.log.some((l) => l.type === 'ToggleInputMute'));
  });

  test('sayfa eylemi yerelde çalışır', async () => {
    let page = '';
    await runButton(btn([{ type: 'page', pageId: 'p2' }]), { goToPage: (id) => (page = id) });
    assert.equal(page, 'p2');
  });

  test('yayın: istatistik ve bit hızı hesaplanır', async () => {
    await runButton(btn([{ type: 'stream', mode: 'toggle' }]), ctx);
    await waitFor(() => useObs.getState().stream.active);
    await waitFor(() => (useObs.getState().stream.kbps ?? 0) > 0, 5000);
    const kbps = useObs.getState().stream.kbps!;
    assert.ok(kbps > 5000 && kbps < 7000, `750 KB/sn ≈ 6000 kb/sn, ölçülen ${kbps}`);
    assert.ok(useObs.getState().stats?.fps === 60);
  });

  test('OBS kapanıp açılınca kendiliğinden yeniden bağlanır', async () => {
    await obs.close();
    await waitFor(() => useObs.getState().status !== 'connected');
    obs = new MockObs(PORT, PASS);
    await waitFor(() => useObs.getState().status === 'connected', 8000);
    assert.equal(useObs.getState().programScene, 'Kamera', 'yeni sunucunun durumu okundu');
  });
});

describe('yardımcılar', () => {
  test('OBS QR kodu çözülür', () => {
    assert.deepEqual(parseObsQr('obswebsocket://x'), null);
    assert.deepEqual(parseObsQr('obsws://192.168.1.20:4455/abc%20def'), { host: '192.168.1.20', port: 4455, password: 'abc def' });
    assert.deepEqual(parseObsQr('obsws://10.0.0.5:4455'), { host: '10.0.0.5', port: 4455, password: '' });
  });

  test('deste dışa/içe aktarma ve bozuk veri', () => {
    const p = defaultProfile();
    const round = validateProfile(JSON.parse(JSON.stringify(p)));
    assert.equal(round.pages.length, p.pages.length);
    assert.equal(round.pages[0].buttons.length, p.pages[0].buttons.length);
    assert.throws(() => validateProfile({ foo: 1 }));
    const fixed = validateProfile({ pages: [{ name: 'A', cols: 99, buttons: [null, { label: 'x' }] }] });
    assert.equal(fixed.pages[0].cols, 8);
    assert.equal(fixed.pages[0].buttons.length, 1);
    assert.deepEqual(fixed.pages[0].buttons[0].actions, []);
  });
});
