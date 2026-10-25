/**
 * Unit tests of the finder-note filter (server/moderation/filter.ts) and of how the finder route
 * uses it, with a stand-in database. The database half is scripts/qurtag/moderation.test.mjs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNote, countLinks, flatten, MAX_LINKS } from '../../../server/moderation/filter.ts';
import { SLURS, THREATS } from '../../../server/moderation/wordlist.ts';
import { createFinderRoutes, type Query } from '../../../server/routes/finder.ts';

const TAG = 'AbCdEf234567';
const env = { QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv;
let ip = 0;
const post = (body: unknown) =>
  new Request('https://www.qurtag.com/api/fn/finder-send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.9.0.${++ip}` },
    body: JSON.stringify(body),
  });

test('ordinary notes pass', () => {
  for (const t of [
    'Found your keys at the bus stop on Main Street.',
    'I left it with the front desk, ask for Sam.',
    'Thank you! The class assessment room is on the third floor.',
    'Is this the black bag with a Scunthorpe tag? Call me maybe tomorrow...',
    'I hope I did not hurt your feelings by opening it.',
    'My Maine coon found it first :)',
  ]) assert.deepEqual(checkNote(t), { kind: 'ok' }, t);
});

test('slurs are held, including disguised and spaced ones', () => {
  for (const t of ['you faggot', 'F4GG0T', 'f.a.g.g.o.t', 'fuuuuaggot'.replace('fuuuu', 'f'), 'what a c u n t', 'Retarded!!', 'n1gg3r', 'NIGGERRR']) {
    const v = checkNote(t);
    assert.equal(v.kind, 'hold', t);
  }
});

test('threats are held', () => {
  for (const t of ["I'll kill you", 'i WILL find you and i know where you live', 'kys', 'go kill yourself', 'hope u die', 'kill   you']) {
    assert.deepEqual(checkNote(t), { kind: 'hold', reason: 'threat' }, t);
  }
});

test('whole words only', () => {
  for (const t of ['classic', 'assassin', 'skills you', 'therapist', 'grape you can have it', 'spice']) assert.deepEqual(checkNote(t), { kind: 'ok' }, t);
});

test('a note of only links is refused, and so is one with too many', () => {
  for (const t of ['https://example.com/x', 'www.example.com', '  shop.example.io/deal  ', 'http://a.com http://b.com']) {
    const v = checkNote(t);
    assert.equal(v.kind, 'reject', t);
    assert.equal((v as { code: string }).code, 'only_links');
  }
  const many = checkNote('See http://a.com and http://b.com and http://c.com thanks');
  assert.equal(many.kind, 'reject');
  assert.equal((many as { code: string }).code, 'too_many_links');
  assert.equal(checkNote('Meet me here https://maps.example.com/a or www.cafe.example.com').kind, 'ok');
});

test('links are counted', () => {
  assert.equal(countLinks('no links at all, just 3.5 hours and v1.2'), 0);
  assert.equal(countLinks('a http://x.com b www.y.org c z.co/path'), 3);
  assert.equal(MAX_LINKS, 2);
});

test('flatten', () => {
  assert.equal(flatten('  Héllo   W0RLD!! '), 'hello world');
  assert.equal(flatten('sooooo'), 'soo');
});

test('the word lists are lower case and flatten to themselves or shorter', () => {
  for (const w of [...SLURS, ...THREATS]) assert.equal(w, w.toLowerCase());
  assert.equal(new Set(SLURS).size, SLURS.length, 'no word is listed twice');
});

test('the route passes the hold reason to the database and shows the finder a normal answer', async () => {
  const calls: unknown[][] = [];
  const query: Query = async (_t, values) => {
    calls.push(values);
    return { rows: [{ ok: true }] };
  };
  const routes = createFinderRoutes({ query, env, afterNote: () => {} });
  const slur = await routes.send(post({ tag: TAG, body: 'you faggot' }));
  const j = await slur.json();
  assert.equal(slur.status, 200);
  assert.equal(j.ok, true);
  assert.ok(j.token);
  assert.equal(calls[0][3], 'language');
  const clean = await routes.send(post({ tag: TAG, token: j.token, body: 'Sorry, I meant: I found it.' }));
  assert.equal(clean.status, 200);
  assert.equal(calls[1][3], null);
});

test('the route refuses a link-only note without touching the database', async () => {
  let touched = 0;
  const routes = createFinderRoutes({ query: async () => (touched++, { rows: [] }), env, afterNote: () => {} });
  const r = await routes.send(post({ tag: TAG, body: 'https://spam.example.com' }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /few words/);
  assert.equal(touched, 0);
});

test('a blocked finder gets the same words as a closed conversation', async () => {
  const routes = createFinderRoutes({ query: async () => { throw new Error('thread_blocked'); }, env, afterNote: () => {} });
  const r = await routes.send(post({ tag: TAG, token: 'A'.repeat(43), body: 'hello' }));
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.equal(j.message, 'This conversation is closed.');
  assert.equal(j.error, 'thread_closed');
});

test('the admin alert says only that reports wait, and how many', async () => {
  const { buildPayload, isTimeSensitive } = await import('../../../server/push/apns.ts');
  const one = buildPayload({ kind: 'admin', itemName: 'SECRET', note: 'SECRET', threadId: 'SECRET', hideText: false, unread: 2 });
  assert.deepEqual(one.aps.alert, { title: 'New report on QuR Tag', body: 'Review it in Admin.' });
  assert.equal(one.aps.category, 'QURTAG_ADMIN');
  assert.equal(one.aps['interruption-level'], 'time-sensitive');
  assert.equal(one.open, '/app/admin#reported-notes');
  assert.equal(JSON.stringify(one).includes('SECRET'), false);
  const many = buildPayload({ kind: 'admin', itemName: '', hideText: false, unread: 0, waiting: 5 });
  assert.equal(many.aps.alert.title, '5 new reports on QuR Tag');
  assert.equal(isTimeSensitive('admin'), true);
});
