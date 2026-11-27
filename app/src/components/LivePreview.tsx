import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Image, PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { obsClient } from '../obs/client';
import { useObs } from '../obs/store';
import { useLiveShot } from '../obs/thumbs';
import { useSettings } from '../settings';
import { font, navy, radius, withAlpha } from '../theme';
import { toast } from './ui';

// Canlı önizleme: OBS'in yayındaki (program) sahnesinin görüntüsü saniyede iki kez tazelenir.
// Stüdyo modunda önizleme sahnesi de yanında gösterilir ve tek dokunuşla yayına alınır.
// Dikey ekranda tuşların üstünde, yatay ekranda solunda durur.

const GAP = 8;
/** Etiket satırının yüksekliği (görüntünün altındaki sahne adı). */
const CAPTION = 22;

export function PreviewSplit({ show, children }: { show: boolean; children: ReactNode }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const studio = useObs((s) => s.studioMode);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height });
  };
  const landscape = box.w > box.h * 1.15;
  const tiles = studio ? 2 : 1;

  // Görüntü 16:9. Dikeyde en çok yüksekliğin üçte biri, yatayda en çok genişliğin %40'ı kullanılır.
  let tileW = 0;
  if (show && box.w > 0) {
    if (landscape) {
      const maxW = box.w * 0.4;
      const byHeight = ((box.h - (tiles - 1) * GAP) / tiles - CAPTION) * (16 / 9);
      tileW = Math.min(maxW, byHeight);
    } else {
      const byWidth = (box.w - (tiles - 1) * GAP) / tiles;
      const byHeight = (box.h * 0.32 - CAPTION) * (16 / 9);
      tileW = Math.min(byWidth, byHeight);
    }
  }
  const visible = tileW >= 120;

  return (
    <View style={[styles.fill, landscape ? styles.row : styles.col]} onLayout={onLayout}>
      {visible ? (
        <View style={[landscape ? styles.panelSide : styles.panelTop]}>
          {studio ? <Tile kind="preview" width={tileW} /> : null}
          <Tile kind="program" width={tileW} />
        </View>
      ) : null}
      <View style={styles.fill}>{children}</View>
    </View>
  );
}

function Tile({ kind, width }: { kind: 'program' | 'preview'; width: number }) {
  const scene = useObs((s) => (kind === 'program' ? s.programScene : s.previewScene));
  const connected = useObs((s) => s.status === 'connected');
  const live = useObs((s) => kind === 'program' && (s.stream.active || s.record.active));
  const thumbsOn = useSettings((s) => s.sceneThumbs);
  const haptics = useSettings((s) => s.haptics);
  const height = Math.round((width * 9) / 16);
  const px = Math.min(640, Math.round(width * Math.min(PixelRatio.get(), 2)));
  const uri = useLiveShot(scene, thumbsOn && connected, px, kind === 'program' ? 500 : 800);
  const tally = kind === 'program' ? navy.live : navy.success;

  const take = async () => {
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await obsClient.call('TriggerStudioModeTransition');
    } catch (e: any) {
      toast(e?.message ?? 'Geçiş yapılamadı', 'error');
    }
  };

  return (
    <View style={{ width }}>
      <View style={[styles.frame, { height, borderColor: withAlpha(tally, kind === 'program' && !live ? 0.45 : 0.9) }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" fadeDuration={0} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name={connected ? 'videocam-outline' : 'cloud-offline-outline'} size={22} color={navy.textMuted} />
            <Text style={styles.emptyText}>{!connected ? 'OBS bağlı değil' : thumbsOn ? 'Görüntü bekleniyor' : 'Canlı görüntü ayarlardan kapalı'}</Text>
          </View>
        )}
        <View style={[styles.badge, { backgroundColor: withAlpha(tally, 0.92) }]}>
          {kind === 'program' && live ? <View style={styles.liveDot} /> : null}
          <Text style={styles.badgeText}>{kind === 'program' ? (live ? 'CANLI' : 'PROGRAM') : 'ÖNİZLEME'}</Text>
        </View>
        {kind === 'preview' ? (
          <Pressable onPress={() => void take()} accessibilityRole="button" accessibilityLabel="Önizlemeyi yayına al" hitSlop={6} style={styles.takeWrap}>
            {({ pressed }) => (
              <View style={[styles.take, pressed && styles.takePressed]}>
                <Ionicons name="swap-horizontal" size={14} color="#fff" />
                <Text style={styles.takeText}>Yayına al</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.caption} numberOfLines={1}>
        {scene ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  col: { flexDirection: 'column' },
  row: { flexDirection: 'row' },
  panelTop: { flexDirection: 'row', justifyContent: 'center', gap: GAP, paddingTop: 6, paddingBottom: 4 },
  panelSide: { justifyContent: 'center', gap: GAP, paddingRight: 10 },
  frame: {
    borderRadius: radius.sm + 2,
    borderWidth: 2,
    backgroundColor: navy.well,
    overflow: 'hidden',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  emptyText: { color: navy.textMuted, fontFamily: font.medium, fontSize: 12, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  badgeText: { color: '#fff', fontFamily: font.keyBold, fontSize: 11, letterSpacing: 0.8 },
  takeWrap: { position: 'absolute', right: 6, bottom: 6 },
  take: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: navy.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  takePressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  takeText: { color: '#fff', fontFamily: font.semi, fontSize: 12 },
  caption: { color: navy.text, fontFamily: font.key, fontSize: 13, height: CAPTION - 4, marginTop: 4, textAlign: 'center' },
});
