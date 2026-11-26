import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { dbToPos, formatDb, mixerChannels, posToDb, type MixerChannel } from '../deck/mixer';
import { OBS_NAMES } from '../deck/model';
import { obsClient } from '../obs/client';
import { useObs } from '../obs/store';
import { useSettings } from '../settings';
import { font, navy } from '../theme';
import { Keycap, toast } from './ui';

/** Sürüklerken OBS'e en sık bu aralıkla yazılır; bırakınca son değer hemen gider. */
const SEND_EVERY_MS = 60;

/**
 * Mikser sayfası: OBS'te sesi olan her kaynak için sustur tuşu ve düzey kaydırıcısı.
 * Liste OBS'ten gelir (kaynak eklenip silinince kendiliğinden değişir); ses efektleri kendi sayfalarında kalır.
 */
export function MixerView({ editing }: { editing: boolean }) {
  const status = useObs((s) => s.status);
  const inputs = useObs((s) => s.inputs);
  const muted = useObs((s) => s.muted);
  const special = useObs((s) => s.specialInputs);
  const scenes = useObs((s) => s.scenes);
  const { width } = useWindowDimensions();
  const [sfx, setSfx] = useState<string[]>([]);

  // Ses efektleri sahnesindeki klipler mikserde gösterilmez.
  useEffect(() => {
    if (status !== 'connected' || !scenes.includes(OBS_NAMES.sfxScene)) {
      setSfx([]);
      return;
    }
    let alive = true;
    obsClient
      .listSceneItems(OBS_NAMES.sfxScene)
      .then((names) => alive && setSfx(names))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [status, scenes, inputs]);

  const channels = useMemo(() => mixerChannels(inputs, muted, special, sfx), [inputs, muted, special, sfx]);
  const twoCols = width >= 760;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {editing ? (
        <View style={styles.note}>
          <Ionicons name="information-circle" size={18} color={navy.accent} />
          <Text style={styles.noteText}>
            Mikser OBS'teki ses kaynaklarını kendiliğinden gösterir; tuş eklenmez. Adını ve yerini Sayfa ayarları'ndan değiştirebilirsin.
          </Text>
        </View>
      ) : null}
      {status !== 'connected' ? (
        <Empty icon="options-outline" text="OBS'e bağlanınca ses kaynakların burada kaydırıcı olarak görünür." />
      ) : channels.length === 0 ? (
        <Empty icon="volume-mute-outline" text="OBS'te sesi olan bir kaynak yok. OBS'e mikrofon ya da masaüstü sesi ekle." />
      ) : (
        <View style={[styles.grid, twoCols && styles.gridTwo]}>
          {channels.map((c) => (
            <View key={c.name} style={twoCols ? styles.cellTwo : styles.cell}>
              <ChannelStrip channel={c} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon as any} size={40} color={navy.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const ChannelStrip = memo(function ChannelStrip({ channel }: { channel: MixerChannel }) {
  const { name } = channel;
  const { db, isMuted, kind } = useObs(
    useShallow((s) => ({
      db: s.volumes[name],
      isMuted: !!s.muted[name],
      kind:
        s.specialInputs.mic1 === name || s.specialInputs.mic2 === name
          ? 'mic'
          : s.specialInputs.desktop1 === name || s.specialInputs.desktop2 === name
            ? 'desktop'
            : 'other',
    })),
  );
  const haptics = useSettings((s) => s.haptics);
  // Sürüklerken gösterilen konum; bırakınca OBS'ten gelen değere dönülür.
  const [drag, setDrag] = useState<number | null>(null);
  const shownDb = drag !== null ? posToDb(drag) : db;

  const icon = kind === 'mic' ? (isMuted ? 'mic-off' : 'mic') : kind === 'desktop' ? (isMuted ? 'volume-mute' : 'volume-high') : isMuted ? 'volume-mute' : 'musical-note';

  const toggleMute = async () => {
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await obsClient.call('ToggleInputMute', { inputName: name });
    } catch (e: any) {
      toast(e?.message ?? 'Susturulamadı', 'error');
    }
  };

  return (
    <View style={[styles.strip, isMuted && styles.stripMuted]}>
      <View style={styles.stripHead}>
        <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={`${name} ${isMuted ? 'sesi aç' : 'sustur'}`} hitSlop={4}>
          {({ pressed }) => (
            <Keycap color={isMuted ? '#C0283A' : '#1B2D55'} pressed={pressed} radius={12} ring={isMuted ? navy.live : undefined} faceStyle={styles.muteFace}>
              <Ionicons name={icon as any} size={22} color="#fff" />
            </Keycap>
          )}
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.state, isMuted && { color: navy.live }]}>{isMuted ? 'Susturuldu' : kind === 'mic' ? 'Mikrofon' : kind === 'desktop' ? 'Masaüstü sesi' : 'Kaynak'}</Text>
        </View>
        <Text style={[styles.db, isMuted && { color: navy.textMuted }]}>{formatDb(shownDb)}</Text>
      </View>
      <Fader
        pos={drag ?? dbToPos(db ?? -100)}
        muted={isMuted}
        label={name}
        onDrag={setDrag}
        onSend={(p) => obsClient.setInputVolumeDb(name, posToDb(p))}
        onEnd={() => setDrag(null)}
      />
    </View>
  );
});

/**
 * Yatay ses kaydırıcısı. Parmağın konumunu izler (dokunduğun yere atlar), OBS'e seyrek yazar.
 * Dokunma alanı 44 px; görünen yiv ince.
 */
function Fader({
  pos,
  muted,
  label,
  onDrag,
  onSend,
  onEnd,
}: {
  pos: number;
  muted: boolean;
  label: string;
  onDrag: (p: number) => void;
  onSend: (p: number) => Promise<void>;
  onEnd: () => void;
}) {
  const track = useRef<ComponentRef<typeof View>>(null);
  const box = useRef({ x: 0, w: 1 });
  const last = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(pos);
  const cb = useRef({ onDrag, onSend, onEnd });
  cb.current = { onDrag, onSend, onEnd };

  const measure = useCallback(() => {
    track.current?.measureInWindow((x: number, _y: number, w: number) => {
      if (w > 0) box.current = { x, w };
    });
  }, []);

  const send = useCallback((p: number, final: boolean) => {
    latest.current = p;
    clearTimeout(pending.current);
    const go = () => {
      last.current = Date.now();
      const r = cb.current.onSend(latest.current).catch((e: any) => toast(e?.message ?? 'Düzey yazılamadı', 'error'));
      if (final) void r.finally(() => cb.current.onEnd());
    };
    const wait = SEND_EVERY_MS - (Date.now() - last.current);
    if (final || wait <= 0) go();
    else pending.current = setTimeout(go, wait);
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          measure();
          const p = clamp((e.nativeEvent.pageX - box.current.x) / box.current.w);
          cb.current.onDrag(p);
          send(p, false);
        },
        onPanResponderMove: (_e, g) => {
          const p = clamp((g.moveX - box.current.x) / box.current.w);
          cb.current.onDrag(p);
          send(p, false);
        },
        onPanResponderRelease: () => send(latest.current, true),
        onPanResponderTerminate: () => send(latest.current, true),
      }),
    [measure, send],
  );

  useEffect(() => () => clearTimeout(pending.current), []);

  const fill = muted ? [navy.outline, navy.outline] : pos > 0.97 ? [navy.accent, navy.warning] : [navy.primary, navy.accent];

  return (
    <View
      ref={track}
      onLayout={measure}
      style={styles.faderHit}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} düzeyi`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pos * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const p = clamp(pos + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05));
        void onSend(p);
      }}
    >
      <View style={styles.groove} pointerEvents="none">
        <LinearGradient colors={fill as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${pos * 100}%` }]} />
        {/* 0 dB işareti en sağda; -20 dB ve -6 dB ara çizgileri */}
        {[-20, -6].map((d) => (
          <View key={d} style={[styles.tick, { left: `${dbToPos(d) * 100}%` }]} />
        ))}
      </View>
      <View pointerEvents="none" style={[styles.thumbWrap, { left: `${pos * 100}%` }]}>
        <LinearGradient colors={['#F4F8FF', '#B9C7E4']} style={[styles.thumb, muted && { opacity: 0.6 }]}>
          <View style={styles.thumbLine} />
        </LinearGradient>
      </View>
    </View>
  );
}

const clamp = (p: number) => Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingVertical: 8, gap: 12 },
  note: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: navy.glass,
    borderWidth: 1,
    borderColor: navy.glassEdge,
  },
  noteText: { color: navy.text, fontFamily: font.body, fontSize: 14, lineHeight: 19, flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { color: navy.textMuted, fontFamily: font.medium, fontSize: 16, textAlign: 'center', maxWidth: 360, lineHeight: 22 },
  grid: { gap: 12 },
  gridTwo: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: undefined, rowGap: 12 },
  cell: { width: '100%' },
  cellTwo: { width: '49.2%' },
  strip: {
    padding: 14,
    paddingBottom: 6,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: navy.faceplate,
    borderTopColor: navy.bevelLight,
    borderLeftColor: 'rgba(160,196,255,0.08)',
    borderRightColor: navy.bevelDark,
    borderBottomColor: navy.bevelDark,
  },
  stripMuted: {
    borderTopColor: 'rgba(255,59,78,0.4)',
    borderLeftColor: 'rgba(255,59,78,0.3)',
    borderRightColor: 'rgba(255,59,78,0.3)',
    borderBottomColor: 'rgba(255,59,78,0.3)',
  },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muteFace: { width: 52, height: 46, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, minWidth: 0 },
  name: { color: navy.text, fontFamily: font.keyBold, fontSize: 17 },
  state: { color: navy.textMuted, fontFamily: font.medium, fontSize: 12.5, marginTop: 1 },
  db: { color: navy.text, fontFamily: font.display, fontSize: 18, fontVariant: ['tabular-nums'], minWidth: 78, textAlign: 'right' },
  faderHit: { height: 48, justifyContent: 'center', marginHorizontal: 14 },
  groove: {
    height: 10,
    borderRadius: 5,
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(220,231,255,0.25)' },
  thumbWrap: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', marginLeft: -14, width: 28 },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  thumbLine: { width: 2, height: 14, borderRadius: 1, backgroundColor: 'rgba(11,21,48,0.55)' },
});
