/**
 * Where the code is running, and which server it talks to.
 *
 * On the web, the pages and the server routes share one address. The iPhone app
 * (Capacitor) loads its pages from capacitor://localhost, which serves no /api, so
 * every call to QuR Tag's server must name the live site in full.
 */
import { Capacitor } from '@capacitor/core';

/** The live site, which every iPhone build talks to. */
export const PRODUCTION_SITE = 'https://www.qurtag.com';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The server's address: the page's own on the web, the live site in the iPhone app. */
export function apiOrigin(): string {
  const set = import.meta.env.VITE_QURTAG_API_URL as string | undefined;
  if (set) return set.replace(/\/+$/, '');
  return isNative() ? PRODUCTION_SITE : window.location.origin;
}

/** An address on QuR Tag's server, for example serverUrl('/api/fn/finder-view'). */
export function serverUrl(path: string): string {
  return `${apiOrigin()}${path}`;
}

/** The address a finder's tag opens: always the live site, never the app's local page. */
export function publicUrl(path: string): string {
  return `${isNative() ? PRODUCTION_SITE : window.location.origin}${path}`;
}

/** Opens a web page outside the app: Safari's sheet with a Done button on iPhone, the same tab on the web. */
export async function openOutside(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}
