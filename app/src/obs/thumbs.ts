import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { obsClient } from './client';
import { useObs } from './store';

// Sahne küçük resimleri ve canlı önizleme: OBS'in GetSourceScreenshot isteğiyle alınan JPEG'ler (data URI).
// Yalnız ekranda görünen sahneler, yalnız uygulama öndeyken ve OBS bağlıyken istenir.

export const useThumbs = create<{ images: Record<string, string> }>(() => ({ images: {} }));

/** Uygulama ön planda mı (arka planda iken hiçbir görüntü istenmez). */
export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Verilen sahnelerin küçük resimlerini `everyMs` aralıkla tazeler.
 * Bir tur bitmeden yenisi başlamaz; OBS yavaşsa aralık kendiliğinden uzar.
 */
export function useSceneThumbs(scenes: string[], enabled: boolean, width = 192, everyMs = 3000) {
  const connected = useObs((s) => s.status === 'connected');
  const active = useAppActive();
  const key = scenes.join('\u0000');
  useEffect(() => {
    if (!enabled || !connected || !active || !scenes.length) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const got = await obsClient.screenshots(scenes, width);
        if (alive && Object.keys(got).length) useThumbs.setState((s) => ({ images: { ...s.images, ...got } }));
      } catch {}
      if (alive) timer = setTimeout(tick, everyMs);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, connected, active, width, everyMs]);
}

/** Tek bir kaynağın (sahnenin) sık tazelenen görüntüsü: canlı önizleme için. */
export function useLiveShot(source: string | undefined, enabled: boolean, width: number, everyMs = 500) {
  const connected = useObs((s) => s.status === 'connected');
  const active = useAppActive();
  const [uri, setUri] = useState<string>();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !connected || !active || !source) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const got = await obsClient.screenshots([source], width, 70);
        const u = got[source];
        if (alive && u && u !== last.current) {
          last.current = u;
          setUri(u);
        }
      } catch {}
      if (alive) timer = setTimeout(tick, everyMs);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [source, enabled, connected, active, width, everyMs]);
  // Kapalıyken ya da bağlantı yokken eski görüntü gösterilmez.
  return source && enabled && connected ? uri : undefined;
}
