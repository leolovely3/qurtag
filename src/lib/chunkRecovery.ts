import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/*
 * A visitor who has the site open during a deploy later asks for page files
 * (assets/Groups-abc123.js) that no longer exist. The page then renders
 * nothing. The cure is one reload, which fetches the new index.html and the
 * new file names. It is allowed once per window: a reload that did not help
 * must end in a plain message with a Reload button, never in a loop and never
 * in a blank screen. The time lives in sessionStorage because it has to
 * survive the reload it guards.
 */

export const RELOAD_WINDOW_MS = 30_000;
const KEY = 'qurtag_chunk_reload_at';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const PATTERNS = [
  'Failed to fetch dynamically imported module', // Chrome, Edge
  'Importing a module script failed', // Safari
  'error loading dynamically imported module', // Firefox
  'Unable to preload CSS',
  'Expected a JavaScript module script',
  'Loading chunk',
  'Loading CSS chunk',
];

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return PATTERNS.some((p) => error.message.includes(p));
}

/** True once per window. Declines when storage is unavailable, as it cannot guard a loop. */
export function claimReload(store?: Store, nowMs: number = Date.now()): boolean {
  try {
    const s = store ?? sessionStorage;
    const last = Number(s.getItem(KEY) ?? 0);
    if (last && nowMs - last < RELOAD_WINDOW_MS) return false;
    s.setItem(KEY, String(nowMs));
    return true;
  } catch {
    return false;
  }
}

/** Reloads if the guard allows it. Returns whether a reload was started. */
let reloading = false;
export function reloadOnce(): boolean {
  if (reloading) return true;
  if (!claimReload()) return false;
  reloading = true;
  window.location.reload();
  return true;
}

/**
 * Call once at start-up: Vite reports a failed preload here before it throws.
 * The event is not cancelled, so the import still fails and reaches the lazy
 * wrapper and the boundary if the reload is refused.
 */
export function installPreloadErrorHandler(): void {
  window.addEventListener('vite:preloadError', () => {
    reloadOnce();
  });
}

/** React.lazy that reloads once on a chunk failure, then lets the error reach the boundary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadOnce()) {
        // Keep the loading state up while the page reloads.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}
