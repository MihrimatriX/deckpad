import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ACTION_GROUPS,
  ACTION_META,
  MODE_LABELS,
  PC_MEDIA_LABELS,
  PC_SLIDE_LABELS,
  PC_VOLUME_LABELS,
  SPECIAL_INPUT_LABELS,
} from '../deck/actions';
import { useHub } from '../hub/client';
import { COMMON_COMBOS, validateCombo } from '../hub/keys';
import type { DeckAction, DeckActionType } from '../deck/model';
import { useDeck } from '../deck/store';
import { obsClient } from '../obs/client';
import { useObs } from '../obs/store';
import { font, navy, radius, space } from '../theme';
import { Btn, ChipGroup, Field, Hint, Label, Sheet } from './ui';

/**
 * Tek bir eylemi oluşturur veya düzenler.
 * Sahne, kaynak, filtre gibi listeler OBS'ten canlı gelir; bağlı değilken elle yazılabilir.
 */
export function ActionEditor({
  visible,
  initial,
  onClose,
  onDone,
}: {
  visible: boolean;
  initial: DeckAction | null;
  onClose: () => void;
  onDone: (a: DeckAction) => void;
}) {
  const [action, setAction] = useState<DeckAction | null>(initial);
  useEffect(() => {
    if (visible) setAction(initial);
  }, [visible, initial]);

  const isNew = !initial;
  const title = action ? ACTION_META[action.type].label : 'Eylem ekle';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      full
      footer={
        action ? (
          <>
            {isNew ? <Btn title="Tür değiştir" variant="secondary" icon="arrow-back" onPress={() => setAction(null)} /> : null}
            <Btn title="Tamam" icon="checkmark" style={{ flex: 1 }} onPress={() => onDone(action)} />
          </>
        ) : undefined
      }
    >
      {action ? <ActionForm action={action} onChange={setAction} /> : <TypePicker onPick={(t) => setAction(ACTION_META[t].create())} />}
    </Sheet>
  );
}

function TypePicker({ onPick }: { onPick: (t: DeckActionType) => void }) {
  return (
    <View style={{ gap: space.lg }}>
      {ACTION_GROUPS.map((g) => (
        <View key={g.title} style={{ gap: space.sm }}>
          <Label>{g.title}</Label>
          {g.types.map((t) => {
            const m = ACTION_META[t];
            return (
              <Pressable key={t} onPress={() => onPick(t)} style={({ pressed }) => [styles.typeRow, pressed && { opacity: 0.75 }]}>
                <View style={styles.typeIcon}>
                  <Ionicons name={m.icon as any} size={20} color={navy.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeTitle}>{m.label}</Text>
                  {m.hint ? <Text style={styles.typeHint}>{m.hint}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={navy.textMuted} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const modes = (...m: string[]) => m.map((v) => ({ value: v, label: MODE_LABELS[v] ?? v }));
const labelsToOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

function ActionForm({ action, onChange }: { action: DeckAction; onChange: (a: DeckAction) => void }) {
  const scenes = useObs((s) => s.scenes);
  const inputs = useObs((s) => s.inputs);
  const muted = useObs((s) => s.muted);
  const transitions = useObs((s) => s.transitions);
  const connected = useObs((s) => s.status === 'connected');
  const pages = useDeck((s) => s.profile.pages);
  const hint = ACTION_META[action.type].hint;

  const set = <K extends DeckAction>(patch: Partial<K>) => onChange({ ...action, ...patch } as DeckAction);

  const audioInputs = useMemo(() => {
    const special = Object.keys(SPECIAL_INPUT_LABELS).map((k) => ({ value: k, label: SPECIAL_INPUT_LABELS[k] }));
    const real = inputs.filter((i) => i.name in muted).map((i) => ({ value: i.name, label: i.name }));
    return [...special, ...real];
  }, [inputs, muted]);

  const mediaInputs = useMemo(() => {
    const isMedia = (k: string) => /ffmpeg|vlc|slideshow|media/i.test(k);
    return [...inputs]
      .sort((a, b) => Number(isMedia(b.kind)) - Number(isMedia(a.kind)))
      .map((i) => ({ value: i.name, label: isMedia(i.kind) ? `♪ ${i.name}` : i.name }));
  }, [inputs]);

  const sceneOptions = scenes.map((s) => ({ value: s, label: s }));

  const body = (() => {
    switch (action.type) {
      case 'scene':
      case 'previewScene':
        return <Picker label="Sahne" options={sceneOptions} value={action.scene} onChange={(scene) => set({ scene })} connected={connected} />;
      case 'record':
        return <Mode value={action.mode} options={modes('toggle', 'start', 'stop')} onChange={(mode) => set({ mode } as any)} />;
      case 'recordPause':
        return <Mode value={action.mode} options={modes('toggle', 'pause', 'resume')} onChange={(mode) => set({ mode } as any)} />;
      case 'stream':
      case 'replayBuffer':
      case 'virtualCam':
        return <Mode value={action.mode} options={modes('toggle', 'start', 'stop')} onChange={(mode) => set({ mode } as any)} />;
      case 'studioMode':
        return <Mode value={action.mode} options={modes('toggle', 'on', 'off')} onChange={(mode) => set({ mode } as any)} />;
      case 'mute':
        return (
          <>
            <Picker label="Ses kaynağı" options={audioInputs} value={action.input} onChange={(input) => set({ input })} connected />
            <Mode
              value={action.mode}
              options={[
                { value: 'toggle', label: 'Sustur/aç' },
                { value: 'on', label: 'Sustur' },
                { value: 'off', label: 'Sesi aç' },
              ]}
              onChange={(mode) => set({ mode } as any)}
            />
          </>
        );
      case 'volume':
        return (
          <>
            <Picker label="Ses kaynağı" options={audioInputs} value={action.input} onChange={(input) => set({ input })} connected />
            <Label>Seviye (dB)</Label>
            <ChipGroup
              options={['0', '-3', '-6', '-12', '-20', '-30', '-100'].map((v) => ({ value: v, label: v === '-100' ? 'Sessiz' : `${v} dB` }))}
              value={String(action.db)}
              onChange={(v) => set({ db: Number(v) })}
            />
            <Field
              keyboardType="numbers-and-punctuation"
              value={String(action.db)}
              onChangeText={(t) => {
                const n = Number(t.replace(',', '.'));
                if (!Number.isNaN(n)) set({ db: Math.max(-100, Math.min(26, n)) });
              }}
            />
          </>
        );
      case 'sourceVisibility':
        return (
          <>
            <Picker label="Sahne" options={sceneOptions} value={action.scene} onChange={(scene) => set({ scene, source: '' })} connected={connected} />
            {action.scene ? (
              <AsyncPicker
                label="Kaynak"
                deps={[action.scene]}
                load={() => obsClient.listSceneItems(action.scene)}
                value={action.source}
                onChange={(source) => set({ source })}
              />
            ) : null}
            <Mode value={action.mode} options={[{ value: 'toggle', label: 'Göster/gizle' }, { value: 'on', label: 'Göster' }, { value: 'off', label: 'Gizle' }]} onChange={(mode) => set({ mode } as any)} />
          </>
        );
      case 'filter': {
        const sources = [
          ...audioInputs.filter((o) => o.value.startsWith('$')),
          ...inputs.map((i) => ({ value: i.name, label: i.name })),
          ...scenes.map((s) => ({ value: s, label: `Sahne: ${s}` })),
        ];
        return (
          <>
            <Picker label="Kaynak veya sahne" options={sources} value={action.source} onChange={(source) => set({ source, filter: '' })} connected={connected} />
            {action.source ? (
              <AsyncPicker
                label="Filtre"
                deps={[action.source]}
                load={() => obsClient.listFilters(action.source)}
                value={action.filter}
                onChange={(filter) => set({ filter })}
              />
            ) : null}
            <Mode value={action.mode} options={modes('toggle', 'on', 'off')} onChange={(mode) => set({ mode } as any)} />
          </>
        );
      }
      case 'transition':
        return (
          <>
            <Picker label="Geçiş" options={transitions.map((t) => ({ value: t, label: t }))} value={action.name} onChange={(name) => set({ name })} connected={connected} />
            <Label>Süre (isteğe bağlı)</Label>
            <ChipGroup
              options={[
                { value: '0', label: 'Değiştirme' },
                { value: '300', label: '300 ms' },
                { value: '500', label: '500 ms' },
                { value: '1000', label: '1 sn' },
                { value: '2000', label: '2 sn' },
              ]}
              value={String(action.durationMs ?? 0)}
              onChange={(v) => set({ durationMs: Number(v) || undefined })}
            />
          </>
        );
      case 'media':
        return (
          <>
            <Picker label="Medya kaynağı" options={mediaInputs} value={action.input} onChange={(input) => set({ input })} connected={connected} />
            <Mode value={action.mode} options={modes('restart', 'playPause', 'stop', 'next', 'previous')} onChange={(mode) => set({ mode } as any)} />
            <Hint>
              Ses efekti: OBS'te ses dosyasıyla bir Media Source ekle, "Baştan oynat" seç. Slayt: Image Slide Show kaynağı seç,
              "Sonraki" ve "Önceki" kullan.
            </Hint>
          </>
        );
      case 'chapter':
        return <Field label="İşaret adı (isteğe bağlı)" value={action.name ?? ''} onChangeText={(name) => set({ name: name || undefined })} placeholder="Örn. Bölüm 2" />;
      case 'hotkey':
        return (
          <AsyncPicker
            label="OBS kısayolu"
            deps={[]}
            load={() => obsClient.listHotkeys()}
            value={action.name}
            onChange={(name) => set({ name })}
          />
        );
      case 'delay':
        return (
          <>
            <ChipGroup
              options={['250', '500', '1000', '2000', '5000'].map((v) => ({ value: v, label: Number(v) >= 1000 ? `${Number(v) / 1000} sn` : `${v} ms` }))}
              value={String(action.ms)}
              onChange={(v) => set({ ms: Number(v) })}
            />
            <Field
              label="Milisaniye"
              keyboardType="number-pad"
              value={String(action.ms)}
              onChangeText={(t) => set({ ms: Math.max(0, Math.min(50000, Number(t.replace(/\D/g, '')) || 0)) })}
            />
          </>
        );
      case 'page':
        return <Picker label="Sayfa" options={pages.map((p) => ({ value: p.id, label: p.name }))} value={action.pageId} onChange={(pageId) => set({ pageId })} connected />;
      case 'studioTransition':
      case 'replaySave':
        return <Hint>Bu eylemin ayarı yok.</Hint>;
      case 'pcSlide':
        return <Mode value={action.dir} options={labelsToOptions(PC_SLIDE_LABELS)} onChange={(dir) => set({ dir } as any)} />;
      case 'pcMedia':
        return <Mode value={action.key} options={labelsToOptions(PC_MEDIA_LABELS)} onChange={(key) => set({ key } as any)} />;
      case 'pcVolume':
        return (
          <>
            <Mode value={action.mode} options={labelsToOptions(PC_VOLUME_LABELS)} onChange={(mode) => set({ mode, value: mode === 'set' ? 50 : mode === 'up' || mode === 'down' ? 5 : undefined } as any)} />
            {action.mode === 'up' || action.mode === 'down' ? (
              <>
                <Label>Adım</Label>
                <ChipGroup options={['2', '5', '10', '20'].map((v) => ({ value: v, label: `%${v}` }))} value={String(action.value ?? 5)} onChange={(v) => set({ value: Number(v) } as any)} />
              </>
            ) : null}
            {action.mode === 'set' ? (
              <>
                <Label>Düzey</Label>
                <ChipGroup options={['0', '25', '50', '75', '100'].map((v) => ({ value: v, label: `%${v}` }))} value={String(action.value ?? 50)} onChange={(v) => set({ value: Number(v) } as any)} />
              </>
            ) : null}
          </>
        );
      case 'pcKeys': {
        const err = action.keys.trim() ? validateCombo(action.keys) : null;
        return (
          <>
            <Field label="Kısayol" value={action.keys} onChangeText={(keys) => set({ keys } as any)} placeholder="Ctrl+Shift+M" autoCapitalize="none" autoCorrect={false} />
            {err ? <Text style={styles.error}>{err}</Text> : null}
            <Label>Hazır kısayollar</Label>
            <ChipGroup options={COMMON_COMBOS.map((c) => ({ value: c.keys, label: c.label }))} value={action.keys} onChange={(keys) => set({ keys } as any)} />
            <Hint>Tuş adları: Ctrl, Alt, Shift, Win; A-Z, 0-9, F1-F24, Enter, Esc, Space, Tab, Sol, Sağ, Yukarı, Aşağı, PageUp, PageDown, Home, End, Delete.</Hint>
          </>
        );
      }
      case 'pcLaunch':
        return (
          <>
            <Field label="Program, dosya ya da klasör" value={action.path} onChangeText={(path) => set({ path } as any)} placeholder="C:\Program Files\Spotify\Spotify.exe" autoCapitalize="none" autoCorrect={false} />
            <Field label="Parametreler (isteğe bağlı)" value={action.args ?? ''} onChangeText={(args) => set({ args: args || undefined } as any)} autoCapitalize="none" autoCorrect={false} />
            <Hint>Uygulama bağlantıları da çalışır: spotify:, ms-settings:, steam://rungameid/730</Hint>
          </>
        );
      case 'pcUrl':
        return <Field label="Adres" value={action.url} onChangeText={(url) => set({ url } as any)} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" />;
      case 'pcText':
        return (
          <>
            <Field label="Yazılacak metin" value={action.text} onChangeText={(text) => set({ text } as any)} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: 'top' }} />
            <Hint>Metin, bilgisayarda o an imlecin olduğu yere yazılır. Satır sonları Enter tuşu olarak gider.</Hint>
          </>
        );
    }
  })();

  const pcState = useHub((h) => h.status);
  const isPc = action.type.startsWith('pc');

  return (
    <View style={{ gap: space.md }}>
      {isPc && pcState !== 'connected' ? (
        <View style={[styles.hintBox, { borderColor: 'rgba(255,176,32,0.45)' }]}>
          <Ionicons name="desktop" size={18} color={navy.warning} />
          <Text style={styles.hintText}>
            Bilgisayar eylemleri için bilgisayarda StudioHub açık olmalı ve bu cihaz eşleşmiş olmalı. Bağlantı ekranından StudioHub'ın QR kodunu okut.
          </Text>
        </View>
      ) : null}
      {hint ? (
        <View style={styles.hintBox}>
          <Ionicons name="information-circle" size={18} color={navy.accent} />
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
      {body}
    </View>
  );
}

function Mode({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>Ne yapsın?</Label>
      <ChipGroup options={options} value={value} onChange={onChange} />
    </View>
  );
}

/** Seçenek listesi + elle yazma. */
function Picker({
  label,
  options,
  value,
  onChange,
  connected,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
}) {
  const known = options.some((o) => o.value === value);
  const [manual, setManual] = useState(!!value && !known && options.length === 0);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.pickerHead}>
        <Label>{label}</Label>
        <Pressable onPress={() => setManual((m) => !m)} hitSlop={8}>
          <Text style={styles.link}>{manual ? 'Listeden seç' : 'Elle yaz'}</Text>
        </Pressable>
      </View>
      {manual ? (
        <Field value={value} onChangeText={onChange} placeholder="OBS'teki adını yaz" />
      ) : options.length ? (
        <ChipGroup options={options} value={value} onChange={onChange} />
      ) : (
        <Hint>{connected ? 'OBS listesi boş.' : 'OBS bağlanınca liste dolacak. Şimdilik "Elle yaz" ile adını girebilirsin.'}</Hint>
      )}
      {value && !known && !manual ? <Hint>Seçili: {value}</Hint> : null}
    </View>
  );
}

function AsyncPicker({
  label,
  load,
  deps,
  value,
  onChange,
}: {
  label: string;
  load: () => Promise<string[]>;
  deps: unknown[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [items, setItems] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const connected = useObs((s) => s.status === 'connected');
  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(undefined);
    if (!connected) {
      setItems([]);
      return;
    }
    load()
      .then((r) => alive && setItems(r))
      .catch((e) => {
        if (!alive) return;
        setItems([]);
        setError(e?.message);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, ...deps]);

  if (items === null)
    return (
      <View style={{ gap: 6 }}>
        <Label>{label}</Label>
        <ActivityIndicator color={navy.accent} />
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <Picker label={label} options={items.map((i) => ({ value: i, label: i }))} value={value} onChange={onChange} connected={connected} />
      {error ? <Hint>{error}</Hint> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: navy.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTitle: { color: navy.text, fontSize: 16, fontFamily: font.semi },
  typeHint: { color: navy.textMuted, fontSize: 13, marginTop: 2, fontFamily: font.body },
  hintBox: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: navy.glass,
    borderWidth: 1,
    borderColor: navy.glassEdge,
  },
  hintText: { color: navy.textMuted, fontSize: 13.5, flex: 1, lineHeight: 19, fontFamily: font.body },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: navy.accent, fontSize: 14, fontFamily: font.semi },
  error: { color: navy.live, fontSize: 13.5, fontFamily: font.medium },
});
