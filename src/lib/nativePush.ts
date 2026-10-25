/**
 * Push notifications in the iPhone app: asking permission at a good moment, registering the
 * phone's Apple device token with the server, and forgetting it on sign out.
 *
 * Nothing here runs on the web (the web app has no push), and nothing runs at launch except
 * re-registering a phone that already allowed alerts, which keeps its token current. The
 * permission question is asked only after the person's first item is saved, behind a short
 * explanation (components/push/PushPrimer.tsx), never cold. If they say no there, or to
 * Apple's own question, the Settings screen explains how to change it.
 *
 * The device token goes to the server (/api/fn/push-register) with the person's pass, and is
 * kept on this phone only so it can be removed again on sign out. The server never sends a
 * token back to any screen.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { getDataPass } from './authClient';
import { pushEnvironment } from './nativeSession';
import { isNative, serverUrl } from './platform';

export type PushPermission = 'prompt' | 'granted' | 'denied' | 'unsupported';

const ASKED_KEY = 'qurtag.push-asked';
const TOKEN_KEY = 'qurtag.push-token';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage off: we may ask again next time, which is harmless */
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!isNative()) return 'unsupported';
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** True once, on a phone that has not been asked: the moment to show the explanation. */
export async function shouldExplainPush(): Promise<boolean> {
  if (!isNative() || read(ASKED_KEY)) return false;
  return (await pushPermission()) === 'prompt';
}

export function markPushExplained(): void {
  write(ASKED_KEY, '1');
}

async function post(path: string, body: unknown): Promise<boolean> {
  const pass = await getDataPass();
  if (!pass) return false;
  try {
    const r = await fetch(serverUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pass}` },
      credentials: 'omit',
      body: JSON.stringify(body),
      // Signing out waits for this; a bad connection must not hold it up.
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  void PushNotifications.addListener('registration', async ({ value }) => {
    const token = value.toLowerCase();
    if (!/^[0-9a-f]{32,200}$/.test(token)) return;
    write(TOKEN_KEY, token);
    await post('/api/fn/push-register', { token, environment: await pushEnvironment() });
  });
  void PushNotifications.addListener('registrationError', () => {
    /* Apple did not hand out a token (no network, or the build is not set up for push): try again next launch */
  });
}

/** Asks Apple's permission question and, if allowed, registers the phone. */
export async function turnOnPush(): Promise<'granted' | 'denied' | 'error'> {
  if (!isNative()) return 'error';
  try {
    listen();
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') return 'denied';
    await PushNotifications.register();
    return 'granted';
  } catch {
    return 'error';
  }
}

/** On launch: a phone that already allowed alerts asks Apple for its (possibly new) token again. */
export async function refreshPushRegistration(): Promise<void> {
  if (!isNative() || (await pushPermission()) !== 'granted') return;
  try {
    listen();
    await PushNotifications.register();
  } catch {
    /* tried again at the next launch */
  }
}

/** Sign out: this phone stops receiving this account's alerts. Call it before the session ends. */
export async function forgetPushDevice(): Promise<void> {
  const token = read(TOKEN_KEY);
  if (!isNative() || !token) return;
  await post('/api/fn/push-unregister', { token });
  write(TOKEN_KEY, null);
}

export interface PushTap {
  thread: string | null;
  /** An admin alert: the screen to open. */
  open: string | null;
}

/** Calls back when the person taps a notification (not Reply, which the app's native code handles). */
export function onPushTap(handler: (tap: PushTap) => void): () => void {
  if (!isNative()) return () => {};
  let handle: { remove: () => Promise<void> } | null = null;
  let gone = false;
  void PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const data = (event.notification?.data ?? {}) as { thread?: unknown; open?: unknown };
    const thread = typeof data.thread === 'string' && /^[0-9a-f-]{36}$/i.test(data.thread) ? data.thread : null;
    const open = typeof data.open === 'string' && /^\/app\/admin(#[a-z-]+)?$/.test(data.open) ? data.open : null;
    handler({ thread, open });
  }).then((h) => {
    if (gone) void h.remove();
    else handle = h;
  });
  return () => {
    gone = true;
    void handle?.remove();
  };
}
