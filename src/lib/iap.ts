/**
 * Buying a membership inside the phone apps, through RevenueCat: Apple's in-app purchase in the
 * iPhone app, Google Play Billing in the Android app. Both use the same RevenueCat project, the
 * same entitlement (`member`) and the same offering (`default`, with the packages plus and
 * family), and the products have the same ids in both stores (server/billing/catalog.ts).
 *
 * The app tells RevenueCat who the person is by their QuR Tag account id, so a purchase is
 * tied to the account and survives a new phone. The app never writes a plan itself: after
 * a purchase or a restore it asks the server for the membership again until the plan
 * RevenueCat's webhook recorded shows up (src/lib/membership.ts, waitForMembership).
 *
 * Needs RevenueCat's public SDK key for the platform when the app is built (public keys, safe
 * to ship): VITE_REVENUECAT_IOS_API_KEY (appl_...) for iPhone, VITE_REVENUECAT_ANDROID_API_KEY
 * (goog_...) for Android. Without it the app shows nothing about memberships. Everything here
 * loads only inside the phone apps; the web never reaches it.
 */
import { isAndroidApp, isNative, storeName } from './platform';
import { productByStoreId } from '../../server/billing/catalog';
import { membershipsAvailable } from './membership-flag';
import { purchaseFailedText } from './storeText';

export { purchaseFailedText, storeSubscriptionsUrl } from './storeText';

const iosKey = (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim() || '';
const androidKey = (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined)?.trim() || '';

/** The RevenueCat key for this platform, or '' on the web and in a build without one. */
export const iapKey = !isNative() ? '' : isAndroidApp() ? androidKey : iosKey;

/** Whether this build can sell: it is a phone app and its platform's key was set at build time. */
export function iapAvailable(): boolean {
  return isNative() && !!iapKey;
}

/**
 * Whether the app may show anything about memberships (the rule is in membership-flag.ts).
 * Inside the app it turns true by itself once the key is set and offerings have loaded
 * (probeOfferings); the screens follow it through useMembershipsAvailable.
 */
let offeringsLoaded = false;
let probing = false;
const listeners = new Set<() => void>();

export function membershipsAvailableInApp(): boolean {
  return membershipsAvailable({ native: isNative(), hasKey: !!iapKey, offeringsLoaded });
}

export function subscribeMemberships(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Asks RevenueCat for offerings once the person is signed in; a failure leaves memberships hidden. */
export async function probeOfferings(userId: string): Promise<void> {
  if (!iapAvailable() || offeringsLoaded || probing) return;
  probing = true;
  try {
    const prices = await iapPrices(userId);
    if (prices.size > 0) {
      offeringsLoaded = true;
      listeners.forEach((fn) => fn());
    }
  } catch {
    /* stays hidden; the next screen asks again */
  } finally {
    probing = false;
  }
}

export interface StorePrice {
  /** The catalog's product id (server/billing/catalog.ts), the same on both stores. */
  productId: string;
  /** The store's own product id: the same on the App Store, `<id>:yearly` on Google Play. */
  storeProductId: string;
  /** The price as the store formats it for the person's country, for example "$19.00". */
  priceString: string;
  /** RevenueCat's package, passed back to purchase. */
  packageRef: unknown;
}

let configuredFor: string | null = null;

/**
 * The RevenueCat plugin, wrapped in an object. A Capacitor plugin is a proxy that answers
 * every property as a native method, `then` included, so an async function must never
 * resolve to the plugin itself: awaiting it calls Purchases.then(), which fails on iOS
 * ("not implemented") and left RevenueCat unconfigured with memberships hidden.
 */
async function sdk() {
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  return { Purchases };
}

/** Signs RevenueCat in as this account (once per account). */
export async function iapSignIn(userId: string): Promise<void> {
  if (!iapAvailable() || configuredFor === userId) return;
  const { Purchases } = await sdk();
  if (configuredFor === null) {
    await Purchases.configure({ apiKey: iapKey, appUserID: userId });
  } else {
    await Purchases.logIn({ appUserID: userId });
  }
  configuredFor = userId;
}

/** Forgets the account in RevenueCat after sign-out, so the next person starts clean. */
export async function iapSignOut(): Promise<void> {
  if (!iapAvailable() || configuredFor === null) return;
  try {
    const { Purchases } = await sdk();
    await Purchases.logOut();
  } catch {
    /* already anonymous */
  }
  configuredFor = null;
}

/**
 * The products with the store's prices, for those the store returned, keyed by the catalog's
 * product id. Google Play names a product `<id>:yearly`, the App Store `<id>`: both map to the
 * same catalog product (productByStoreId), so the screens look prices up the same way on both.
 */
export async function iapPrices(userId: string): Promise<Map<string, StorePrice>> {
  const out = new Map<string, StorePrice>();
  if (!iapAvailable()) return out;
  await iapSignIn(userId);
  const { Purchases } = await sdk();
  const offerings = await Purchases.getOfferings();
  const all = [offerings.current, ...Object.values(offerings.all ?? {})].filter(Boolean);
  for (const offering of all) {
    for (const pkg of offering!.availablePackages ?? []) {
      const storeProductId = pkg.product.identifier;
      const product = productByStoreId(storeProductId);
      if (product && !out.has(product.appleId)) {
        out.set(product.appleId, { productId: product.appleId, storeProductId, priceString: pkg.product.priceString, packageRef: pkg });
      }
    }
  }
  return out;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

export async function iapBuy(userId: string, price: StorePrice): Promise<{ outcome: PurchaseOutcome; message?: string }> {
  await iapSignIn(userId);
  const { Purchases } = await sdk();
  try {
    await Purchases.purchasePackage({ aPackage: price.packageRef as Parameters<typeof Purchases.purchasePackage>[0]['aPackage'] });
    return { outcome: 'purchased' };
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return { outcome: 'cancelled' };
    return { outcome: 'failed', message: purchaseFailedText(e, storeName()) };
  }
}

/** Asks the store for this store account's earlier purchases. Answers whether any membership was found. */
export async function iapRestore(userId: string): Promise<{ found: boolean } | { error: string }> {
  try {
    await iapSignIn(userId);
    const { Purchases } = await sdk();
    const { customerInfo } = await Purchases.restorePurchases();
    return { found: (customerInfo.activeSubscriptions ?? []).length > 0 };
  } catch {
    return { error: `Could not reach ${storeName()}. Check your connection, and that you are signed in to ${storeName()}, then try again.` };
  }
}
