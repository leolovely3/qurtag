/**
 * What happened to each tag after it was made, as this browser or phone knows it: printed (a Print,
 * a saved PDF, or "I have printed it") and stuck on ("I stuck it on"). Items shows it as the item's
 * status: "Tag ready to print", then "Printed, not stuck on yet", then "Tag is on". The database has
 * no field for this (a print counts in the measures, but carries no tag), so it is kept per device,
 * like the Getting started checklist; another device starts at "Tag ready to print" again.
 */
import type { StorageLike } from './gettingStarted';

const KEY = 'qurtag.tag-progress';

export interface TagProgress {
  printed?: boolean;
  stuck?: boolean;
}

function read(storage: StorageLike | null): Record<string, TagProgress> {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, TagProgress>) : {};
  } catch {
    return {};
  }
}

export function tagProgress(storage: StorageLike | null, tagId: string): TagProgress {
  return read(storage)[tagId] ?? {};
}

export function markTag(storage: StorageLike | null, tagId: string, what: 'printed' | 'stuck'): void {
  const all = read(storage);
  // Stuck on means it was printed too.
  all[tagId] = { ...all[tagId], printed: true, ...(what === 'stuck' ? { stuck: true } : {}) };
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage off */
  }
}

/** The item's status line on Items. */
export function itemStatus(input: { locked: boolean; hasTag: boolean; progress: TagProgress }): string {
  if (input.locked) return 'Read-only: over your plan';
  if (!input.hasTag) return 'No working tag';
  if (input.progress.stuck) return 'Tag is on';
  if (input.progress.printed) return 'Printed, not stuck on yet';
  return 'Tag ready to print';
}

export function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Records a print or a stick from any screen. */
export function recordTag(tagId: string | null | undefined, what: 'printed' | 'stuck'): void {
  if (tagId) markTag(deviceStorage(), tagId, what);
}
