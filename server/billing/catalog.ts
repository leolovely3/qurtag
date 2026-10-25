/**
 * The plans QuR Tag sells, in one place: what each includes, what it costs, the iPhone
 * product ids and the names of the Stripe price settings. Shared by the server (which maps
 * a payment to a plan) and the screens (the pricing page and the Membership screen), so a
 * price is written exactly once. No imports: both sides load this file.
 *
 * The prices here are the US dollar prices set in Stripe and in App Store Connect. The
 * iPhone shows the price StoreKit reports for the person's country; the web shows these.
 *
 * Free: 3 items, 1 person, scan history of the last 30 days.
 * Plus: unlimited items, 1 person, the full scan history.
 * Family: Plus for up to 5 people who share the items and the inbox.
 */
export type PaidPlan = 'plus' | 'family';
export type Plan = 'free' | PaidPlan;
/** Both paid plans are yearly only, auto-renewing. */
export type Interval = 'year';

/** How many people one Family plan covers (the owner and four others). */
export const FAMILY_SEATS = 5;
/** Items on the Free plan. */
export const FREE_ITEM_LIMIT = 3;
/** Days of scan history on the Free plan. */
export const FREE_SCAN_DAYS = 30;

export const APPLE_GROUP_NAME = 'QuR Tag Membership';

export interface Product {
  plan: PaidPlan;
  interval: Interval;
  /** US dollars, in cents. */
  cents: number;
  /** The auto-renewable subscription's product id in App Store Connect. */
  appleId: string;
  /** The setting that holds the Stripe price id (a server setting). */
  stripeEnv: string;
}

export const PRODUCTS: readonly Product[] = [
  { plan: 'plus', interval: 'year', cents: 1900, appleId: 'app.impactconsultingai.qurtag.plus.yearly', stripeEnv: 'STRIPE_PRICE_PLUS_YEARLY' },
  { plan: 'family', interval: 'year', cents: 2900, appleId: 'app.impactconsultingai.qurtag.family.yearly', stripeEnv: 'STRIPE_PRICE_FAMILY_YEARLY' },
];

export function productFor(plan: PaidPlan, interval: Interval): Product {
  return PRODUCTS.find((p) => p.plan === plan && p.interval === interval)!;
}

export function productByAppleId(id: string | null | undefined): Product | undefined {
  return PRODUCTS.find((p) => p.appleId === id);
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A price as people write it: $19 for whole dollars, $19.50 otherwise. */
export function priceLabel(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : dollars(cents);
}

export interface PlanInfo {
  id: Plan;
  name: string;
  /** One line under the name. */
  summary: string;
  /** What the plan includes, as short true statements. */
  includes: readonly string[];
}

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    summary: 'For the few things you would hate to lose.',
    includes: [
      `Up to ${FREE_ITEM_LIMIT} items, each with a printable QR tag`,
      '1 person',
      'The finder page, with no app or account for the finder',
      'Your inbox, to read and reply to finders',
      'A lost switch for each item',
      `Scan history for the last ${FREE_SCAN_DAYS} days`,
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    summary: 'For everything you carry.',
    includes: [
      'Unlimited items',
      '1 person',
      'Everything in Free',
      'Your full scan history',
    ],
  },
  family: {
    id: 'family',
    name: 'Family',
    summary: 'Plus, shared with the people you live with.',
    includes: [
      `Up to ${FAMILY_SEATS} people, invited by email`,
      'Unlimited items, shared by everyone in the family',
      'One shared inbox',
      'Everything in Plus',
    ],
  },
};
