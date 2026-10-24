import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import type { DeckButton } from '../deck/model';
import type { ButtonState, Tone } from '../deck/run';
import { font, navy, shade, withAlpha } from '../theme';

const toneColor: Record<Tone, string> = {
  accent: navy.accent,
  live: navy.live,
  warning: navy.warning,
  success: navy.success,
};

/**
 * Stream Deck tarzı fiziksel tuş: gövdeye oyulmuş bir yuva, içinde yükseklikli renkli kapak.
 * Aktif durumda kapağın üst kenarındaki LED ve çevresindeki halka tally rengiyle yanar.
 */
export const DeckButtonView = memo(function DeckButtonView({
  button,
  size,
  state,
  editing,
  incomplete,
  pressed,
}: {
  button: DeckButton;
  size: number;
  state: ButtonState;
  editing?: boolean;
  incomplete?: boolean;
  pressed?: boolean;
}) {
  const r = Math.max(10, size * 0.16);
  const inset = Math.max(2, Math.round(size * 0.03));

  if (button.spacer) {
    return (
      <View style={{ width: size, height: size }}>
        <View style={[styles.well, { borderRadius: r + inset }, editing && styles.spacerEdit]} />
      </View>
    );
  }

  const tc = state.active && state.tone ? toneColor[state.tone] : undefined;
  const lift = Math.max(3, Math.round(size * 0.045));
  const skirt = pressed ? 1 : lift;
  const iconSize = Math.max(16, Math.min(46, size * (state.sub ? 0.27 : 0.33)));
  // En uzun kelime tek satıra sığsın; kelime ortasından bölünmesin.
  const longest = Math.max(1, ...button.label.split(/\s+/).map((w) => w.length));
  const labelSize = Math.max(10, Math.min(17, size * 0.14, (size - 18) / (longest * 0.52)));
  const showSub = !!state.sub && size >= 64;
  const color = button.color;

  return (
    <View style={{ width: size, height: size }}>
      {tc ? <Halo color={tc} radius={r + inset + 3} pulse={state.tone === 'live'} /> : null}
      {/* Gövdedeki yuva */}
      <View style={[styles.well, { borderRadius: r + inset }]} />
      {/* Kapağın yan yüzü (etek) */}
      <View
        style={{
          position: 'absolute',
          left: inset,
          right: inset,
          top: inset + (lift - skirt),
          bottom: inset,
          borderRadius: r,
          backgroundColor: shade(color, -0.55),
        }}
      >
        <LinearGradient
          colors={[shade(color, 0.18), color, shade(color, -0.18)]}
          locations={[0, 0.48, 1]}
          style={[
            styles.face,
            {
              marginBottom: skirt,
              borderRadius: r,
              borderColor: tc ? withAlpha(tc, 0.9) : 'rgba(255,255,255,0.08)',
              borderWidth: tc ? 1.5 : 1,
            },
          ]}
        >
          <View pointerEvents="none" style={[styles.highlight, { borderTopLeftRadius: r, borderTopRightRadius: r }]} />
          {tc ? <View style={[styles.led, { backgroundColor: tc, shadowColor: tc, width: size * 0.32 }]} /> : null}
          {button.icon ? (
            <Ionicons name={(state.iconOverride ?? button.icon) as any} size={iconSize} color="rgba(255,255,255,0.96)" style={styles.engrave} />
          ) : null}
          {button.label ? (
            <Text style={[styles.label, { fontSize: labelSize, lineHeight: labelSize * 1.12 }]} numberOfLines={2}>
              {button.label}
            </Text>
          ) : null}
          {showSub ? (
            <View style={[styles.subPill, { backgroundColor: tc ?? navy.glass }]}>
              <Text style={[styles.subText, { fontSize: Math.max(9, Math.min(12, size * 0.09)) }]} numberOfLines={1}>
                {state.sub}
              </Text>
            </View>
          ) : null}
          {button.confirm && !editing ? (
            <Ionicons name="hand-left" size={Math.max(10, size * 0.1)} color="rgba(255,255,255,0.55)" style={[styles.corner, { top: r * 0.45, right: r * 0.45 }]} />
          ) : null}
          {incomplete ? <Ionicons name="warning" size={16} color={navy.warning} style={[styles.corner, { top: r * 0.4, left: r * 0.4 }]} /> : null}
        </LinearGradient>
      </View>
      {editing ? (
        <View style={styles.editBadge}>
          <Ionicons name="pencil" size={11} color={navy.background} />
        </View>
      ) : null}
    </View>
  );
});

/** Aktif tuşun çevresindeki ışık halkası. Canlı yayındaki tuşlarda yavaşça nefes alır. */
function Halo({ color, radius, pulse }: { color: string; radius: number; pulse: boolean }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    if (pulse) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((reduce) => {
          if (reduce || cancelled) return;
          loop = Animated.loop(
            Animated.sequence([
              Animated.timing(a, { toValue: 0.45, duration: 900, useNativeDriver: true }),
              Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
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
  }, [pulse, a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.halo,
        {
          borderRadius: radius,
          borderColor: withAlpha(color, 0.55),
          backgroundColor: withAlpha(color, 0.14),
          shadowColor: color,
          opacity: a,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  well: {
    ...StyleSheet.absoluteFill,
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
  },
  spacerEdit: { borderStyle: 'dashed', borderColor: navy.outline },
  halo: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderWidth: 1.5,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 3, overflow: 'hidden' },
  highlight: { position: 'absolute', top: 0, left: 8, right: 8, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  led: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    height: 3,
    borderRadius: 2,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  engrave: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  label: {
    color: '#FFFFFF',
    fontFamily: 'BarlowSemiCondensed_600SemiBold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  subPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, maxWidth: '100%' },
  subText: { color: '#050C1F', fontFamily: font.keyBold, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  corner: { position: 'absolute' },
  editBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: navy.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: navy.background,
  },
});
