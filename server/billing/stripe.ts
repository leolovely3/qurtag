/**
 * The web side of payment: Stripe Checkout and the customer portal, and the webhook that
 * turns Stripe's events into a plan.
 *
 * No Stripe library: three small calls over HTTPS and a signature check, so nothing here is
 * hidden and the tests can sign their own events.
 *
 * A webhook is trusted only when its `Stripe-Signature` header matches an HMAC-SHA256 of
 * `<timestamp>.<raw body>` made with STRIPE_WEBHOOK_SECRET, and the timestamp is within 5
 * minutes (checked in constant time). The plan comes from the PRICE that was paid (which
 * of the four price settings it is), never from text the browser could have influenced.
 * The account comes from `metadata.user_id` that the checkout route put on the
 * subscription, then from the Stripe customer linked at checkout. Only subscriptions
 * marked `metadata.app = qurtag` are ours; the rest of the Stripe account is left alone.
 *
 * The database does the rest (qurtag.server_apply_subscription): it ignores a delivery it
 * has already applied, ignores an older event than the one it holds, and writes the plan.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PRODUCTS, productFor, type Interval, type PaidPlan, type Product } from './catalog.js';

export const STRIPE_TOLERANCE_SECONDS = 300;

/** The settings Stripe needs, and which of the four prices are set. */
export function stripeSettings(env: NodeJS.ProcessEnv) {
  const secret = env.STRIPE_SECRET_KEY?.trim() || '';
  const prices = PRODUCTS.map((p) => ({ product: p, priceId: env[p.stripeEnv]?.trim() || '' }));
  return {
    secret,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || '',
    prices,
    /** Buying works when the secret key and the price are set. */
    canSell: (p: Product) => !!secret && !!prices.find((x) => x.product === p)?.priceId,
  };
}

export function productForStripePrice(env: NodeJS.ProcessEnv, priceId: string | null | undefined): Product | undefined {
  if (!priceId) return undefined;
  return stripeSettings(env).prices.find((x) => x.priceId === priceId)?.product;
}

/** Whether `header` is a valid Stripe signature of `payload`. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  let t = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  const stamp = Number(t);
  if (!t || !Number.isFinite(stamp) || v1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - stamp) > STRIPE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest();
  return v1.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
  });
}

/** Signs a payload the way Stripe does (for tests and for local fixtures). */
export function signStripePayload(payload: string, secret: string, nowMs = Date.now()): string {
  const t = Math.floor(nowMs / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

// ------------------------------------------------------------------ Stripe's API

export type Fetch = typeof fetch;

async function stripePost(env: NodeJS.ProcessEnv, f: Fetch, path: string, form: URLSearchParams): Promise<Record<string, unknown>> {
  const { secret } = stripeSettings(env);
  if (!secret) throw new Error('stripe_not_configured');
  const r = await f(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`stripe_${r.status}`);
  return body;
}

/** A hosted Checkout page for one plan. Returns its address. */
export async function createCheckoutSession(
  env: NodeJS.ProcessEnv,
  f: Fetch,
  input: { userId: string; email: string; customerId: string | null; plan: PaidPlan; interval: Interval; siteUrl: string },
): Promise<string> {
  const product = productFor(input.plan, input.interval);
  const priceId = stripeSettings(env).prices.find((x) => x.product === product)?.priceId;
  if (!priceId) throw new Error('stripe_price_missing');
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', `${input.siteUrl}/app/membership?checkout=success`);
  form.set('cancel_url', `${input.siteUrl}/app/membership?checkout=cancelled`);
  form.set('client_reference_id', input.userId);
  form.set('metadata[user_id]', input.userId);
  form.set('metadata[app]', 'qurtag');
  form.set('subscription_data[metadata][user_id]', input.userId);
  form.set('subscription_data[metadata][app]', 'qurtag');
  // Stripe Tax: tax is worked out from the billing address the person gives on the Checkout page.
  // Subscriptions made by Checkout carry automatic tax, so renewals and plan changes made in the
  // customer portal are taxed the same way with no further setting.
  form.set('automatic_tax[enabled]', 'true');
  form.set('billing_address_collection', 'required');
  if (input.customerId) {
    form.set('customer', input.customerId);
    // Stripe requires these when an existing customer is passed with automatic tax, so the address they
    // give is saved on the customer and used for tax.
    form.set('customer_update[address]', 'auto');
    form.set('customer_update[name]', 'auto');
  } else form.set('customer_email', input.email);
  const session = await stripePost(env, f, 'checkout/sessions', form);
  if (typeof session.url !== 'string') throw new Error('stripe_no_url');
  return session.url;
}

/** The customer portal, where a person changes their card, switches plan or cancels. */
export async function createPortalSession(env: NodeJS.ProcessEnv, f: Fetch, input: { customerId: string; returnUrl: string }): Promise<string> {
  const form = new URLSearchParams();
  form.set('customer', input.customerId);
  form.set('return_url', input.returnUrl);
  const session = await stripePost(env, f, 'billing_portal/sessions', form);
  if (typeof session.url !== 'string') throw new Error('stripe_no_url');
  return session.url;
}

// ------------------------------------------------------------------ events

export interface Applied {
  provider: 'stripe' | 'apple';
  eventId: string;
  eventType: string;
  eventAt: Date;
  userId: string | null;
  customer: string | null;
  externalId: string;
  plan: PaidPlan;
  interval: Interval;
  status: 'active' | 'canceling' | 'billing_issue' | 'expired' | 'refunded';
  periodEnd: Date;
  /** Must not lower a plan already held (an upgrade announced before it starts). */
  keepHigher: boolean;
}

/** What a webhook delivery asks the database to do. */
export type Action =
  /** `log`: say so in the server log (a QuR Tag event nothing here can place). */
  | { kind: 'ignore'; why: string; log?: boolean }
  | { kind: 'link'; userId: string; customer: string }
  | { kind: 'apply'; apply: Applied };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** A Stripe reference is an id or an expanded object with an id. */
const refId = (v: unknown): string | null => text(v) ?? text(obj(v)?.id);

/**
 * Decides what a verified Stripe event means. Throws when it is ours but cannot be read
 * (so the delivery answers 500 and Stripe sends it again); ignores everything else.
 */
export function actionForStripeEvent(env: NodeJS.ProcessEnv, event: unknown): Action {
  const e = obj(event);
  const id = text(e?.id);
  const type = text(e?.type);
  const object = obj(obj(e?.data)?.object);
  if (!e || !id || !type || !object) return { kind: 'ignore', why: 'unreadable event' };

  if (type === 'checkout.session.completed') {
    if (object.mode !== 'subscription') return { kind: 'ignore', why: 'not a subscription' };
    const metadata = obj(object.metadata);
    const userId = text(object.client_reference_id) ?? text(metadata?.user_id);
    const customer = refId(object.customer);
    if (metadata?.app !== 'qurtag' || !userId || !UUID.test(userId) || !customer) return { kind: 'ignore', why: 'not a QuR Tag checkout' };
    return { kind: 'link', userId, customer };
  }

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const metadata = obj(object.metadata);
    if (metadata?.app !== 'qurtag') return { kind: 'ignore', why: 'not a QuR Tag subscription' };
    const subscriptionId = text(object.id);
    const customer = refId(object.customer);
    const item = obj((Array.isArray(obj(object.items)?.data) ? (obj(object.items)!.data as unknown[]) : [])[0]);
    const priceId = text(obj(item?.price)?.id);
    const product = productForStripePrice(env, priceId);
    if (!subscriptionId) throw new Error('subscription without an id');
    if (!product) {
      // With no price settings at all the server is not set up: throw, so Stripe retries the event
      // later instead of dropping it. With the settings in place, a price that is not one of them
      // (a retired or unknown price) is logged and the plan is left as it is.
      if (!stripeSettings(env).prices.some((x) => x.priceId)) throw new Error(`price ${priceId ?? '(none)'}: the QuR Tag price settings are not set`);
      return { kind: 'ignore', why: `price ${priceId ?? '(none)'} is not a QuR Tag price; the plan is unchanged`, log: true };
    }
    // The period end moved from the subscription to its items in newer API versions; read both.
    const end = Number(item?.current_period_end ?? object.current_period_end);
    const status = String(object.status);
    let mapped: Applied['status'];
    if (type === 'customer.subscription.deleted') mapped = 'expired';
    else if (status === 'active' || status === 'trialing') mapped = object.cancel_at_period_end === true ? 'canceling' : 'active';
    else if (status === 'past_due') mapped = 'billing_issue';
    else if (status === 'incomplete') return { kind: 'ignore', why: 'payment not finished yet' };
    else mapped = 'expired'; // unpaid, canceled, incomplete_expired, paused
    if (mapped !== 'expired' && !Number.isFinite(end)) throw new Error('subscription without a period end');
    const userId = text(metadata?.user_id);
    return {
      kind: 'apply',
      apply: {
        provider: 'stripe',
        eventId: id,
        eventType: type,
        eventAt: new Date(Number(e.created) * 1000),
        userId: userId && UUID.test(userId) ? userId : null,
        customer,
        externalId: subscriptionId,
        plan: product.plan,
        interval: product.interval,
        status: mapped,
        periodEnd: new Date((Number.isFinite(end) ? end : Date.now() / 1000) * 1000),
        keepHigher: false,
      },
    };
  }
  return { kind: 'ignore', why: `event type ${type}` };
}
