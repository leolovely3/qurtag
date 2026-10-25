/**
 * Browsers inside other apps (Facebook, Instagram, Messenger, TikTok, LinkedIn, Snapchat and so
 * on). A parent who taps a post lands in one of these, and there printing usually does nothing
 * and a PDF download often goes nowhere. The print step says so and offers the way out: copy the
 * link and open it in Safari or Chrome (on Android, a link that opens Chrome directly).
 *
 * Detection is by the user agent words these apps add; a browser it does not know is treated as
 * a normal browser, so nobody is wrongly told to switch.
 */
/** The first match wins: Messenger and Instagram also carry Facebook's words. */
const APPS: [RegExp, string][] = [
  [/Messenger/i, 'Messenger'],
  [/\bInstagram\b/i, 'Instagram'],
  [/\b(FBAN|FBAV|FB_IAB|FBIOS|FB4A)\b/, 'Facebook'],
  [/\b(musical_ly|TikTok|BytedanceWebview|trill)\b/i, 'TikTok'],
  [/\bLinkedInApp\b/i, 'LinkedIn'],
  [/\bSnapchat\b/i, 'Snapchat'],
  [/\bPinterest\b/i, 'Pinterest'],
  [/\bTwitter\b/i, 'X'],
  [/\bLine\/\d/i, 'LINE'],
];

/** The app whose built-in browser this is, or null for an ordinary browser. */
export function inAppBrowserName(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? '';
  for (const [re, name] of APPS) if (re.test(ua)) return name;
  return null;
}

export function isAndroid(userAgent: string | null | undefined): boolean {
  return /android/i.test(userAgent ?? '');
}

/** An address that asks Android to open `url` in Chrome. */
export function chromeIntentUrl(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`;
}
