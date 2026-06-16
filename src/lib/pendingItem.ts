/**
 * A "pending item" lets a user provide their first item's details at
 * /start (before the magic-link round-trip) and have them survive the
 * redirect to /start/setup, so the flow feels like one continuous step.
 *
 * Stored in sessionStorage so it auto-clears at the end of the browser
 * session and never leaks across users.
 */

const KEY = 'qurtag.pending_item';

export interface PendingItem {
  name?: string;
  brand?: string;
}

export function setPendingItem(item: PendingItem): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(item));
  } catch {
    /* noop */
  }
}

export function getPendingItem(): PendingItem | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingItem;
  } catch {
    return null;
  }
}

export function clearPendingItem(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
