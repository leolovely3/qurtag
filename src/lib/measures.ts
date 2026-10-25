/**
 * First-party measures: what QuR Tag counts about how it is used, in its own database and nowhere else
 * (db/measures.sql). The Privacy page promises no third-party analytics and no tracking cookies, so:
 *
 *   - The channel a visitor came from (?ch=<channel>, or utm_source when there is no ch) is kept in
 *     sessionStorage, which belongs to the one browser tab and is gone when it closes. It is not a cookie and it
 *     is never sent anywhere until the person creates an account; then it is stored once on the account
 *     (signup_channel) and used only to count sign-ups per channel.
 *   - A print or download of a tag file records the style, look, paper, app or web, and which button,
 *     against the household, so the owner's own totals can be counted. No item, no tag, no address.
 *   - The platform an account signs in from (iPhone app or web) is recorded once a day at most.
 *
 * Every call here is fire and forget: a failed measure never blocks, delays or shows an error to a person.
 */
import { isNative } from './platform';

export const CHANNEL_KEY = 'qurtag.channel';
const SHAPE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** A channel label as the database accepts it: lowercase letters, digits, "-" and "_", 32 characters at most; else null. */
export function cleanChannel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 32).replace(/-+$/, '');
  return SHAPE.test(s) ? s : null;
}

/** The channel a page address names: ch, else utm_source. */
export function channelFromSearch(search: string): string | null {
  const q = new URLSearchParams(search);
  return cleanChannel(q.get('ch')) ?? cleanChannel(q.get('utm_source'));
}

/**
 * Remembers the channel of the first tagged visit in this tab. Called once when the app starts, on every
 * page, so a tagged link to the landing page, the pricing page or a tag page is all counted the same.
 */
export function captureChannel(search: string = typeof location === 'undefined' ? '' : location.search, store?: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    const s = store ?? window.sessionStorage;
    if (s.getItem(CHANNEL_KEY)) return;
    const ch = channelFromSearch(search);
    if (ch) s.setItem(CHANNEL_KEY, ch);
  } catch {
    /* storage off: the sign-up is simply counted under "unknown" */
  }
}

/** The channel to store on a new account: the remembered one; in the iPhone app, which has no landing page, "ios-app". */
export function signupChannel(store?: Pick<Storage, 'getItem'>): string | null {
  try {
    const found = (store ?? window.sessionStorage).getItem(CHANNEL_KEY);
    if (found && SHAPE.test(found)) return found;
  } catch {
    /* storage off */
  }
  return isNative() ? 'ios-app' : null;
}

export type PrintAction = 'print' | 'download_pdf' | 'download_print_ready_png' | 'download_print_ready_pdf';

/** Counts one print, share or download of a tag file. Never throws. */
export function recordTagPrint(input: { style: string; look: string; paper: string; action: PrintAction }): void {
  void import('./db')
    .then(({ db }) =>
      db.rpc('record_tag_print', {
        p_style: input.style,
        p_look: input.look,
        p_paper: input.paper,
        p_surface: isNative() ? 'app' : 'web',
        p_action: input.action,
      }),
    )
    .catch(() => {});
}

/** Notes which platform this account is using (the database writes it at most once a day). Never throws. */
export function recordPlatform(): void {
  void import('./db')
    .then(({ db }) => db.rpc('record_app_platform', { p_platform: isNative() ? 'ios' : 'web' }))
    .catch(() => {});
}
