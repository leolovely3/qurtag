/**
 * The iPhone side of payment: RevenueCat tells the server, by webhook, what the App Store
 * sold or ended, and the server turns it into the same plan the web payments set.
 *
 * The request is trusted only when its `Authorization` header equals REVENUECAT_WEBHOOK_AUTH
 * (the value pasted into RevenueCat's webhook settings), compared in constant time. The
 * account is RevenueCat's app user id: the app signs RevenueCat in with the QuR Tag account
 * id, so the id in the event is the account. The plan comes from the App Store product id.
 * Products that are not QuR Tag's (RevenueCat projects can hold several apps) are ignored.
 *
 * Event meanings:
 *   INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, SUBSCRIPTION_EXTENDED   active until expiration
 *   PRODUCT_CHANGE   the new product, but never lowers a plan already held (a downgrade
 *                    takes effect at the next renewal, which arrives as RENEWAL)
 *   CANCELLATION     auto-renew is off: the plan lasts until expiration; a refund
 *                    (cancel reason CUSTOMER_SUPPORT) ends it at once
 *   BILLING_ISSUE    the renewal payment failed; Apple retries, the plan lasts until expiration
 *   EXPIRATION       over
 * Anything else (TEST, TRANSFER, and so on) is acknowledged and ignored.
 */
import { productByAppleId, type Interval, type PaidPlan } from './catalog.js';
import type { Action, Applied } from './stripe.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The header value to compare: RevenueCat sends exactly what was pasted, with or without "Bearer ". */
export function sentSecret(header: string | null): string | null {
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, '').trim() || null;
}

export function userFromEvent(event: Record<string, unknown>): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])];
  for (const c of candidates) if (typeof c === 'string' && UUID.test(c)) return c;
  return null;
}

export function actionForRevenueCatEvent(body: unknown): Action {
  const ev = obj(obj(body)?.event);
  const type = text(ev?.type);
  const id = text(ev?.id);
  if (!ev || !type) return { kind: 'ignore', why: 'unreadable event' };
  if (type === 'TEST') return { kind: 'ignore', why: 'test event' };
  const store = text(ev.store);
  if (store !== 'APP_STORE' && store !== 'MAC_APP_STORE') return { kind: 'ignore', why: `store ${store ?? '(none)'}` };

  const handled = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'PRODUCT_CHANGE', 'CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION']);
  if (!handled.has(type)) return { kind: 'ignore', why: `event type ${type}` };

  const productId = type === 'PRODUCT_CHANGE' ? (text(ev.new_product_id) ?? text(ev.product_id)) : text(ev.product_id);
  const product = productByAppleId(productId);
  if (!product) return { kind: 'ignore', why: 'not a QuR Tag product' };
  const userId = userFromEvent(ev);
  if (!userId) return { kind: 'ignore', why: 'no QuR Tag account in the event' };
  const externalId = text(ev.original_transaction_id) ?? text(ev.transaction_id);
  // Number(null) is 0, which would read as 1970: a missing time must stay missing.
  const end = typeof ev.expiration_at_ms === 'number' ? ev.expiration_at_ms : NaN;
  const at = typeof ev.event_timestamp_ms === 'number' ? ev.event_timestamp_ms : NaN;
  if (!id || !externalId || !Number.isFinite(at)) throw new Error('RevenueCat event without an id, a transaction or a time');
  if (!Number.isFinite(end)) throw new Error('RevenueCat event without an expiration');

  let status: Applied['status'];
  if (type === 'EXPIRATION') status = 'expired';
  else if (type === 'BILLING_ISSUE') status = 'billing_issue';
  else if (type === 'CANCELLATION') status = ev.cancel_reason === 'CUSTOMER_SUPPORT' ? 'refunded' : 'canceling';
  else status = 'active';
  const plan: PaidPlan = product.plan;
  const interval: Interval = product.interval;
  return {
    kind: 'apply',
    apply: {
      provider: 'apple',
      eventId: id,
      eventType: type,
      eventAt: new Date(at),
      userId,
      customer: null,
      externalId,
      plan,
      interval,
      status,
      periodEnd: new Date(status === 'refunded' ? Math.min(end, at) : end),
      keepHigher: type === 'PRODUCT_CHANGE',
    },
  };
}
