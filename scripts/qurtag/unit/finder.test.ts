/**
 * Unit tests of the finder's routes (server/routes/finder.ts) with a stand-in database:
 * what a finder can see, and what never reaches them. The full loop against a real
 * Postgres is scripts/qurtag/e2e.test.mjs (npm run test:e2e).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFinderRoutes, deviceClass, finderCard, finderThread, newThreadToken, THREAD_TOKEN, type Query } from '../../../server/routes/finder.ts';

const TAG = 'AbCdEf234567';
const env = { QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv;
let ipCounter = 0;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://www.qurtag.com/api/fn/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.1.0.${++ipCounter}`, ...headers },
    body: JSON.stringify(body),
  });
}

function stub(answer: (text: string, values: unknown[]) => Record<string, unknown>[] | Error) {
  const calls: { text: string; values: unknown[] }[] = [];
  const query: Query = async (text, values) => {
    calls.push({ text, values });
    const a = answer(text, values);
    if (a instanceof Error) throw a;
    return { rows: a };
  };
  return { query, calls };
}

test('finderCard keeps only name, photo, reward text and lost', () => {
  const card = finderCard({
    name: 'Violin case',
    photo: 'data:image/jpeg;base64,AAAA',
    reward_text: 'A thank-you',
    lost: true,
    owner_email: 'owner@example.com',
    notes: 'private',
    household_id: 'x',
  });
  assert.deepEqual(card, { name: 'Violin case', photo: 'data:image/jpeg;base64,AAAA', reward_text: 'A thank-you', lost: true });
});

test('finderCard drops a photo that is not an image data address', () => {
  assert.equal(finderCard({ name: 'Keys', photo: 'https://tracker.example.com/pixel.gif' })?.photo, null);
  assert.equal(finderCard({ name: 'Keys', photo: 'javascript:alert(1)' })?.photo, null);
  assert.equal(finderCard({ name: '' }), null);
  assert.equal(finderCard(null), null);
});

test('finderThread keeps only id, sender, body and time of each message', () => {
  const t = finderThread({
    status: 'open',
    household_id: 'secret',
    messages: [
      { id: '1', sender_kind: 'finder', body: 'hi', created_at: '2026-10-25T10:00:00Z', read_by_owner_at: 'x' },
      { id: '2', sender_kind: 'owner', body: 'thanks', created_at: '2026-10-25T10:01:00Z', owner_email: 'o@example.com' },
      { id: '3', sender_kind: 'robot', body: 'bad', created_at: '2026-10-25T10:02:00Z' },
    ],
  });
  assert.deepEqual(t, {
    status: 'open',
    messages: [
      { id: '1', sender_kind: 'finder', body: 'hi', created_at: '2026-10-25T10:00:00Z' },
      { id: '2', sender_kind: 'owner', body: 'thanks', created_at: '2026-10-25T10:01:00Z' },
    ],
  });
});

test('tokens are 43 random base64url characters and never repeat', () => {
  const a = newThreadToken();
  const b = newThreadToken();
  assert.match(a, THREAD_TOKEN);
  assert.notEqual(a, b);
});

test('device class is coarse', () => {
  assert.equal(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'iphone');
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 15)'), 'android');
  assert.equal(deviceClass(null), 'other');
});

test('an unknown or malformed tag answers "This tag isn\'t registered" without asking the database for it', async () => {
  const db = stub(() => [{ v: null }]);
  const routes = createFinderRoutes({ query: db.query, env, afterNote: () => {} });
  const bad = await routes.view(post('finder-view', { tag: "x' or 1=1" }));
  assert.equal(bad.status, 404);
  assert.equal((await bad.json()).message, "This tag isn't registered.");
  assert.equal(db.calls.length, 0);
  const unknown = await routes.view(post('finder-view', { tag: TAG }));
  assert.equal(unknown.status, 404);
  assert.equal(db.calls.length, 1);
});

test('the view answers only finder-safe fields even if the database sent more', async () => {
  const db = stub(() => [
    {
      v: {
        item: { name: 'Blue water bottle', photo: null, reward_text: null, lost: false, notes: 'PRIVATE', owner_email: 'o@example.com' },
        tag: { public_id: TAG },
        thread: null,
        household_id: 'hh',
      },
    },
  ]);
  const routes = createFinderRoutes({ query: db.query, env, afterNote: () => {} });
  const r = await routes.view(post('finder-view', { tag: TAG, scan: true }));
  const text = await r.text();
  assert.equal(r.status, 200);
  assert.ok(!text.includes('PRIVATE') && !text.includes('o@example.com') && !text.includes('hh'));
  assert.deepEqual(JSON.parse(text), { item: { name: 'Blue water bottle', photo: null, reward_text: null, lost: false }, thread: null, tokenValid: null });
  assert.equal(db.calls[0].values[3], true);
});

test('a malformed token is never sent to the database', async () => {
  const db = stub(() => [{ v: { item: { name: 'Keys', lost: false } } }]);
  const routes = createFinderRoutes({ query: db.query, env, afterNote: () => {} });
  await routes.view(post('finder-view', { tag: TAG, token: "short' or 1=1" }));
  assert.equal(db.calls[0].values[1], null);
});

test('the first note opens a conversation with a new token; later notes need it', async () => {
  let notes = 0;
  const db = stub(() => [{ ok: true }]);
  const routes = createFinderRoutes({ query: db.query, env, afterNote: () => notes++ });
  const first = await routes.send(post('finder-send', { tag: TAG, body: 'Found it at the gym' }));
  const j = await first.json();
  assert.equal(first.status, 200);
  assert.match(j.token, THREAD_TOKEN);
  assert.match(db.calls[0].text, /server_finder_open/);
  assert.equal(db.calls[0].values[1], j.token);
  const second = await routes.send(post('finder-send', { tag: TAG, token: j.token, body: 'Still here' }));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).token, undefined);
  assert.match(db.calls[1].text, /server_finder_post/);
  assert.equal(notes, 2);
});

test('database refusals become plain words; nothing internal leaks', async () => {
  const routes = createFinderRoutes({ query: stub(() => new Error('thread_not_found')).query, env, afterNote: () => {} });
  const r = await routes.send(post('finder-send', { tag: TAG, token: 'A'.repeat(43), body: 'hi' }));
  assert.equal(r.status, 404);
  const other = createFinderRoutes({ query: stub(() => Object.assign(new Error('relation "qurtag.items" does not exist'), { code: '42P01' })).query, env, afterNote: () => {} });
  const r2 = await other.send(post('finder-send', { tag: TAG, body: 'hi' }));
  assert.equal(r2.status, 500);
  assert.ok(!(await r2.text()).includes('relation'));
});

test('empty, long and cross-site notes are refused', async () => {
  const db = stub(() => [{ ok: true }]);
  const routes = createFinderRoutes({ query: db.query, env, afterNote: () => {} });
  assert.equal((await routes.send(post('finder-send', { tag: TAG, body: '   ' }))).status, 400);
  assert.equal((await routes.send(post('finder-send', { tag: TAG, body: 'x'.repeat(2001) }))).status, 400);
  assert.equal((await routes.send(post('finder-send', { tag: TAG, body: 'hi' }, { origin: 'https://evil.example.com' }))).status, 403);
  assert.equal((await routes.view(new Request('https://www.qurtag.com/api/fn/finder-view?tag=' + TAG))).status, 405);
  assert.equal(db.calls.length, 0);
});
