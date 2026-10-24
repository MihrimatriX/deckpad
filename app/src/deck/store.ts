import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { defaultProfile } from './defaults';
import type { DeckProfile } from './model';
import { validateProfile } from './ops';

export * from './ops';

const KEY = 'deckpad.profile.v1';
const MAX_HISTORY = 40;

interface DeckStore {
  loaded: boolean;
  profile: DeckProfile;
  pageId: string;
  editing: boolean;
  history: DeckProfile[];
  load: () => Promise<void>;
  setPage: (id: string) => void;
  setEditing: (v: boolean) => void;
  /** Profili değiştirir, geri alma geçmişine ekler ve kaydeder. */
  mutate: (fn: (p: DeckProfile) => DeckProfile) => void;
  undo: () => void;
  replaceProfile: (p: DeckProfile) => void;
  /** Bilgisayardan gelen düzen: geçmişe eklenmez, açık sayfa korunur. */
  applyRemote: (p: DeckProfile) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const persist = (p: DeckProfile) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
  }, 250);
};

export const useDeck = create<DeckStore>((set, get) => {
  const initial = defaultProfile();
  return {
    loaded: false,
    profile: initial,
    pageId: initial.pages[0].id,
    editing: false,
    history: [],

    load: async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const p = validateProfile(JSON.parse(raw));
          set({ profile: p, pageId: p.pages[0].id, loaded: true });
          return;
        }
      } catch {}
      persist(get().profile);
      set({ loaded: true });
    },

    setPage: (id) => {
      if (get().profile.pages.some((p) => p.id === id)) set({ pageId: id });
    },

    setEditing: (v) => set({ editing: v, history: v ? get().history : [] }),

    mutate: (fn) => {
      const prev = get().profile;
      const next = fn(prev);
      if (next === prev) return;
      const history = [...get().history, prev].slice(-MAX_HISTORY);
      const pageId = next.pages.some((p) => p.id === get().pageId) ? get().pageId : next.pages[0].id;
      set({ profile: next, history, pageId });
      persist(next);
    },

    undo: () => {
      const h = get().history;
      if (!h.length) return;
      const prev = h[h.length - 1];
      const pageId = prev.pages.some((p) => p.id === get().pageId) ? get().pageId : prev.pages[0].id;
      set({ profile: prev, history: h.slice(0, -1), pageId });
      persist(prev);
    },

    applyRemote: (p) => {
      const pageId = p.pages.some((pg) => pg.id === get().pageId) ? get().pageId : p.pages[0].id;
      set({ profile: p, pageId });
      persist(p);
    },

    replaceProfile: (p) => {
      const valid = validateProfile(p);
      set({ profile: valid, pageId: valid.pages[0].id, history: [...get().history, get().profile] });
      persist(valid);
    },
  };
});

