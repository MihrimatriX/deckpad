// Yalnızca kullanılan ağırlıklar alınır; paket kökünden almak tüm ağırlıkları uygulamaya ekler.
import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { BarlowSemiCondensed_600SemiBold } from '@expo-google-fonts/barlow-semi-condensed/600SemiBold';
import { BarlowSemiCondensed_700Bold } from '@expo-google-fonts/barlow-semi-condensed/700Bold';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ButtonEditor } from './src/components/ButtonEditor';
import { PageTabs, TopBar } from './src/components/Chrome';
import { DeckGrid } from './src/components/DeckGrid';
import { MixerView } from './src/components/Mixer';
import { ConnectSheet, PageSheet, SettingsSheet } from './src/components/Sheets';
import { toast, ToastHost } from './src/components/ui';
import { sceneButtons, sceneOf, sfxButtons, sfxOf } from './src/deck/defaults';
import { newId, OBS_NAMES, type DeckButton } from './src/deck/model';
import { collectBindings } from './src/deck/run';
import { syncAutoButtons, updatePage, useDeck } from './src/deck/store';
import { obsClient } from './src/obs/client';
import { useObs } from './src/obs/store';
import { deviceName } from './src/device';
import { hubClient, hubUrl } from './src/hub/client';
import { startDeckSync } from './src/hub/sync';
import { loadPanelConfig, panelMode } from './src/panel';
import { useSettings } from './src/settings';
import { navy } from './src/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
  });
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Chassis>{fontsLoaded || fontError ? <Main /> : null}</Chassis>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Cihaz gövdesi: koyu mavi eloksal yüzey. */
function Chassis({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[navy.chassisTop, navy.background, navy.chassisBottom]} locations={[0, 0.45, 1]} style={styles.root}>
      {children}
    </LinearGradient>
  );
}

function KeepAwake() {
  useKeepAwake('deckpad');
  return null;
}

/** Otomatik sayfayı OBS'teki adlarla eşitler. OBS kaynaklı değişiklik kullanıcı düzenlemesi değildir: geri alma geçmişine girmez. */
function syncAutoPage(
  pageId: string,
  names: string[],
  bound: (b: DeckButton) => string | undefined,
  make: (names: string[]) => DeckButton[],
) {
  const deck = useDeck.getState();
  const page = deck.profile.pages.find((p) => p.id === pageId);
  if (!page) return;
  const buttons = syncAutoButtons(page.buttons, names, bound, make);
  if (buttons === page.buttons) return;
  deck.applyRemote(
    updatePage(deck.profile, pageId, (pg) => ({ ...pg, buttons, rows: Math.max(pg.rows, Math.ceil(buttons.length / pg.cols)) })),
  );
}

function Main() {
  const settingsLoaded = useSettings((s) => s.loaded);
  const deckLoaded = useDeck((s) => s.loaded);
  const keepAwake = useSettings((s) => s.keepAwake);
  const profile = useDeck((s) => s.profile);
  const pageId = useDeck((s) => s.pageId);
  const deckEditing = useDeck((s) => s.editing);
  const status = useObs((s) => s.status);
  const scenes = useObs((s) => s.scenes);
  const inputs = useObs((s) => s.inputs);

  const [sheet, setSheet] = useState<'connect' | 'settings' | 'page' | null>(null);
  const [editing, setEditing] = useState<{ button: DeckButton; isNew: boolean } | null>(null);

  // İlk açılış: ayarları ve desteyi yükle, kayıtlı OBS ve bilgisayar varsa bağlan.
  useEffect(() => {
    void (async () => {
      await Promise.all([useSettings.getState().load(), useDeck.getState().load()]);
      startDeckSync();

      // Bilgisayardaki panel: bağlantı bilgileri StudioHub'dan gelir, düzen bilgisayarda tutulur.
      const panel = panelMode ? await loadPanelConfig() : null;
      if (panel) {
        await useSettings.getState().save({
          host: panel.obs.host,
          port: panel.obs.port,
          password: panel.obs.password,
          hubName: panel.hub.name,
          deckSync: true,
          keepAwake: false,
          haptics: false,
        });
        obsClient.start({ host: panel.obs.host, port: panel.obs.port, password: panel.obs.password });
        hubClient.start({
          url: panel.hub.url,
          token: panel.hub.token,
          clientName: panelMode === 'dock' ? 'OBS paneli' : 'Masaüstü paneli',
          app: 'deckpad-panel',
        });
        return;
      }

      const s = useSettings.getState();
      if (s.hubHost && s.hubToken) hubClient.start({ url: hubUrl(s.hubHost, s.hubPort), token: s.hubToken, clientName: deviceName() });
      if (s.host) obsClient.start({ host: s.host, port: s.port, password: s.password });
      else setSheet('connect');
    })();
  }, []);

  // Uygulama öne gelince bağlantıları hemen dene.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      obsClient.nudge();
      hubClient.nudge();
    });
    return () => sub.remove();
  }, []);

  // "Ses efektleri" sayfası OBS'teki "Ses Efektleri" sahnesinin kaynaklarını izler.
  // Yeni efekt yeni bir OBS kaynağıdır; `inputs` değişince liste yeniden okunur.
  useEffect(() => {
    const target = profile.autoSfxPageId;
    if (status !== 'connected' || !target || !scenes.includes(OBS_NAMES.sfxScene)) return;
    let alive = true;
    obsClient
      .listSceneItems(OBS_NAMES.sfxScene)
      .then((names) => {
        if (alive && names.length) syncAutoPage(target, names, sfxOf, sfxButtons);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [status, scenes, inputs, profile.autoSfxPageId]);

  // "Sahneler" sayfası OBS'teki sahne listesini izler.
  useEffect(() => {
    const target = profile.autoScenesPageId;
    if (status !== 'connected' || !scenes.length || !target) return;
    syncAutoPage(target, scenes.filter((s) => s !== OBS_NAMES.sfxScene), sceneOf, sceneButtons);
  }, [status, scenes, profile.autoScenesPageId]);

  const page = profile.pages.find((p) => p.id === pageId) ?? profile.pages[0];

  // Görünen sayfadaki kaynak/filtre butonlarının durumunu OBS'ten oku.
  useEffect(() => {
    if (status !== 'connected' || !page) return;
    const { items, filters } = collectBindings(page.buttons);
    if (items.length || filters.length) void obsClient.watchBindings(items, filters);
  }, [status, page]);

  const onEditButton = useCallback((b: DeckButton) => setEditing({ button: b, isNew: false }), []);

  if (!settingsLoaded || !deckLoaded) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={navy.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left', 'right']}>
      {keepAwake ? <KeepAwake /> : null}
      <TopBar
        onConnect={() => setSheet('connect')}
        onSettings={() => setSheet('settings')}
        onPageSettings={() => setSheet('page')}
        onAddButton={() =>
          page?.kind === 'mixer'
            ? toast('Mikser sayfasına tuş eklenmez. Tuş eklemek için başka bir sayfaya geç.')
            : setEditing({
                isNew: true,
                button: { id: newId(), label: '', color: '#1B2D55', actions: [] },
              })
        }
      />
      <View style={styles.gridArea}>
        {page?.kind === 'mixer' ? <MixerView editing={deckEditing} /> : page ? <DeckGrid page={page} onEditButton={onEditButton} /> : null}
      </View>
      <PageTabs />

      <ConnectSheet visible={sheet === 'connect'} onClose={() => setSheet(null)} />
      <SettingsSheet visible={sheet === 'settings'} onClose={() => setSheet(null)} />
      <PageSheet visible={sheet === 'page'} onClose={() => setSheet(null)} />
      <ButtonEditor
        pageId={page?.id ?? ''}
        button={editing?.button ?? null}
        isNew={!!editing?.isNew}
        onClose={() => setEditing(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: navy.background },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  gridArea: { flex: 1, paddingHorizontal: 10 },
});
