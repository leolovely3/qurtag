/**
 * The bridge to the iPhone app's own code (ios/App/App/QurTagPushPlugin.swift) for what the
 * web page cannot do alone:
 *
 *  - keep the sign-in session token where the app's native code can read it when the page is
 *    asleep, so "Reply" typed in a notification can post with the app in the background or
 *    closed (the page's own storage is not readable then). It lives in the iPhone's Keychain,
 *    available after the first unlock, and goes when the person signs out;
 *  - set the number on the app icon and clear delivered notifications;
 *  - say which Apple push server this build talks to (Xcode builds: sandbox; TestFlight and the
 *    App Store: production).
 *
 * On the web these do nothing.
 */
import { registerPlugin } from '@capacitor/core';
import { apiOrigin, isNative } from './platform';

interface QurTagPushPlugin {
  setSession(options: { token: string; apiBase: string }): Promise<void>;
  clearSession(): Promise<void>;
  setBadge(options: { count: number }): Promise<void>;
  clearDelivered(options?: { thread?: string }): Promise<void>;
  environment(): Promise<{ environment: 'sandbox' | 'production' }>;
}

const plugin = isNative() ? registerPlugin<QurTagPushPlugin>('QurTagPush') : null;

async function quietly(work: (() => Promise<unknown>) | undefined): Promise<void> {
  try {
    await work?.();
  } catch {
    /* an older build of the app without the plugin, or the plugin is busy: nothing to do */
  }
}

/** Gives the native code the session token (or takes it away when null). */
export function syncNativeSession(token: string | null): Promise<void> {
  if (!plugin) return Promise.resolve();
  return quietly(token ? () => plugin.setSession({ token, apiBase: apiOrigin() }) : () => plugin.clearSession());
}

/** The number on the app icon: notes the person has not read. */
export function setAppBadge(count: number): Promise<void> {
  if (!plugin) return Promise.resolve();
  return quietly(() => plugin.setBadge({ count: Math.max(0, Math.min(9999, Math.trunc(count) || 0)) }));
}

/** Takes delivered notifications off the lock screen and Notification Centre (one conversation, or all). */
export function clearDeliveredNotifications(thread?: string): Promise<void> {
  if (!plugin) return Promise.resolve();
  return quietly(() => plugin.clearDelivered(thread ? { thread } : {}));
}

export async function pushEnvironment(): Promise<'sandbox' | 'production'> {
  try {
    return (await plugin?.environment())?.environment ?? 'production';
  } catch {
    return 'production';
  }
}
