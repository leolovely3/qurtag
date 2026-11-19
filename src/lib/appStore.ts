/**
 * Where people get QuR Tag on a phone, shown on the home page and on Help (src/routes/marketing/GetTheApp.tsx).
 *
 * APP_STORE_URL is the iPhone app's public App Store listing. It stays null until Apple has
 * approved the app and the listing answers with the QuR Tag page: Apple's "Download on the App
 * Store" badge may only link to a live listing, and a link to a missing one is a dead end for a
 * visitor. On launch day, set it to the listing address from App Store Connect (App Information,
 * "View on App Store"), in the form https://apps.apple.com/us/app/qur-tag/id0000000000.
 */
export const APP_STORE_URL: string | null = null;

/** Until the Android app is on Google Play, Android visitors use the web app, which starts here. */
export const ANDROID_WEB_APP_PATH = '/start';

/** True for an address that is an App Store app listing, and nothing else. */
export function isAppStoreListing(url: string): boolean {
  return /^https:\/\/apps\.apple\.com\/([a-z]{2}\/)?app\/[a-z0-9-]+\/id\d{6,12}$/.test(url);
}
