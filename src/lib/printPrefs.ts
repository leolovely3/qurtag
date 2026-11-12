/**
 * What the tag page remembers between visits, on this device only (no account setting exists).
 *
 * - The look and the paper size are remembered for every tag: a person who likes Bold on A4 keeps it.
 * - The style is remembered per tag, once that tag has been printed or saved in it. A tag never
 *   printed opens on the style its item suits (src/lib/tagRecommend.ts), not on the style used
 *   last for something else: the backpack added after a water bottle opens on the bag tag, not
 *   on the small sticker.
 */
import { recommendStyle } from './tagRecommend';
import { LOOKS, STYLES, type LookId, type PaperId, type StyleId } from './tagLayout';

const GLOBAL = 'qurtag.tagstyle';
const BY_TAG = 'qurtag.tagstyle.byTag';

const styleIds = STYLES.map((s) => s.id);
const isStyle = (v: unknown): v is StyleId => typeof v === 'string' && (styleIds as string[]).includes(v);

function read(key: string): Record<string, unknown> {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window: nothing is remembered */
  }
}

/** The style a tag's page opens on: the one it was printed in, else the one its item suits. */
export function initialStyle(byTag: Record<string, unknown>, tagId: string, itemName: string | null | undefined): StyleId {
  const saved = byTag[tagId];
  return isStyle(saved) ? saved : recommendStyle(null, itemName ?? '');
}

export function styleForTag(tagId: string, itemName: string | null | undefined): StyleId {
  return initialStyle(read(BY_TAG), tagId, itemName);
}

/** Records the style a tag was printed or saved in. */
export function rememberTagStyle(tagId: string, style: StyleId): void {
  const all = read(BY_TAG);
  all[tagId] = style;
  write(BY_TAG, all);
}

export function rememberedLook(): LookId {
  const v = read(GLOBAL).look;
  return LOOKS.some((l) => l.id === v) ? (v as LookId) : 'clean';
}

export function rememberedPaper(fallback: PaperId): PaperId {
  const v = read(GLOBAL).paper;
  return v === 'letter' || v === 'a4' ? v : fallback;
}

export function rememberLookAndPaper(look: LookId, paper: PaperId): void {
  write(GLOBAL, { ...read(GLOBAL), look, paper });
}
