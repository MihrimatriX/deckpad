// StudioHub'daki KeyCombo ayrıştırıcısının hafif bir kopyası: düzenleyicide yazarken hatayı hemen gösterir.

const MODIFIERS = new Set(['ctrl', 'control', 'ctl', 'strg', 'shift', 'alt', 'option', 'altgr', 'win', 'windows', 'meta', 'cmd', 'super']);

const NAMED = new Set(
  [
    'enter', 'return', 'giriş', 'esc', 'escape', 'space', 'boşluk', 'bosluk', 'tab', 'backspace', 'back', 'geri',
    'delete', 'del', 'sil', 'insert', 'ins', 'home', 'end', 'pageup', 'pgup', 'pagedown', 'pgdn',
    'up', 'yukarı', 'yukari', 'down', 'aşağı', 'asagi', 'left', 'sol', 'right', 'sağ', 'sag',
    'printscreen', 'prtsc', 'prtscn', 'pause', 'break', 'scrolllock', 'capslock',
    'numplus', 'add', 'numminus', 'subtract', 'nummultiply', 'multiply', 'numdivide', 'divide',
    'plus', '=', 'minus', '-', 'comma', ',', 'period', '.',
    'volumemute', 'volumedown', 'volumeup', 'medianext', 'mediaprevious', 'mediaprev', 'mediastop', 'mediaplaypause', 'playpause',
  ].map((k) => k.toLocaleLowerCase('tr')),
);

function isKey(name: string): boolean {
  const k = name.toLocaleLowerCase('tr');
  if (/^[a-z0-9]$/i.test(name)) return true;
  if (/^f([1-9]|1\d|2[0-4])$/i.test(name)) return true;
  if (/^num(pad)?[0-9]$/i.test(name)) return true;
  return NAMED.has(k) || NAMED.has(name.toLowerCase());
}

/** Geçerliyse null, değilse kullanıcıya gösterilecek hata. */
export function validateCombo(text: string): string | null {
  const raw = text.trim();
  if (!raw) return 'Kısayol boş';
  const parts: string[] = [];
  let cur = '';
  for (const ch of raw) {
    if (ch === '+' && cur.length > 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.length) parts.push(cur.trim());
  const clean = parts.filter(Boolean);
  if (!clean.length) return 'Kısayol boş';
  let main = 0;
  for (const p of clean) {
    if (MODIFIERS.has(p.toLowerCase())) continue;
    const name = p === '+' ? 'plus' : p;
    if (!isKey(name)) return `Tanınmayan tuş: ${p}`;
    main++;
  }
  if (main > 1) return 'Kısayolda yalnızca bir ana tuş olabilir';
  return null;
}

/** Düzenleyicide tek dokunuşla eklenebilen yaygın kısayollar. */
export const COMMON_COMBOS: { keys: string; label: string }[] = [
  { keys: 'Win+Shift+S', label: 'Ekran alıntısı' },
  { keys: 'Win+D', label: 'Masaüstünü göster' },
  { keys: 'Alt+Tab', label: 'Pencere değiştir' },
  { keys: 'Ctrl+Shift+M', label: 'Teams mikrofon' },
  { keys: 'Alt+A', label: 'Zoom mikrofon' },
  { keys: 'Ctrl+Shift+D', label: 'Discord sağırlaştır' },
  { keys: 'Win+Alt+R', label: 'Xbox kaydı' },
  { keys: 'F11', label: 'Tam ekran' },
];
