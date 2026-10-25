/**
 * Whether paid memberships may be shown at all.
 *
 * The iPhone app shows nothing about memberships until Apple's purchase path works: App Review
 * rejects placeholder features, and a Membership screen that cannot sell is one. So inside the
 * app the answer is yes only when the build has the RevenueCat public iOS key
 * (VITE_REVENUECAT_IOS_API_KEY) and RevenueCat returned offerings. On the web it is always
 * yes: the pricing page and the Membership page there say "Coming soon" themselves when
 * Stripe is not set up.
 *
 * This file is the rule and nothing else, with no imports, so it can be tested on its own.
 * The app's live answer is membershipsAvailableInApp() in src/lib/iap.ts.
 */
export interface MembershipEnvironment {
  /** Running inside the iPhone app (Capacitor), not on the web. */
  native: boolean;
  /** The RevenueCat public iOS key was set when the app was built. */
  hasKey: boolean;
  /** RevenueCat returned at least one offering with a product the app sells. */
  offeringsLoaded: boolean;
}

export function membershipsAvailable(env: MembershipEnvironment): boolean {
  if (!env.native) return true;
  return env.hasKey && env.offeringsLoaded;
}
