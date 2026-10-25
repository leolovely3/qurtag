/**
 * Unit tests of the payment code with stand-ins for the database, Stripe and RevenueCat:
 * the Stripe signature check, what each provider's events mean, the plan catalog, and the
 * routes' answers with the settings present and missing. The real database and the webhooks
 * together are scripts/qurtag/membership.test.mjs (npm run test:e2e).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dollars, productByAppleId, PRODUCTS, yearlySavingPercent, PLAN_INFO } from '../../../server/billing/catalog.ts';
import { actionForRevenueCatEvent, sentSecret } from '../../../server/billing/revenuecat.ts';
import { actionForStripeEvent, signStripePayload, verifyStripeSignature } from '../../../server/billing/stripe.ts';
// The routes read their per-minute limits when loaded; these tests make more calls than a person would.
process.env.QURTAG_BILLING_RATE_PER_ACCOUNT = '1000';
process.env.QURTAG_BILLING_RATE_PER_IP = '1000';
const { createBillingRoutes } = await import('../../../server/routes/billing.ts');

const USER = '11111111-2222-4333-8444-555555555555';
const SESSION = '66666666-7777-4888-9999-000000000000';
const SECRET = 'whsec_unit';
const PRICES = {
  STRIPE_PRICE_PLUS_MONTHLY: 'price_pm',
  STRIPE_PRICE_PLUS_YEARLY: 'price_py',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_fm',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_fy',
};
const FULL = { QURTAG_AUTH_URL: 'https://www.qurtag.com', STRIPE_SECRET_KEY: 'sk_test_unit', STRIPE_WEBHOOK_SECRET: SECRET, REVENUECAT_WEBHOOK_AUTH: 'rc_secret', ...PRICES } as NodeJS.ProcessEnv;
const EMPTY = { QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv;

// ------------------------------------------------------------------ the catalog

test('the prices are the founder\'s', () => {
  const by = (id: string) => PRODUCTS.find((p) => p.appleId === id)!.cents;
  assert.equal(by('app.impactconsultingai.qurtag.plus.monthly'), 299);
  assert.equal(by('app.impactconsultingai.qurtag.plus.yearly'), 1900);
  assert.equal(by('app.impactconsultingai.qurtag.family.monthly'), 499);
  assert.equal(by('app.impactconsultingai.qurtag.family.yearly'), 3900);
  assert.equal(dollars(299), '$2.99');
  assert.equal(dollars(1900), '$19.00');
  assert.equal(PRODUCTS.length, 4);
  assert.equal(new Set(PRODUCTS.map((p) => p.stripeEnv)).size, 4);
  assert.equal(productByAppleId('app.impactconsultingai.qurtag.family.yearly')?.plan, 'family');
  assert.equal(productByAppleId('something.else'), undefined);
});

test('the savings quoted for paying yearly are true', () => {
  assert.equal(yearlySavingPercent('plus'), 47);
  assert.equal(yearlySavingPercent('family'), 34);
});

test('the plan descriptions make only the claims the code backs', () => {
  const all = JSON.stringify(PLAN_INFO).toLowerCase();
  for (const removed of ['translat', 'trip', 'escrow', 'reward', 'wallet', 'courier', 'insurance']) assert.ok(!all.includes(removed), removed);
  assert.ok(!all.includes('—'), 'no em dash');
});

// ------------------------------------------------------------------ Stripe's signature

test('a Stripe signature verifies only for the right payload, secret and time', () => {
  const body = '{"id":"evt_1"}';
  const header = signStripePayload(body, SECRET);
  assert.equal(verifyStripeSignature(body, header, SECRET), true);
  assert.equal(verifyStripeSignature(body + ' ', header, SECRET), false);
  assert.equal(verifyStripeSignature(body, header, 'whsec_other'), false);
  assert.equal(verifyStripeSignature(body, null, SECRET), false);
  assert.equal(verifyStripeSignature(body, header, ''), false);
  assert.equal(verifyStripeSignature(body, 't=abc,v1=00', SECRET), false);
  assert.equal(verifyStripeSignature(body, header, SECRET, Date.now() + 6 * 60_000), false);
  assert.equal(verifyStripeSignature(body, header, SECRET, Date.now() - 6 * 60_000), false);
  assert.equal(verifyStripeSignature(body, header.replace(/v1=(.)/, (_m, c: string) => `v1=${c === '0' ? '1' : '0'}`), SECRET), false);
  // Several v1 values (a secret being rotated): any match is enough.
  assert.equal(verifyStripeSignature(body, `${header},v1=${'0'.repeat(64)}`, SECRET), true);
});

// ------------------------------------------------------------------ Stripe's events

function subEvent(over: Record<string, unknown> = {}, type = 'customer.subscription.updated', itemOver: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type,
    created: 1_800_000_000,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { app: 'qurtag', user_id: USER },
        items: { data: [{ price: { id: 'price_fm' }, current_period_end: 1_800_086_400, ...itemOver }] },
        ...over,
      },
    },
  };
}

test('Stripe: subscription statuses become the plan states', () => {
  const apply = (ev: unknown) => {
    const a = actionForStripeEvent(FULL, ev);
    assert.equal(a.kind, 'apply');
    return a.kind === 'apply' ? a.apply : null!;
  };
  const active = apply(subEvent());
  assert.equal(active.plan, 'family');
  assert.equal(active.interval, 'month');
  assert.equal(active.status, 'active');
  assert.equal(active.userId, USER);
  assert.equal(active.customer, 'cus_1');
  assert.equal(active.periodEnd.getTime(), 1_800_086_400_000);
  assert.equal(apply(subEvent({ cancel_at_period_end: true })).status, 'canceling');
  assert.equal(apply(subEvent({ status: 'trialing' })).status, 'active');
  assert.equal(apply(subEvent({ status: 'past_due' })).status, 'billing_issue');
  assert.equal(apply(subEvent({ status: 'unpaid' })).status, 'expired');
  assert.equal(apply(subEvent({ status: 'canceled' })).status, 'expired');
  assert.equal(apply(subEvent({}, 'customer.subscription.deleted')).status, 'expired');
  assert.equal(apply(subEvent({ items: { data: [{ price: { id: 'price_py' }, current_period_end: 1_800_086_400 }] } })).plan, 'plus');
  assert.equal(apply(subEvent({ items: { data: [{ price: { id: 'price_py' }, current_period_end: 1_800_086_400 }] } })).interval, 'year');
});

test('Stripe: the period end is read from the item or from the subscription', () => {
  const a = actionForStripeEvent(FULL, subEvent({ current_period_end: 1_800_000_500, items: { data: [{ price: { id: 'price_pm' } }] } }));
  assert.equal(a.kind === 'apply' && a.apply.periodEnd.getTime(), 1_800_000_500_000);
  assert.throws(() => actionForStripeEvent(FULL, subEvent({ items: { data: [{ price: { id: 'price_pm' } }] } })), /period end/);
});

test('Stripe: what is not ours is ignored, and what is ours but unreadable throws', () => {
  assert.equal(actionForStripeEvent(FULL, subEvent({ metadata: {} })).kind, 'ignore');
  assert.equal(actionForStripeEvent(FULL, subEvent({ status: 'incomplete' })).kind, 'ignore');
  assert.equal(actionForStripeEvent(FULL, { id: 'e', type: 'invoice.paid', data: { object: {} } }).kind, 'ignore');
  assert.equal(actionForStripeEvent(FULL, 'nonsense').kind, 'ignore');
  assert.throws(() => actionForStripeEvent(FULL, subEvent({ items: { data: [{ price: { id: 'price_unknown' }, current_period_end: 1 }] } })), /price/);
  assert.throws(() => actionForStripeEvent(EMPTY, subEvent()), /price/, 'with the price settings missing, a QuR Tag subscription is retried, not dropped');
});

test('Stripe: checkout.session.completed links the customer', () => {
  const ev = { id: 'e', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: USER, customer: 'cus_9', metadata: { app: 'qurtag', user_id: USER } } } };
  assert.deepEqual(actionForStripeEvent(FULL, ev), { kind: 'link', userId: USER, customer: 'cus_9' });
  const other = { ...ev, data: { object: { ...ev.data.object, metadata: {} } } };
  assert.equal(actionForStripeEvent(FULL, other).kind, 'ignore');
  const payment = { ...ev, data: { object: { ...ev.data.object, mode: 'payment' } } };
  assert.equal(actionForStripeEvent(FULL, payment).kind, 'ignore');
});

// ------------------------------------------------------------------ RevenueCat's events

function rc(over: Record<string, unknown> = {}) {
  return {
    event: {
      id: 'rc_1', type: 'INITIAL_PURCHASE', app_user_id: USER, original_app_user_id: USER, product_id: 'app.impactconsultingai.qurtag.plus.monthly',
      store: 'APP_STORE', original_transaction_id: '100', transaction_id: '100', expiration_at_ms: 1_800_086_400_000, event_timestamp_ms: 1_800_000_000_000, ...over,
    },
  };
}

test('RevenueCat: events become plan states', () => {
  const get = (over: Record<string, unknown>) => {
    const a = actionForRevenueCatEvent(rc(over));
    return a.kind === 'apply' ? a.apply : null;
  };
  assert.equal(get({})?.status, 'active');
  assert.equal(get({})?.provider, 'apple');
  assert.equal(get({})?.plan, 'plus');
  assert.equal(get({})?.interval, 'month');
  assert.equal(get({ type: 'RENEWAL' })?.status, 'active');
  assert.equal(get({ type: 'UNCANCELLATION' })?.status, 'active');
  assert.equal(get({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' })?.status, 'canceling');
  assert.equal(get({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })?.status, 'refunded');
  assert.equal(get({ type: 'BILLING_ISSUE' })?.status, 'billing_issue');
  assert.equal(get({ type: 'EXPIRATION' })?.status, 'expired');
  const change = get({ type: 'PRODUCT_CHANGE', new_product_id: 'app.impactconsultingai.qurtag.family.yearly' });
  assert.equal(change?.plan, 'family');
  assert.equal(change?.keepHigher, true);
  assert.equal(get({ type: 'RENEWAL' })?.keepHigher, false);
  assert.equal(get({ app_user_id: 'x', original_app_user_id: 'y', aliases: ['z', USER] })?.userId, USER);
});

test('RevenueCat: what is not ours is ignored', () => {
  for (const over of [
    { type: 'TEST' }, { type: 'TRANSFER' }, { type: 'NON_RENEWING_PURCHASE' }, { store: 'PLAY_STORE' },
    { product_id: 'com.other.app' }, { app_user_id: '$RCAnonymousID:1', original_app_user_id: '$RCAnonymousID:1', aliases: [] },
  ]) assert.equal(actionForRevenueCatEvent(rc(over)).kind, 'ignore', JSON.stringify(over));
  assert.equal(actionForRevenueCatEvent(null).kind, 'ignore');
  assert.throws(() => actionForRevenueCatEvent(rc({ expiration_at_ms: null })), /expiration/);
});

test('RevenueCat: the shared secret is compared without the Bearer prefix', () => {
  assert.equal(sentSecret('Bearer abc'), 'abc');
  assert.equal(sentSecret('abc'), 'abc');
  assert.equal(sentSecret(null), null);
});

// ------------------------------------------------------------------ the routes

type Call = { text: string; values: unknown[] };
function harness(env: NodeJS.ProcessEnv, answer: (c: Call) => Record<string, unknown>[] = () => []) {
  const calls: Call[] = [];
  const fetched: { url: string; body: URLSearchParams; headers: Record<string, string> }[] = [];
  const routes = createBillingRoutes({
    env,
    query: async (text, values) => {
      calls.push({ text, values });
      return { rows: answer({ text, values }) };
    },
    fetch: (async (url: string, init: { body: URLSearchParams; headers: Record<string, string> }) => {
      fetched.push({ url, body: init.body, headers: init.headers });
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
    }) as unknown as typeof fetch,
    checkPass: async (token) =>
      token === 'good' ? { ok: true, claims: { sub: USER, sid: SESSION, role: 'qurtag_user', app: 'qurtag', aud: 'qurtag', exp: 9e9 } } : { ok: false, reason: 'bad' },
  });
  return { routes, calls, fetched };
}

let ip = 0;
const call = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://www.qurtag.com/api/fn/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.2.0.${++ip}`, ...headers },
    body: JSON.stringify(body),
  });
const account = (over: Record<string, unknown> = {}) => ({ user_id: USER, email: 'me@example.com', name: 'Me', household_id: 'h', stripe_customer_id: null, live_providers: [], live_stripe_customer: null, ...over });
const signedIn = { authorization: 'Bearer good' };

test('config: with no settings no plan can be bought; with them all four can', async () => {
  const none = await harness(EMPTY).routes.config(call('billing-config', {}));
  const a = (await none.json()) as { available: Record<string, boolean> };
  assert.deepEqual(Object.values(a.available), [false, false, false, false]);
  const some = await harness({ ...EMPTY, STRIPE_SECRET_KEY: 'sk', STRIPE_PRICE_PLUS_MONTHLY: 'p' } as NodeJS.ProcessEnv).routes.config(call('billing-config', {}));
  assert.deepEqual(((await some.json()) as { available: Record<string, boolean> }).available, { plus_month: true, plus_year: false, family_month: false, family_year: false });
  const all = await harness(FULL).routes.config(call('billing-config', {}));
  assert.deepEqual(Object.values(((await all.json()) as { available: Record<string, boolean> }).available), [true, true, true, true]);
  assert.ok(!JSON.stringify(await harness(FULL).routes.config(call('billing-config', {})).then((r) => r.text())).includes('price_'));
});

test('checkout: needs a signed-in person, a real plan, and the settings', async () => {
  const h = harness(FULL, () => [{ a: account() }]);
  assert.equal((await h.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }))).status, 401);
  assert.equal((await h.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, { authorization: 'Bearer forged' }))).status, 401);
  assert.equal((await h.routes.checkout(call('billing-checkout', { plan: 'gold', interval: 'month' }, signedIn))).status, 400);
  assert.equal((await h.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'week' }, signedIn))).status, 400);
  assert.equal((await h.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, { ...signedIn, origin: 'https://evil.example' }))).status, 403);
  assert.equal(h.fetched.length, 0);
  const closed = harness(EMPTY, () => [{ a: account() }]);
  const r = await closed.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, signedIn));
  assert.equal(r.status, 503);
  assert.equal(closed.fetched.length, 0, 'with no settings nothing is sent to Stripe');
});

test('checkout: asks Stripe for the right price and marks the subscription as this account\'s', async () => {
  const h = harness(FULL, () => [{ a: account() }]);
  const r = await h.routes.checkout(call('billing-checkout', { plan: 'family', interval: 'year' }, signedIn));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  const sent = h.fetched[0];
  assert.equal(sent.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(sent.headers.authorization, 'Bearer sk_test_unit');
  assert.equal(sent.body.get('mode'), 'subscription');
  assert.equal(sent.body.get('line_items[0][price]'), 'price_fy');
  assert.equal(sent.body.get('client_reference_id'), USER);
  assert.equal(sent.body.get('subscription_data[metadata][user_id]'), USER);
  assert.equal(sent.body.get('subscription_data[metadata][app]'), 'qurtag');
  assert.equal(sent.body.get('customer_email'), 'me@example.com');
  assert.equal(sent.body.get('success_url'), 'https://www.qurtag.com/app/membership?checkout=success');
  // A known customer is reused, not asked for again.
  const again = harness(FULL, () => [{ a: account({ stripe_customer_id: 'cus_7' }) }]);
  await again.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, signedIn));
  assert.equal(again.fetched[0].body.get('customer'), 'cus_7');
  assert.equal(again.fetched[0].body.get('customer_email'), null);
});

test('checkout: refuses to start a second membership', async () => {
  const apple = harness(FULL, () => [{ a: account({ live_providers: ['apple'] }) }]);
  const a = await apple.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, signedIn));
  assert.equal(a.status, 409);
  assert.equal(((await a.json()) as { error: string }).error, 'managed_on_iphone');
  const stripe = harness(FULL, () => [{ a: account({ live_providers: ['stripe'] }) }]);
  const s = await stripe.routes.checkout(call('billing-checkout', { plan: 'plus', interval: 'month' }, signedIn));
  assert.equal(((await s.json()) as { error: string }).error, 'use_portal');
  assert.equal(apple.fetched.length + stripe.fetched.length, 0);
});

test('portal: opens only for someone with a Stripe customer', async () => {
  const none = harness(FULL, () => [{ a: account() }]);
  assert.equal((await none.routes.portal(call('billing-portal', {}, signedIn))).status, 404);
  const has = harness(FULL, () => [{ a: account({ stripe_customer_id: 'cus_5' }) }]);
  assert.equal((await has.routes.portal(call('billing-portal', {}, signedIn))).status, 200);
  assert.equal(has.fetched[0].url, 'https://api.stripe.com/v1/billing_portal/sessions');
  assert.equal(has.fetched[0].body.get('customer'), 'cus_5');
  assert.equal(has.fetched[0].body.get('return_url'), 'https://www.qurtag.com/app/membership');
  const gone = harness(FULL, () => [{ a: null }]);
  assert.equal((await gone.routes.portal(call('billing-portal', {}, signedIn))).status, 401, 'a session the database no longer knows is refused');
});

test('webhooks: with their settings missing they answer 503 and touch nothing', async () => {
  const h = harness(EMPTY);
  assert.equal((await h.routes.stripeWebhook(call('stripe-webhook', {}))).status, 503);
  assert.equal((await h.routes.revenueCatWebhook(call('revenuecat-webhook', {}, { authorization: 'x' }))).status, 503);
  assert.equal(h.calls.length, 0);
});

test('webhooks: a forged request never reaches the database', async () => {
  const h = harness(FULL);
  const body = JSON.stringify(subEvent());
  const unsigned = new Request('https://www.qurtag.com/api/fn/stripe-webhook', { method: 'POST', body });
  assert.equal((await h.routes.stripeWebhook(unsigned)).status, 400);
  const wrong = new Request('https://www.qurtag.com/api/fn/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': signStripePayload(body, 'whsec_wrong') } });
  assert.equal((await h.routes.stripeWebhook(wrong)).status, 400);
  assert.equal((await h.routes.revenueCatWebhook(call('revenuecat-webhook', rc(), {}))).status, 401);
  assert.equal((await h.routes.revenueCatWebhook(call('revenuecat-webhook', rc(), { authorization: 'nope' }))).status, 401);
  assert.equal(h.calls.length, 0);
});

test('webhooks: a genuine event is written once through the database function, and a failure answers 500', async () => {
  const body = JSON.stringify(subEvent());
  const signed = () => new Request('https://www.qurtag.com/api/fn/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': signStripePayload(body, SECRET) } });
  const ok = harness(FULL, () => [{ r: 'applied' }]);
  const r = await ok.routes.stripeWebhook(signed());
  assert.equal(r.status, 200);
  assert.equal(ok.calls.length, 1);
  assert.match(ok.calls[0].text, /server_apply_subscription/);
  assert.equal(ok.calls[0].values[0], 'stripe');
  assert.equal(ok.calls[0].values[7], 'family');
  const failing = createBillingRoutes({ env: FULL, query: async () => { throw new Error('db down'); } });
  assert.equal((await failing.stripeWebhook(signed())).status, 500);
  const rcOk = harness(FULL, () => [{ r: 'applied' }]);
  const rr = await rcOk.routes.revenueCatWebhook(call('revenuecat-webhook', rc(), { authorization: 'rc_secret' }));
  assert.equal(rr.status, 200);
  assert.equal(rcOk.calls[0].values[0], 'apple');
  assert.equal(rcOk.calls[0].values[11], false);
});

test('invite: only the owner path reaches the database, and the link is answered', async () => {
  let createdWith: unknown[] = [];
  const h = harness(EMPTY, ({ text, values }) => {
    if (/server_account/.test(text)) return [{ a: account() }];
    createdWith = values;
    return [{ r: { invite_id: 'i1', expires_at: '2030-01-01T00:00:00Z', email: 'you@example.com' } }];
  });
  const bad = await h.routes.invite(call('family-invite', { email: 'nope' }, signedIn));
  assert.equal(bad.status, 400);
  const r = await h.routes.invite(call('family-invite', { email: ' You@Example.com ' }, signedIn));
  assert.equal(r.status, 200);
  const j = (await r.json()) as { link: string; emailed: boolean };
  assert.match(j.link, /^https:\/\/www\.qurtag\.com\/join\/[A-Za-z0-9_-]{43}$/);
  assert.equal(j.emailed, false);
  assert.equal(createdWith[2], 'you@example.com');
  assert.equal(createdWith[0], USER);
  assert.equal(createdWith[1], SESSION);
  assert.equal(createdWith[3], j.link.split('/join/')[1]);
});

test('invite: when email is set up it is sent to the invited address, and a failed send still answers the link', async () => {
  const sent: { to: string; text: string }[] = [];
  const mk = (fail: boolean) =>
    createBillingRoutes({
      env: { ...EMPTY, QURTAG_MAIL_MODE: 'capture' } as NodeJS.ProcessEnv,
      query: async (text) => ({ rows: /server_account/.test(text) ? [{ a: account() }] : [{ r: { invite_id: 'i', expires_at: 'x', email: 'a@b.co' } }] }),
      checkPass: async () => ({ ok: true, claims: { sub: USER, sid: SESSION, role: 'qurtag_user', app: 'qurtag', aud: 'qurtag', exp: 9e9 } }),
      sendMail: async (m) => {
        if (fail) throw new Error('mail down');
        sent.push({ to: m.to, text: m.text });
      },
    });
  const a = (await (await mk(false).invite(call('family-invite', { email: 'a@b.co' }, signedIn))).json()) as { emailed: boolean; link: string };
  assert.equal(a.emailed, true);
  assert.equal(sent[0].to, 'a@b.co');
  assert.ok(sent[0].text.includes(a.link));
  const b = (await (await mk(true).invite(call('family-invite', { email: 'a@b.co' }, signedIn))).json()) as { emailed: boolean; link: string };
  assert.equal(b.emailed, false);
  assert.ok(b.link.includes('/join/'));
});
