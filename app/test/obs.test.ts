// OBS istemcisini ve buton yürütücüsünü sahte bir OBS sunucusuna karşı uçtan uca test eder.
// Çalıştırma: npm test
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { obsClient } from '../src/obs/client';
import { useObs } from '../src/obs/store';
import { parseObsQr } from '../src/obs/qr';
import { buttonState, runButton } from '../src/deck/run';
import { pageShowsPreview, type DeckButton } from '../src/deck/model';
import { syncAutoButtons, validateProfile } from '../src/deck/ops';
import { defaultProfile, sceneButtons, sceneOf } from '../src/deck/defaults';
import { MockObs } from './mock-obs';
import { meterPos, nextMeter, useMeters } from '../src/obs/meters';
import { dbToPos, formatDb, mixerChannels, posToDb } from '../src/deck/mixer';

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

  test('mikser: düzeyler okunur, kaydırıcı yazar, olay durumu günceller', async () => {
    const s = useObs.getState();
    assert.equal(s.volumes['Desktop Audio'], 0);
    assert.equal(s.volumes['Webcam'], undefined, 'sesi olmayan kaynak mikserde yok');
    await obsClient.setInputVolumeDb('Desktop Audio', -12.5);
    await waitFor(() => useObs.getState().volumes['Desktop Audio'] === -12.5);
    await obsClient.setInputVolumeDb('Desktop Audio', -400);
    await waitFor(() => useObs.getState().volumes['Desktop Audio'] === -100);
    const ch = mixerChannels(s.inputs, s.muted, s.specialInputs, ['Alkış']);
    assert.deepEqual(
      ch.map((c) => c.name),
      ['Desktop Audio', 'Mic/Aux'],
      'genel aygıtlar başta, ses efekti gizli',
    );
  });

  test('ses ölçerleri: yalnız istenince abone olur, olaylar depoya düşer', async () => {
    assert.equal(obs.metersSubscribed, false, 'başta ölçer aboneliği yok');
    await obsClient.setMeters(true);
    await waitFor(() => obs.metersSubscribed);
    obs.emitMeters([{ inputName: 'Mic/Aux', inputLevelsMul: [[0.1, 0.5, 0.1], [0.05, 0.2, 0.05]] }]);
    await waitFor(() => !!useMeters.getState().levels['Mic/Aux']);
    const [l, r] = useMeters.getState().levels['Mic/Aux'];
    assert.ok(Math.abs(l.level - -20) < 0.01, 'çarpan 0.1 → -20 dB');
    assert.ok(Math.abs(l.hold - 20 * Math.log10(0.5)) < 0.01, 'tepe göstergesi');
    assert.ok(r.level < l.level);
    await obsClient.setMeters(false);
    await waitFor(() => !obs.metersSubscribed);
    assert.deepEqual(useMeters.getState().levels, {}, 'kapanınca ölçerler temizlenir');
  });

  test('sahne görüntüleri tek batch\'te gelir, olmayan sahne atlanır', async () => {
    const got = await obsClient.screenshots(['Kamera', 'Oyun', 'Yok böyle sahne'], 192);
    assert.deepEqual(Object.keys(got).sort(), ['Kamera', 'Oyun']);
    assert.match(got.Kamera, /^data:image\/(png|jpeg);base64,/);
  });

  test('stüdyo modu: açılınca önizleme okunur, geçiş önizlemeyi yayına alır', async () => {
    const program = obs.state.programScene;
    obs.state.previewScene = obs.state.scenes.find((x) => x !== program)!;
    const preview = obs.state.previewScene;
    try {
      await obsClient.call('SetStudioModeEnabled', { studioModeEnabled: true });
      await waitFor(() => useObs.getState().studioMode && useObs.getState().previewScene === preview);
      await obsClient.call('TriggerStudioModeTransition');
      await waitFor(() => useObs.getState().programScene === preview && useObs.getState().previewScene === program);
    } finally {
      await obsClient.call('SetStudioModeEnabled', { studioModeEnabled: false });
      await waitFor(() => !useObs.getState().studioMode);
      await obsClient.call('SetCurrentProgramScene', { sceneName: program });
      await waitFor(() => useObs.getState().programScene === program);
    }
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

  test('bildirim: yazıyı OBS\'e yazar, süre bitince siler', async () => {
    obs.log = [];
    assert.deepEqual(await runButton(btn([{ type: 'notify', text: 'Merhaba', seconds: 0.2 }]), ctx), []);
    assert.deepEqual(
      obs.log.map((l) => [l.type, l.data?.inputName, l.data?.inputSettings?.text]),
      [['SetInputSettings', 'Bildirim', 'Merhaba'], ['Sleep', undefined, undefined], ['SetInputSettings', 'Bildirim', '']],
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

  test('otomatik sayfa: OBS\'teki yeni ad tuş olur, değişiklik yoksa dizi aynen kalır', () => {
    const home = btn([{ type: 'page', pageId: 'ana' }]);
    const page = [home, ...sceneButtons(['Kamera'])];
    assert.equal(syncAutoButtons(page, ['Kamera'], sceneOf, sceneButtons), page, 'değişiklik yoksa aynı dizi döner');
    const next = syncAutoButtons(page, ['Kamera', 'Oyun'], sceneOf, sceneButtons);
    assert.ok(next.includes(home), 'OBS adına bağlı olmayan tuşlar korunur');
    assert.deepEqual(next.map(sceneOf).filter(Boolean), ['Kamera', 'Oyun']);
  });
});

test('mikser fader eğrisi ve dB yazımı', () => {
  assert.equal(posToDb(0), -100);
  assert.equal(posToDb(1), 0);
  assert.ok(Math.abs(posToDb(0.5) + 18.06) < 0.1, 'orta nokta ≈ -18 dB');
  for (const db of [-60, -18, -6, 0]) assert.ok(Math.abs(posToDb(dbToPos(db)) - db) < 1e-9);
  assert.equal(dbToPos(6), 1, '0 dB üstü sona yapışır');
  assert.equal(dbToPos(-100), 0);
  assert.equal(formatDb(-100), '-∞');
  assert.equal(formatDb(-12.54), '-12,5 dB');
  assert.equal(formatDb(0), '0,0 dB');
  assert.equal(formatDb(3), '+3,0 dB');
  assert.equal(formatDb(undefined), '—');
});

test('mikser sayfası: varsayılan destede var, içe aktarmada türü korunur', () => {
  const p = defaultProfile();
  const mixer = p.pages.find((pg) => pg.kind === 'mixer');
  assert.ok(mixer, 'varsayılan destede mikser sayfası');
  assert.ok(
    p.pages[0].buttons.some((b) => b.actions[0]?.type === 'page' && (b.actions[0] as any).pageId === mixer!.id),
    'ana sayfadan mikser tuşu',
  );
  const round = validateProfile(JSON.parse(JSON.stringify(p)));
  assert.equal(round.pages.find((pg) => pg.id === mixer!.id)?.kind, 'mixer');
  const bogus = validateProfile({ pages: [{ id: 'x', name: 'X', kind: 'tuhaf', buttons: [] }] });
  assert.equal(bogus.pages[0].kind, undefined);
});

test('canlı önizleme: yalnız Sahneler sayfasında kendiliğinden açık, seçim içe aktarmada korunur', () => {
  const p = defaultProfile();
  const scenes = p.pages.find((pg) => pg.id === p.autoScenesPageId)!;
  const home = p.pages[0];
  const mixer = p.pages.find((pg) => pg.kind === 'mixer')!;
  assert.equal(pageShowsPreview(scenes, p), true);
  assert.equal(pageShowsPreview(home, p), home.id === p.autoScenesPageId);
  assert.equal(pageShowsPreview({ ...mixer, preview: true }, p), false, 'mikserde önizleme yok');
  const edited = { ...p, pages: p.pages.map((pg) => (pg.id === scenes.id ? { ...pg, preview: false } : pg.id === home.id ? { ...pg, preview: true } : pg)) };
  const round = validateProfile(JSON.parse(JSON.stringify(edited)));
  assert.equal(pageShowsPreview(round.pages.find((pg) => pg.id === scenes.id)!, round), false);
  assert.equal(pageShowsPreview(round.pages.find((pg) => pg.id === home.id)!, round), true);
  assert.equal(validateProfile({ pages: [{ id: 'x', preview: 'evet', buttons: [] }] }).pages[0].preview, undefined);
});

test('ölçer: tepe göstergesi yavaş düşer, çubuk -60 dB ile 0 arası', () => {
  const a = nextMeter(undefined, [[0.5, 1, 0.5]], 0);
  assert.equal(a[0].hold, 0);
  const b = nextMeter(a, [[0.001, 0.001, 0.001]], 500);
  assert.equal(b[0].level, -60);
  assert.ok(Math.abs(b[0].hold - -10) < 1e-9, 'yarım saniyede 10 dB düşer');
  assert.equal(nextMeter(b, [[0, 0, 0]], 10000)[0].hold, -60);
  assert.equal(meterPos(-60), 0);
  assert.equal(meterPos(0), 1);
  assert.equal(meterPos(-30), 0.5);
  assert.equal(nextMeter(undefined, [[0.1, 0.1], [0.1, 0.1], [0.1, 0.1]], 0).length, 2, 'en çok iki kanal');
});
