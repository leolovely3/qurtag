/**
 * What /start shows first: the welcome screen, the form to make an account, or the form to sign in.
 *
 * On the website /start opens on making an account, as a visitor has usually just pressed
 * "Make a free tag". In the iPhone app most people opening a signed-out app already have an
 * account (they signed out, or the session ended), so the app opens on signing in. The one
 * exception is the very first open on a phone: someone who has just downloaded the app has never
 * been told what it is, so they see a single welcome screen that says what QuR Tag does and lets
 * them choose between making a free tag and signing in.
 *
 * "Has used an account on this phone" is a flag in localStorage, set whenever a session exists
 * (src/lib/auth.tsx), so a successful sign-in or new account sets it, and so does an existing
 * install that is already signed in when it updates. Signing out leaves it alone: the next
 * signed-out open goes straight to signing in. Deleting the app clears it, which is right, as
 * the phone then starts over.
 *
 * Links that say what they want win over all of this: ?mode=create and ?mode=signin open that
 * form, and a `next` (an invite, a paid plan from Pricing) skips the welcome screen, because the
 * person is already in the middle of something. The one `next` that does not count is the app's
 * own home: the app opens at /app, and AppLayout sends a signed-out person to /start?next=/app,
 * so every cold start carries it and it says nothing about what the person wants.
 */

export type StartView = 'welcome' | 'create' | 'signin';

export const ACCOUNT_ON_DEVICE_KEY = 'qurtag.account-on-device';

export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function initialStartView({
  native,
  mode,
  next,
  accountOnDevice,
}: {
  native: boolean;
  mode: string | null;
  next: string | null;
  accountOnDevice: boolean;
}): StartView {
  if (mode === 'signin') return 'signin';
  if (mode === 'create' || !native) return 'create';
  if (accountOnDevice || (next && !isAppHome(next))) return 'signin';
  return 'welcome';
}

/** The address every signed-out cold start of the app carries as `next`: /app, with or without a slash. */
function isAppHome(next: string): boolean {
  return /^\/app\/?$/.test(next);
}

function storage(): FlagStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasAccountOnDevice(store: FlagStorage | null = storage()): boolean {
  try {
    return store?.getItem(ACCOUNT_ON_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberAccountOnDevice(store: FlagStorage | null = storage()): void {
  try {
    store?.setItem(ACCOUNT_ON_DEVICE_KEY, '1');
  } catch {
    // Storage is full or blocked: the welcome screen may show again, which is harmless.
  }
}
