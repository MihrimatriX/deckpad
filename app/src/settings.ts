import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

const KEY = 'deckpad.settings.v1';
const PASS_KEY = 'deckpad.obs.password';
const HUB_TOKEN_KEY = 'deckpad.hub.token';

export interface Settings {
  host: string;
  port: number;
  password: string;
  keepAwake: boolean;
  haptics: boolean;
  showStats: boolean;
  /** StudioHub (bilgisayar eylemleri). Boşsa eşleşilmemiş demektir. */
  hubHost: string;
  hubPort: number;
  hubToken: string;
  hubName: string;
  /** Tuş düzenini bilgisayardaki panellerle eşitle. */
  deckSync: boolean;
}

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<void>;
}

const defaults: Settings = {
  host: '',
  port: 4455,
  password: '',
  keepAwake: true,
  haptics: true,
  showStats: true,
  hubHost: '',
  hubPort: 4466,
  hubToken: '',
  hubName: '',
  deckSync: false,
};

// Telefonda Android Keystore destekli güvenli depo; tarayıcıda (bilgisayar paneli) böyle bir depo yok.
const secret = Platform.OS === 'web' ? {
  get: async (k: string) => (await AsyncStorage.getItem(k).catch(() => null)) ?? '',
  set: async (k: string, v: string) => {
    await (v ? AsyncStorage.setItem(k, v) : AsyncStorage.removeItem(k)).catch(() => {});
  },
} : {
  get: async (k: string) => (await SecureStore.getItemAsync(k).catch(() => null)) ?? '',
  set: async (k: string, v: string) => {
    try {
      if (v) await SecureStore.setItemAsync(k, v);
      else await SecureStore.deleteItemAsync(k);
    } catch {
      // Güvenli depo yoksa (ör. web) değer yalnızca bu oturumda kalır.
    }
  },
};

export const useSettings = create<SettingsStore>((set, get) => ({
  ...defaults,
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const stored = raw ? JSON.parse(raw) : {};
      // Şifre ve eşleştirme anahtarı düz metin olarak değil, cihazın güvenli deposunda tutulur.
      const password = await secret.get(PASS_KEY);
      const hubToken = await secret.get(HUB_TOKEN_KEY);
      set({ ...defaults, ...stored, password, hubToken, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (patch) => {
    set(patch);
    const { password, hubToken, loaded: _l, load: _ld, save: _s, ...plain } = { ...get(), ...patch } as SettingsStore;
    await AsyncStorage.setItem(KEY, JSON.stringify(plain));
    if ('password' in patch) await secret.set(PASS_KEY, password);
    if ('hubToken' in patch) await secret.set(HUB_TOKEN_KEY, hubToken);
  },
}));
