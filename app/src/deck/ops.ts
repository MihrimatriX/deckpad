import { newId, type DeckButton, type DeckPage, type DeckProfile } from './model';

// ---------- Saf yardımcılar (mutate içinde kullanılır) ----------

export const updatePage = (p: DeckProfile, pageId: string, fn: (pg: DeckPage) => DeckPage): DeckProfile => ({
  ...p,
  pages: p.pages.map((pg) => (pg.id === pageId ? fn(pg) : pg)),
});

export const upsertButton = (p: DeckProfile, pageId: string, b: DeckButton): DeckProfile =>
  updatePage(p, pageId, (pg) => {
    const exists = pg.buttons.some((x) => x.id === b.id);
    return { ...pg, buttons: exists ? pg.buttons.map((x) => (x.id === b.id ? b : x)) : [...pg.buttons, b] };
  });

export const removeButton = (p: DeckProfile, pageId: string, id: string): DeckProfile =>
  updatePage(p, pageId, (pg) => ({ ...pg, buttons: pg.buttons.filter((b) => b.id !== id) }));

export const duplicateButton = (p: DeckProfile, pageId: string, id: string): DeckProfile =>
  updatePage(p, pageId, (pg) => {
    const i = pg.buttons.findIndex((b) => b.id === id);
    if (i < 0) return pg;
    const copy: DeckButton = { ...pg.buttons[i], id: newId(), actions: pg.buttons[i].actions.map((a) => ({ ...a })) };
    const buttons = [...pg.buttons];
    buttons.splice(i + 1, 0, copy);
    return { ...pg, buttons };
  });

export const addPage = (p: DeckProfile, name: string): { profile: DeckProfile; id: string } => {
  const id = newId();
  return { id, profile: { ...p, pages: [...p.pages, { id, name, cols: 3, rows: 4, buttons: [] }] } };
};

export const removePage = (p: DeckProfile, pageId: string): DeckProfile => {
  if (p.pages.length <= 1) return p;
  const pages = p.pages
    .filter((pg) => pg.id !== pageId)
    // Silinen sayfaya giden butonlar boşa düşmesin.
    .map((pg) => ({
      ...pg,
      buttons: pg.buttons.map((b) => ({
        ...b,
        actions: b.actions.map((a) => (a.type === 'page' && a.pageId === pageId ? { ...a, pageId: '' } : a)),
      })),
    }));
  return { ...p, pages, autoScenesPageId: p.autoScenesPageId === pageId ? undefined : p.autoScenesPageId };
};

export const movePage = (p: DeckProfile, pageId: string, dir: -1 | 1): DeckProfile => {
  const i = p.pages.findIndex((pg) => pg.id === pageId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.pages.length) return p;
  const pages = [...p.pages];
  [pages[i], pages[j]] = [pages[j], pages[i]];
  return { ...p, pages };
};

/** İçe aktarılan JSON'u doğrular; bozuk alanları düzeltir. */
export function validateProfile(raw: any): DeckProfile {
  if (!raw || !Array.isArray(raw.pages) || !raw.pages.length) throw new Error('Geçersiz deste dosyası');
  const pages: DeckPage[] = raw.pages.map((pg: any) => ({
    id: String(pg.id || newId()),
    name: String(pg.name || 'Sayfa'),
    cols: clamp(Number(pg.cols) || 3, 1, 8),
    rows: clamp(Number(pg.rows) || 4, 1, 10),
    buttons: Array.isArray(pg.buttons)
      ? pg.buttons
          .filter((b: any) => b && typeof b === 'object')
          .map((b: any) => ({
            ...b,
            id: String(b.id || newId()),
            label: String(b.label ?? ''),
            color: typeof b.color === 'string' ? b.color : '#1A2D52',
            actions: Array.isArray(b.actions) ? b.actions.filter((a: any) => a && typeof a.type === 'string') : [],
          }))
      : [],
  }));
  return {
    version: 1,
    name: String(raw.name || 'Deste'),
    pages,
    autoScenesPageId: typeof raw.autoScenesPageId === 'string' ? raw.autoScenesPageId : undefined,
    autoSfxPageId: typeof raw.autoSfxPageId === 'string' ? raw.autoSfxPageId : undefined,
  };
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)));
