/**
 * Unit tests of iPhone push notifications: the token that signs requests to Apple, the alert
 * text (including the hidden-text variant and which kinds are time-sensitive), the request
 * itself against a stand-in Apple server, and the app's push routes with a stand-in database.
 * The whole loop against a real Postgres is scripts/qurtag/push.test.mjs (npm run test:e2e).
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  CATEGORY_FOUND,
  CATEGORY_MESSAGE,
  HIDDEN_TITLE,
  apnsConfigured,
  apnsFromEnv,
  apnsJwt,
  buildPayload,
  devicesFor,
  isTimeSensitive,
  normalizePem,
} from '../../../server/push/apns.ts';
import { createPushRoutes } from '../../../server/routes/push.ts';
import type { Query } from '../../../server/routes/finder.ts';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const THREAD = '3f2b8c1e-5d4a-4b9e-8a77-0c1d2e3f4a5b';

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

test('the Apple token is an ES256 JWT with the key id and team id, and its signature verifies', () => {
  const jwt = apnsJwt('ABC123DEFG', 'CQUVU6BHHA', PEM, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.deepEqual(decode(c), { iss: 'CQUVU6BHHA', iat: 1_800_000_000 });
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
  assert.equal(Buffer.from(s, 'base64url').length, 64, 'raw r||s, as Apple wants, not DER');
  // A different message does not verify with the same signature.
  assert.equal(verify('sha256', Buffer.from(`${h}.x`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), false);
});

test('the key may be pasted with escaped line breaks or without its header lines', () => {
  const escaped = PEM.trim().replace(/\n/g, '\\n');
  const bare = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  for (const form of [escaped, bare, `  ${PEM}  `]) {
    const jwt = apnsJwt('KEYID12345', 'CQUVU6BHHA', form, 1);
    const [h, c, s] = jwt.split('.');
    assert.equal(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
  }
  assert.match(normalizePem(bare), /^-----BEGIN PRIVATE KEY-----\n/);
});

test('a found alert names the item, shows the note, is time-sensitive and offers Reply', () => {
  const p = buildPayload({ kind: 'found', itemName: 'Blue water bottle', note: 'I have it, call me at the cafe', threadId: THREAD, hideText: false, unread: 3 });
  assert.deepEqual(p, {
    aps: {
      alert: { title: 'Someone found your Blue water bottle', body: 'I have it, call me at the cafe' },
      badge: 3,
      sound: 'default',
      'thread-id': THREAD,
      category: CATEGORY_FOUND,
      'interruption-level': 'time-sensitive',
    },
    thread: THREAD,
  });
});

test('a later note is a new-message alert, also time-sensitive, with the message category', () => {
  const p = buildPayload({ kind: 'message', itemName: 'Keys', note: 'Still here', threadId: THREAD, hideText: false, unread: 1 });
  assert.equal(p.aps.alert.title, 'New note about your Keys');
  assert.equal(p.aps.alert.body, 'Still here');
  assert.equal(p.aps.category, CATEGORY_MESSAGE);
  assert.equal(p.aps['interruption-level'], 'time-sensitive');
  assert.equal(p.thread, THREAD);
});

test('a scan alert is never time-sensitive, has no category, no thread and no Reply', () => {
  const p = buildPayload({ kind: 'scan', itemName: 'Violin case', hideText: false, unread: 0 });
  assert.equal(p.aps.alert.title, 'Your tag was scanned');
  assert.equal(p.aps.alert.body, 'Someone opened the page for your Violin case.');
  assert.equal(p.aps['interruption-level'], undefined);
  assert.equal(p.aps.category, undefined);
  assert.equal(p.aps['thread-id'], undefined);
  assert.equal(p.thread, undefined);
});

test('only found and new-message alerts are time-sensitive', () => {
  assert.equal(isTimeSensitive('found'), true);
  assert.equal(isTimeSensitive('message'), true);
  assert.equal(isTimeSensitive('scan'), false);
});

test('with the note text hidden, the lock screen says only "You have a new note": no note and no item name', () => {
  for (const kind of ['found', 'message'] as const) {
    const p = buildPayload({ kind, itemName: 'Grandma ring box', note: 'I found it near the fountain', threadId: THREAD, hideText: true, unread: 2 });
    assert.deepEqual(p.aps.alert, { title: HIDDEN_TITLE });
    assert.equal(HIDDEN_TITLE, 'You have a new note');
    const wire = JSON.stringify(p);
    assert.equal(wire.includes('Grandma'), false);
    assert.equal(wire.includes('fountain'), false);
    // Still time-sensitive, still threaded, still able to Reply.
    assert.equal(p.aps['interruption-level'], 'time-sensitive');
    assert.equal(p.aps['thread-id'], THREAD);
  }
  const s = buildPayload({ kind: 'scan', itemName: 'Grandma ring box', hideText: true, unread: 0 });
  assert.deepEqual(s.aps.alert, { title: 'Your tag was scanned' });
  assert.equal(JSON.stringify(s).includes('Grandma'), false);
});

test('the badge is a whole number from 0 up, and long notes are cut for the lock screen', () => {
  assert.equal(buildPayload({ kind: 'scan', itemName: 'x', hideText: false, unread: -4 }).aps.badge, 0);
  assert.equal(buildPayload({ kind: 'scan', itemName: 'x', hideText: false, unread: 2.9 }).aps.badge, 2);
  assert.equal(buildPayload({ kind: 'scan', itemName: 'x', hideText: false, unread: Number.NaN }).aps.badge, 0);
  const long = buildPayload({ kind: 'found', itemName: 'x', note: `${'word '.repeat(100)}`, threadId: THREAD, hideText: false, unread: 1 });
  assert.ok((long.aps.alert.body ?? '').length <= 120);
  assert.ok((long.aps.alert.body ?? '').endsWith('…'));
});

test('a payload carries nothing but the lock screen text, the thread, the badge, the sound and the category', () => {
  const p = buildPayload({ kind: 'found', itemName: 'Bag', note: 'hello', threadId: THREAD, hideText: false, unread: 1 });
  assert.deepEqual(Object.keys(p).sort(), ['aps', 'thread']);
  assert.deepEqual(Object.keys(p.aps).sort(), ['alert', 'badge', 'category', 'interruption-level', 'sound', 'thread-id']);
});

test('without the key settings there is no sender, and it is said once', () => {
  const seen: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void seen.push(a.join(' '));
  try {
    assert.equal(apnsFromEnv({}), null);
    assert.equal(apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG' }), null);
    assert.equal(apnsFromEnv({}), null);
  } finally {
    console.error = original;
  }
  assert.equal(seen.filter((l) => l.includes('push notifications are not sent')).length, 1);
  assert.equal(apnsConfigured({ APNS_KEY_ID: 'a', APNS_TEAM_ID: 'b', APNS_KEY_P8: 'c' }), true);
  assert.equal(apnsConfigured({ APNS_KEY_ID: 'a', APNS_TEAM_ID: 'b' }), false);
});

test('a deployment sends only to phones registered for its own Apple server', () => {
  const prod = apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'CQUVU6BHHA', APNS_KEY_P8: PEM })!;
  const sandbox = apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'CQUVU6BHHA', APNS_KEY_P8: PEM, APNS_ENV: 'sandbox' })!;
  const devices = [
    { token: 'a'.repeat(64), environment: 'production' as const },
    { token: 'b'.repeat(64), environment: 'sandbox' as const },
  ];
  assert.deepEqual(devicesFor(prod, devices).map((d) => d.token[0]), ['a']);
  assert.deepEqual(devicesFor(sandbox, devices).map((d) => d.token[0]), ['b']);
});

// ------------------------------------------------------------------ the request to Apple

interface Seen {
  path: string;
  headers: http2.IncomingHttpHeaders;
  body: string;
}

async function standInApple(answer: (deviceToken: string) => { status: number; reason?: string }) {
  const seen: Seen[] = [];
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.on('data', (c) => (body += c));
    stream.on('end', () => {
      const path = String(headers[':path']);
      seen.push({ path, headers, body });
      const a = answer(path.split('/').pop()!);
      stream.respond({ ':status': a.status, 'content-type': 'application/json' });
      stream.end(a.reason ? JSON.stringify({ reason: a.reason }) : '');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { seen, url, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('a send is a POST to /3/device/<token> with the topic, alert type, priority 10 and a verifiable bearer token', async () => {
  const apple = await standInApple(() => ({ status: 200 }));
  const apns = apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'CQUVU6BHHA', APNS_KEY_P8: PEM, QURTAG_APNS_URL: apple.url })!;
  try {
    const payload = buildPayload({ kind: 'found', itemName: 'Bag', note: 'hi', threadId: THREAD, hideText: false, unread: 1 });
    const token = 'c'.repeat(64);
    assert.equal(await apns.send(token, 'found', payload, '11111111-2222-3333-4444-555555555555'), 'sent');
    const r = apple.seen[0];
    assert.equal(r.path, `/3/device/${token}`);
    assert.equal(r.headers['apns-topic'], 'app.impactconsultingai.qurtag');
    assert.equal(r.headers['apns-push-type'], 'alert');
    assert.equal(r.headers['apns-priority'], '10');
    assert.equal(r.headers['apns-collapse-id'], '11111111-2222-3333-4444-555555555555');
    assert.ok(Number(r.headers['apns-expiration']) > Date.now() / 1000);
    const [, jwt] = String(r.headers.authorization).split(' ');
    const [h, c, s] = jwt.split('.');
    assert.equal(decode(h).kid, 'ABC123DEFG');
    assert.equal(decode(c).iss, 'CQUVU6BHHA');
    assert.equal(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
    assert.deepEqual(JSON.parse(r.body), payload);
  } finally {
    apns.close();
    await apple.close();
  }
});

test('Apple saying the token is gone is reported as gone; other refusals as failed', async () => {
  const apple = await standInApple((token) => {
    if (token.startsWith('d')) return { status: 410, reason: 'Unregistered' };
    if (token.startsWith('e')) return { status: 400, reason: 'BadDeviceToken' };
    if (token.startsWith('f')) return { status: 400, reason: 'PayloadEmpty' };
    if (token.startsWith('1')) return { status: 503, reason: 'ServiceUnavailable' };
    return { status: 200 };
  });
  const apns = apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'CQUVU6BHHA', APNS_KEY_P8: PEM, QURTAG_APNS_URL: apple.url, APNS_BUNDLE_ID: 'x.y.z' })!;
  const original = console.error;
  console.error = () => {};
  try {
    const payload = buildPayload({ kind: 'scan', itemName: 'Bag', hideText: false, unread: 0 });
    assert.equal(await apns.send('d'.repeat(64), 'scan', payload), 'gone');
    assert.equal(await apns.send('e'.repeat(64), 'scan', payload), 'gone');
    assert.equal(await apns.send('f'.repeat(64), 'scan', payload), 'failed');
    assert.equal(await apns.send('1'.repeat(64), 'scan', payload), 'failed');
    assert.equal(await apns.send('a'.repeat(64), 'scan', payload), 'sent');
    assert.equal(apple.seen.at(-1)!.headers['apns-topic'], 'x.y.z');
  } finally {
    console.error = original;
    apns.close();
    await apple.close();
  }
});

test('an unreachable Apple server is a failure, never a throw', async () => {
  const apns = apnsFromEnv({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'CQUVU6BHHA', APNS_KEY_P8: PEM, QURTAG_APNS_URL: 'http://127.0.0.1:9' })!;
  try {
    assert.equal(await apns.send('a'.repeat(64), 'scan', buildPayload({ kind: 'scan', itemName: 'x', hideText: false, unread: 0 })), 'failed');
  } finally {
    apns.close();
  }
});

// ------------------------------------------------------------------ the app's push routes

const env = { QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv;
let ip = 0;
const USER = '0aaa0000-0000-4000-8000-000000000001';
const SESSION = '0bbb0000-0000-4000-8000-000000000002';

function post(path: string, body: unknown, headers: Record<string, string> = { authorization: 'Bearer pass' }) {
  return new Request(`https://www.qurtag.com/api/fn/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.9.0.${++ip}`, ...headers },
    body: JSON.stringify(body),
  });
}

function routes(answer: (text: string, values: unknown[]) => Record<string, unknown>[] | Error = () => [{ r: { message_id: 'm', unread: 2 } }]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const query: Query = async (text, values) => {
    calls.push({ text, values });
    const a = answer(text, values);
    if (a instanceof Error) throw a;
    return { rows: a };
  };
  const r = createPushRoutes({
    query,
    env,
    checkPass: async (t) => (t === 'pass' ? { ok: true, claims: { sub: USER, sid: SESSION, role: 'qurtag_user', app: 'qurtag', aud: 'qurtag', exp: 9e9 } } : { ok: false, reason: 'no' }),
  });
  return { ...r, calls };
}

test('register needs a pass, a hex token and an environment, and passes the verified account to the database', async () => {
  const { register, calls } = routes();
  assert.equal((await register(post('push-register', { token: 'a'.repeat(64), environment: 'production' }, {}))).status, 401);
  assert.equal((await register(post('push-register', { token: 'a'.repeat(64), environment: 'production' }, { authorization: 'Bearer forged' }))).status, 401);
  assert.equal((await register(post('push-register', { token: 'not hex!', environment: 'production' }))).status, 400);
  assert.equal((await register(post('push-register', { token: 'a'.repeat(64), environment: 'staging' }))).status, 400);
  assert.equal(calls.length, 0, 'nothing reached the database');
  const ok = await register(post('push-register', { token: 'a'.repeat(64), environment: 'sandbox' }));
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0].values, [USER, SESSION, 'a'.repeat(64), 'sandbox']);
  const body = await ok.json();
  assert.deepEqual(body, { ok: true }, 'the token is never echoed back');
});

test('unregister forgets only the signed-in account\'s token', async () => {
  const { unregister, calls } = routes();
  assert.equal((await unregister(post('push-unregister', { token: 'b'.repeat(64) }))).status, 200);
  assert.deepEqual(calls[0].values, [USER, SESSION, 'b'.repeat(64)]);
});

test('reply posts the typed text to the conversation as the signed-in account and answers the unread count', async () => {
  const { reply, calls } = routes();
  const r = await reply(post('push-reply', { thread: THREAD, body: '  On my way  ' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, unread: 2 });
  assert.deepEqual(calls[0].values, [USER, SESSION, THREAD, 'On my way']);
  assert.match(calls[0].text, /server_owner_reply/);
});

test('reply refuses an empty or oversized text, a bad thread id, no pass, and a conversation that is not theirs', async () => {
  const { reply, calls } = routes((text) => (text.includes('server_owner_reply') ? new Error('not_found') : []));
  assert.equal((await reply(post('push-reply', { thread: THREAD, body: '   ' }))).status, 400);
  assert.equal((await reply(post('push-reply', { thread: THREAD, body: 'x'.repeat(2001) }))).status, 400);
  assert.equal((await reply(post('push-reply', { thread: 'nope', body: 'hi' }))).status, 400);
  assert.equal((await reply(post('push-reply', { thread: THREAD, body: 'hi' }, {}))).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await reply(post('push-reply', { thread: THREAD, body: 'hi' }))).status, 404);
});

test('the push routes refuse a page on another site and any method but POST', async () => {
  const { register } = routes();
  const foreign = await register(post('push-register', { token: 'a'.repeat(64), environment: 'production' }, { authorization: 'Bearer pass', origin: 'https://evil.example' }));
  assert.equal(foreign.status, 403);
  const get = await register(new Request('https://www.qurtag.com/api/fn/push-register', { method: 'GET' }));
  assert.equal(get.status, 405);
  const phone = await register(post('push-register', { token: 'a'.repeat(64), environment: 'production' }, { authorization: 'Bearer pass', origin: 'capacitor://localhost' }));
  assert.equal(phone.status, 200);
});
