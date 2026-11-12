/**
 * The test email an owner sends to themselves (POST /api/fn/email-test): signed in only, only to
 * the account's own address (from the database, never the request), limited per account and per
 * network address, and an honest answer when email is not set up or the send fails.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mail } from '../../../server/auth/mailer.ts';
process.env.QURTAG_BILLING_RATE_PER_ACCOUNT = '1000';
process.env.QURTAG_BILLING_RATE_PER_IP = '1000';
const { createBillingRoutes, HourWindow } = await import('../../../server/routes/billing.ts');
const { fromAddress, testAlertMail } = await import('../../../server/auth/mailer.ts');

const USER = '11111111-2222-4333-8444-555555555555';
const SESSION = '66666666-7777-4888-9999-000000000000';
const ENV = { QURTAG_AUTH_URL: 'https://www.qurtag.com', RESEND_API_KEY: 're_unit' } as NodeJS.ProcessEnv;

function harness(env: NodeJS.ProcessEnv, fail = false) {
  const sent: Mail[] = [];
  const routes = createBillingRoutes({
    env,
    query: async (text) => ({ rows: text.includes('server_account') ? [{ a: { user_id: USER, email: 'owner@example.com', name: 'Dana', household_id: 'h', stripe_customer_id: null, live_providers: [], live_stripe_customer: null } }] : [] }),
    sendMail: async (m) => {
      if (fail) throw new Error('mail down');
      sent.push(m);
    },
    checkPass: async (token) =>
      token === 'good' ? { ok: true, claims: { sub: USER, sid: SESSION, role: 'qurtag_user', app: 'qurtag', aud: 'qurtag', exp: 9e9 } } : { ok: false, reason: 'bad' },
    testEmailLimits: { account: new HourWindow(3), ip: new HourWindow(10) },
  });
  return { routes, sent };
}

let n = 0;
const req = (body: unknown = {}, auth = 'Bearer good', ip = `10.9.0.${++n}`) =>
  new Request('https://www.qurtag.com/api/fn/email-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

test('signed out is refused and nothing is sent', async () => {
  const h = harness(ENV);
  assert.equal((await h.routes.emailTest(req({}, ''))).status, 401);
  assert.equal((await h.routes.emailTest(req({}, 'Bearer forged'))).status, 401);
  assert.equal(h.sent.length, 0);
});

test('it goes only to the account\'s own address, whatever the request says', async () => {
  const h = harness(ENV);
  const r = await h.routes.emailTest(req({ to: 'someone-else@example.com', email: 'x@example.com' }));
  assert.equal(r.status, 200);
  const body = (await r.json()) as { to: string; from: string };
  assert.equal(body.to, 'owner@example.com');
  assert.equal(body.from, 'no-reply@qurtag.com');
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, 'owner@example.com');
  assert.equal(h.sent[0].kind, 'test-alert');
  assert.match(h.sent[0].text, /spam/);
});

test('three an hour per account, then a plain refusal', async () => {
  const h = harness(ENV);
  for (let i = 0; i < 3; i++) assert.equal((await h.routes.emailTest(req())).status, 200);
  const r = await h.routes.emailTest(req());
  assert.equal(r.status, 429);
  assert.match(((await r.json()) as { message: string }).message, /wait an hour/);
  assert.equal(h.sent.length, 3);
});

test('ten an hour per network address', async () => {
  const limits = { account: new HourWindow(100), ip: new HourWindow(10) };
  const sent: Mail[] = [];
  const routes = createBillingRoutes({
    env: ENV,
    query: async () => ({ rows: [{ a: { user_id: USER, email: 'owner@example.com', name: 'Dana', household_id: 'h', stripe_customer_id: null, live_providers: [], live_stripe_customer: null } }] }),
    sendMail: async (m) => void sent.push(m),
    checkPass: async () => ({ ok: true, claims: { sub: USER, sid: SESSION, role: 'qurtag_user', app: 'qurtag', aud: 'qurtag', exp: 9e9 } }),
    testEmailLimits: limits,
  });
  for (let i = 0; i < 10; i++) assert.equal((await routes.emailTest(req({}, 'Bearer good', '10.9.9.9'))).status, 200);
  assert.equal((await routes.emailTest(req({}, 'Bearer good', '10.9.9.9'))).status, 429);
});

test('with email off it says so; a failed send is a 502, never a false "sent"', async () => {
  const off = harness({ QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv);
  assert.equal((await off.routes.emailTest(req())).status, 503);
  const broken = harness(ENV, true);
  assert.equal((await broken.routes.emailTest(req())).status, 502);
});

test('the sending address comes from the setting, without its display name', () => {
  assert.equal(fromAddress({} as NodeJS.ProcessEnv), 'no-reply@qurtag.com');
  assert.equal(fromAddress({ QURTAG_EMAIL_FROM: 'QuR Tag <hello@qurtag.com>' } as NodeJS.ProcessEnv), 'hello@qurtag.com');
  const m = testAlertMail('a@b.co', 'https://www.qurtag.com/app/settings#email-check');
  assert.ok(!m.text.includes('—') && !m.html.includes('—'), 'no em dash');
});
