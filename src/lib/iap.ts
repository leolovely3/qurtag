/**
 * Buying a membership inside the iPhone app: Apple's in-app purchase, through RevenueCat.
 *
 * The app tells RevenueCat who the person is by their QuR Tag account id, so a purchase is
 * tied to the account and survives a new phone. The app never writes a plan itself: after
 * a purchase or a restore it asks the server for the membership again until the plan
 * RevenueCat's webhook recorded shows up (src/lib/membership.ts, waitForMembership).
 *
 * Needs the RevenueCat public iOS key, VITE_REVENUECAT_IOS_API_KEY, when the app is built
 * (it is a public key, safe to ship). Without it the Membership screen says buying is not
 * open yet. Everything here loads only inside the iPhone app; the web never reaches it.
 */
import { isNative } from './platform';
import { PRODUCTS } from '../../server/billing/catalog';
import { membershipsAvailable } from './membership-flag';

export const iapKey = (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined)?.trim() || '';

/** Whether this build can sell: it is the iPhone app and the key was set at build time. */
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
  productId: string;
  /** The price as Apple formats it for the person's country, for example "$19.00". */
  priceString: string;
  /** Apple's own name for the package, passed back to purchase. */
  packageRef: unknown;
}

let configuredFor: string | null = null;

async function sdk() {
  return (await import('@revenuecat/purchases-capacitor')).Purchases;
}

/** Signs RevenueCat in as this account (once per account). */
export async function iapSignIn(userId: string): Promise<void> {
  if (!iapAvailable() || configuredFor === userId) return;
  const Purchases = await sdk();
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
    const Purchases = await sdk();
    await Purchases.logOut();
  } catch {
    /* already anonymous */
  }
  configuredFor = null;
}

/** The four products with Apple's prices, for those Apple returned. */
export async function iapPrices(userId: string): Promise<Map<string, StorePrice>> {
  const out = new Map<string, StorePrice>();
  if (!iapAvailable()) return out;
  await iapSignIn(userId);
  const Purchases = await sdk();
  const offerings = await Purchases.getOfferings();
  const all = [offerings.current, ...Object.values(offerings.all ?? {})].filter(Boolean);
  for (const offering of all) {
    for (const pkg of offering!.availablePackages ?? []) {
      const id = pkg.product.identifier;
      if (PRODUCTS.some((p) => p.appleId === id) && !out.has(id)) {
        out.set(id, { productId: id, priceString: pkg.product.priceString, packageRef: pkg });
      }
    }
  }
  return out;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

export async function iapBuy(userId: string, price: StorePrice): Promise<{ outcome: PurchaseOutcome; message?: string }> {
  await iapSignIn(userId);
  const Purchases = await sdk();
  try {
    await Purchases.purchasePackage({ aPackage: price.packageRef as Parameters<typeof Purchases.purchasePackage>[0]['aPackage'] });
    return { outcome: 'purchased' };
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return { outcome: 'cancelled' };
    return { outcome: 'failed', message: 'The App Store could not complete the purchase. You were not charged. Please try again.' };
  }
}

/** Asks Apple for this Apple ID's earlier purchases. Answers whether any membership was found. */
export async function iapRestore(userId: string): Promise<{ found: boolean } | { error: string }> {
  try {
    await iapSignIn(userId);
    const Purchases = await sdk();
    const { customerInfo } = await Purchases.restorePurchases();
    return { found: (customerInfo.activeSubscriptions ?? []).length > 0 };
  } catch {
    return { error: 'Could not reach the App Store. Check your connection and try again.' };
  }
}
