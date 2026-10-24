import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addPage, useDeck } from '../deck/store';
import { useHub } from '../hub/client';
import { useObs } from '../obs/store';
import { useSettings } from '../settings';
import { font, navy, space } from '../theme';
import { Btn, IconBtn, Keycap } from './ui';

// ---------- Üst çubuk: cihazın durum ekranı ----------

export function TopBar({
  onConnect,
  onSettings,
  onPageSettings,
  onAddButton,
}: {
  onConnect: () => void;
  onSettings: () => void;
  onPageSettings: () => void;
  onAddButton: () => void;
}) {
  const editing = useDeck((s) => s.editing);
  const setEditing = useDeck((s) => s.setEditing);
  const undo = useDeck((s) => s.undo);
  const canUndo = useDeck((s) => s.history.length > 0);

  if (editing) {
    return (
      <View style={styles.bar}>
        <View style={[styles.display, styles.editDisplay]}>
          <Ionicons name="construct" size={16} color={navy.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.editTitle}>Düzenleme</Text>
            <Text style={styles.editHint} numberOfLines={1}>
              Sürükleyerek taşı, dokunarak düzenle
            </Text>
          </View>
        </View>
        <IconBtn icon="arrow-undo" label="Geri al" onPress={undo} color={canUndo ? navy.text : navy.outline} />
        <IconBtn icon="grid-outline" label="Sayfa ayarları" onPress={onPageSettings} />
        <IconBtn icon="add" label="Tuş ekle" onPress={onAddButton} color={navy.accent} size={24} />
        <Btn title="Bitti" onPress={() => setEditing(false)} style={{ width: 76 }} />
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <StatusDisplay onPress={onConnect} />
      <IconBtn icon="create-outline" label="Düzenle" onPress={() => setEditing(true)} />
      <IconBtn icon="settings-outline" label="Ayarlar" onPress={onSettings} />
    </View>
  );
}

/** Gövdeye gömülü koyu cam ekran: bağlantı ışığı, kayıt ve yayın sayaçları, OBS ölçümleri. */
function StatusDisplay({ onPress }: { onPress: () => void }) {
  const status = useObs((s) => s.status);
  const version = useObs((s) => s.obsVersion);
  const error = useObs((s) => s.error);
  const record = useObs((s) => s.record);
  const stream = useObs((s) => s.stream);
  const stats = useObs((s) => s.stats);
  const showStats = useSettings((s) => s.showStats);
  const hub = useHub((h) => h.status);
  const connected = status === 'connected';
  const hubLed = hub === 'connected' ? navy.success : hub === 'error' ? navy.live : navy.warning;

  const led = connected ? navy.success : status === 'error' ? navy.live : status === 'connecting' ? navy.warning : navy.textMuted;
  const title = connected
    ? `OBS${version ? ` ${version.split('.').slice(0, 2).join('.')}` : ''}`
    : status === 'connecting'
      ? 'Bağlanıyor'
      : status === 'error'
        ? error ?? 'Bağlanamadı'
        : "OBS'e bağlan";
  const dropped = stats ? stats.renderSkipped + stats.outputSkipped + (stream.dropped ?? 0) : 0;
  // Kayıt veya yayın sürerken yer açmak için yalnızca "OBS" yazılır.
  const busy = connected && (record.active || stream.active);
  const shownTitle = busy ? 'OBS' : title;

  return (
    <Pressable onPress={onPress} style={styles.display} accessibilityRole="button" accessibilityLabel="OBS bağlantısı">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.displayRow} style={styles.noGrow}>
        <Led color={led} />
        <Text style={[styles.dispTitle, !connected && { color: status === 'idle' ? navy.accent : led }]} numberOfLines={1}>
          {shownTitle}
        </Text>
        {hub !== 'off' ? (
          <Segment>
            <Ionicons name="desktop-outline" size={15} color={hubLed} accessibilityLabel={hub === 'connected' ? 'Bilgisayar bağlı' : 'Bilgisayar bağlı değil'} />
            <Text style={[styles.caption, { color: hub === 'connected' ? navy.text : hubLed }]}>PC</Text>
          </Segment>
        ) : null}
        {connected && record.active ? (
          <Segment>
            <Led color={record.paused ? navy.warning : navy.live} blink={!record.paused} />
            <Text style={[styles.time, { color: record.paused ? navy.warning : navy.live }]}>{record.timecode ?? '00:00:00'}</Text>
          </Segment>
        ) : null}
        {connected && stream.active ? (
          <Segment>
            <Ionicons name="radio" size={15} color={navy.live} accessibilityLabel="Canlı yayın" />
            <Text style={[styles.time, { color: navy.live }]}>{stream.timecode ?? '00:00:00'}</Text>
            {stream.kbps !== undefined ? <Text style={styles.value}>{(stream.kbps / 1000).toFixed(1)} Mb/s</Text> : null}
          </Segment>
        ) : null}
        {connected && showStats && stats ? (
          <Segment>
            <Text style={styles.caption}>CPU</Text>
            <Text style={styles.value}>%{Math.round(stats.cpu)}</Text>
            <Text style={styles.caption}>FPS</Text>
            <Text style={styles.value}>{Math.round(stats.fps)}</Text>
            {dropped > 0 ? <Text style={[styles.value, { color: navy.warning }]}>{dropped} kare düştü</Text> : null}
          </Segment>
        ) : null}
      </ScrollView>
      {/* Sağ kenar geçişi: şeridin kaydırılabildiğini gösterir */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(4,10,24,0)', navy.glass]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeRight}
      />
    </Pressable>
  );
}

function Segment({ children }: { children: ReactNode }) {
  return (
    <View style={styles.segment}>
      <View style={styles.divider} />
      {children}
    </View>
  );
}

/** Durum ışığı. Kayıt sürerken yavaşça yanıp söner. */
function Led({ color, blink }: { color: string; blink?: boolean }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    if (blink) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((reduce) => {
          if (reduce || cancelled) return;
          loop = Animated.loop(
            Animated.sequence([
              Animated.timing(a, { toValue: 0.25, duration: 600, useNativeDriver: true }),
              Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true }),
            ]),
          );
          loop.start();
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      loop?.stop();
      a.setValue(1);
    };
  }, [blink, a]);
  return <Animated.View style={[styles.led, { backgroundColor: color, shadowColor: color, opacity: a }]} />;
}

// ---------- Alt sayfa seçici ----------

export function PageTabs() {
  const pages = useDeck((s) => s.profile.pages);
  const pageId = useDeck((s) => s.pageId);
  const setPage = useDeck((s) => s.setPage);
  const editing = useDeck((s) => s.editing);
  const mutate = useDeck((s) => s.mutate);

  return (
    <View style={styles.tabTrack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.tabs}>
        {pages.map((p) => {
          const on = p.id === pageId;
          return (
            <Pressable key={p.id} onPress={() => setPage(p.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              {({ pressed }) =>
                on ? (
                  <Keycap color={navy.primary} pressed={pressed} height={3} radius={11} ring={navy.accent} faceStyle={styles.tabFace}>
                    <Text style={[styles.tabText, { color: '#fff' }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Keycap>
                ) : (
                  <View style={[styles.tabOff, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.tabText} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </View>
                )
              }
            </Pressable>
          );
        })}
        {editing ? (
          <Pressable
            onPress={() => {
              let id = '';
              mutate((p) => {
                const r = addPage(p, `Sayfa ${p.pages.length + 1}`);
                id = r.id;
                return r.profile;
              });
              setPage(id);
            }}
            style={({ pressed }) => [styles.tabOff, styles.tabAdd, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="add" size={18} color={navy.accent} />
            <Text style={[styles.tabText, { color: navy.accent }]}>Sayfa ekle</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingTop: 6, paddingBottom: 10 },
  noGrow: { flexGrow: 0 },
  display: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: navy.glass,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
    borderLeftColor: 'rgba(0,0,0,0.6)',
    borderRightColor: navy.glassEdge,
    borderBottomColor: navy.glassEdge,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  displayRow: { alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 28 },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 26 },
  editDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  editTitle: { color: navy.text, fontFamily: font.display, fontSize: 16 },
  editHint: { color: navy.textMuted, fontFamily: font.body, fontSize: 12 },
  dispTitle: { color: navy.text, fontFamily: font.keyBold, fontSize: 16, maxWidth: 220 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  divider: { width: 1, height: 22, backgroundColor: navy.glassEdge, marginRight: 3 },
  time: { fontFamily: font.display, fontSize: 18, fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  caption: { color: navy.textMuted, fontFamily: font.medium, fontSize: 11.5 },
  value: { color: navy.text, fontFamily: font.keyBold, fontSize: 15, fontVariant: ['tabular-nums'] },
  led: {
    width: 9,
    height: 9,
    borderRadius: 5,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  tabTrack: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    marginTop: 4,
    borderRadius: 15,
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
  },
  tabs: { gap: 6, padding: 5, alignItems: 'center' },
  tabFace: { height: 38, paddingHorizontal: 18, minWidth: 64, alignItems: 'center', justifyContent: 'center', maxWidth: 190 },
  tabOff: {
    height: 41,
    paddingHorizontal: 16,
    borderRadius: 11,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 190,
  },
  tabAdd: { borderWidth: 1, borderStyle: 'dashed', borderColor: navy.outline },
  tabText: { color: navy.textMuted, fontFamily: font.keyBold, fontSize: 15 },
});
