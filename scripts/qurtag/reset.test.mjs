#!/usr/bin/env node
/**
 * Password reset, end to end (run by run-local.sh after e2e.test.mjs). Accounts are made on
 * the main server (email off, so they are confirmed at once); reset requests go to the
 * second server whose sender is a fake that appends each email to QURTAG_TEST_MAIL_FILE.
 * Checks: the same answer for known and unknown addresses, the email's content, the link,
 * the token working once, expiry, other sessions revoked, rate limits, and the "email not
 * set up" answer being identical for known and unknown addresses.
 */
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

const BASE = process.env.QURTAG_TEST_BASE;
const MAIL = process.env.QURTAG_TEST_MAIL_BASE;
const FILE = process.env.QURTAG_TEST_MAIL_FILE;
let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(name);
  console.log(`${ok ? 'ok  ' : 'FAIL'} reset: ${name}${!ok && detail ? ` (${detail})` : ''}`);
}
const admin = new pg.Client({ connectionString: process.env.QURTAG_TEST_ADMIN_DB });
await admin.connect();

const mails = () => (existsSync(FILE) ? readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const post = (base, path, body, ip, cookie) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { origin: BASE, 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const OLD = 'old password one';
const NEW = 'brand new password 2';

async function makeAccount(email, ip) {
  const r = await post(BASE, '/api/auth/sign-up/email', { email, password: OLD, name: 'Rae' }, ip);
  if (r.status !== 200) throw new Error(`sign-up ${r.status}`);
}
const signIn = (email, password, ip) => post(BASE, '/api/auth/sign-in/email', { email, password }, ip);

await makeAccount('rae@example.com', '10.7.0.1');
const s1 = await signIn('rae@example.com', OLD, '10.7.0.2');
const s2 = await signIn('rae@example.com', OLD, '10.7.0.3');
const c1 = cookieOf(s1), c2 = cookieOf(s2);
const sessionOk = async (c) => ((await (await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie: c, origin: BASE } })).text()) || 'null') !== 'null';
check('two sessions are open before the reset', (await sessionOk(c1)) && (await sessionOk(c2)));

// With email not set up (main server): the same refusal for a real and an unknown address.
const off1 = await post(BASE, '/api/auth/request-password-reset', { email: 'rae@example.com', redirectTo: '/reset-password' }, '10.7.1.1');
const off2 = await post(BASE, '/api/auth/request-password-reset', { email: 'nobody@example.com', redirectTo: '/reset-password' }, '10.7.1.2');
const off1b = await off1.text(), off2b = await off2.text();
check('email off: known and unknown addresses get the same refusal', off1.status === 503 && off2.status === 503 && off1b === off2b, `${off1.status} ${off2.status}`);
check('email off: nothing was sent', mails().length === 0);

// Email on (capture server): same response for known and unknown.
const known = await post(MAIL, '/api/auth/request-password-reset', { email: 'Rae@Example.com', redirectTo: '/reset-password' }, '10.7.2.1');
const unknown = await post(MAIL, '/api/auth/request-password-reset', { email: 'nobody@example.com', redirectTo: '/reset-password' }, '10.7.2.2');
const kb = await known.text(), ub = await unknown.text();
check('same status and body for a known and an unknown address', known.status === 200 && unknown.status === 200 && kb === ub, `${known.status} ${unknown.status}`);
const sent = mails();
check('exactly one email, to the account only, sent at once', sent.length === 1 && sent[0].to === 'rae@example.com', String(sent.length));
const m = sent[0] ?? {};
const link = (m.text ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';
check('email: brand, button, ignore line, operator footer, contact', /QuR Tag/.test(m.html) && /Reset my password/.test(m.html) && /If you didn't ask for this, ignore this email/.test(m.text) && /Impact Consulting AI LLC/.test(m.text) && /info@impactconsulting\.ai/.test(m.text));
check('email: no em dashes', !/—/.test(m.text + m.html + m.subject));
check('email: link goes to the reset route of this site', /\/api\/auth\/reset-password\/[^/?]+\?callbackURL=/.test(link), link.slice(0, 60));

// Following the link lands on /reset-password with the token.
const land = await fetch(link.replace(/^https?:\/\/[^/]+/, BASE), { redirect: 'manual', headers: { origin: BASE } });
const loc = land.headers.get('location') ?? '';
const token = new URL(loc, BASE).searchParams.get('token');
check('link redirects to /reset-password?token=', new URL(loc, BASE).pathname === '/reset-password' && !!token, loc);

const expRow = await admin.query(`select "expiresAt" from qurtag.auth_verifications where identifier = $1`, [`reset-password:${token}`]);
const ttl = (new Date(expRow.rows[0].expiresAt) - Date.now()) / 1000;
check('token expires within 1 hour', ttl > 0 && ttl <= 3600, String(ttl));

const bad = await post(BASE, '/api/auth/reset-password', { newPassword: NEW, token: 'not-a-real-token' }, '10.7.3.1');
check('a made-up token is refused', bad.status === 400);
const ok = await post(BASE, '/api/auth/reset-password', { newPassword: NEW, token }, '10.7.3.2');
check('the token sets a new password', ok.status === 200);
const again = await post(BASE, '/api/auth/reset-password', { newPassword: 'yet another one 3', token }, '10.7.3.3');
check('the same token cannot be used twice', again.status === 400);
check('old password no longer signs in', (await signIn('rae@example.com', OLD, '10.7.3.4')).status >= 400);
check('new password signs in', (await signIn('rae@example.com', NEW, '10.7.3.5')).status === 200);
check('other sessions are revoked', !(await sessionOk(c1)) && !(await sessionOk(c2)));

// Expiry.
await post(MAIL, '/api/auth/request-password-reset', { email: 'rae@example.com', redirectTo: '/reset-password' }, '10.7.4.1');
const t2 = mails().at(-1).text.match(/reset-password\/([^/?\s]+)\?/)?.[1];
await admin.query(`update qurtag.auth_verifications set "expiresAt" = now() - interval '1 minute' where identifier = $1`, [`reset-password:${t2}`]);
const exp = await post(BASE, '/api/auth/reset-password', { newPassword: 'late password 4', token: t2 }, '10.7.4.2');
check('an expired token is refused', exp.status === 400);
const expLink = await fetch(`${BASE}/api/auth/reset-password/${t2}?callbackURL=%2Freset-password`, { redirect: 'manual', headers: { origin: BASE } });
check('an expired link redirects with error=INVALID_TOKEN', (expLink.headers.get('location') ?? '').includes('error=INVALID_TOKEN'));
check('a too-short new password is refused', (await post(BASE, '/api/auth/reset-password', { newPassword: 'short', token: 'x' }, '10.7.4.3')).status === 400);

// Rate limits.
await makeAccount('lim@example.com', '10.7.5.1');
const before = mails().length;
const codes = [];
for (let i = 0; i < 5; i++) {
  const r = await post(MAIL, '/api/auth/request-password-reset', { email: 'lim@example.com', redirectTo: '/reset-password' }, `10.7.6.${i}`);
  codes.push(r.status);
}
check('per email: after 3 an hour, the answer is still a success but nothing more is sent', codes.every((c) => c === 200) && mails().length - before === 3, `${codes} sent=${mails().length - before}`);
const ipCodes = [];
for (let i = 0; i < 5; i++) ipCodes.push((await post(MAIL, '/api/auth/request-password-reset', { email: `u${i}@example.com`, redirectTo: '/reset-password' }, '10.7.7.7')).status);
check('per IP: the 4th request in 5 minutes is refused', ipCodes.slice(0, 3).every((c) => c === 200) && ipCodes[3] === 429, ipCodes.join(','));

await admin.end();
console.log(`\nreset: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
