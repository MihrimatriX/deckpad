import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';
import { buttonIncomplete } from '../deck/actions';
import type { DeckButton, DeckPage } from '../deck/model';
import { isPcAction } from '../deck/model';
import { buttonState, runButton } from '../deck/run';
import { useHub } from '../hub/client';
import { useDeck } from '../deck/store';
import { useObs } from '../obs/store';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../settings';
import { DeckButtonView } from './DeckButtonView';
import { toast } from './ui';
import { navy } from '../theme';

const GAP = 12;
/** Tuşları çevreleyen ön panelin iç boşluğu. */
const FP = 12;

export function DeckGrid({ page, onEditButton }: { page: DeckPage; onEditButton: (b: DeckButton) => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const editing = useDeck((s) => s.editing);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height });
  };

  // Dikeyde kullanıcının ayarladığı sütun/satır kullanılır.
  // Yatayda butonlar, ekrana en büyük sığacak sütun sayısıyla yeniden dizilir.
  const { size, cols } = useMemo(
    () => fitGrid(box.w - FP * 2 - 2, box.h - FP * 2 - 10, page.cols, page.rows, page.buttons.length),
    [box, page.cols, page.rows, page.buttons.length],
  );

  const gridWidth = size * cols + GAP * (cols - 1);
  const layoutPage = cols === page.cols ? page : { ...page, cols };

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size > 0 ? (
        editing ? (
          <EditGrid page={layoutPage} size={size} width={gridWidth} onEditButton={onEditButton} />
        ) : (
          <PlayGrid page={layoutPage} size={size} width={gridWidth} />
        )
      ) : null}
    </View>
  );
}

export function fitGrid(w: number, h: number, pageCols: number, pageRows: number, count: number) {
  if (!w || !h) return { size: 0, cols: pageCols };
  const sizeFor = (c: number, r: number) => Math.floor(Math.min((w - (c - 1) * GAP) / c, (h - (r - 1) * GAP) / r));
  const portraitSize = sizeFor(pageCols, pageRows);
  if (w <= h * 1.15 || count === 0) return { size: Math.max(40, portraitSize), cols: pageCols };
  let best = { size: portraitSize, cols: pageCols };
  for (let c = pageCols; c <= Math.max(pageCols, count); c++) {
    const sz = sizeFor(c, Math.max(1, Math.ceil(count / c)));
    if (sz > best.size) best = { size: sz, cols: c };
  }
  return { size: Math.max(40, best.size), cols: best.cols };
}

// ---------- Normal mod: basınca çalışır ----------

function PlayGrid({ page, size, width }: { page: DeckPage; size: number; width: number }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Faceplate>
        <View style={[styles.wrap, { width }]}>
          {page.buttons.map((b) => (
            <PlayButton key={b.id} button={b} size={size} />
          ))}
        </View>
      </Faceplate>
    </ScrollView>
  );
}

function PlayButton({ button, size }: { button: DeckButton; size: number }) {
  const state = useObs(useShallow((s) => buttonState(button, s)));
  const connected = useObs((s) => s.status === 'connected');
  const pcConnected = useHub((s) => s.status === 'connected');
  const haptics = useSettings((s) => s.haptics);
  const setPage = useDeck((s) => s.setPage);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (button.spacer || busy) return;
    const needsObs = button.actions.some((a) => a.type !== 'page' && a.type !== 'delay' && !isPcAction(a));
    const needsPc = button.actions.some(isPcAction);
    if (needsObs && !connected) {
      toast('OBS bağlı değil', 'error');
      return;
    }
    if (needsPc && !pcConnected) {
      toast('Bilgisayar bağlı değil. StudioHub\'daki QR kodu okut.', 'error');
      return;
    }
    setBusy(true);
    try {
      const errors = await runButton(button, { goToPage: setPage });
      if (errors.length) {
        toast(errors[0], 'error');
        if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      toast(e?.message ?? 'Hata', 'error');
    } finally {
      setBusy(false);
    }
  }, [button, busy, connected, pcConnected, haptics, setPage]);

  if (button.spacer) return <DeckButtonView button={button} size={size} state={state} />;

  return (
    <Pressable
      onPressIn={() => haptics && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      onPress={() => {
        if (button.confirm) toast('Çalıştırmak için basılı tut');
        else void run();
      }}
      onLongPress={() => {
        if (!button.confirm) return;
        if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        void run();
      }}
      delayLongPress={button.confirm ? 600 : 400}
      accessibilityRole="button"
      accessibilityLabel={button.label}
    >
      {({ pressed }) => (
        <DeckButtonView
          button={button}
          size={size}
          state={state}
          pressed={pressed || busy}
          incomplete={buttonIncomplete(button)}
        />
      )}
    </Pressable>
  );
}

// ---------- Düzenleme modu: sürükle bırak, dokununca düzenle ----------

function EditGrid({
  page,
  size,
  width,
  onEditButton,
}: {
  page: DeckPage;
  size: number;
  width: number;
  onEditButton: (b: DeckButton) => void;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const mutate = useDeck((s) => s.mutate);
  const haptics = useSettings((s) => s.haptics);

  const renderItem = useCallback<SortableGridRenderItem<DeckButton>>(
    ({ item }) => (
      <Sortable.Touchable onTap={() => onEditButton(item)} style={{ width: size, height: size }}>
        <DeckButtonView button={item} size={size} state={{ active: false }} editing incomplete={buttonIncomplete(item)} />
      </Sortable.Touchable>
    ),
    [size, onEditButton],
  );

  return (
    <Animated.ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Faceplate>
      <View style={{ width }}>
        <Sortable.Grid
          key={`${page.id}-${page.cols}-${size}`}
          data={page.buttons}
          columns={page.cols}
          rowGap={GAP}
          columnGap={GAP}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          scrollableRef={scrollRef}
          hapticsEnabled={haptics}
          dragActivationDelay={180}
          activeItemScale={1.08}
          onDragEnd={({ data }) =>
            mutate((p) => ({
              ...p,
              pages: p.pages.map((pg) => (pg.id === page.id ? { ...pg, buttons: data } : pg)),
            }))
          }
        />
      </View>
      </Faceplate>
    </Animated.ScrollView>
  );
}

/** Tuşların oturduğu ön panel: kenarları eğimli, gövdeden hafifçe yükselen bir levha. */
function Faceplate({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[navy.chassisTop, navy.faceplate, navy.chassisBottom]} locations={[0, 0.5, 1]} style={styles.faceplate}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  faceplate: {
    padding: FP,
    borderRadius: 26,
    borderWidth: 1,
    borderTopColor: navy.bevelLight,
    borderLeftColor: 'rgba(160,196,255,0.08)',
    borderRightColor: navy.bevelDark,
    borderBottomColor: navy.bevelDark,
  },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
