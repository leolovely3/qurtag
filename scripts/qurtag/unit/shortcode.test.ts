/** The short code route with a stand-in database: shapes, answers, and the limits. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHORT_CODE, createShortCodeRoute } from '../../../server/routes/shortcode.ts';

const ID = 'Hk3vX9mRtB2q';
const get = (ip: string) => new Request('http://x/api/fn?go=k7m2p', { headers: { 'x-forwarded-for': ip } });

test('only codes of 5 or 6 characters from the alphabet with a digit match, in any case', () => {
  for (const ok of ['k7m2p', 'K7M2P', 'k7m2p9', 'abcde2']) assert.ok(SHORT_CODE.test(ok), ok);
  for (const bad of ['terms', 'start', 'k7m2', 'k7m2p99', 'k0m2p', 'k1m2p', 'kolm2p', 'kim2pq', 'k7m 2p', '', 'abcdef', "k7m2p'"]) {
    assert.ok(!SHORT_CODE.test(bad), bad);
  }
});

test('a known code redirects to the finder page without caching; the database sees a lower case code and a hash, not the address', async () => {
  const calls: unknown[][] = [];
  const go = createShortCodeRoute({ env: {}, query: async (_t, v) => (calls.push(v), { rows: [{ id: ID }] }) });
  const r = await go(get('1.1.1.1'), 'K7M2P');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/find/${ID}`);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(calls[0][0], 'k7m2p');
  assert.match(String(calls[0][1]), /^[0-9a-f]{64}$/);
  assert.ok(!String(calls[0][1]).includes('1.1.1.1'));
});

test('an unknown code is an honest 404 page, and a bad shape still counts as a guess', async () => {
  const calls: unknown[][] = [];
  const go = createShortCodeRoute({ env: {}, query: async (_t, v) => (calls.push(v), { rows: [{ id: null }] }) });
  for (const code of ['zzzzz2', 'terms']) {
    const r = await go(get('2.2.2.2'), code);
    assert.equal(r.status, 404);
    assert.ok(!r.headers.get('location'));
    assert.match(await r.text(), /isn't registered/);
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'invalid');
});

test('the database saying too_many gives a 429, and a database fault gives a plain 500, never a redirect', async () => {
  const limited = createShortCodeRoute({ env: {}, query: async () => { throw Object.assign(new Error('too_many'), { code: 'P0001' }); } });
  const r = await limited(get('3.3.3.3'), 'k7m2p');
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '600');
  const broken = createShortCodeRoute({ env: {}, query: async () => { throw new Error('connection refused to 10.0.0.1'); } });
  const b = await broken(get('3.3.3.4'), 'k7m2p');
  assert.equal(b.status, 500);
  assert.ok(!(await b.text()).includes('10.0.0.1'));
});

test('one address is limited to 30 lookups a minute before the database is asked', async () => {
  let asked = 0;
  const go = createShortCodeRoute({ env: {}, query: async () => (asked++, { rows: [{ id: null }] }) });
  const statuses: number[] = [];
  for (let i = 0; i < 33; i++) statuses.push((await go(get('4.4.4.4'), 'zzzzz2')).status);
  assert.equal(statuses.filter((s) => s === 429).length, 3);
  assert.equal(asked, 30);
});

test('other methods are refused', async () => {
  const go = createShortCodeRoute({ env: {}, query: async () => ({ rows: [] }) });
  const r = await go(new Request('http://x/api/fn?go=k7m2p', { method: 'POST' }), 'k7m2p');
  assert.equal(r.status, 405);
});
