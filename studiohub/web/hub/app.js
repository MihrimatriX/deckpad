'use strict';

// StudioHub yönetim arayüzü. Yalnızca bu bilgisayardan açılır; tüm istekler X-StudioHub başlığı taşır.
const $ = (id) => document.getElementById(id);
const H = { 'X-StudioHub': '1' };

async function api(method, path, body) {
  const r = await fetch('/api' + path, {
    method,
    headers: body === undefined ? H : { ...H, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = r.headers.get('content-type') || '';
  const data = type.includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error((data && data.message) || `İstek başarısız (${r.status})`);
  return data;
}

let toastTimer;
function toast(text, kind = 'on') {
  const t = $('toast');
  t.querySelector('.led').className = 'led ' + kind;
  $('toast-text').textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3800);
}

function led(el, kind, blink = false) {
  el.className = 'led' + (kind ? ' ' + kind : '') + (blink ? ' blink' : '');
}

function timecode(since) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

let state = null;
let qrKey = '';
let settingsDirty = false;
let busy = false;
let tokenShown = false;

// ---------------- Görüntüleme ----------------

function render(s) {
  state = s;
  const phones = s.clients.length;

  // Durum camı
  $('d-name').textContent = s.name;
  $('d-ip').textContent = selectedHost() || s.primary;
  $('d-phones').textContent = phones === 0 ? 'Bağlı cihaz yok' : `${phones} cihaz bağlı`;
  led($('d-phones-led'), phones ? 'on' : '');
  led(document.querySelector('[data-led="hub"]'), 'info');

  const w = s.webcam;
  const camText = {
    stopped: 'Webcam kapalı',
    waiting: 'Webcam telefonu bekliyor',
    receiving: w.hasConsumer ? 'Webcam yayında' : 'Webcam görüntü alıyor',
    error: 'Webcam hatası',
  }[w.state];
  $('d-cam').textContent = camText;
  led($('d-cam-led'), { stopped: '', waiting: 'warn', receiving: w.hasConsumer ? 'live' : 'on', error: 'live' }[w.state], w.state === 'waiting');

  const o = s.obs;
  const obsReady = o.webSocketEnabled && s.obsHasPassword;
  $('d-obs').textContent = !o.configFound ? 'OBS bulunamadı' : o.running ? (obsReady ? 'OBS açık' : 'OBS açık, ayar gerekli') : obsReady ? 'OBS hazır' : 'OBS ayar bekliyor';
  led($('d-obs-led'), !o.configFound ? '' : obsReady ? 'on' : 'warn');

  renderPair(s);
  renderWebcam(w);
  renderObs(s);
  renderDeck(s);
  if (!settingsDirty) renderSettings(s);
  $('version').textContent = `Sürüm ${s.version}, ${s.os}`;
}

function selectedHost() {
  return $('ip-select').value;
}

function renderPair(s) {
  const sel = $('ip-select');
  const wanted = s.addresses.map((a) => a.address);
  const have = [...sel.options].map((o) => o.value);
  if (wanted.join() !== have.join()) {
    const prev = sel.value;
    sel.innerHTML = '';
    if (wanted.length === 0) wanted.push('127.0.0.1');
    for (const a of s.addresses.length ? s.addresses : [{ address: '127.0.0.1', iface: 'Yerel', wifi: false }]) {
      const opt = document.createElement('option');
      opt.value = a.address;
      opt.textContent = `${a.address}   (${a.wifi ? 'Wi‑Fi' : a.iface})`;
      sel.append(opt);
    }
    sel.value = wanted.includes(prev) ? prev : wanted[0];
  }
  const host = sel.value;
  $('m-hub').textContent = `${host}:${s.settings.hubPort}`;
  $('m-webcam').textContent = `srt://${host}:${s.settings.webcamPort}`;
  $('m-srt').textContent = `srt://${host}:${s.settings.obsSrtPort}`;
  $('m-ws').textContent = `${host}:${s.settings.obsWebSocketPort}`;
  const token = new URLSearchParams(s.pairUri.split('?')[1]).get('token');
  $('m-token').textContent = tokenShown ? token : '••••••••••';
  $('m-reveal').textContent = tokenShown ? 'Gizle' : 'Göster';
  const key = sel.value + '|' + s.pairUri.replace(/host=[^&]+/, '');
  if (key !== qrKey) {
    qrKey = key;
    loadQr();
  }
}

async function loadQr() {
  try {
    const r = await fetch('/api/qr.svg?host=' + encodeURIComponent(selectedHost()), { headers: H });
    $('qr').innerHTML = await r.text();
  } catch {
    $('qr').textContent = 'QR kodu yüklenemedi';
  }
}

function renderWebcam(w) {
  const running = w.state !== 'stopped';
  const btn = $('cam-toggle');
  btn.textContent = running ? 'Durdur' : 'Başlat';
  btn.className = 'key ' + (running ? 'key-danger' : 'key-primary');

  const receiving = w.state === 'receiving';
  $('monitor').classList.toggle('live', receiving && w.hasConsumer);
  $('preview').hidden = !receiving;
  $('monitor-idle').hidden = receiving;
  $('monitor-text').textContent = !w.ffmpegFound
    ? 'FFmpeg bulunamadı. StudioHub klasörünü zip\'teki haliyle kullan.'
    : w.state === 'error'
      ? w.error || 'Alıcı başlatılamadı'
      : running
        ? `Telefon bekleniyor. CamLink bu bilgisayarın ${w.port} portuna yayın yapmalı.`
        : 'Alıcı kapalı. Telefondan görüntü almak için Başlat\'a bas.';

  const tally = $('tally');
  tally.hidden = !running;
  const tallyLed = tally.querySelector('.led');
  if (receiving) {
    led(tallyLed, w.hasConsumer ? 'live' : 'on');
    $('tally-text').textContent = `${w.hasConsumer ? 'Kullanımda' : 'Görüntü var'}  ${timecode(w.receivingSince)}  ${Math.round(w.fps)} kare/sn`;
  } else {
    led(tallyLed, 'warn', true);
    $('tally-text').textContent = 'Bekliyor';
  }

  $('cam-name').textContent = w.deviceName;
  const res = `${w.settings.width}x${w.settings.height}`;
  for (const c of document.querySelectorAll('#res-chips .chip')) c.classList.toggle('sel', c.dataset.res === res);
  for (const c of document.querySelectorAll('#fps-chips .chip')) c.classList.toggle('sel', Number(c.dataset.fps) === w.settings.fps);
  $('opt-mirror').checked = w.settings.mirror;
  $('opt-flip').checked = w.settings.flipVertical;

  led($('driver-led'), w.driverInstalled ? 'on' : 'warn');
  $('driver-text').textContent = w.driverInstalled
    ? `Sanal kamera "${w.deviceName}" kurulu`
    : 'Sanal kamera sürücüsü kurulu değil. Kurmak için yönetici izni istenir.';
  $('driver-btn').textContent = w.driverInstalled ? 'Kaldır' : 'Kur';
  $('driver-btn').dataset.install = w.driverInstalled ? '0' : '1';
}

function renderObs(s) {
  const o = s.obs;
  const rows = {
    websocket: [o.webSocketEnabled, o.webSocketEnabled ? `Açık, port ${o.webSocketPort}` : 'Kapalı'],
    dock: [o.dockAdded, o.dockAdded ? 'Paneller menüsünde' : 'Eklenmedi'],
    plugin: [o.pluginInstalled, o.pluginInstalled ? 'Kurulu' : s.pluginBundled ? 'Kurulmadı' : 'Paket içinde yok'],
    script: [o.scriptAdded, o.scriptAdded ? `"${o.sceneCollection}" koleksiyonunda` : s.scriptBundled ? 'Eklenmedi' : 'Paket içinde yok'],
  };
  for (const li of document.querySelectorAll('#obs-list li')) {
    const [ok, text] = rows[li.dataset.step];
    led(li.querySelector('.led'), ok ? 'on' : '');
    li.querySelector('.ck-state').textContent = text;
  }
  const setup = $('obs-setup');
  setup.disabled = busy || o.running || !o.configFound;
  const allDone = Object.values(rows).every(([ok]) => ok) && s.obsHasPassword;
  setup.textContent = allDone ? 'Yeniden uygula' : 'OBS\'i hazırla';
  $('obs-launch').disabled = !s.obsCanLaunch || o.running;
  $('obs-launch').textContent = o.running ? 'OBS açık' : 'OBS\'i aç';

  const n = $('obs-notice');
  if (!n.dataset.sticky) {
    if (!o.configFound) show(n, 'OBS bu kullanıcıda hiç açılmamış görünüyor. OBS\'i bir kez açıp kapat, sonra tekrar dene.');
    else if (o.running && !allDone) show(n, 'Ayarları yazabilmek için önce OBS\'i kapat. StudioHub değişiklikleri OBS kapalıyken yapar.');
    else n.hidden = true;
  }
}

function show(n, text, ok = false) {
  n.textContent = text;
  n.classList.toggle('ok', ok);
  n.hidden = false;
}

function renderDeck(s) {
  $('dock-url').textContent = s.dockUrl;
  const box = $('clients');
  if (s.clients.length === 0) {
    box.innerHTML = '<div class="clients-empty">Henüz bağlı cihaz yok. DeckPad\'de QR kodunu okuttuğunda burada görünür.</div>';
    return;
  }
  box.innerHTML = '';
  for (const c of s.clients) {
    const row = document.createElement('div');
    row.className = 'client';
    const l = document.createElement('span');
    l.className = 'led on';
    const name = document.createElement('span');
    name.className = 'client-name';
    name.textContent = c.name;
    const ip = document.createElement('span');
    ip.className = 'client-ip';
    ip.textContent = c.address;
    const last = document.createElement('span');
    last.className = 'client-last';
    last.textContent = c.lastAction ? `Son eylem: ${c.lastAction}` : 'Bağlandı, henüz eylem yok';
    row.append(l, name, ip, last);
    box.append(row);
  }
}

function renderSettings(s) {
  $('s-name').value = s.settings.deviceName;
  $('s-autostart').checked = s.settings.startWithWindows;
  $('p-hub').value = s.settings.hubPort;
  $('p-webcam').value = s.settings.webcamPort;
  $('p-srt').value = s.settings.obsSrtPort;
  $('p-ws').value = s.settings.obsWebSocketPort;
  led($('fw-led'), s.firewall ? 'on' : 'warn');
  $('fw-text').textContent = s.firewall ? 'Telefonlar için izinler ekli' : 'Telefonlar bağlanamıyorsa izin ver';
}

// ---------------- Önizleme ----------------

let previewUrl;
async function refreshPreview() {
  if (!state || state.webcam.state !== 'receiving' || document.hidden) return;
  try {
    const r = await fetch('/api/webcam/preview.bmp', { headers: H, cache: 'no-store' });
    if (r.status !== 200) return;
    const url = URL.createObjectURL(await r.blob());
    $('preview').src = url;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
  } catch {
    /* bir sonraki turda yeniden denenir */
  }
}

// ---------------- Eylemler ----------------

async function patchWebcam(change) {
  const next = { ...state.webcam.settings, ...change };
  try {
    render({ ...state, webcam: await api('PUT', '/webcam/settings', next) });
  } catch (e) {
    toast(e.message, 'live');
  }
}

const actions = {
  async reveal() {
    tokenShown = !tokenShown;
    render(state);
  },
  async regen() {
    await api('POST', '/token/regenerate');
    qrKey = '';
    toast('Yeni eşleştirme kodu oluşturuldu. Telefonlar kodu yeniden okutmalı.');
  },
  async 'cam-toggle'() {
    const running = state.webcam.state !== 'stopped';
    const w = await api('POST', running ? '/webcam/stop' : '/webcam/start');
    render({ ...state, webcam: w });
    toast(running ? 'Webcam alıcısı durduruldu' : 'Webcam alıcısı açıldı, telefon bekleniyor');
  },
  async driver(btn) {
    const install = btn.dataset.install === '1';
    toast(install ? 'Yönetici izni isteniyor…' : 'Sürücü kaldırılıyor…', 'warn');
    const r = await api('POST', '/webcam/driver', { install });
    const failed = r.steps.filter((x) => !x.ok);
    toast(failed.length ? failed[0].message : install ? 'Sanal kamera kuruldu' : 'Sanal kamera kaldırıldı', failed.length ? 'live' : 'on');
    render({ ...state, webcam: r.webcam });
  },
  async 'obs-setup'() {
    busy = true;
    $('obs-setup').disabled = true;
    const n = $('obs-notice');
    try {
      const r = await api('POST', '/obs/setup', { webSocket: true, dock: true, plugin: true, script: true });
      const bad = r.steps.filter((x) => !x.ok);
      n.dataset.sticky = '1';
      if (bad.length === 0) {
        show(n, 'OBS hazır. OBS\'i açınca DeckPad paneli Paneller menüsünde, CamLink kaynağı Kaynaklar listesinde olur. Telefonlar bağlantı bilgisini QR koddan alır.', true);
      } else {
        n.classList.remove('ok');
        n.innerHTML = '';
        n.append('Bazı adımlar tamamlanamadı:');
        const ul = document.createElement('ul');
        for (const x of bad) {
          const li = document.createElement('li');
          li.textContent = `${x.title}: ${x.message}`;
          ul.append(li);
        }
        n.append(ul);
        n.hidden = false;
      }
      setTimeout(() => delete n.dataset.sticky, 15000);
      qrKey = '';
      await poll();
    } finally {
      busy = false;
    }
  },
  async 'obs-launch'() {
    const r = await api('POST', '/obs/launch');
    toast(r.ok ? 'OBS açılıyor' : r.message, r.ok ? 'on' : 'live');
  },
  async 'panel-open'() {
    await api('POST', '/panel/open');
  },
  async 'copy-dock'() {
    try {
      await navigator.clipboard.writeText(state.dockUrl);
      toast('Adres kopyalandı. OBS\'te Paneller › Özel tarayıcı panelleri\'ne yapıştırabilirsin.');
    } catch {
      toast('Kopyalanamadı; adresi elle seç', 'warn');
    }
  },
  async firewall() {
    toast('Yönetici izni isteniyor…', 'warn');
    const r = await api('POST', '/firewall');
    const bad = r.steps.filter((x) => !x.ok);
    toast(bad.length ? bad[0].message : 'Güvenlik duvarı izinleri eklendi', bad.length ? 'live' : 'on');
    await poll();
  },
  async 'save-settings'() {
    const num = (id) => {
      const v = Number($(id).value);
      if (!Number.isInteger(v) || v < 1024 || v > 65535) throw new Error('Portlar 1024 ile 65535 arasında olmalı');
      return v;
    };
    const body = {
      deviceName: $('s-name').value.trim(),
      startWithWindows: $('s-autostart').checked,
      hubPort: num('p-hub'),
      webcamPort: num('p-webcam'),
      obsSrtPort: num('p-srt'),
      obsWebSocketPort: num('p-ws'),
    };
    if (!body.deviceName) throw new Error('Ad boş olamaz');
    const r = await api('PUT', '/settings', body);
    if (!r.ok) throw new Error(r.message);
    settingsDirty = false;
    render(r.status);
    qrKey = '';
    toast(r.restartNeeded ? 'Kaydedildi. Yeni StudioHub portu uygulama yeniden açılınca geçerli olur.' : 'Ayarlar kaydedildi');
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) {
    try {
      await actions[el.dataset.act](el);
    } catch (err) {
      toast(err.message, 'live');
    }
    return;
  }
  const res = e.target.closest('#res-chips .chip');
  if (res) {
    const [width, height] = res.dataset.res.split('x').map(Number);
    return patchWebcam({ width, height });
  }
  const fps = e.target.closest('#fps-chips .chip');
  if (fps) return patchWebcam({ fps: Number(fps.dataset.fps) });
});

$('opt-mirror').addEventListener('change', (e) => patchWebcam({ mirror: e.target.checked }));
$('opt-flip').addEventListener('change', (e) => patchWebcam({ flipVertical: e.target.checked }));
$('ip-select').addEventListener('change', () => {
  qrKey = '';
  if (state) render(state);
});
for (const id of ['s-name', 's-autostart', 'p-hub', 'p-webcam', 'p-srt', 'p-ws']) {
  $(id).addEventListener('input', () => (settingsDirty = true));
}

// ---------------- Döngü ----------------

let failures = 0;
async function poll() {
  try {
    render(await api('GET', '/status'));
    failures = 0;
  } catch {
    failures++;
    if (failures === 3) toast('StudioHub yanıt vermiyor', 'live');
  }
}

poll();
setInterval(poll, 1500);
setInterval(refreshPreview, 400);
