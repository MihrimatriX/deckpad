import { Platform } from 'react-native';

/**
 * DeckPad'in bilgisayar sürümü: StudioHub aynı kodun web derlemesini sunar.
 *   ?mode=desktop -> StudioHub'ın DeckPad penceresi
 *   ?mode=dock    -> OBS'in içindeki DeckPad paneli
 * Bağlantı bilgileri StudioHub'ın yalnızca bu bilgisayara verdiği /panel-config.json'dan gelir.
 */
export type PanelMode = 'desktop' | 'dock';

export interface PanelConfig {
  obs: { host: string; port: number; password: string };
  hub: { url: string; token: string; name: string };
  storage: 'hub';
}

const params = Platform.OS === 'web' && typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const raw = params?.get('mode');

export const panelMode: PanelMode | null = raw === 'desktop' || raw === 'dock' ? raw : null;
export const isWeb = Platform.OS === 'web';

export async function loadPanelConfig(): Promise<PanelConfig | null> {
  if (!isWeb) return null;
  try {
    const r = await fetch('/panel-config.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const c = (await r.json()) as PanelConfig;
    return c?.hub?.url ? c : null;
  } catch {
    return null;
  }
}
