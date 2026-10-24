import { useDeck, validateProfile } from '../deck/store';
import { useSettings } from '../settings';
import { toast } from '../components/ui';
import { hubClient, useHub } from './client';

/**
 * Tuş düzenini StudioHub üzerinden eşitler. Bilgisayardaki düzen esas alınır:
 * bağlanınca oradaki düzen yüklenir (yoksa bu cihazınki gönderilir), sonra her değişiklik iki yöne akar.
 */
let started = false;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastJson = '';

const enabled = () => useSettings.getState().deckSync && useHub.getState().status === 'connected';

export async function pullDeck(seedIfEmpty: boolean): Promise<'pulled' | 'same' | 'seeded' | 'empty'> {
  const { deck } = await hubClient.getDeck();
  if (deck == null) {
    if (!seedIfEmpty) return 'empty';
    await pushDeck();
    return 'seeded';
  }
  const profile = validateProfile(deck);
  const json = JSON.stringify(profile);
  if (json === JSON.stringify(useDeck.getState().profile)) {
    lastJson = json;
    return 'same';
  }
  applyingRemote = true;
  try {
    useDeck.getState().applyRemote(profile);
    lastJson = json;
  } finally {
    applyingRemote = false;
  }
  return 'pulled';
}

export async function pushDeck() {
  const profile = useDeck.getState().profile;
  await hubClient.putDeck(profile);
  lastJson = JSON.stringify(profile);
}

export function startDeckSync() {
  if (started) return;
  started = true;

  useHub.subscribe((s, prev) => {
    if (s.status === 'connected' && prev.status !== 'connected' && useSettings.getState().deckSync) {
      pullDeck(true).catch((e) => toast(e?.message ?? 'Düzen eşitlenemedi', 'error'));
    }
  });

  hubClient.onDeckChanged(() => {
    if (enabled()) pullDeck(false).catch(() => {});
  });

  useDeck.subscribe((s, prev) => {
    if (applyingRemote || s.profile === prev.profile || !enabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const json = JSON.stringify(useDeck.getState().profile);
      if (json === lastJson || !enabled()) return;
      pushDeck().catch((e) => toast(e?.message ?? 'Düzen bilgisayara gönderilemedi', 'error'));
    }, 700);
  });
}
