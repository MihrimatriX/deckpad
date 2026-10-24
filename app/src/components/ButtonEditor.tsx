import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTION_META, ICONS, actionIncomplete, describeAction } from '../deck/actions';
import type { DeckAction, DeckButton } from '../deck/model';
import { duplicateButton, removeButton, upsertButton, useDeck } from '../deck/store';
import { font, buttonColors, navy, radius, space } from '../theme';
import { ActionEditor } from './ActionEditor';
import { DeckButtonView } from './DeckButtonView';
import { Btn, Field, Hint, Keycap, Label, Sheet, ToggleRow } from './ui';

export function ButtonEditor({
  pageId,
  button,
  isNew,
  onClose,
}: {
  pageId: string;
  button: DeckButton | null;
  isNew: boolean;
  onClose: () => void;
}) {
  const mutate = useDeck((s) => s.mutate);
  const pages = useDeck((s) => s.profile.pages);
  const [draft, setDraft] = useState<DeckButton | null>(button);
  const [actionEdit, setActionEdit] = useState<{ index: number; action: DeckAction | null } | null>(null);

  useEffect(() => setDraft(button), [button]);
  if (!draft) return null;

  const set = (patch: Partial<DeckButton>) => setDraft({ ...draft, ...patch });
  const pageName = (id: string) => pages.find((p) => p.id === id)?.name ?? '?';

  const save = () => {
    mutate((p) => upsertButton(p, pageId, draft));
    onClose();
  };

  const moveAction = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.actions.length) return;
    const actions = [...draft.actions];
    [actions[i], actions[j]] = [actions[j], actions[i]];
    set({ actions });
  };

  return (
    <>
      <Sheet
        visible={!!button && !actionEdit}
        onClose={onClose}
        title={isNew ? 'Yeni buton' : 'Butonu düzenle'}
        full
        footer={
          <>
            {!isNew ? (
              <>
                <Btn
                  title="Sil"
                  icon="trash"
                  variant="danger"
                  onPress={() => {
                    mutate((p) => removeButton(p, pageId, draft.id));
                    onClose();
                  }}
                />
                <Btn
                  title="Çoğalt"
                  icon="copy"
                  variant="secondary"
                  onPress={() => {
                    mutate((p) => duplicateButton(p, pageId, draft.id));
                    onClose();
                  }}
                />
              </>
            ) : null}
            <Btn title="Kaydet" icon="checkmark" style={{ flex: 1 }} onPress={save} />
          </>
        }
      >
        <View style={styles.preview}>
          <DeckButtonView button={draft} size={108} state={{ active: false }} />
        </View>

        <ToggleRow
          label="Boşluk"
          hint="Izgarada yer tutan görünmez buton"
          value={!!draft.spacer}
          onChange={(spacer) => set({ spacer })}
        />

        {!draft.spacer ? (
          <>
            <Field label="Etiket" value={draft.label} onChangeText={(label) => set({ label })} placeholder="Örn. Kamera" maxLength={40} />

            <Label>İkon</Label>
            <View style={styles.iconGrid}>
              <IconCell icon="ban" selected={!draft.icon} onPress={() => set({ icon: undefined })} label="İkon yok" />
              {ICONS.map((ic) => (
                <IconCell key={ic} icon={ic} selected={draft.icon === ic} onPress={() => set({ icon: ic })} label={ic} />
              ))}
            </View>

            <Label>Renk</Label>
            <View style={styles.colorRow}>
              {buttonColors.map((c) => (
                <Pressable key={c} onPress={() => set({ color: c })} accessibilityLabel={`Renk ${c}`} accessibilityState={{ selected: draft.color === c }}>
                  {({ pressed }) => (
                    <Keycap color={c} pressed={pressed} height={3} radius={12} ring={draft.color === c ? navy.accent : undefined} style={{ width: 46, height: 46 }} faceStyle={styles.center}>
                      {draft.color === c ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
                    </Keycap>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionHead}>
              <Label>Eylemler</Label>
              <Text style={styles.count}>{draft.actions.length}</Text>
            </View>
            {draft.actions.length === 0 ? <Hint>Bu buton henüz bir şey yapmıyor. Aşağıdan eylem ekle.</Hint> : null}
            {draft.actions.length > 1 ? <Hint>Eylemler sırayla çalışır; aralarına "Bekle" koyabilirsin.</Hint> : null}
            {draft.actions.map((a, i) => (
              <View key={i} style={styles.actionRow}>
                <Text style={styles.actionIndex}>{i + 1}</Text>
                <Ionicons name={ACTION_META[a.type].icon as any} size={18} color={navy.accent} />
                <Pressable style={{ flex: 1 }} onPress={() => setActionEdit({ index: i, action: a })}>
                  <Text style={styles.actionText} numberOfLines={2}>
                    {describeAction(a, pageName)}
                  </Text>
                  {actionIncomplete(a) ? <Text style={styles.warn}>Ayarlanması gerekiyor</Text> : null}
                </Pressable>
                <View style={styles.actionBtns}>
                  <SmallIcon icon="chevron-up" onPress={() => moveAction(i, -1)} disabled={i === 0} />
                  <SmallIcon icon="chevron-down" onPress={() => moveAction(i, 1)} disabled={i === draft.actions.length - 1} />
                  <SmallIcon icon="close" onPress={() => set({ actions: draft.actions.filter((_, j) => j !== i) })} />
                </View>
              </View>
            ))}
            <Btn title="Eylem ekle" icon="add" variant="secondary" onPress={() => setActionEdit({ index: -1, action: null })} />

            <ToggleRow
              label="Basılı tutarak çalıştır"
              hint="Yayını kapatmak gibi kritik işlerde yanlışlıkla basmayı önler"
              value={!!draft.confirm}
              onChange={(confirm) => set({ confirm })}
            />
            <ToggleRow
              label="OBS durumunu göster"
              hint="Kayıtta kırmızı yanar, aktif sahne vurgulanır"
              value={draft.showState !== false}
              onChange={(v) => set({ showState: v })}
            />
          </>
        ) : null}
      </Sheet>

      <ActionEditor
        visible={!!actionEdit}
        initial={actionEdit?.action ?? null}
        onClose={() => setActionEdit(null)}
        onDone={(a) => {
          if (!actionEdit) return;
          const actions = [...draft.actions];
          if (actionEdit.index < 0) actions.push(a);
          else actions[actionEdit.index] = a;
          // Yeni butonun etiketi boşsa eylemden öner.
          const label = draft.label || suggestLabel(a);
          const icon = draft.icon ?? ACTION_META[a.type].icon;
          setDraft({ ...draft, actions, label, icon });
          setActionEdit(null);
        }}
      />
    </>
  );
}

function suggestLabel(a: DeckAction): string {
  switch (a.type) {
    case 'scene':
    case 'previewScene':
      return a.scene;
    case 'sourceVisibility':
      return a.source;
    case 'filter':
      return a.filter;
    case 'media':
      return a.input;
    case 'transition':
      return a.name;
    default:
      return ACTION_META[a.type].label;
  }
}

function IconCell({ icon, selected, onPress, label }: { icon: string; selected: boolean; onPress: () => void; label: string }) {
  if (selected) {
    return (
      <Pressable onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: true }}>
        {({ pressed }) => (
          <Keycap color={navy.primary} pressed={pressed} height={3} radius={11} ring={navy.accent} style={{ width: 46, height: 46 }} faceStyle={styles.center}>
            <Ionicons name={icon as any} size={22} color="#fff" />
          </Keycap>
        )}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.iconCell, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon as any} size={22} color={navy.textMuted} />
    </Pressable>
  );
}

function SmallIcon({ icon, onPress, disabled }: { icon: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.small, (pressed || disabled) && { opacity: 0.35 }]}>
      <Ionicons name={icon as any} size={18} color={navy.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  preview: {
    alignSelf: 'center',
    padding: 14,
    marginVertical: space.sm,
    borderRadius: 24,
    backgroundColor: navy.faceplate,
    borderWidth: 1,
    borderTopColor: navy.bevelLight,
    borderLeftColor: 'rgba(160,196,255,0.08)',
    borderRightColor: navy.bevelDark,
    borderBottomColor: navy.bevelDark,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  iconCell: {
    width: 46,
    height: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
  },
  cellOn: { backgroundColor: navy.primary, borderColor: navy.primary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  swatchOn: { borderWidth: 3, borderColor: navy.accent },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.sm },
  count: { color: navy.textMuted, fontSize: 13, fontFamily: font.medium },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    backgroundColor: navy.well,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.7)',
    borderLeftColor: 'rgba(0,0,0,0.5)',
    borderRightColor: navy.bevelLight,
    borderBottomColor: navy.bevelLight,
    paddingLeft: space.md,
    paddingVertical: space.sm,
  },
  actionIndex: { color: navy.accent, fontSize: 15, fontFamily: font.display, width: 16 },
  actionText: { color: navy.text, fontSize: 15, fontFamily: font.medium },
  warn: { color: navy.warning, fontSize: 13, marginTop: 2, fontFamily: font.medium },
  actionBtns: { flexDirection: 'row' },
  small: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
