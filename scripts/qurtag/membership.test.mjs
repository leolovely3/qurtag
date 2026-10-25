#!/usr/bin/env node
/**
 * End-to-end test of paid memberships and the Family household, after e2e.test.mjs, on the
 * same throwaway Postgres and the same server functions (run through run-local.sh, which
 * applies db/membership.sql and db/family.sql and sets made-up payment settings):
 *
 *   - the item limit follows the plan (Free 2, Plus and Family unlimited);
 *   - the webhooks change the plan: signed Stripe fixtures and RevenueCat fixtures, forged
 *     and tampered ones refused, repeated ones changing nothing, old ones not overwriting
 *     new ones, a web and an iPhone membership together;
 *   - downgrading deletes nothing: items past the limit become read-only, can still be read
 *     and deleted, and a finder can still reach them;
 *   - the Family household: invites, accepting, sharing, leaving, removing, the 5-person
 *     limit, a lapsed plan pausing members, and one household never reaching another.
 *
 * Nothing here talks to Stripe, RevenueCat or Apple: the fixtures are made here and signed
 * with the made-up settings.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { signStripePayload } from '../../server/billing/stripe.ts';
import { Person, BASE } from './people.mjs';

const MAIL_BASE = process.env.QURTAG_TEST_MAIL_BASE;
const MAIL_FILE = process.env.QURTAG_TEST_MAIL_FILE;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const RC_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH;

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
}

const admin = new pg.Client({ connectionString: process.env.QURTAG_TEST_ADMIN_DB });
await admin.connect();
const sql = (text, values) => admin.query(text, values);
const serverDb = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_SERVER });
await serverDb.connect();

// ------------------------------------------------------------------ fixtures

let clock = Math.floor(Date.now() / 1000);
const tick = () => ++clock;
let counter = 0;
const nextId = (prefix) => `${prefix}_${Date.now()}_${++counter}`;
const inDays = (d) => Math.floor(Date.now() / 1000) + d * 86400;

function stripeEvent({ type = 'customer.subscription.updated', user, customer = 'cus_default', sub = 'sub_default', price = 'price_test_plus_month',
  status = 'active', cancel = false, end = inDays(30), id = nextId('evt'), created = tick(), app = 'qurtag', object = null }) {
  return {
    id,
    type,
    created,
    data: {
      object: object ?? {
        id: sub,
        object: 'subscription',
        customer,
        status,
        cancel_at_period_end: cancel,
        metadata: { ...(user ? { user_id: user } : {}), ...(app ? { app } : {}) },
        items: { data: [{ price: { id: price }, current_period_end: end }] },
      },
    },
  };
}

async function postStripe(event, { sign = true, secret = WEBHOOK_SECRET, mutate = (s) => s, at = Date.now() } = {}) {
  const raw = JSON.stringify(event);
  const headers = { 'content-type': 'application/json' };
  if (sign) headers['stripe-signature'] = signStripePayload(raw, secret, at);
  const r = await fetch(`${BASE}/api/fn/stripe-webhook`, { method: 'POST', headers, body: mutate(raw) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}

function rcEvent({ type = 'INITIAL_PURCHASE', user, product = 'app.impactconsultingai.qurtag.plus.yearly', orig = '1000000000001',
  exp = Date.now() + 30 * 86400_000, id = nextId('rc'), at = Date.now() + counter, extra = {} }) {
  return {
    api_version: '1.0',
    event: {
      id, type, app_user_id: user, original_app_user_id: user, aliases: [user], product_id: product, store: 'APP_STORE', environment: 'SANDBOX',
      original_transaction_id: orig, transaction_id: orig, expiration_at_ms: exp, event_timestamp_ms: at, ...extra,
    },
  };
}

async function postRc(body, auth = RC_AUTH) {
  const r = await fetch(`${BASE}/api/fn/revenuecat-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth !== null ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}

async function signUp(p, email, name) {
  await p.signUp(email, name);
  const { rows } = await sql(
    `select u.id, h.id as household from qurtag.auth_users u join qurtag.households h on h.owner_user_id = u.id where u.email = $1`,
    [email.toLowerCase()],
  );
  p.id = rows[0]?.id;
  p.household = rows[0]?.household;
  check(`${p.label}: signed up with a household`, !!p.id && !!p.household && !!p.pass);
}

const membership = async (p) => (await p.db.rpc('my_membership')).data;
const planOf = async (p) => (await membership(p))?.plan;
const itemsOf = async (p) => ((await p.db.from('items').select('id,name,household_id').order('created_at')).data ?? []);
const addItem = (p, name) => p.db.rpc('create_item', { p_name: name });
const reason = (r) => r.error?.message ?? '';

// ------------------------------------------------------------------ 1. the limit follows the plan

const ana = new Person('ana', '10.7.0.1');
await signUp(ana, 'ana@example.com', 'Ana Free');

{
  const m = await membership(ana);
  check('a new account is on Free with a limit of 2', m?.plan === 'free' && m?.item_limit === 2 && m?.can_add_items === true, JSON.stringify(m));
  const a = await addItem(ana, 'Bottle');
  const b = await addItem(ana, 'Violin');
  const c = await addItem(ana, 'Keys');
  check('Free: two items are allowed', !a.error && !b.error);
  check('Free: a third item is refused with item_limit', reason(c) === 'item_limit', JSON.stringify(c.error));
  const m2 = await membership(ana);
  check('Free: the membership says no more items can be added', m2?.can_add_items === false && m2?.items_used === 2);
}

// Forged and invalid webhooks change nothing.
{
  const ev = stripeEvent({ user: ana.id, customer: 'cus_ana', sub: 'sub_ana' });
  check('Stripe: no signature is refused', (await postStripe(ev, { sign: false })).status === 400);
  check('Stripe: a signature made with another secret is refused', (await postStripe(ev, { secret: 'whsec_not_ours' })).status === 400);
  check('Stripe: a tampered body is refused', (await postStripe(ev, { mutate: (s) => s.replace('price_test_plus_month', 'price_test_family_year') })).status === 400);
  check('Stripe: an old signature is refused', (await postStripe(ev, { at: Date.now() - 20 * 60_000 })).status === 400);
  check('Stripe: a malformed signature header is refused', (await fetch(`${BASE}/api/fn/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=zz' }, body: JSON.stringify(ev) })).status === 400);
  check('RevenueCat: no secret is refused', (await postRc(rcEvent({ user: ana.id }), null)).status === 401);
  check('RevenueCat: a wrong secret is refused', (await postRc(rcEvent({ user: ana.id }), 'wrong')).status === 401);
  check('nothing changed after the refused webhooks', (await planOf(ana)) === 'free' && (await sql('select count(*)::int as n from qurtag.subscriptions')).rows[0].n === 0);
  const get = await fetch(`${BASE}/api/fn/stripe-webhook`);
  check('Stripe: GET is not allowed', get.status === 405);
}

// A web membership through Stripe: link the customer, then the subscription events.
{
  const link = await postStripe({
    id: nextId('evt'), type: 'checkout.session.completed', created: tick(),
    data: { object: { id: 'cs_1', mode: 'subscription', client_reference_id: ana.id, customer: 'cus_ana', subscription: 'sub_ana', metadata: { user_id: ana.id, app: 'qurtag' } } },
  });
  check('Stripe: checkout.session.completed links the customer', link.status === 200 && link.json?.result === 'linked', JSON.stringify(link));
  const linked = await sql('select stripe_customer_id from qurtag.billing_customers where user_id = $1', [ana.id]);
  check('the customer link is stored', linked.rows[0]?.stripe_customer_id === 'cus_ana');

  const created = stripeEvent({ type: 'customer.subscription.created', user: ana.id, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_plus_month' });
  const r1 = await postStripe(created);
  check('Stripe: subscription.created makes the account Plus', r1.status === 200 && r1.json?.result === 'applied' && (await planOf(ana)) === 'plus', JSON.stringify(r1));
  const row = (await sql('select plan, billing_interval, status, provider from qurtag.subscriptions where external_id = $1', ['sub_ana'])).rows[0];
  check('the subscription row has plan, interval, status and provider', row?.plan === 'plus' && row?.billing_interval === 'month' && row?.status === 'active' && row?.provider === 'stripe', JSON.stringify(row));
  check('households.plan_tier mirrors the plan', (await sql('select plan_tier from qurtag.households where id = $1', [ana.household])).rows[0].plan_tier === 'plus');

  const before = (await sql('select updated_at from qurtag.subscriptions where external_id = $1', ['sub_ana'])).rows[0].updated_at;
  const again = await postStripe(created);
  check('Stripe: the same delivery twice changes nothing', again.json?.result === 'duplicate' && (await sql('select updated_at from qurtag.subscriptions where external_id = $1', ['sub_ana'])).rows[0].updated_at.getTime() === before.getTime(), JSON.stringify(again));

  const c = await addItem(ana, 'Keys');
  const d = await addItem(ana, 'Backpack');
  check('Plus: unlimited items (a third and a fourth)', !c.error && !d.error, JSON.stringify(c.error ?? d.error));
  const m = await membership(ana);
  check('Plus: the membership says no limit, renewing, monthly, from Stripe', m?.item_limit === null && m?.renews === true && m?.provider === 'stripe' && m?.billing_interval === 'month', JSON.stringify(m));

  const cancel = await postStripe(stripeEvent({ user: ana.id, customer: 'cus_ana', sub: 'sub_ana', cancel: true }));
  const m2 = await membership(ana);
  check('Stripe: auto-renew off keeps Plus until the period ends', cancel.json?.result === 'applied' && m2?.plan === 'plus' && m2?.status === 'canceling' && m2?.renews === false, JSON.stringify(m2));

  const stale = await postStripe(stripeEvent({ user: ana.id, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_family_year', created: clock - 500 }));
  check('Stripe: an older event never overwrites a newer one', stale.json?.result === 'stale' && (await planOf(ana)) === 'plus', JSON.stringify(stale));

  const up = await postStripe(stripeEvent({ user: ana.id, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_family_year' }));
  const m3 = await membership(ana);
  check('Stripe: switching to the Family price makes the account Family, yearly', up.json?.result === 'applied' && m3?.plan === 'family' && m3?.billing_interval === 'year' && m3?.renews === true, JSON.stringify(m3));

  const pastDue = await postStripe(stripeEvent({ user: ana.id, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_family_year', status: 'past_due' }));
  check('Stripe: a failed payment keeps the plan while Stripe retries', pastDue.json?.result === 'applied' && (await planOf(ana)) === 'family' && (await membership(ana))?.status === 'billing_issue');

  const gone = await postStripe(stripeEvent({ type: 'customer.subscription.deleted', user: ana.id, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_family_year', status: 'canceled' }));
  check('Stripe: subscription.deleted returns the account to Free', gone.json?.result === 'applied' && (await planOf(ana)) === 'free' && (await sql('select plan_tier from qurtag.households where id = $1', [ana.household])).rows[0].plan_tier === 'free');

  const notOurs = await postStripe(stripeEvent({ user: ana.id, sub: 'sub_other_app', app: null }));
  check('Stripe: a subscription that is not marked as QuR Tag is ignored', notOurs.status === 200 && /^ignored/.test(notOurs.json?.result) && (await sql(`select count(*)::int as n from qurtag.subscriptions where external_id = 'sub_other_app'`)).rows[0].n === 0);
  const unknownPrice = await postStripe(stripeEvent({ user: ana.id, sub: 'sub_x', price: 'price_nobody_knows' }));
  check('Stripe: a QuR Tag subscription with an unknown price answers 500 so Stripe retries', unknownPrice.status === 500);
  const ghost = await postStripe(stripeEvent({ user: crypto.randomUUID(), sub: 'sub_ghost' }));
  check('Stripe: an event for an account that does not exist is acknowledged and recorded nowhere', ghost.status === 200 && ghost.json?.result === 'unknown_user' && (await sql(`select count(*)::int as n from qurtag.subscriptions where external_id = 'sub_ghost'`)).rows[0].n === 0, JSON.stringify(ghost));
  const noUserOnEvent = await postStripe(stripeEvent({ user: null, customer: 'cus_ana', sub: 'sub_ana', price: 'price_test_plus_year' }));
  check('Stripe: an event with no account id finds the account by its linked customer', noUserOnEvent.json?.result === 'applied' && (await planOf(ana)) === 'plus', JSON.stringify(noUserOnEvent));
}

// An iPhone membership through RevenueCat, together with a web one.
{
  const bea = new Person('bea', '10.7.0.2');
  await signUp(bea, 'bea@example.com', 'Bea Phone');
  const rcBad = await postRc(rcEvent({ user: bea.id, product: 'app.impactconsultingai.qurtag.plus.yearly' }), `Bearer ${RC_AUTH}`);
  check('RevenueCat: the secret is accepted with or without "Bearer "', rcBad.status === 200 && rcBad.json?.result === 'applied', JSON.stringify(rcBad));
  check('RevenueCat: INITIAL_PURCHASE makes the account Plus', (await planOf(bea)) === 'plus');
  const row = (await sql(`select provider, plan, billing_interval, status from qurtag.subscriptions where user_id = $1`, [bea.id])).rows[0];
  check('RevenueCat: the row is Apple, Plus, yearly, active', row?.provider === 'apple' && row?.plan === 'plus' && row?.billing_interval === 'year' && row?.status === 'active', JSON.stringify(row));

  const ev = rcEvent({ type: 'RENEWAL', user: bea.id, id: 'rc-renewal-1' });
  const r1 = await postRc(ev);
  const r2 = await postRc(ev);
  check('RevenueCat: the same delivery twice changes nothing', r1.json?.result === 'applied' && r2.json?.result === 'duplicate', `${r1.json?.result} ${r2.json?.result}`);

  const test = await postRc({ api_version: '1.0', event: { id: nextId('rc'), type: 'TEST', app_user_id: bea.id } });
  check('RevenueCat: TEST events are acknowledged and ignored', test.status === 200 && /^ignored/.test(test.json?.result));
  const other = await postRc(rcEvent({ user: bea.id, product: 'com.someone.else.pro', orig: '999' }));
  check('RevenueCat: another app\'s product is ignored', /^ignored/.test(other.json?.result ?? ''));
  const anon = await postRc(rcEvent({ user: '$RCAnonymousID:abc123', product: 'app.impactconsultingai.qurtag.plus.yearly' }));
  check('RevenueCat: an anonymous RevenueCat id is ignored', /^ignored/.test(anon.json?.result ?? ''));

  // Both at once: Stripe Family and Apple Plus. The better plan counts; neither overwrites the other.
  await postStripe(stripeEvent({ user: bea.id, customer: 'cus_bea', sub: 'sub_bea', price: 'price_test_family_month' }));
  check('web Family and iPhone Plus together give Family', (await planOf(bea)) === 'family');
  const m = await membership(bea);
  check('both subscriptions are kept', (await sql('select count(*)::int as n from qurtag.subscriptions where user_id = $1', [bea.id])).rows[0].n === 2 && m?.provider === 'stripe');
  await postStripe(stripeEvent({ type: 'customer.subscription.deleted', user: bea.id, customer: 'cus_bea', sub: 'sub_bea', price: 'price_test_family_month', status: 'canceled' }));
  check('when the web one ends the iPhone one still counts', (await planOf(bea)) === 'plus');

  const down = await postRc(rcEvent({ type: 'PRODUCT_CHANGE', user: bea.id, product: 'app.impactconsultingai.qurtag.plus.yearly', extra: { new_product_id: 'app.impactconsultingai.qurtag.family.yearly' } }));
  check('RevenueCat: PRODUCT_CHANGE to Family makes the account Family', down.json?.result === 'applied' && (await planOf(bea)) === 'family', JSON.stringify(down));
  const lower = await postRc(rcEvent({ type: 'PRODUCT_CHANGE', user: bea.id, extra: { new_product_id: 'app.impactconsultingai.qurtag.plus.monthly' } }));
  check('RevenueCat: a PRODUCT_CHANGE down to Plus does not lower the plan before the renewal', lower.json?.result === 'applied' && (await planOf(bea)) === 'family');
  const renewDown = await postRc(rcEvent({ type: 'RENEWAL', user: bea.id, product: 'app.impactconsultingai.qurtag.plus.monthly' }));
  check('RevenueCat: the RENEWAL at the lower product makes it Plus', renewDown.json?.result === 'applied' && (await planOf(bea)) === 'plus');

  const cancel = await postRc(rcEvent({ type: 'CANCELLATION', user: bea.id, product: 'app.impactconsultingai.qurtag.plus.monthly', extra: { cancel_reason: 'UNSUBSCRIBE' } }));
  const mc = await membership(bea);
  check('RevenueCat: CANCELLATION keeps the plan until it expires', cancel.json?.result === 'applied' && mc?.plan === 'plus' && mc?.status === 'canceling' && mc?.renews === false, JSON.stringify(mc));
  const billing = await postRc(rcEvent({ type: 'BILLING_ISSUE', user: bea.id, product: 'app.impactconsultingai.qurtag.plus.monthly' }));
  check('RevenueCat: BILLING_ISSUE keeps the plan', billing.json?.result === 'applied' && (await membership(bea))?.status === 'billing_issue' && (await planOf(bea)) === 'plus');
  const expire = await postRc(rcEvent({ type: 'EXPIRATION', user: bea.id, product: 'app.impactconsultingai.qurtag.plus.monthly', exp: Date.now() - 1000 }));
  check('RevenueCat: EXPIRATION returns the account to Free', expire.json?.result === 'applied' && (await planOf(bea)) === 'free');
  const refund = await postRc(rcEvent({ type: 'INITIAL_PURCHASE', user: bea.id, orig: '2000000000002', id: 'rc-buy-2' }));
  check('RevenueCat: a new purchase works again', refund.json?.result === 'applied' && (await planOf(bea)) === 'plus');
  const refunded = await postRc(rcEvent({ type: 'CANCELLATION', user: bea.id, orig: '2000000000002', extra: { cancel_reason: 'CUSTOMER_SUPPORT' } }));
  check('RevenueCat: a refund ends the plan at once', refunded.json?.result === 'applied' && (await planOf(bea)) === 'free');
}

// The clock decides, not only the webhook: a lapsed period stops counting.
{
  const cal = new Person('cal', '10.7.0.3');
  await signUp(cal, 'cal@example.com', 'Cal Clock');
  await postRc(rcEvent({ user: cal.id, orig: '3000000000003' }));
  check('Cal is Plus', (await planOf(cal)) === 'plus');
  await sql(`update qurtag.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1`, [cal.id]);
  check('an active membership one day past its end still counts (renewal slack of 2 days)', (await planOf(cal)) === 'plus');
  await sql(`update qurtag.subscriptions set current_period_end = now() - interval '3 days' where user_id = $1`, [cal.id]);
  check('an active membership 3 days past its end no longer counts', (await planOf(cal)) === 'free');
  await sql(`update qurtag.subscriptions set status = 'canceling', current_period_end = now() - interval '1 minute' where user_id = $1`, [cal.id]);
  check('a cancelled membership ends exactly at its period end', (await planOf(cal)) === 'free');
  await sql(`update qurtag.subscriptions set status = 'canceling', current_period_end = now() + interval '1 day' where user_id = $1`, [cal.id]);
  check('a cancelled membership counts until its period end', (await planOf(cal)) === 'plus');
  const sweep = await serverDb.query(`select qurtag.server_membership_sweep() as n`);
  check('the daily sweep runs', sweep.rows[0].n === 0);
}

// ------------------------------------------------------------------ 2. downgrade: read-only, nothing deleted

{
  const dee = new Person('dee', '10.7.0.4');
  await signUp(dee, 'dee@example.com', 'Dee Downgrade');
  const sub = rcEvent({ user: dee.id, orig: '4000000000004', exp: Date.now() + 30 * 86400_000 });
  await postRc(sub);
  const made = [];
  for (const n of ['One', 'Two', 'Three', 'Four']) {
    const r = await addItem(dee, n);
    made.push(r.data);
    await sql(`update qurtag.items set created_at = now() - interval '${10 - made.length} days' where id = $1`, [r.data?.item_id]);
  }
  check('Plus holds four items', (await itemsOf(dee)).length === 4);
  check('Plus: nothing is read-only', ((await membership(dee))?.read_only_item_ids ?? []).length === 0);
  const tagOfFour = made[3].public_id;

  // A finder has already written about item Four.
  const finder = new Person('finder', '10.7.0.40');
  const sent = await finder.send(tagOfFour, null, 'I found your Four');
  check('a finder can write about an item on Plus', sent.status === 200, JSON.stringify(sent.json));

  await postRc(rcEvent({ type: 'EXPIRATION', user: dee.id, orig: '4000000000004', exp: Date.now() - 1000 }));
  check('after the downgrade the account is Free', (await planOf(dee)) === 'free');
  check('downgrading deletes nothing: all four items are still there', (await itemsOf(dee)).length === 4);
  const m = await membership(dee);
  check('the two newest items are read-only, the two oldest stay editable', JSON.stringify([...(m.read_only_item_ids ?? [])].sort()) === JSON.stringify([made[2].item_id, made[3].item_id].sort()), JSON.stringify(m.read_only_item_ids));
  check('a downgraded account cannot add an item', reason(await addItem(dee, 'Five')) === 'item_limit');

  const editOld = await dee.db.from('items').update({ name: 'One renamed' }).eq('id', made[0].item_id).select().single();
  check('an item within the limit can still be edited', !editOld.error && editOld.data?.name === 'One renamed', JSON.stringify(editOld.error));
  const editNew = await dee.db.from('items').update({ name: 'Four renamed' }).eq('id', made[3].item_id).select();
  check('a read-only item cannot be renamed', !!editNew.error && editNew.error.message === 'read_only_item', JSON.stringify(editNew.error));
  const lost = await dee.db.from('items').update({ lost_mode: true }).eq('id', made[3].item_id).select();
  check('a read-only item cannot be marked lost', !!lost.error && lost.error.message === 'read_only_item');
  const read = await dee.db.from('items').select('id,name').eq('id', made[3].item_id).single();
  check('a read-only item can still be read', !read.error && read.data?.name === 'Four');
  const replace = await dee.db.rpc('replace_tag', { p_item_id: made[3].item_id });
  check('a read-only item cannot get a new tag', !!replace.error && replace.error.message === 'read_only_item', JSON.stringify(replace.error));
  const tagId = (await sql('select id from qurtag.tags where public_id = $1', [tagOfFour])).rows[0].id;
  const off = await dee.db.from('tags').update({ status: 'inactive' }).eq('id', tagId).select();
  check('a read-only item\'s tag cannot be switched off', !!off.error && off.error.message === 'read_only_item');
  check('that item\'s tag still works for a finder', (await finder.view(tagOfFour)).status === 200);
  const more = await finder.send(tagOfFour, sent.json?.token, 'Still there?');
  check('a finder can still write about a read-only item', more.status === 200);
  const thread = (await dee.db.from('threads').select('id').eq('item_id', made[3].item_id).single()).data;
  const reply = await dee.db.rpc('owner_reply', { p_thread_id: thread.id, p_body: 'Thank you, I am here' });
  check('the owner can still reply about a read-only item', !reply.error, JSON.stringify(reply.error));

  // Deleting one makes the next oldest editable again.
  const del = await dee.db.from('items').delete().eq('id', made[0].item_id);
  check('items can be deleted while read-only ones exist', !del.error);
  const m2 = await membership(dee);
  check('after deleting one, the next item becomes editable', JSON.stringify(m2.read_only_item_ids) === JSON.stringify([made[3].item_id]), JSON.stringify(m2.read_only_item_ids));
  const del2 = await dee.db.from('items').delete().eq('id', made[3].item_id);
  check('a read-only item can be deleted', !del2.error && (await itemsOf(dee)).length === 2);

  // Upgrading restores everything.
  await postRc(rcEvent({ user: dee.id, orig: '4000000000005', exp: Date.now() + 30 * 86400_000 }));
  check('after upgrading again, items can be added', !(await addItem(dee, 'Five')).error && !(await addItem(dee, 'Six')).error);
}

// Scan history: 30 days on Free, everything on Plus.
{
  const gus = new Person('gus', '10.7.0.5');
  await signUp(gus, 'gus@example.com', 'Gus Scans');
  const made = (await addItem(gus, 'Scooter')).data;
  const tagRow = (await sql('select id from qurtag.tags where public_id = $1', [made.public_id])).rows[0];
  await sql(`insert into qurtag.scans (tag_id, item_id, scanned_at) values ($1, $2, now() - interval '5 days'), ($1, $2, now() - interval '100 days'), ($1, $2, now() - interval '400 days')`, [tagRow.id, made.item_id]);
  const free = (await gus.db.from('scans').select('id').eq('item_id', made.item_id)).data ?? [];
  check('Free: only the last 30 days of scans are visible', free.length === 1, `${free.length}`);
  await postRc(rcEvent({ user: gus.id, orig: '5000000000005' }));
  const plus = (await gus.db.from('scans').select('id').eq('item_id', made.item_id)).data ?? [];
  check('Plus: the full scan history is visible', plus.length === 3, `${plus.length}`);
}

// ------------------------------------------------------------------ 3. the Family household

const fay = new Person('fay (family owner)', '10.7.1.1');
const gil = new Person('gil (member)', '10.7.1.2');
const hal = new Person('hal (another family\'s owner)', '10.7.1.3');
const ivy = new Person('ivy (outsider)', '10.7.1.4');
await signUp(fay, 'fay@example.com', 'Fay Family');
await signUp(gil, 'gil@example.com', 'Gil Member');
await signUp(hal, 'hal@example.com', 'Hal Other');
await signUp(ivy, 'ivy@example.com', 'Ivy Outsider');
const FAMILY = 'app.impactconsultingai.qurtag.family.monthly';

const fayItem = (await addItem(fay, 'Fay bike')).data;
const gilOwn = (await addItem(gil, 'Gil own scooter')).data;
const halItem = (await addItem(hal, 'Hal guitar')).data;

{
  const none = await fay.db.rpc('my_family');
  check('a Free account has no family card', none.data?.role === 'none');
  const tryInvite = await fay.post('/api/fn/family-invite', { email: 'gil@example.com' });
  check('inviting needs the Family plan', tryInvite.status === 403 && tryInvite.json?.error === 'family_required', JSON.stringify(tryInvite.json));
  await postRc(rcEvent({ user: fay.id, product: FAMILY, orig: '6000000000001' }));
  await postRc(rcEvent({ user: hal.id, product: FAMILY, orig: '6000000000002' }));
  check('Fay and Hal are on Family', (await planOf(fay)) === 'family' && (await planOf(hal)) === 'family');

  const noPass = await fetch(`${BASE}/api/fn/family-invite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'gil@example.com' }) });
  check('the invite route needs a signed-in person', noPass.status === 401);
  const bad = await fay.post('/api/fn/family-invite', { email: 'not an email' });
  check('the invite route refuses a bad email address', bad.status === 400);
  const self = await fay.post('/api/fn/family-invite', { email: 'fay@example.com' });
  check('you cannot invite yourself', self.status === 400 && self.json?.error === 'invite_self');
}

let gilLink;
{
  // Through the copy of the server that has a (fake) email sender: the link is emailed.
  const fayMail = new Person('fay', '10.7.1.1', MAIL_BASE);
  fayMail.cookie = fay.cookie;
  fayMail.pass = fay.pass;
  const inv = await fayMail.post('/api/fn/family-invite', { email: 'Gil@Example.com ' });
  check('Family owner: an invite is created and emailed', inv.status === 200 && inv.json?.emailed === true && /\/join\/[A-Za-z0-9_-]{43}$/.test(inv.json?.link ?? ''), JSON.stringify(inv.json));
  gilLink = inv.json?.link;
  const mails = fs.readFileSync(MAIL_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const mail = mails.filter((m) => m.kind === 'family-invite').pop();
  check('the invite email goes to the invited address and holds the link', mail?.to === 'gil@example.com' && mail.text.includes(gilLink), mail?.to);

  const copy = await fay.post('/api/fn/family-invite', { email: 'second.person@example.com' });
  check('without email set up the invite still answers a link to copy', copy.status === 200 && copy.json?.emailed === false && !!copy.json?.link, JSON.stringify(copy.json));
  const stored = (await sql('select token_sha256 from qurtag.household_invites')).rows.map((r) => r.token_sha256);
  check('the database keeps only a hash of each invite token', stored.every((h) => /^[0-9a-f]{64}$/.test(h)) && !stored.some((h) => gilLink.includes(h)));
}

const tokenOf = (link) => link.split('/join/')[1];

{
  const fam = (await fay.db.rpc('my_family')).data;
  check('the owner sees two pending invites and herself as the only person', fam?.role === 'owner' && fam.members.length === 1 && fam.invites.length === 2 && fam.seats_total === 5, JSON.stringify(fam));

  // Not signed in / wrong person / wrong token.
  const peek = await ivy.db.rpc('invite_preview', { p_token: tokenOf(gilLink) });
  check('an outsider can see the invite is not for them', peek.data?.valid === true && peek.data?.email_matches === false && !JSON.stringify(peek.data).includes('gil@'), JSON.stringify(peek.data));
  const wrong = await ivy.db.rpc('accept_invite', { p_token: tokenOf(gilLink) });
  check('an outsider cannot accept someone else\'s invite', reason(wrong) === 'invite_wrong_email', JSON.stringify(wrong.error));
  const junk = await ivy.db.rpc('accept_invite', { p_token: 'x'.repeat(43) });
  check('a made-up token is refused', reason(junk) === 'invite_invalid');
  const anonReq = await new Person('anon', '10.7.1.9').req('/api/data/rpc/accept_invite', { method: 'POST', body: { p_token: tokenOf(gilLink) } });
  check('accepting needs a signed-in person', anonReq.status === 401 || anonReq.status === 403);

  // Gil accepts.
  const prev = await gil.db.rpc('invite_preview', { p_token: tokenOf(gilLink) });
  check('the invited person sees the invite is for them', prev.data?.valid === true && prev.data?.email_matches === true && prev.data?.inviter === 'Fay Family', JSON.stringify(prev.data));
  const ok = await gil.db.rpc('accept_invite', { p_token: tokenOf(gilLink) });
  check('the invited person joins the family', !ok.error && ok.data?.household_id === fay.household, JSON.stringify(ok.error ?? ok.data));
  const reuse = await gil.db.rpc('accept_invite', { p_token: tokenOf(gilLink) });
  check('an invite works once', reason(reuse) === 'invite_invalid');
  check('a used invite previews as used', (await gil.db.rpc('invite_preview', { p_token: tokenOf(gilLink) })).data?.reason === 'used');
}

{
  // Sharing.
  const gilSees = (await itemsOf(gil)).map((i) => i.name).sort();
  check('the member sees the family\'s items and their own', JSON.stringify(gilSees) === JSON.stringify(['Fay bike', 'Gil own scooter']), JSON.stringify(gilSees));
  const faySees = (await itemsOf(fay)).map((i) => i.name);
  check('the owner does NOT see the member\'s own items', JSON.stringify(faySees) === JSON.stringify(['Fay bike']), JSON.stringify(faySees));

  const added = await addItem(gil, 'Family kayak');
  check('a member\'s new item goes into the family and is not limited', !added.error);
  const inFamily = (await sql('select household_id from qurtag.items where id = $1', [added.data?.item_id])).rows[0]?.household_id;
  check('the new item belongs to the family\'s household', inFamily === fay.household);
  check('the owner sees the member\'s new item', (await itemsOf(fay)).some((i) => i.name === 'Family kayak'));
  const m = await membership(gil);
  check('the member\'s membership shows the family plan, unlimited', m?.items_plan === 'family' && m?.item_limit === null && m?.household_id === fay.household, JSON.stringify(m));
  const edit = await gil.db.from('items').update({ notes: 'edited by Gil' }).eq('name', 'Fay bike').select();
  check('a member can edit the family\'s items', !edit.error && edit.data?.length === 1);

  // The shared inbox: a finder writes about Fay's bike; both read it.
  const finder = new Person('finder', '10.7.1.50');
  const sent = await finder.send(fayItem.public_id, null, 'Found your bike!');
  check('a finder writes about the family\'s bike', sent.status === 200);
  const faySeesThread = (await fay.db.from('threads').select('id').eq('item_id', fayItem.item_id)).data ?? [];
  const gilSeesThread = (await gil.db.from('threads').select('id').eq('item_id', fayItem.item_id)).data ?? [];
  check('owner and member share the inbox', faySeesThread.length === 1 && gilSeesThread.length === 1);
  const gilReply = await gil.db.rpc('owner_reply', { p_thread_id: gilSeesThread[0].id, p_body: 'Gil here, thank you!' });
  check('a member can reply', !gilReply.error);
  const finderMessage = (await sql(`select id from qurtag.messages where thread_id = $1 and sender_kind = 'finder' limit 1`, [faySeesThread[0].id])).rows[0].id;
  const notice = await serverDb.query('select owner_email from qurtag.server_finder_message_notice($1)', [finderMessage]);
  check('the finder\'s note is emailed to everyone in the family', JSON.stringify(notice.rows.map((r) => r.owner_email).sort()) === JSON.stringify(['fay@example.com', 'gil@example.com']), JSON.stringify(notice.rows));
  const faySeesCount = (await fay.db.from('messages').select('id').eq('thread_id', faySeesThread[0].id)).data?.length;
  check('the owner reads the member\'s reply', faySeesCount === 2, `${faySeesCount}`);

  const fam = (await gil.db.rpc('my_family')).data;
  check('the member sees the family card with its people, but no invites', fam?.role === 'member' && fam.members.length === 2 && fam.invites === null, JSON.stringify(fam));
}

// One household never reaches another.
{
  const everything = async (p) => {
    const out = {};
    for (const t of ['items', 'tags', 'threads', 'messages', 'scans', 'households', 'household_members']) out[t] = (await p.db.from(t).select('*')).data ?? [];
    return out;
  };
  const ivyAll = await everything(ivy);
  const ivyHouseholds = new Set(ivyAll.households.map((h) => h.id));
  check('an outsider sees only their own household', ivyHouseholds.size === 1 && ivyHouseholds.has(ivy.household) && ivyAll.items.length === 0 && ivyAll.threads.length === 0 && ivyAll.messages.length === 0);
  const halAll = await everything(hal);
  check('another Family sees nothing of this family', halAll.items.every((i) => i.household_id === hal.household) && halAll.households.length === 1 && halAll.household_members.every((m) => m.household_id === hal.household) && halAll.threads.length === 0 && halAll.messages.length === 0);
  const fayAll = await everything(fay);
  check('the family owner sees only the family\'s household', fayAll.households.length === 1 && fayAll.items.every((i) => i.household_id === fay.household) && fayAll.tags.every((t) => t.household_id === fay.household));
  const gilAll = await everything(gil);
  const gilHouseholds = new Set(gilAll.households.map((h) => h.id));
  check('the member sees exactly their own household and the family\'s', gilHouseholds.size === 2 && gilHouseholds.has(gil.household) && gilHouseholds.has(fay.household) && !gilHouseholds.has(hal.household));
  check('nobody sees Hal\'s guitar but Hal', (await itemsOf(fay)).concat(await itemsOf(gil), await itemsOf(ivy)).every((i) => i.name !== 'Hal guitar') && (await itemsOf(hal)).some((i) => i.name === 'Hal guitar'));

  const takeover = await ivy.db.from('items').update({ name: 'Mine now' }).eq('id', fayItem.item_id).select();
  check('an outsider cannot edit the family\'s item', !takeover.error && (takeover.data ?? []).length === 0);
  const steal = await ivy.db.from('items').update({ household_id: ivy.household }).eq('id', fayItem.item_id).select();
  check('an outsider cannot move an item into their household', (steal.data ?? []).length === 0);
  const memberMove = await gil.db.from('items').update({ household_id: gil.household }).eq('id', fayItem.item_id).select();
  check('a member cannot move a family item into their own household', !!memberMove.error || (memberMove.data ?? []).length === 0);
  const ivyReply = await ivy.db.rpc('owner_reply', { p_thread_id: (await fay.db.from('threads').select('id').single()).data.id, p_body: 'hi from outside' });
  check('an outsider cannot reply in the family\'s inbox', !!ivyReply.error);
  const ivyRemove = await ivy.db.rpc('remove_member', { p_user: gil.id });
  check('an outsider cannot remove a member', !!ivyRemove.error);
  const gilRemove = await gil.db.rpc('remove_member', { p_user: fay.id });
  check('a member cannot remove anyone, the owner least of all', !!gilRemove.error);
  const gilInvite = await gil.post('/api/fn/family-invite', { email: 'friend@example.com' });
  check('a member cannot invite people (only the owner of a Family plan)', gilInvite.status === 403);
  const ivyRevoke = await ivy.db.rpc('revoke_invite', { p_invite: (await sql('select id from qurtag.household_invites limit 1')).rows[0].id });
  check('an outsider cannot revoke an invite', !!ivyRevoke.error);

  // The billing tables are not reachable by any request.
  for (const t of ['subscriptions', 'billing_customers', 'billing_events', 'household_invites']) {
    const r = await fay.req(`/api/data/${t}`);
    check(`the data API does not serve ${t}`, r.status >= 400, `${r.status}`);
  }
  const apply = await fay.req('/api/data/rpc/server_apply_subscription', { method: 'POST', body: {} });
  check('an owner cannot call the webhook function', apply.status >= 400);
  const fam = await fay.req('/api/data/rpc/server_create_invite', { method: 'POST', body: { p_user: fay.id } });
  check('an owner cannot call the invite function directly', fam.status >= 400);
  const grants = await sql(`select count(*)::int as n from information_schema.role_table_grants where table_schema = 'qurtag' and table_name in ('subscriptions','billing_customers','billing_events','household_invites') and grantee like 'qurtag\\_%'`);
  check('no QuR Tag login has any right on the membership tables', grants.rows[0].n === 0, `${grants.rows[0].n}`);
  const direct = await serverDb.query('select 1 from qurtag.subscriptions limit 1').then(() => 'allowed', () => 'denied');
  check('the server login cannot read the subscriptions table either', direct === 'denied');
}

// Joining rules.
{
  const hasFamily = await hal.db.rpc('accept_invite', { p_token: 'y'.repeat(43) });
  check('a bad token still fails for a Family owner', reason(hasFamily) === 'invite_invalid');
  // Invite Hal to Fay's family while Hal owns a Family with nobody in it: allowed (owner has no members).
  // Gil is already in Fay's family; a second invite to Gil from Hal must be refused at accept time.
  const toGil = await hal.post('/api/fn/family-invite', { email: 'gil@example.com' });
  check('Hal can invite Gil too', toGil.status === 200);
  const refused = await gil.db.rpc('accept_invite', { p_token: tokenOf(toGil.json.link) });
  check('a person can be in only one family', reason(refused) === 'already_in_family', JSON.stringify(refused.error));
  const halToIvy = await hal.post('/api/fn/family-invite', { email: 'ivy@example.com' });
  const ivyJoin = await ivy.db.rpc('accept_invite', { p_token: tokenOf(halToIvy.json.link) });
  check('Ivy joins Hal\'s family', !ivyJoin.error);
  const fayToHal = await fay.post('/api/fn/family-invite', { email: 'hal@example.com' });
  const halJoin = await hal.db.rpc('accept_invite', { p_token: tokenOf(fayToHal.json.link) });
  check('an owner whose family has members cannot join another family', reason(halJoin) === 'owner_has_family', JSON.stringify(halJoin.error));
  // Revoke and expiry.
  const toRevoke = await fay.post('/api/fn/family-invite', { email: 'revokee@example.com' });
  const rid = toRevoke.json.invite_id;
  check('the owner can revoke an invite', !(await fay.db.rpc('revoke_invite', { p_invite: rid })).error);
  check('a revoked invite previews as revoked', (await ivy.db.rpc('invite_preview', { p_token: tokenOf(toRevoke.json.link) })).data?.reason === 'revoked');
  const toExpire = await fay.post('/api/fn/family-invite', { email: 'late@example.com' });
  await sql(`update qurtag.household_invites set expires_at = now() - interval '1 minute' where id = $1`, [toExpire.json.invite_id]);
  check('an expired invite previews as expired', (await ivy.db.rpc('invite_preview', { p_token: tokenOf(toExpire.json.link) })).data?.reason === 'expired');
}

// Five people at most.
{
  // Fay: herself + Gil. Add three more members: five people in all.
  const extra = [];
  for (let i = 1; i <= 3; i++) {
    const p = new Person(`member${i}`, `10.7.2.${i}`);
    await signUp(p, `member${i}@example.com`, `Member ${i}`);
    extra.push(p);
  }
  // Pending invites hold seats: clear the spare ones so only these count.
  await sql(`update qurtag.household_invites set revoked_at = now() where household_id = $1 and accepted_at is null`, [fay.household]);
  for (const p of extra) {
    const inv = await fay.post('/api/fn/family-invite', { email: p.email });
    check(`Fay invites ${p.email}`, inv.status === 200, JSON.stringify(inv.json));
    const acc = await p.db.rpc('accept_invite', { p_token: tokenOf(inv.json.link) });
    check(`${p.email} joins`, !acc.error, JSON.stringify(acc.error));
  }
  const fam = (await fay.db.rpc('my_family')).data;
  check('the family has five people', fam?.members.length === 5, `${fam?.members.length}`);
  const sixth = await fay.post('/api/fn/family-invite', { email: 'sixth@example.com' });
  check('a sixth person cannot be invited', sixth.status === 409 && sixth.json?.error === 'family_full', JSON.stringify(sixth.json));

  // Pending invites hold a seat: remove one member, invite two people, the second is refused.
  const removed = await fay.db.rpc('remove_member', { p_user: extra[2].id });
  check('the owner removes a member', !removed.error);
  check('a removed member no longer sees the family\'s items', !(await itemsOf(extra[2])).some((i) => i.household_id === fay.household));
  check('a removed member keeps their own account and household', (await itemsOf(extra[2])).length === 0 && !!(await membership(extra[2]))?.household_id);
  const a = await fay.post('/api/fn/family-invite', { email: 'seat.holder@example.com' });
  const b = await fay.post('/api/fn/family-invite', { email: 'no.seat@example.com' });
  check('a pending invite holds a seat', a.status === 200 && b.status === 409, `${a.status} ${b.status}`);
  await fay.db.rpc('revoke_invite', { p_invite: a.json.invite_id });

  // Leaving.
  const leaver = extra[1];
  const kayak = (await addItem(leaver, 'Leaver\'s paddle')).data;
  const left = await leaver.db.rpc('leave_household');
  check('a member can leave', !left.error);
  check('a member who left no longer sees the family\'s items', !(await itemsOf(leaver)).some((i) => i.household_id === fay.household));
  check('items a member added to the family stay with the family', (await itemsOf(fay)).some((i) => i.id === kayak.item_id));
  check('leaving twice answers not_a_member', reason(await leaver.db.rpc('leave_household')) === 'not_a_member');
  const ownerLeave = await fay.db.rpc('leave_household');
  check('the owner cannot "leave" their own household', !!ownerLeave.error);
  const ownerLeft = await fay.db.rpc('remove_member', { p_user: fay.id });
  check('the owner cannot remove themselves', !!ownerLeft.error);
}

// The plan lapses: members pause, nothing is deleted; it returns, they return.
{
  const members = (await sql(`select count(*)::int as n from qurtag.household_members where household_id = $1 and role = 'member'`, [fay.household])).rows[0].n;
  const itemsBefore = (await sql(`select count(*)::int as n from qurtag.items where household_id = $1`, [fay.household])).rows[0].n;
  await postRc(rcEvent({ type: 'EXPIRATION', user: fay.id, product: FAMILY, orig: '6000000000001', exp: Date.now() - 1000 }));
  check('Fay is on Free after her plan ends', (await planOf(fay)) === 'free');
  check('nothing was deleted: members and items are all still recorded', (await sql(`select count(*)::int as n from qurtag.household_members where household_id = $1 and role = 'member'`, [fay.household])).rows[0].n === members && (await sql(`select count(*)::int as n from qurtag.items where household_id = $1`, [fay.household])).rows[0].n === itemsBefore);
  check('members lose access to the family\'s items while it is paused', !(await itemsOf(gil)).some((i) => i.household_id === fay.household));
  check('the member keeps their own household', (await itemsOf(gil)).some((i) => i.name === 'Gil own scooter'));
  const fam = (await gil.db.rpc('my_family')).data;
  check('the member is told the family is paused', fam?.role === 'member' && fam.active === false, JSON.stringify(fam));
  const fm = await membership(fay);
  check('the owner\'s family items are read-only past 2, oldest first', (fm?.read_only_item_ids ?? []).length === itemsBefore - 2, JSON.stringify(fm?.read_only_item_ids));
  const noInvite = await fay.post('/api/fn/family-invite', { email: 'again@example.com' });
  check('a lapsed owner cannot invite', noInvite.status === 403);
  const gilNew = await addItem(gil, 'Gil after pause');
  check('a paused member adds items to their own household under the Free limit', reason(gilNew) === 'item_limit' || !gilNew.error);

  await postRc(rcEvent({ user: fay.id, product: FAMILY, orig: '6000000000009', exp: Date.now() + 30 * 86400_000 }));
  check('Fay is on Family again', (await planOf(fay)) === 'family');
  check('members come back with the plan', (await itemsOf(gil)).some((i) => i.household_id === fay.household));
  check('the family\'s items are editable again', ((await membership(fay))?.read_only_item_ids ?? []).length === 0);
}

// Deleting an account while a membership renews.
{
  const del = await fay.db.rpc('delete_my_account');
  check('an account with a renewing membership cannot be deleted', reason(del) === 'membership_active', JSON.stringify(del.error));
  await postRc(rcEvent({ type: 'CANCELLATION', user: fay.id, product: FAMILY, orig: '6000000000009', extra: { cancel_reason: 'UNSUBSCRIBE' } }));
  const del2 = await ivy.db.rpc('delete_my_account');
  check('an account with no membership can be deleted', !del2.error);
}

// The daily sweep forgets invites that ended a month ago, and keeps recent ones.
{
  const hal2 = (await sql(`select id from qurtag.households where owner_user_id = $1`, [hal.id])).rows[0].id;
  const make = async (email, ended) => {
    const r = await sql(
      `insert into qurtag.household_invites (household_id, email, token_sha256, created_by, expires_at, revoked_at)
       values ($1, $2, encode(sha256(convert_to($3, 'UTF8')), 'hex'), $4, now() - interval '40 days', $5) returning id`,
      [hal2, email, `${email}-${crypto.randomUUID()}-padding-padding`, hal.id, ended],
    );
    return r.rows[0].id;
  };
  const old = await make('old.invite@example.com', null);
  const recent = await make('recent.invite@example.com', new Date());
  await serverDb.query('select qurtag.server_membership_sweep()');
  const left = (await sql('select id from qurtag.household_invites where id = any($1)', [[old, recent]])).rows.map((r) => r.id);
  check('the daily sweep forgets invites that ended over 30 days ago and keeps newer ones', left.length === 1 && left[0] === recent, JSON.stringify(left));
}

// ------------------------------------------------------------------ 3b. the Contact us form

{
  const supportRows = async () => (await sql('select * from qurtag.support_requests order by created_at')).rows;
  const send = (p, body) => p.post('/api/fn/support', body);
  const visitor = new Person('visitor', '10.7.8.1');
  const noMsg = await send(visitor, { topic: 'billing', message: '   ', email: 'v@example.com' });
  check('the form is refused without a message', noMsg.status === 400 && noMsg.json?.error === 'empty_message', JSON.stringify(noMsg.json));
  check('the form is refused with an unknown topic', (await send(visitor, { topic: 'sales', message: 'hi', email: 'v@example.com' })).status === 400);
  check('signed out, the form needs an email to reply to', (await send(visitor, { topic: 'billing', message: 'hi' })).status === 400);
  check('signed out, a bad email is refused', (await send(visitor, { topic: 'billing', message: 'hi', email: 'nope' })).status === 400);
  check('a message over 4000 characters is refused', (await send(visitor, { topic: 'other', message: 'x'.repeat(4001), email: 'v@example.com' })).status === 400);
  check('nothing was stored by the refused attempts', (await supportRows()).length === 0);

  const visitor2 = new Person('visitor', '10.7.8.7');
  const ok = await send(visitor2, { topic: 'billing', message: 'I was charged twice on 3 November.', email: 'Visitor@Example.com' });
  const row = (await supportRows())[0];
  check('signed out: the message is stored with the reply email', ok.status === 200 && row?.reply_email === 'visitor@example.com' && row.user_id === null && row.plan === null && row.status === 'open' && row.topic === 'billing');

  const bot = await send(new Person('bot', '10.7.8.2'), { topic: 'other', message: 'buy pills', email: 'bot@example.com', website: 'http://spam.example' });
  check('a filled honeypot looks like success and stores nothing', bot.status === 200 && (await supportRows()).length === 1);

  const asFay = await send(fay, { topic: 'billing', message: 'Question about my last charge.', email: 'someoneelse@example.com' });
  const mine = (await supportRows()).find((r) => r.user_id === fay.id);
  check('signed in: the account, household and plan are attached, and the email is the account\'s, not the form\'s', asFay.status === 200 && mine?.household_id === fay.household && mine.plan === 'family' && mine.reply_email === 'fay@example.com', JSON.stringify(mine));

  const mailed = new Person('fay', '10.7.8.3', MAIL_BASE);
  mailed.cookie = fay.cookie;
  mailed.pass = fay.pass;
  const m1 = await mailed.post('/api/fn/support', { topic: 'account', message: 'Please check my account.' });
  const mails = fs.readFileSync(MAIL_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((m) => m.kind === 'support-request');
  const last = mails.pop();
  check('with email set up, the company inbox is told, replying goes to the sender', m1.status === 200 && last?.to === 'info@impactconsulting.ai' && last.replyTo === 'fay@example.com' && last.text.includes('Please check my account.') && last.text.includes(fay.id));

  // Limits: per network address (5 an hour), and per email address across addresses (5 an hour).
  const flood = new Person('flood', '10.7.8.4');
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await send(flood, { topic: 'other', message: `m${i}`, email: `flood${i}@example.com` })).status);
  check('more than 5 messages an hour from one address are refused', JSON.stringify(codes) === JSON.stringify([200, 200, 200, 200, 200, 429]), JSON.stringify(codes));
  const byEmail = [];
  for (let i = 0; i < 6; i++) byEmail.push((await send(new Person('e', `10.7.9.${20 + i}`), { topic: 'other', message: `e${i}`, email: 'same@example.com' })).status);
  check('more than 5 messages an hour for one email address are refused', JSON.stringify(byEmail) === JSON.stringify([200, 200, 200, 200, 200, 429]), JSON.stringify(byEmail));

  // No table access, and the admin list is for admins only.
  for (const path of ['/api/data/support_requests']) check('the data API does not serve the support table', (await fay.req(path)).status >= 400);
  check('no QuR Tag login can read the support table', (await sql(`select count(*)::int as n from information_schema.role_table_grants where table_schema = 'qurtag' and table_name = 'support_requests' and grantee like 'qurtag\\_%'`)).rows[0].n === 0);
  check('the server login cannot read it either', (await serverDb.query('select 1 from qurtag.support_requests limit 1').then(() => 'allowed', () => 'denied')) === 'denied');
  const notAdmin = await fay.db.rpc('admin_support_list', { p_status: 'open' });
  check('an ordinary account cannot list support requests', !!notAdmin.error && notAdmin.error.message === 'not_authorized', JSON.stringify(notAdmin.error));
  check('an ordinary account cannot close one', !!(await fay.db.rpc('admin_support_close', { p_id: row.id })).error);
  check('a signed-out visitor cannot list them', (await visitor2.req('/api/data/rpc/admin_support_list', { method: 'POST', body: { p_status: 'open' } })).status >= 400);

  const boss = new Person('boss', '10.7.8.5');
  await signUp(boss, 'supportboss@example.com', 'Boss Admin');
  await sql('insert into qurtag.super_admins (user_id) values ($1)', [boss.id]);
  const list = await boss.db.rpc('admin_support_list', { p_status: 'open' });
  const reqs = list.data?.requests ?? [];
  check('a super admin lists the open requests, oldest first', !list.error && reqs.length === (await supportRows()).length && reqs[0].id === row.id && new Date(reqs[0].created_at) <= new Date(reqs[reqs.length - 1].created_at), JSON.stringify(list.error));
  check('the list shows the sender\'s account email and plan', reqs.some((r) => r.account_email === 'fay@example.com' && r.plan === 'family'));

  const metrics = async () => (await new Person('metrics', '10.7.8.6').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: process.env.QURTAG_TEST_FACTORY_TOKEN } })).json;
  const before = await metrics();
  check('the Factory counts carry support_open, support_30d and support_oldest_open_days', typeof before?.support_open === 'number' && before.support_open === reqs.length && before.support_30d === reqs.length && before.support_oldest_open_days === 0, JSON.stringify(before));
  await sql(`update qurtag.support_requests set created_at = now() - interval '9 days' where id = $1`, [row.id]);
  check('the oldest open request is aged in days', (await metrics()).support_oldest_open_days === 9);

  const closed = await boss.db.rpc('admin_support_close', { p_id: row.id });
  check('a super admin closes a request', !closed.error && (await supportRows()).find((r) => r.id === row.id).status === 'closed' && !!(await supportRows()).find((r) => r.id === row.id).closed_at);
  const after = await metrics();
  check('closing lowers support_open and keeps support_30d', after.support_open === before.support_open - 1 && after.support_30d === before.support_30d);
  check('closing twice is refused', reason(await boss.db.rpc('admin_support_close', { p_id: row.id })) === 'not_found');
  const closedList = await boss.db.rpc('admin_support_list', { p_status: 'closed' });
  check('closed requests are listed under closed', (closedList.data?.requests ?? []).some((r) => r.id === row.id));
  const audit = (await sql(`select action from qurtag.admin_audit where action in ('list_support_requests', 'close_support_request')`)).rows.map((r) => r.action);
  check('listing and closing are written to the admin log', audit.includes('list_support_requests') && audit.includes('close_support_request'));
}

// ------------------------------------------------------------------ 4. the config route

{
  const r = await new Person('visitor', '10.7.9.9').post('/api/fn/billing-config', {});
  check('the config route says which plans can be bought', r.status === 200 && r.json?.available?.plus_month === true && r.json?.available?.family_year === true && Object.keys(r.json.available).length === 4, JSON.stringify(r.json));
  check('the config route holds no secret', !JSON.stringify(r.json).includes('sk_') && !JSON.stringify(r.json).includes('whsec_') && !JSON.stringify(r.json).includes('price_'));
}

await admin.end();
await serverDb.end();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
