import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultProfile, muteButtons, sceneButtons } from '../deck/defaults';
import { addPage, movePage, removePage, updatePage, useDeck, validateProfile } from '../deck/store';
import { obsClient } from '../obs/client';
import { parseObsQr } from '../obs/qr';
import { useObs } from '../obs/store';
import { hubClient, hubUrl, useHub } from '../hub/client';
import { parsePairQr, type PairInfo } from '../hub/pair';
import { pullDeck, pushDeck } from '../hub/sync';
import { isWeb, panelMode } from '../panel';
import { useSettings } from '../settings';
import { deviceName } from '../device';
import { font, navy, radius, space } from '../theme';
import { Btn, Field, Hint, Label, Sheet, Stepper, ToggleRow, toast } from './ui';

// ---------- Bağlantı ----------

export function ConnectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const settings = useSettings();
  const status = useObs((s) => s.status);
  const error = useObs((s) => s.error);
  const version = useObs((s) => s.obsVersion);
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));
  const [password, setPassword] = useState(settings.password);
  const [showPass, setShowPass] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setHost(settings.host);
    setPort(String(settings.port));
    setPassword(settings.password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const connect = async (h = host, p = port, pw = password) => {
    const portNum = Number(p) || 4455;
    if (!h.trim()) {
      toast('Bilgisayarın IP adresini yaz', 'error');
      return;
    }
    await settings.save({ host: h.trim(), port: portNum, password: pw });
    obsClient.start({ host: h.trim(), port: portNum, password: pw });
  };

  const statusText =
    status === 'connected'
      ? `Bağlı${version ? ` · OBS ${version}` : ''}`
      : status === 'connecting'
        ? 'Bağlanıyor…'
        : status === 'error'
          ? error ?? 'Bağlanılamadı'
          : 'Bağlı değil';
  const statusColor = status === 'connected' ? navy.success : status === 'error' ? navy.live : navy.warning;

  const hub = useHub();
  const paired = !!settings.hubHost && !!settings.hubToken;
  const hubText =
    hub.status === 'connected'
      ? `${hub.pcName ?? 'Bilgisayar'} bağlı`
      : hub.status === 'connecting'
        ? 'Bilgisayara bağlanıyor…'
        : hub.status === 'error'
          ? hub.error ?? 'Bilgisayara bağlanılamadı'
          : paired
            ? 'Bilgisayar bağlı değil'
            : 'Eşleşmedi';
  const hubColor = hub.status === 'connected' ? navy.success : hub.status === 'error' ? navy.live : paired ? navy.warning : navy.textMuted;

  const pair = async (info: PairInfo) => {
    // StudioHub kodu: OBS ve bilgisayar eylemleri tek seferde ayarlanır.
    const password = info.obsPassword || (settings.host === info.host ? settings.password : '');
    await settings.save({
      host: info.host,
      port: info.obsPort,
      password,
      hubHost: info.host,
      hubPort: info.hubPort,
      hubToken: info.token,
      hubName: info.name,
    });
    setHost(info.host);
    setPort(String(info.obsPort));
    setPassword(password);
    obsClient.start({ host: info.host, port: info.obsPort, password });
    hubClient.start({ url: hubUrl(info.host, info.hubPort), token: info.token, clientName: deviceName() });
    toast(`${info.name} ile eşleşildi`);
  };

  const unpair = async () => {
    hubClient.stop();
    await settings.save({ hubHost: '', hubToken: '', hubName: '', deckSync: false });
    toast('Bilgisayar eşleşmesi kaldırıldı');
  };

  return (
    <>
      <Sheet
        visible={visible && !scanning}
        onClose={onClose}
        title="Bağlantı"
        footer={
          <>
            {status !== 'idle' ? <Btn title="Kes" variant="secondary" icon="power" onPress={() => void obsClient.stop()} /> : null}
            <Btn title="Bağlan" icon="link" style={{ flex: 1 }} onPress={() => void connect()} />
          </>
        }
      >
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusLabel}>OBS</Text>
          <Text style={styles.statusText} numberOfLines={2}>{statusText}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: hubColor }]} />
          <Text style={styles.statusLabel}>Bilgisayar</Text>
          <Text style={styles.statusText} numberOfLines={2}>{hubText}</Text>
          {paired && !panelMode ? (
            <Pressable onPress={() => void unpair()} hitSlop={8}>
              <Text style={styles.link}>Kaldır</Text>
            </Pressable>
          ) : null}
        </View>

        {panelMode ? (
          <Hint>Bu panel bağlantı bilgilerini StudioHub'dan alır. Ayarları StudioHub penceresinden değiştirebilirsin.</Hint>
        ) : !isWeb ? (
          <>
            <Btn title="QR kodu okut" icon="qr-code" onPress={() => setScanning(true)} />
            <Hint>StudioHub'ın QR kodu OBS'i ve bilgisayar eylemlerini birlikte bağlar. Yalnızca OBS için OBS'in kendi QR kodu da olur.</Hint>
          </>
        ) : null}

        <Label>OBS'e elle bağlan</Label>

        <Field label="Bilgisayarın IP adresi" value={host} onChangeText={setHost} placeholder="192.168.1.20" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
        <Field label="Port" value={port} onChangeText={setPort} keyboardType="number-pad" placeholder="4455" />
        <View style={{ gap: 6 }}>
          <Label>Şifre</Label>
          <View style={styles.passRow}>
            <View style={{ flex: 1 }}>
              <Field value={password} onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" placeholder="WebSocket şifresi" />
            </View>
            <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eye} hitSlop={8}>
              <Ionicons name={showPass ? 'eye-off' : 'eye'} size={22} color={navy.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.helpBox}>
          <Text style={styles.helpTitle}>En kolayı: StudioHub</Text>
          <Hint>Bilgisayarda StudioHub'ı aç, "OBS'i hazırla"ya bas, sonra buradan QR kodu okut.</Hint>
          <Text style={[styles.helpTitle, { marginTop: 8 }]}>StudioHub olmadan</Text>
          <Hint>OBS'te Araçlar › WebSocket Sunucu Ayarları'nı aç, sunucuyu etkinleştir ve "Bağlantı bilgilerini göster"deki QR kodu okut.</Hint>
          <Hint>Telefon ve bilgisayar aynı Wi-Fi ağında olmalı.</Hint>
        </View>
      </Sheet>

      <QrScanner
        visible={visible && scanning}
        onClose={() => setScanning(false)}
        onResult={(r) => {
          setScanning(false);
          if ('token' in r) {
            void pair(r);
            return;
          }
          setHost(r.host);
          setPort(String(r.port));
          setPassword(r.password);
          void connect(r.host, String(r.port), r.password);
          toast('QR okundu, bağlanılıyor');
        }}
      />
    </>
  );
}

function QrScanner({
  visible,
  onClose,
  onResult,
}: {
  visible: boolean;
  onClose: () => void;
  onResult: (r: { host: string; port: number; password: string } | PairInfo) => void;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (visible) {
      setDone(false);
      if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
    }
  }, [visible, perm, requestPerm]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scanWrap}>
        {perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              done
                ? undefined
                : ({ data }) => {
                    const r = parsePairQr(data) ?? parseObsQr(data);
                    if (r) {
                      setDone(true);
                      onResult(r);
                    }
                  }
            }
          />
        ) : (
          <View style={styles.scanCenter}>
            <Hint>QR okumak için kamera izni gerekiyor.</Hint>
            <Btn title="İzin ver" onPress={() => void requestPerm()} />
          </View>
        )}
        <View style={styles.scanFrame} pointerEvents="none" />
        <View style={[styles.scanTop, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.scanTitle}>StudioHub ya da OBS'teki QR kodu çerçeveye getir</Text>
          <Pressable onPress={onClose} style={styles.scanClose} hitSlop={8}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Genel ayarlar ----------

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  const replaceProfile = useDeck((d) => d.replaceProfile);
  const mutate = useDeck((d) => d.mutate);
  const setPage = useDeck((d) => d.setPage);
  const connected = useObs((o) => o.status === 'connected');
  const scenes = useObs((o) => o.scenes);
  const inputs = useObs((o) => o.inputs);
  const muted = useObs((o) => o.muted);

  const exportProfile = async () => {
    await Clipboard.setStringAsync(JSON.stringify(useDeck.getState().profile, null, 2));
    toast('Deste panoya kopyalandı');
  };

  const importProfile = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const p = validateProfile(JSON.parse(text));
      replaceProfile(p);
      toast('Deste içe aktarıldı');
      onClose();
    } catch (e: any) {
      toast(e?.message?.includes('JSON') ? 'Panodaki metin geçerli bir deste değil' : e?.message ?? 'İçe aktarılamadı', 'error');
    }
  };

  const generatePage = (name: string, buttons: ReturnType<typeof sceneButtons>) => {
    const cols = buttons.length > 9 ? 4 : 3;
    let newId = '';
    mutate((p) => {
      const r = addPage(p, name);
      newId = r.id;
      return updatePage(r.profile, r.id, (pg) => ({ ...pg, cols, rows: Math.max(3, Math.ceil(buttons.length / cols)), buttons }));
    });
    setPage(newId);
    toast(`"${name}" sayfası oluşturuldu`);
    onClose();
  };

  const hubConnected = useHub((h) => h.status === 'connected');
  const pcName = useHub((h) => h.pcName);
  const paired = !!s.hubHost && !!s.hubToken;

  const sendDeck = async () => {
    try {
      await pushDeck();
      toast('Düzen bilgisayara gönderildi');
    } catch (e: any) {
      toast(e?.message ?? 'Gönderilemedi', 'error');
    }
  };
  const fetchDeck = async () => {
    try {
      const r = await pullDeck(false);
      toast(r === 'empty' ? 'Bilgisayarda kayıtlı düzen yok' : r === 'same' ? 'Düzenler zaten aynı' : 'Bilgisayardaki düzen yüklendi');
    } catch (e: any) {
      toast(e?.message ?? 'Alınamadı', 'error');
    }
  };
  const toggleSync = async (deckSync: boolean) => {
    await s.save({ deckSync });
    if (deckSync && hubConnected) {
      try {
        const r = await pullDeck(true);
        toast(r === 'seeded' ? 'Bu cihazın düzeni bilgisayara gönderildi' : 'Bilgisayardaki düzen yüklendi');
      } catch (e: any) {
        toast(e?.message ?? 'Eşitlenemedi', 'error');
      }
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Ayarlar">
      {!panelMode ? (
        <>
          <Label>Bilgisayar</Label>
          {paired ? (
            <>
              <Hint>{hubConnected ? `${pcName ?? s.hubName} ile bağlı.` : `${s.hubName || s.hubHost} şu an bağlı değil.`} Tuş düzenini masaüstü paneli ve OBS paneliyle paylaşabilirsin.</Hint>
              <View style={styles.row}>
                <Btn title="Bilgisayara gönder" icon="cloud-upload-outline" variant="secondary" style={{ flex: 1 }} disabled={!hubConnected} onPress={() => void sendDeck()} />
                <Btn title="Bilgisayardan al" icon="cloud-download-outline" variant="secondary" style={{ flex: 1 }} disabled={!hubConnected} onPress={() => void fetchDeck()} />
              </View>
              <ToggleRow
                label="Düzeni otomatik eşitle"
                hint="Açınca bilgisayardaki düzen esas alınır; değişiklikler iki yönde aktarılır"
                value={s.deckSync}
                onChange={(v) => void toggleSync(v)}
              />
            </>
          ) : (
            <Hint>Bilgisayar eylemleri ve düzen paylaşımı için bağlantı ekranından StudioHub'ın QR kodunu okut.</Hint>
          )}
        </>
      ) : null}

      <ToggleRow label="Ekranı açık tut" hint="Yayın sırasında ekran kararmasın" value={s.keepAwake} onChange={(keepAwake) => void s.save({ keepAwake })} />
      <ToggleRow label="Titreşim" value={s.haptics} onChange={(haptics) => void s.save({ haptics })} />
      <ToggleRow label="Üst bilgi çubuğu" hint="CPU, FPS, düşen kare, yayın hızı" value={s.showStats} onChange={(showStats) => void s.save({ showStats })} />

      <Label>OBS'ten hızlı sayfa</Label>
      <Btn
        title="Sahnelerden sayfa oluştur"
        icon="albums"
        variant="secondary"
        disabled={!connected || !scenes.length}
        onPress={() => generatePage('Sahneler', sceneButtons(scenes))}
      />
      <Btn
        title="Ses kaynaklarından sayfa oluştur"
        icon="mic"
        variant="secondary"
        disabled={!connected}
        onPress={() => generatePage('Ses', muteButtons(inputs.filter((i) => i.name in muted).map((i) => i.name)))}
      />
      {!connected ? <Hint>Bu seçenekler OBS'e bağlıyken çalışır.</Hint> : null}

      <Label>Deste</Label>
      <Hint>Desteyi JSON olarak panoya kopyalayıp başka telefona aktarabilir ya da yedekleyebilirsin.</Hint>
      <View style={styles.row}>
        <Btn title="Dışa aktar" icon="share-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void exportProfile()} />
        <Btn title="İçe aktar" icon="download-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void importProfile()} />
      </View>
      <Btn
        title="Varsayılan desteye dön"
        icon="refresh"
        variant="danger"
        onPress={() =>
          Alert.alert('Varsayılana dön', 'Tüm sayfalar ve butonlar silinip varsayılan deste yüklenecek.', [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sıfırla',
              style: 'destructive',
              onPress: () => {
                replaceProfile(defaultProfile());
                onClose();
              },
            },
          ])
        }
      />
    </Sheet>
  );
}

// ---------- Sayfa ayarları (düzenleme modunda) ----------

export function PageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const profile = useDeck((d) => d.profile);
  const pageId = useDeck((d) => d.pageId);
  const mutate = useDeck((d) => d.mutate);
  const page = profile.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const idx = profile.pages.indexOf(page);
  const set = (patch: Partial<typeof page>) => mutate((p) => updatePage(p, page.id, (pg) => ({ ...pg, ...patch })));

  return (
    <Sheet visible={visible} onClose={onClose} title="Sayfa ayarları">
      <Field label="Sayfa adı" value={page.name} onChangeText={(name) => set({ name })} maxLength={24} />
      <Stepper label="Sütun" value={page.cols} min={1} max={8} onChange={(cols) => set({ cols })} />
      <Stepper label="Satır" value={page.rows} min={1} max={10} onChange={(rows) => set({ rows })} />
      <Hint>Satır sayısı buton boyutunu belirler; fazla butonlar kaydırılarak görünür.</Hint>
      <View style={styles.row}>
        <Btn title="Sola" icon="arrow-back" variant="secondary" style={{ flex: 1 }} disabled={idx === 0} onPress={() => mutate((p) => movePage(p, page.id, -1))} />
        <Btn
          title="Sağa"
          icon="arrow-forward"
          variant="secondary"
          style={{ flex: 1 }}
          disabled={idx === profile.pages.length - 1}
          onPress={() => mutate((p) => movePage(p, page.id, 1))}
        />
      </View>
      <Btn
        title="Sayfayı sil"
        icon="trash"
        variant="danger"
        disabled={profile.pages.length <= 1}
        onPress={() =>
          Alert.alert('Sayfayı sil', `"${page.name}" ve içindeki ${page.buttons.length} buton silinecek.`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sil',
              style: 'destructive',
              onPress: () => {
                mutate((p) => removePage(p, page.id));
                onClose();
              },
            },
          ])
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: navy.glass,
    borderWidth: 1,
    borderColor: navy.glassEdge,
    padding: space.md,
    borderRadius: radius.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: navy.text, fontSize: 15, flex: 1, fontFamily: font.medium },
  statusLabel: { color: navy.textMuted, fontSize: 14, fontFamily: font.semi, width: 74 },
  link: { color: navy.accent, fontSize: 14, fontFamily: font.semi },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  helpBox: { gap: 4, backgroundColor: navy.glass, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: navy.glassEdge },
  helpTitle: { color: navy.text, fontFamily: font.semi, fontSize: 15, marginBottom: 4 },
  row: { flexDirection: 'row', gap: space.sm },
  scanWrap: { flex: 1, backgroundColor: '#000' },
  scanCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  scanFrame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: navy.accent,
  },
  scanTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scanTitle: { color: '#fff', fontSize: 17, fontFamily: font.semi, flex: 1 },
  scanClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
