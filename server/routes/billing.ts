/**
 * Memberships on the server: vercel.json sends /api/fn/(.*) to api/fn/index.ts, which routes
 * these names here.
 *
 *   POST /api/fn/billing-config       who may buy what right now (no sign-in): which of the
 *                                     four plans have a Stripe price set, so a page shows
 *                                     "Coming soon" instead of a button that cannot work. Also
 *                                     `email`: whether email is set up (RESEND_API_KEY), so Settings
 *                                     does not promise email alerts that cannot be sent.
 *   POST /api/fn/billing-checkout     { plan, interval? }  signed in; yearly is the only interval. Starts a Stripe Checkout
 *                                     page and answers its address.
 *   POST /api/fn/billing-portal       signed in. Opens Stripe's customer portal (change card,
 *                                     switch plan, cancel) and answers its address.
 *   POST /api/fn/family-invite        { email }  signed in, the owner of a Family plan.
 *                                     Makes an invite link, emails it when email is set up,
 *                                     and answers the link either way (to copy).
 *   POST /api/fn/support              { topic, message, email?, website? }  the Contact us form (signed in
 *                                     or not). Stored in qurtag.support_requests; emailed to the company
 *                                     inbox when email is set up.
 *   POST /api/fn/email-test           signed in. Sends a test email to the account's own address, so a
 *                                     web owner can check that alerts reach them and are not in spam.
 *                                     Only ever to the signed-in account's own address; 3 an hour per
 *                                     account and 10 an hour per network address (per instance).
 *   POST /api/fn/stripe-webhook       Stripe's events. Needs a valid Stripe signature.
 *   POST /api/fn/revenuecat-webhook   RevenueCat's events (the App Store). Needs the shared
 *                                     secret in REVENUECAT_WEBHOOK_AUTH.
 *
 * Signed in means a QuR Tag pass (server/data/passCheck.ts) whose session the database
 * confirms is still alive (qurtag.server_account). The database login is qurtag_server,
 * which has no table rights: it calls only the server_* functions of db/membership.sql and
 * db/family.sql. Every setting comes from the environment (README). With the settings
 * missing, each route answers plainly that payment is not available; nothing breaks.
 *
 * Both webhooks answer 200 for events they do not act on (so the sender stops retrying),
 * 4xx for a request that is not genuine, and 500 when the event is ours but could not be
 * written (so the sender retries). Delivery is idempotent in the database.
 */
import { siteUrl } from '../auth/origins.js';
import { familyInviteMail, fromAddress, mailConfigured, senderFromEnv, supportNoticeMail, testAlertMail, type MailSender } from '../auth/mailer.js';
import { createPassCheck, type PassResult } from '../data/passCheck.js';
import { actionForRevenueCatEvent, sentSecret } from '../billing/revenuecat.js';
import { actionForStripeEvent, createCheckoutSession, createPortalSession, stripeSettings, verifyStripeSignature, type Action, type Fetch } from '../billing/stripe.js';
import { PRODUCTS, type Interval, type PaidPlan } from '../billing/catalog.js';
import { json, sameSecret, serverPool } from './core.js';
import { clientIp, newThreadToken, originAllowed, Window, type Query } from './finder.js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_WEBHOOK_BYTES = 512 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Requests a minute per account and per network address (per function instance). */
/** The Contact us form: messages an hour per network address (the database also limits per account and per email). */
const supportLimit = { map: new Map<string, { start: number; n: number }>(), limit: Number(process.env.QURTAG_SUPPORT_RATE_PER_IP ?? 5) };
function supportOver(key: string, now = Date.now()): boolean {
  const m = supportLimit.map;
  if (m.size > 20_000) m.clear();
  const c = m.get(key);
  if (!c || now - c.start >= 3_600_000) {
    m.set(key, { start: now, n: 1 });
    return false;
  }
  c.n += 1;
  return c.n > supportLimit.limit;
}
/** A counter per key over a rolling hour, for routes a person uses a few times at most. */
export class HourWindow {
  private counts = new Map<string, { start: number; n: number }>();
  constructor(private limit: number) {}
  over(key: string, now = Date.now()): boolean {
    if (this.counts.size > 20_000) this.counts.clear();
    const c = this.counts.get(key);
    if (!c || now - c.start >= 3_600_000) {
      this.counts.set(key, { start: now, n: 1 });
      return false;
    }
    c.n += 1;
    return c.n > this.limit;
  }
}
const accountLimit = new Window(Number(process.env.QURTAG_BILLING_RATE_PER_ACCOUNT ?? 12));
const ipLimit = new Window(Number(process.env.QURTAG_BILLING_RATE_PER_IP ?? 60));

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface Account {
  user_id: string;
  email: string;
  name: string;
  household_id: string | null;
  stripe_customer_id: string | null;
  live_providers: string[];
  live_stripe_customer: string | null;
  /** The session of the pass, added by signedIn. */
  session_id: string;
}

/** The words for what the database refuses, as the Membership screen shows them. */
const REASONS: Record<string, [number, string, string]> = {
  not_authenticated: [401, 'not_authenticated', 'Please sign in again.'],
  family_required: [403, 'family_required', 'Inviting people needs the Family plan.'],
  bad_email: [400, 'bad_email', 'That does not look like an email address.'],
  invite_self: [400, 'invite_self', 'That is your own email address.'],
  already_member: [409, 'already_member', 'That person is already in your family.'],
  family_full: [409, 'family_full', 'Your family has all 5 places taken (people and invites waiting).'],
  bad_token: [400, 'bad_request', 'That request is not valid.'],
  bad_topic: [400, 'bad_topic', 'Pick what your question is about.'],
  empty_message: [400, 'empty_message', 'Write your message first.'],
  too_long: [400, 'too_long', 'Keep your message under 4000 characters.'],
  too_many: [429, 'too_many', 'You have sent several messages already. Please wait an hour, or write to info@impactconsulting.ai.'],
};

function fromDatabase(e: unknown): Response {
  const message = (e as { message?: string })?.message ?? '';
  const known = Object.prototype.hasOwnProperty.call(REASONS, message) ? REASONS[message] : null;
  if (known) return json(known[0], { error: known[1], message: known[2] });
  console.error(`qurtag billing: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
  return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
}

export interface BillingOptions {
  query?: Query;
  env?: NodeJS.ProcessEnv;
  fetch?: Fetch;
  /** Replaces the email sender (tests). */
  sendMail?: MailSender;
  /** Replaces the test email limits (tests). */
  testEmailLimits?: { account: HourWindow; ip: HourWindow };
  /** Replaces the pass check (tests that do not hold the signing keys). */
  checkPass?: (token: string) => Promise<PassResult>;
}

export function createBillingRoutes(opts: BillingOptions = {}) {
  const env = opts.env ?? process.env;
  const query: Query = opts.query ?? ((text, values) => serverPool(env).query(text, values));
  const f: Fetch = opts.fetch ?? fetch;

  let pass: ((token: string) => Promise<PassResult>) | undefined = opts.checkPass;
  function checkPass(token: string): Promise<PassResult> {
    pass ??= createPassCheck({
      jwks: env.QURTAG_PASS_JWKS || undefined,
      loadKeys: async () => (await query('select qurtag.pass_public_keys() as k', [])).rows.map((r) => r.k),
      issuer: siteUrl(env),
    });
    return pass(token);
  }

  /** The signed-in person, or the answer to send. */
  async function signedIn(request: Request): Promise<Account | Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    if (ipLimit.over(clientIp(request))) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!m) return json(401, { error: 'not_authenticated', message: 'Please sign in again.' });
    const checked = await checkPass(m[1]);
    if (!checked.ok) return json(401, { error: 'not_authenticated', message: 'Please sign in again.' });
    const { sub, sid } = checked.claims;
    if (accountLimit.over(sub)) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const { rows } = await query('select qurtag.server_account($1, $2) as a', [sub, sid]);
    const account = rows[0]?.a as Account | null | undefined;
    if (!account) return json(401, { error: 'not_authenticated', message: 'Please sign in again.' });
    return { ...account, session_id: sid };
  }

  async function config(request: Request): Promise<Response> {
    if (request.method !== 'POST' && request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const s = stripeSettings(env);
    const available: Record<string, boolean> = {};
    for (const p of PRODUCTS) available[`${p.plan}_${p.interval}`] = s.canSell(p);
    return json(200, { available, portal: !!s.secret, email: mailConfigured(env), emailFrom: fromAddress(env) });
  }

  // Test emails: per account and per network address, an hour at a time (this function instance).
  const testByAccount = opts.testEmailLimits?.account ?? new HourWindow(3);
  const testByIp = opts.testEmailLimits?.ip ?? new HourWindow(10);

  /**
   * POST /api/fn/email-test. A test email to the signed-in account's own address (from the
   * database, never from the request), so the owner can see that alerts arrive and where.
   */
  async function emailTest(request: Request): Promise<Response> {
    const account = await signedIn(request);
    if (account instanceof Response) return account;
    if (!mailConfigured(env)) return json(503, { error: 'email_off', message: 'Email is not set up yet. Notes wait in your inbox.' });
    if (testByIp.over(clientIp(request)) || testByAccount.over(account.user_id)) {
      return json(429, { error: 'too_many', message: 'We sent a few test emails already. Please wait an hour and try again.' });
    }
    try {
      const send = opts.sendMail ?? senderFromEnv(env);
      await send(testAlertMail(account.email, `${siteUrl(env)}/app/settings#email-check`));
    } catch (e) {
      console.error(`qurtag billing: test email failed (${(e as Error)?.message ?? 'unknown'})`);
      return json(502, { error: 'send_failed', message: 'The test email could not be sent. Please try again later.' });
    }
    return json(200, { ok: true, to: account.email, from: fromAddress(env) });
  }

  async function checkout(request: Request): Promise<Response> {
    const account = await signedIn(request);
    if (account instanceof Response) return account;
    const body = await readJson(request);
    const plan = str(body?.plan);
    const interval = str(body?.interval) ?? 'year';
    if ((plan !== 'plus' && plan !== 'family') || interval !== 'year') {
      return json(400, { error: 'bad_request', message: 'Pick a plan.' });
    }
    const product = PRODUCTS.find((p) => p.plan === plan && p.interval === interval)!;
    if (!stripeSettings(env).canSell(product)) {
      return json(503, { error: 'not_available', message: 'Paying on the web is not open yet. Please check back soon.' });
    }
    if (account.live_providers.includes('apple')) {
      return json(409, { error: 'managed_on_iphone', message: "You already have a membership through Apple. Change or cancel it in your iPhone's Settings, under Subscriptions." });
    }
    if (account.live_providers.includes('stripe')) {
      return json(409, { error: 'use_portal', message: 'You already have a membership. Use Manage membership to change it.' });
    }
    try {
      const url = await createCheckoutSession(env, f, {
        userId: account.user_id,
        email: account.email,
        customerId: account.stripe_customer_id,
        plan: plan as PaidPlan,
        interval: interval as Interval,
        siteUrl: siteUrl(env),
      });
      return json(200, { url });
    } catch (e) {
      console.error(`qurtag billing: checkout failed (${(e as Error)?.message ?? 'unknown'})`);
      return json(502, { error: 'provider_error', message: 'Could not open the payment page. Please try again.' });
    }
  }

  async function portal(request: Request): Promise<Response> {
    const account = await signedIn(request);
    if (account instanceof Response) return account;
    const customerId = account.stripe_customer_id ?? account.live_stripe_customer;
    if (!customerId || !stripeSettings(env).secret) {
      return json(404, { error: 'no_customer', message: 'There is no web membership to manage.' });
    }
    try {
      const url = await createPortalSession(env, f, { customerId, returnUrl: `${siteUrl(env)}/app/membership` });
      return json(200, { url });
    } catch (e) {
      console.error(`qurtag billing: portal failed (${(e as Error)?.message ?? 'unknown'})`);
      return json(502, { error: 'provider_error', message: 'Could not open the membership page. Please try again.' });
    }
  }

  async function invite(request: Request): Promise<Response> {
    const account = await signedIn(request);
    if (account instanceof Response) return account;
    const body = await readJson(request);
    const email = (str(body?.email) ?? '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL.test(email)) return json(400, { error: 'bad_email', message: REASONS.bad_email[2] });
    const token = newThreadToken();
    let created: { invite_id: string; expires_at: string; email: string };
    try {
      const { rows } = await query('select qurtag.server_create_invite($1, $2, $3, $4) as r', [account.user_id, account.session_id, email, token]);
      created = rows[0]?.r as typeof created;
    } catch (e) {
      return fromDatabase(e);
    }
    const link = `${siteUrl(env)}/join/${token}`;
    let emailed = false;
    if (mailConfigured(env)) {
      try {
        const send = opts.sendMail ?? senderFromEnv(env);
        await send(familyInviteMail(email, account.name?.trim() || 'Someone', link));
        emailed = true;
      } catch (e) {
        console.error(`qurtag billing: invite email failed (${(e as Error)?.message ?? 'unknown'})`);
      }
    }
    return json(200, { link, emailed, invite_id: created?.invite_id, expires_at: created?.expires_at, email });
  }

  /**
   * POST /api/fn/support { topic, message, email?, website? }. Signed in (a pass in
   * Authorization): the account, its plan and its email come from the database. Signed out:
   * a reply email is required. `website` is a hidden field a person never fills; a robot
   * that does gets a normal-looking answer and nothing is stored.
   */
  async function support(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    const ip = clientIp(request);
    if (supportOver(ip)) return json(429, { error: 'too_many', message: REASONS.too_many[2] });
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    if (typeof body.website === 'string' && body.website.trim() !== '') return json(200, { ok: true });
    const topic = str(body.topic);
    const message = (str(body.message) ?? '').trim();
    if (!topic || !['billing', 'account', 'finder', 'other'].includes(topic)) return json(400, { error: 'bad_topic', message: REASONS.bad_topic[2] });
    if (!message) return json(400, { error: 'empty_message', message: REASONS.empty_message[2] });
    if (message.length > 4000) return json(400, { error: 'too_long', message: REASONS.too_long[2] });
    let user: string | null = null;
    let session: string | null = null;
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
    if (m) {
      const checked = await checkPass(m[1]);
      if (checked.ok) {
        user = checked.claims.sub;
        session = checked.claims.sid;
      }
    }
    const email = (str(body.email) ?? '').trim().toLowerCase();
    if (!user && (!email || email.length > 254 || !EMAIL.test(email))) {
      return json(400, { error: 'bad_email', message: 'Enter the email address we should reply to.' });
    }
    let saved: { id: string; reply_email: string | null; plan: string | null; user_id: string | null };
    try {
      const { rows } = await query('select qurtag.server_support_create($1, $2, $3, $4, $5) as r', [user, session, user ? null : email, topic, message]);
      saved = rows[0]?.r as typeof saved;
    } catch (e) {
      return fromDatabase(e);
    }
    // The message is stored either way. With email set up, the company inbox is told too.
    if (mailConfigured(env)) {
      try {
        const send = opts.sendMail ?? senderFromEnv(env);
        await send(supportNoticeMail({ id: saved.id, topic, message, replyEmail: saved.reply_email, plan: saved.plan, userId: saved.user_id }));
      } catch (e) {
        console.error(`qurtag billing: support notice failed (${(e as Error)?.message ?? 'unknown'})`);
      }
    }
    return json(200, { ok: true });
  }

  async function run(action: Action): Promise<{ result: string }> {
    if (action.kind === 'ignore') {
      if (action.log) console.error(`qurtag billing: ignored a subscription event (${action.why})`);
      return { result: `ignored: ${action.why}` };
    }
    if (action.kind === 'link') {
      const { rows } = await query('select qurtag.server_link_stripe_customer($1, $2) as ok', [action.userId, action.customer]);
      return { result: rows[0]?.ok ? 'linked' : 'ignored: no such account' };
    }
    const a = action.apply;
    const { rows } = await query(
      'select qurtag.server_apply_subscription($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as r',
      [a.provider, a.eventId, a.eventType, a.eventAt, a.userId, a.customer, a.externalId, a.plan, a.interval, a.status, a.periodEnd, a.keepHigher],
    );
    return { result: String(rows[0]?.r ?? 'applied') };
  }

  async function readRaw(request: Request): Promise<string | null> {
    if (Number(request.headers.get('content-length') ?? '0') > MAX_WEBHOOK_BYTES) return null;
    const text = await request.text();
    return text.length > MAX_WEBHOOK_BYTES ? null : text;
  }

  async function stripeWebhook(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const s = stripeSettings(env);
    if (!s.webhookSecret) return json(503, { error: 'not_configured' });
    const raw = await readRaw(request);
    if (raw === null) return json(413, { error: 'too_large' });
    if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), s.webhookSecret)) {
      return json(400, { error: 'bad_signature' });
    }
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return json(400, { error: 'bad_request' });
    }
    try {
      const { result } = await run(actionForStripeEvent(env, event));
      return json(200, { received: true, result });
    } catch (e) {
      console.error(`qurtag billing: stripe event failed (${(e as Error)?.message ?? 'unknown'})`);
      return json(500, { error: 'could_not_process' });
    }
  }

  async function revenueCatWebhook(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const expected = env.REVENUECAT_WEBHOOK_AUTH?.trim();
    if (!expected) return json(503, { error: 'not_configured' });
    if (!sameSecret(sentSecret(request.headers.get('authorization')), sentSecret(expected) ?? undefined)) {
      return json(401, { error: 'unauthorized' });
    }
    const raw = await readRaw(request);
    if (raw === null) return json(413, { error: 'too_large' });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: 'bad_request' });
    }
    try {
      const { result } = await run(actionForRevenueCatEvent(body));
      return json(200, { received: true, result });
    } catch (e) {
      console.error(`qurtag billing: revenuecat event failed (${(e as Error)?.message ?? 'unknown'})`);
      return json(500, { error: 'could_not_process' });
    }
  }

  return { config, checkout, portal, invite, support, emailTest, stripeWebhook, revenueCatWebhook };
}
