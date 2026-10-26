/**
 * Unit tests of the finder loop's server half (server/routes/finderCrypto.ts, finderLoop.ts and the
 * finder route's use of them) with a stand-in database. The full loop is scripts/qurtag/finder-loop.test.mjs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFinderRoutes, type Query } from '../../../server/routes/finder.ts';
import { createFinderLoopRoutes } from '../../../server/routes/finderLoop.ts';
import {
  displayCode,
  networkKey,
  newConversationCode,
  normalizeCode,
  openContact,
  sealContact,
  stopSignature,
  tokenForCode,
} from '../../../server/routes/finderCrypto.ts';
import { finderReplyMail } from '../../../server/auth/mailer.ts';

const env = { QURTAG_AUTH_URL: 'https://www.qurtag.com', QURTAG_AUTH_SECRET: 'unit-secret', QURTAG_MAIL_MODE: 'capture' } as NodeJS.ProcessEnv;
const TAG = 'AbCdEf234567';
let ip = 0;
const post = (path: string, body: unknown) =>
  new Request(`https://www.qurtag.com/api/fn/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.9.0.${++ip}` },
    body: JSON.stringify(body),
  });

test('a conversation code: 12 characters of the alphabet, shown in groups, read back however typed', () => {
  for (let i = 0; i < 200; i++) assert.match(newConversationCode(), /^[a-hj-km-np-z2-9]{12}$/);
  const c = 'k7m2p9xq4trb';
  assert.equal(displayCode(c), 'K7M2-P9XQ-4TRB');
  assert.equal(normalizeCode('K7M2-P9XQ-4TRB'), c);
  assert.equal(normalizeCode(' k7m2 p9xq 4trb '), c);
  assert.equal(normalizeCode('K7M2-P9XQ-4TR'), null);
  assert.equal(normalizeCode('O7M2-P9XQ-4TRB'), null, 'no O, 0, 1, I or L');
});

test('the token comes from the code with the server secret: the same code, the same token; another secret, another token', () => {
  const t = tokenForCode('k7m2p9xq4trb', env)!;
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenForCode('k7m2p9xq4trb', env), t);
  assert.notEqual(tokenForCode('k7m2p9xq4trb', { ...env, QURTAG_AUTH_SECRET: 'other' }), t);
  assert.notEqual(tokenForCode('k7m2p9xq4trc', env), t);
  assert.equal(tokenForCode('k7m2p9xq4trb', {} as NodeJS.ProcessEnv), null);
});

test('the network is kept as a keyed hash, never the address', () => {
  const k = networkKey('finder-net', '203.0.113.9', env);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.ok(!k.includes('203'));
  assert.notEqual(networkKey('conversation-code', '203.0.113.9', env), k, 'each purpose has its own key');
});

test("the finder's email is sealed: unreadable without the secret, and any change is caught", () => {
  const sealed = sealContact({ email: 'finder@example.test', token: 'a'.repeat(43) }, env);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes('finder'));
  assert.deepEqual(openContact(sealed, env), { email: 'finder@example.test', token: 'a'.repeat(43) });
  assert.equal(openContact(sealed, { ...env, QURTAG_AUTH_SECRET: 'other' }), null);
  const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
  assert.equal(openContact(flipped, env), null);
  assert.notEqual(sealContact({ email: 'finder@example.test', token: 'a'.repeat(43) }, env), sealed, 'a fresh nonce each time');
});

test('a first note answers a code whose token is the one the database was given, with a network key', async () => {
  const calls: unknown[][] = [];
  const query: Query = async (text, values) => {
    calls.push([text, values]);
    return { rows: [] };
  };
  const r = await createFinderRoutes({ query, env, afterNote: () => {} }).send(post('finder-send', { tag: TAG, body: 'Found it' }));
  const j = (await r.json()) as { token: string; code: string };
  assert.equal(r.status, 200);
  assert.match(j.code, /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
  assert.equal(j.token, tokenForCode(normalizeCode(j.code)!, env));
  const [text, values] = calls[0] as [string, unknown[]];
  assert.match(text, /server_finder_open\(\$1, \$2, \$3, \$4, \$5\)/);
  assert.equal(values[1], j.token);
  assert.match(String(values[4]), /^[0-9a-f]{64}$/);
});

test("a switched-off tag answers 410 'gone'; a refused new conversation is not announced as a block", async () => {
  const gone = await createFinderRoutes({ query: async () => ({ rows: [{ v: { gone: true } }] }), env }).view(post('finder-view', { tag: TAG }));
  assert.equal(gone.status, 410);
  const refused = await createFinderRoutes({
    query: async () => {
      throw new Error('not_taking');
    },
    env,
    afterNote: () => {},
  }).send(post('finder-send', { tag: TAG, body: 'Hello' }));
  const j = (await refused.json()) as { error: string; message: string };
  assert.equal(refused.status, 409);
  assert.equal(j.error, 'not_taking');
  assert.doesNotMatch(j.message, /block/i);
});

test('resume: a typed code becomes its token for the database lookup, with a visitor key', async () => {
  let seen: unknown[] = [];
  const query: Query = async (_t, values) => {
    seen = values;
    return { rows: [{ tag: TAG }] };
  };
  const r = await createFinderLoopRoutes({ query, env }).resume(post('finder-resume', { code: 'k7m2 p9xq 4trb' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { tag: TAG, token: tokenForCode('k7m2p9xq4trb', env) });
  assert.equal(seen[0], tokenForCode('k7m2p9xq4trb', env));
  assert.match(String(seen[1]), /^[0-9a-f]{64}$/);
  const none = await createFinderLoopRoutes({ query: async () => ({ rows: [{ tag: null }] }), env }).resume(post('finder-resume', { code: 'nonsense' }));
  assert.equal(none.status, 404);
});

test('finder email: checked, sealed before the database sees it, and refused when email is off', async () => {
  let stored: unknown = 'unset';
  const query: Query = async (_t, values) => {
    stored = values[2];
    return { rows: [] };
  };
  const routes = createFinderLoopRoutes({ query, env });
  const token = 'b'.repeat(43);
  assert.equal((await routes.email(post('finder-email', { tag: TAG, token, email: 'nope' }))).status, 400);
  const ok = await routes.email(post('finder-email', { tag: TAG, token, email: 'finder@example.test' }));
  assert.equal(ok.status, 200);
  assert.match(String(stored), /^v1\./);
  assert.ok(!String(stored).includes('finder@'));
  assert.equal(openContact(String(stored), env)?.email, 'finder@example.test');
  await routes.email(post('finder-email', { tag: TAG, token, email: null }));
  assert.equal(stored, null, 'null takes it back');
  const off = createFinderLoopRoutes({ query, env: { ...env, QURTAG_MAIL_MODE: undefined } });
  assert.equal((await off.email(post('finder-email', { tag: TAG, token, email: 'finder@example.test' }))).status, 503);
});

test('the unsubscribe link: a page first, then one POST; a forged signature is refused', async () => {
  const id = '3f2b8c1e-1d2a-4b5c-9d8e-0a1b2c3d4e5f';
  let forgot: unknown = null;
  const routes = createFinderLoopRoutes({ query: async (_t, v) => ((forgot = v[0]), { rows: [] }), env });
  const url = `https://www.qurtag.com/api/fn/finder-email-stop?t=${id}&s=${stopSignature(id, env)}`;
  const page = await routes.stop(new Request(url));
  assert.equal(page.status, 200);
  assert.equal(forgot, null, 'opening the link changes nothing');
  assert.equal((await routes.stop(new Request(url, { method: 'POST' }))).status, 200);
  assert.equal(forgot, id);
  assert.equal((await routes.stop(new Request(url.replace(/s=.*/, 's=forged'), { method: 'POST' }))).status, 404);
});

test("the reply email: the owner's words, a link back, a spam reminder, one-click stop, nothing about the owner", () => {
  const m = finderReplyMail({
    to: 'finder@example.test',
    itemName: 'Purple backpack',
    replies: ['I can pick it up after 5 <b>today</b>'],
    more: false,
    returned: false,
    conversationUrl: `https://www.qurtag.com/find/${TAG}#t=${'a'.repeat(43)}`,
    stopUrl: 'https://www.qurtag.com/api/fn/finder-email-stop?t=x&s=y',
  });
  assert.match(m.text, /I can pick it up after 5/);
  assert.ok(m.html.includes('&lt;b&gt;today&lt;/b&gt;'), 'the reply is escaped');
  assert.match(m.text, /#t=a{43}/);
  assert.match(m.text, /spam or junk/);
  assert.equal(m.headers?.['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const back = finderReplyMail({ to: 'f@example.test', itemName: 'Keys', replies: [], more: false, returned: true, conversationUrl: 'u', stopUrl: 's' });
  assert.match(back.subject, /has the Keys back/);
  assert.match(back.text, /deleted your email address/);
});
