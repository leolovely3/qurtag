// Where a new account came from (src/lib/signupSource.ts, db/signup-source.sql): the first page wins, the channel
// comes from the tags then the referrer, nothing sensitive is kept, and a source is sent once per account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureSignupSource, cleanReferrer, inferChannel, landingPath, readSignupSource, recordSignupSource, SIGNUP_SOURCE_KEY } from '../../../src/lib/signupSource';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)) };
};
const NOW = new Date('2026-11-12T12:00:00Z');
const env = (o: Partial<Parameters<typeof captureSignupSource>[0]> & { storage: ReturnType<typeof mem> }) => ({
  search: '', referrer: '', pathname: '/', hostname: 'www.qurtag.com', now: NOW, ...o,
});

test('tags and referrer are captured on the first page', () => {
  const storage = mem();
  const s = captureSignupSource(env({ storage, search: '?utm_source=facebook&utm_medium=cpc&utm_campaign=fall&utm_term=lost&utm_content=a', referrer: 'https://l.facebook.com/l.php?u=secret#x' }));
  assert.equal(s?.utm_term, 'lost');
  assert.equal(s?.referrer_url, 'https://l.facebook.com/l.php');
  assert.equal(s?.acquisition_channel, 'paid_search');
  assert.deepEqual(readSignupSource(storage), s);
});

test('a later page does not overwrite the first', () => {
  const storage = mem();
  captureSignupSource(env({ storage, search: '?utm_source=news&utm_medium=email' }));
  assert.equal(captureSignupSource(env({ storage, referrer: 'https://www.google.com/' })), null);
  assert.equal(readSignupSource(storage)?.acquisition_channel, 'email');
});

test('a tag page keeps no tag code in the landing path', () => {
  assert.equal(landingPath('/find/AB12CD34EF'), '/find/:id');
  assert.equal(landingPath('/k7m2p'), '/:id', 'a short code is not kept');
  assert.equal(landingPath('/'), '/');
  assert.equal(landingPath('/pricing'), '/pricing');
  const s = captureSignupSource(env({ storage: mem(), pathname: '/find/AB12CD34EF' }));
  assert.doesNotMatch(JSON.stringify(s), /AB12CD34EF/);
});

test('channels', () => {
  const c = (utm_source: string | null, utm_medium: string | null, referrer: string | null) => inferChannel({ utm_source, utm_medium, referrer, ownHost: 'qurtag.com' });
  assert.equal(c(null, null, null), 'direct');
  assert.equal(c('news', 'email', null), 'email');
  assert.equal(c('instagram', 'social', null), 'organic_social');
  assert.equal(c('google', null, null), 'organic_search');
  assert.equal(c(null, null, 'https://www.google.co.uk/'), 'organic_search');
  assert.equal(c(null, null, 'https://www.reddit.com/r/x'), 'organic_social');
  assert.equal(c(null, null, 'https://chatgpt.com/'), 'ai');
  assert.equal(c(null, null, 'https://blog.example.org/post'), 'referral');
  assert.equal(c(null, null, 'https://www.qurtag.com/pricing'), 'direct');
  assert.equal(cleanReferrer('android-app://com.google.android.gm'), null);
});

test('blocked storage does not throw', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(captureSignupSource(env({ storage: blocked as never })), null);
});

test('a source is sent once per account, with only the allowed fields; a failure is retried', async () => {
  const storage = mem();
  captureSignupSource(env({ storage, search: '?utm_source=x&utm_medium=social' }));
  const calls: Array<Record<string, string | null>> = [];
  const ok = async (a: Record<string, string | null>) => { calls.push(a); return { error: null }; };
  await assert.rejects(recordSignupSource('u1', storage, async () => ({ error: { message: 'boom' } })), /boom/);
  assert.equal(await recordSignupSource('u1', storage, ok), true);
  assert.equal(await recordSignupSource('u1', storage, ok), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['p_channel', 'p_landing_path', 'p_referrer_url', 'p_utm_campaign', 'p_utm_content', 'p_utm_medium', 'p_utm_source', 'p_utm_term']);
  assert.equal(await recordSignupSource('u2', mem(), ok), false, 'nothing captured, nothing sent');
});

test('a tampered stored value is ignored', () => {
  const storage = mem();
  storage.setItem(SIGNUP_SOURCE_KEY, JSON.stringify({ acquisition_channel: 'DROP TABLE' }));
  assert.equal(readSignupSource(storage), null);
});

test('the SQL is for signed-in owners only, never overwrites, and gives no role a right on the table', () => {
  const sql = readFileSync(new URL('../../../db/signup-source.sql', import.meta.url), 'utf8');
  assert.match(sql, /qurtag\.current_account\(\)/);
  assert.match(sql, /on conflict \(user_id\) do nothing/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /grant execute on function qurtag\.record_signup_source\(text, text, text, text, text, text, text, text\) to qurtag_user;/);
  assert.doesNotMatch(sql, /grant [a-z, ]* on qurtag\.signup_sources/);
  assert.doesNotMatch(sql, /—/);
  assert.equal(readFileSync(new URL('../../../supabase/migrations/20261112130000_signup_source.sql', import.meta.url), 'utf8').includes(sql), true, 'the mirror matches');
});
