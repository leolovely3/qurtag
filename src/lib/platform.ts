/**
 * Where the code is running, and which server it talks to.
 *
 * On the web, the pages and the server routes share one address. The phone apps (Capacitor)
 * load their pages from the app itself (capacitor://localhost on iPhone, https://localhost on
 * Android), which serves no /api, so every call to QuR Tag's server must name the live site in full.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

/** The live site, which every phone build talks to. */
export const PRODUCTION_SITE = 'https://www.qurtag.com';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function nativePlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/** True only inside the Android app (Google Play). */
export function isAndroidApp(): boolean {
  return isNative() && nativePlatform() === 'android';
}

/** True only inside the iPhone app. */
export function isIosApp(): boolean {
  return isNative() && nativePlatform() === 'ios';
}

/**
 * Whether this build offers phone alerts. Alerts go straight from the server to Apple's push
 * service (server/push/apns.ts), and Reply in an alert is the iPhone app's own native code
 * (ios/App/App/QurTagNotifications.swift). The Android app has neither: there is no Firebase
 * project and no google-services.json, and calling the push plugin's register() without them
 * stops the app. So on Android the app never asks for notification permission, never touches
 * the push plugin, and owners hear about notes by email, as on the web; its manifest leaves the
 * notification permission out. Add Firebase and an Android sender, then change this, to offer
 * alerts on Android.
 */
export function pushOffered(): boolean {
  return isIosApp();
}

/** The phone the app runs on, in the words people use: "iPhone" or "Android phone". */
export function phoneWord(): string {
  return isAndroidApp() ? 'Android phone' : 'iPhone';
}

/** The store that sells memberships in this app: Google Play on Android, the App Store on iPhone. */
export function storeName(): string {
  return isAndroidApp() ? 'Google Play' : 'the App Store';
}

/** The server's address: the page's own on the web, the live site in the phone apps. */
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

/**
 * Opens a web page outside the app: Safari's sheet with a Done button on iPhone, a Chrome
 * Custom Tab with a close button on Android, the same tab on the web.
 */
export async function openOutside(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}

interface AndroidBarsPlugin {
  set(opts: { color: string; darkIcons: boolean }): Promise<void>;
}
const androidBars = isAndroidApp() ? registerPlugin<AndroidBarsPlugin>('AndroidBars') : null;

/**
 * Android app only: colours the strip behind the status and navigation bars (the app draws
 * edge to edge) and picks dark or light bar icons to match the page, light or dark
 * (android/app/src/main/java/app/impactconsultingai/qurtag/AndroidBarsPlugin.java).
 */
export function setAndroidBars(color: string, darkIcons: boolean): void {
  if (!androidBars) return;
  try {
    androidBars.set({ color, darkIcons }).catch(() => undefined);
  } catch {
    /* the bars keep their colours */
  }
}
