/**
 * Whether paid memberships may be shown at all.
 *
 * The phone apps show nothing about memberships until their store's purchase path works: App
 * Review and Google Play review reject placeholder features, and a Membership screen that cannot
 * sell is one. So inside an app the answer is yes only when the build has RevenueCat's public key
 * for its platform (VITE_REVENUECAT_IOS_API_KEY or VITE_REVENUECAT_ANDROID_API_KEY) and
 * RevenueCat returned offerings. On Android that also needs Google Play on the phone: when the
 * store returns nothing the app stays on Free, with no buttons that cannot work. On the web it is always
 * yes: the pricing page and the Membership page there say "Coming soon" themselves when
 * Stripe is not set up.
 *
 * This file is the rule and nothing else, with no imports, so it can be tested on its own.
 * The app's live answer is membershipsAvailableInApp() in src/lib/iap.ts.
 */
export interface MembershipEnvironment {
  /** Running inside a phone app (Capacitor), not on the web. */
  native: boolean;
  /** RevenueCat's public key for this platform was set when the app was built. */
  hasKey: boolean;
  /** RevenueCat returned at least one offering with a product the app sells. */
  offeringsLoaded: boolean;
}

export function membershipsAvailable(env: MembershipEnvironment): boolean {
  if (!env.native) return true;
  return env.hasKey && env.offeringsLoaded;
}
