#!/usr/bin/env node
/**
 * End-to-end test of the first-party measures (db/measures.sql), after e2e.test.mjs, on the same throwaway
 * Postgres and server functions. Each new counter is driven the way a person would drive it and read back
 * through qurtag.factory_metrics, the way the Company OS reads it:
 *
 *   - a return is counted when the owner presses "I have it back" (and only then);
 *   - a print, a share and a download are counted by style, with a bad value refused;
 *   - a sign-up channel is stored once, cleaned, never changed afterwards, and counted by channel;
 *   - a scan with no note is counted, and one followed by a note is not;
 *   - Free households at the limit and over it, paid members by plan and source, iPhone accounts and alerts on;
 *   - no new table is readable by anyone: not a visitor with no pass, not a signed-in owner, not the server login.
 */
import pg from 'pg';
import { Person } from './people.mjs';

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
const dataDb = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_DATA });
await dataDb.connect();
const serverDb = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_SERVER });
await serverDb.connect();

const metrics = async () =>
  (await new Person('factory', '10.60.9.9').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: process.env.QURTAG_TEST_FACTORY_TOKEN }, headers: { authorization: '' } })).json;
const stamp = Date.now();

async function signUpWith(person, email, extra = {}) {
  person.email = email;
  const r = await person.req('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password: 'correct horse battery', name: 'Measure Person', callbackURL: '/app', ...extra },
    headers: { authorization: '' },
  });
  await person.getPass();
  const { rows } = await sql(`select u.id, u.signup_channel, h.id as household from qurtag.auth_users u join qurtag.households h on h.owner_user_id = u.id where u.email = $1`, [email]);
  person.id = rows[0]?.id;
  person.household = rows[0]?.household;
  person.channel = rows[0]?.signup_channel;
  return r;
}

// ------------------------------------------------------------------ 1. sign-up source

const fb = new Person('facebook visitor', '10.60.1.1');
const rawChannel = new Person('messy channel', '10.60.1.2');
const none = new Person('no channel', '10.60.1.3');
const evil = new Person('bad channel', '10.60.1.4');
const base = await metrics();
check('the counts carry the new names', ['returned_total', 'returned_30d', 'accounts_at_free_limit', 'accounts_over_free_limit', 'tags_printed_total', 'accounts_that_printed', 'tags_printed_by_style', 'scans_with_note_30d', 'scans_no_note_rate_30d', 'signups_by_channel', 'paid_members_total', 'iphone_accounts_total', 'push_enabled_accounts'].every((k) => k in base), Object.keys(base ?? {}).join());

const fbUp = await signUpWith(fb, `ch-fb-${stamp}@example.com`, { signup_channel: 'facebook' });
check('a sign-up with a channel succeeds', fbUp.status === 200, `${fbUp.status}`);
check('the channel is stored on the account', fb.channel === 'facebook', String(fb.channel));
await signUpWith(rawChannel, `ch-raw-${stamp}@example.com`, { signup_channel: '  Facebook ' });
check('the channel is cleaned (case and spaces)', rawChannel.channel === 'facebook', String(rawChannel.channel));
await signUpWith(none, `ch-none-${stamp}@example.com`);
check('a sign-up with no channel stores none', none.channel === null);
const evilUp = await signUpWith(evil, `ch-evil-${stamp}@example.com`, { signup_channel: "x'; drop table qurtag.items; --" });
check('a bad channel is dropped, not stored, and the sign-up still succeeds', evilUp.status === 200 && evil.channel === null, `${evilUp.status} ${evil.channel}`);

const upd = await fb.req('/api/auth/update-user', { method: 'POST', body: { name: 'Renamed', signup_channel: 'tiktok' } });
const after = (await sql(`select signup_channel from qurtag.auth_users where id = $1`, [fb.id])).rows[0];
check('the channel cannot be changed through the sign-in service after sign-up', after.signup_channel === 'facebook', `${upd.status} ${after.signup_channel}`);
await sql(`update qurtag.auth_users set signup_channel = 'tiktok' where id = $1`, [fb.id]);
check('nor by any update at all (the database keeps it)', (await sql(`select signup_channel from qurtag.auth_users where id = $1`, [fb.id])).rows[0].signup_channel === 'facebook');
const readBack = await fb.req('/api/auth/get-session');
check('the channel is never sent back to a browser', !JSON.stringify(readBack.json).includes('signup_channel'));

const made = await fb.db.rpc('create_item', { p_name: 'Water bottle' });
check('the facebook visitor made an item', !made.error, JSON.stringify(made.error));
const m1 = await metrics();
const by7 = m1.signups_by_channel?.['7d'] ?? {};
const by30 = m1.signups_by_channel?.['30d'] ?? {};
check('sign-ups are counted by channel for 7 days', by7.facebook?.signups === 2 && by7.unknown?.signups >= 3, JSON.stringify(by7));
check('sign-ups are counted by channel for 30 days', by30.facebook?.signups === 2, JSON.stringify(by30));
check('activated is counted by channel (an account with an item)', by7.facebook?.activated === 1 && by30.facebook?.activated === 1, JSON.stringify(by7.facebook));
await sql(`update qurtag.auth_users set "createdAt" = now() - interval '20 days' where id = $1`, [rawChannel.id]);
const m2 = await metrics();
check('a 20 day old account is in the 30 day count and not the 7 day one', m2.signups_by_channel['7d'].facebook.signups === 1 && m2.signups_by_channel['30d'].facebook.signups === 2);

// ------------------------------------------------------------------ 2. returned

const finder = new Person('finder', '10.60.2.1');
const finder2 = new Person('second finder', '10.60.2.2');
const tag = made.data?.public_id;
const before = await metrics();
const note = await finder.send(tag, null, 'I found your bottle at the gym.');
check('a finder sent a note', note.status === 200 && !!note.json?.token, `${note.status}`);
const threads = await fb.db.from('threads').select('id, status');
const thread = threads.data?.[0];
check('the owner sees the conversation, still open', thread?.status === 'open');
check('nothing is counted as returned yet', (await metrics()).returned_total === before.returned_total);
const done = await fb.db.from('threads').update({ status: 'reunited' }).eq('id', thread.id);
check('the owner marks it "I have it back"', !done.error, JSON.stringify(done.error));
const m3 = await metrics();
check('returned_total and returned_30d each rose by one', m3.returned_total === before.returned_total + 1 && m3.returned_30d === before.returned_30d + 1, `${before.returned_total} -> ${m3.returned_total}`);
const closedOnly = await fb.db.from('threads').update({ status: 'closed' }).eq('id', thread.id);
check('closing a conversation instead takes it out of the returned count', !closedOnly.error && (await metrics()).returned_total === before.returned_total);
await fb.db.from('threads').update({ status: 'reunited' }).eq('id', thread.id);
const otherOwner = await fb.db.from('threads').select('returned_at');
check('the owner role cannot read when it was returned', !!otherOwner.error);
await sql(`update qurtag.threads set returned_at = now() - interval '45 days' where id = $1`, [thread.id]);
const m4 = await metrics();
check('a return 45 days ago counts in the total and not in 30 days', m4.returned_total === before.returned_total + 1 && m4.returned_30d === before.returned_30d, `${m4.returned_total} ${m4.returned_30d}`);

// ------------------------------------------------------------------ 3. tags printed

const p0 = await metrics();
const good = { p_style: 'wallet', p_look: 'bold', p_paper: 'letter', p_surface: 'web', p_action: 'print' };
const r1 = await fb.db.rpc('record_tag_print', good);
check('a print is recorded', !r1.error, JSON.stringify(r1.error));
const r2 = await fb.db.rpc('record_tag_print', { ...good, p_style: 'sticker', p_surface: 'app', p_action: 'download_print_ready_png' });
check('a download from the app is recorded', !r2.error, JSON.stringify(r2.error));
const p1 = await metrics();
check('tags_printed_total rose by two', p1.tags_printed_total === p0.tags_printed_total + 2, `${p0.tags_printed_total} -> ${p1.tags_printed_total}`);
check('one account printed', p1.accounts_that_printed === p0.accounts_that_printed + 1);
check('the breakdown by style counts each style', p1.tags_printed_by_style.wallet === p0.tags_printed_by_style.wallet + 1 && p1.tags_printed_by_style.sticker === p0.tags_printed_by_style.sticker + 1 && p1.tags_printed_sticker === p1.tags_printed_by_style.sticker);
for (const [label, patch] of [['style', { p_style: 'poster' }], ['look', { p_look: 'neon' }], ['paper', { p_paper: 'legal' }], ['surface', { p_surface: 'tv' }], ['action', { p_action: 'delete_everything' }]]) {
  const bad = await fb.db.rpc('record_tag_print', { ...good, ...patch });
  check(`a made-up ${label} is refused`, !!bad.error);
}
check('refused prints are not counted', (await metrics()).tags_printed_total === p1.tags_printed_total);
const anonPrint = await new Person('nobody', '10.60.3.1').req('/api/data/rpc/record_tag_print', { method: 'POST', body: good, headers: { authorization: '' } });
check('with no pass a print cannot be recorded', anonPrint.status === 401, `${anonPrint.status}`);
const events = (await sql(`select * from qurtag.tag_print_events where household_id = $1`, [fb.household])).rows;
check('an event holds no item, tag or address', events.length === 2 && !('item_id' in events[0]) && !('tag_id' in events[0]) && !Object.keys(events[0]).some((k) => /ip|address|agent/i.test(k)));
for (let i = 0; i < 205; i++) await fb.db.rpc('record_tag_print', good);
const capped = (await sql(`select count(*)::int as n from qurtag.tag_print_events where household_id = $1`, [fb.household])).rows[0].n;
check('a script cannot flood the count (200 a day per household)', capped === 200, String(capped));

// ------------------------------------------------------------------ 4. scan to note

const s0 = await metrics();
const watcher = new Person('scanner', '10.60.4.1');
const scanned = await watcher.view(tag, null, true);
check('a scan with no note after it is recorded', scanned.status === 200);
const s1 = await metrics();
check('scans_30d rose by one and the scan has no note', s1.scans_30d === s0.scans_30d + 1 && s1.scans_without_note_30d === s0.scans_without_note_30d + 1 && s1.scans_with_note_30d === s0.scans_with_note_30d, JSON.stringify([s0.scans_30d, s1.scans_30d]));
// A scan carries no visitor id, so two scans of one tag within the hour before a note cannot be told apart:
// the second scenario uses another tag.
const made2 = await fb.db.rpc('create_item', { p_name: 'Keys' });
const tag2 = made2.data?.public_id;
await finder2.view(tag2, null, true);
const note2 = await finder2.send(tag2, null, 'Found it near the park.');
check('a second finder scanned and wrote', note2.status === 200);
const s2 = await metrics();
check('the scan followed by a note counts as with a note', s2.scans_30d === s1.scans_30d + 1 && s2.scans_with_note_30d === s1.scans_with_note_30d + 1 && s2.scans_without_note_30d === s1.scans_without_note_30d, JSON.stringify([s1, s2].map((x) => [x.scans_with_note_30d, x.scans_without_note_30d])));
check('the rate is the share of scans with no note', Math.abs(s2.scans_no_note_rate_30d - s2.scans_without_note_30d / s2.scans_30d) < 0.0001, String(s2.scans_no_note_rate_30d));
await sql(`update qurtag.scans set scanned_at = now() - interval '3 hours' where id = (select id from qurtag.scans order by scanned_at desc limit 1)`);
const s3 = await metrics();
check('a note more than an hour after a scan does not belong to it', s3.scans_with_note_30d === s2.scans_with_note_30d - 1 && s3.scans_without_note_30d === s2.scans_without_note_30d + 1, `${s2.scans_with_note_30d} -> ${s3.scans_with_note_30d}`);

// ------------------------------------------------------------------ 5. Free limit

const lim = new Person('limit owner', '10.60.5.1');
await signUpWith(lim, `limit-${stamp}@example.com`);
const l0 = await metrics();
for (const n of ['One', 'Two']) await lim.db.rpc('create_item', { p_name: n });
check('two items is not at the limit', (await metrics()).accounts_at_free_limit === l0.accounts_at_free_limit);
await lim.db.rpc('create_item', { p_name: 'Three' });
const l1 = await metrics();
check('a Free household with three items is at the limit', l1.accounts_at_free_limit === l0.accounts_at_free_limit + 1 && l1.accounts_over_free_limit === l0.accounts_over_free_limit);
await sql(`insert into qurtag.items (household_id, name) values ($1, 'Four')`, [lim.household]);
const l2 = await metrics();
check('past three (after a membership ended) it is over the limit, not at it', l2.accounts_over_free_limit === l0.accounts_over_free_limit + 1 && l2.accounts_at_free_limit === l0.accounts_at_free_limit);

// ------------------------------------------------------------------ 6. paid members

const pay = new Person('payer', '10.60.6.1');
await signUpWith(pay, `payer-${stamp}@example.com`);
const q0 = await metrics();
const sub = (plan, provider, status, ext, end) =>
  sql(`insert into qurtag.subscriptions (provider, external_id, user_id, household_id, plan, billing_interval, status, current_period_end, last_event_at)
       values ($1, $2, $3, $4, $5, 'year', $6, now() + $7::interval, now())`, [provider, ext, pay.id, pay.household, plan, status, end]);
await sub('plus', 'stripe', 'active', `sub_${stamp}_a`, '200 days');
await sub('family', 'apple', 'canceling', `tx_${stamp}_b`, '100 days');
await sub('plus', 'stripe', 'expired', `sub_${stamp}_c`, '-10 days');
await sub('family', 'stripe', 'active', `sub_${stamp}_d`, '-30 days');
const q1 = await metrics();
check('active Plus on Stripe is counted', q1.paid_plus_stripe === q0.paid_plus_stripe + 1);
check('Family on Apple that renews no more but has not ended is counted', q1.paid_family_apple === q0.paid_family_apple + 1);
check('expired and lapsed subscriptions are not counted', q1.paid_family_stripe === q0.paid_family_stripe && q1.paid_plus_apple === q0.paid_plus_apple && q1.paid_members_total === q0.paid_members_total + 2);

// ------------------------------------------------------------------ 7. alerts on

const phone = new Person('iphone owner', '10.60.7.1');
const phone2 = new Person('another iphone owner', '10.60.7.2');
await signUpWith(phone, `phone-${stamp}@example.com`);
await signUpWith(phone2, `phone2-${stamp}@example.com`);
const a0 = await metrics();
check('the web platform is recorded without making an iPhone account', !(await phone.db.rpc('record_app_platform', { p_platform: 'web' })).error && (await metrics()).iphone_accounts_total === a0.iphone_accounts_total);
check('a made-up platform is ignored', !(await phone.db.rpc('record_app_platform', { p_platform: 'toaster' })).error && (await sql(`select count(*)::int as n from qurtag.app_platforms where platform not in ('ios','web')`)).rows[0].n === 0);
await phone.db.rpc('record_app_platform', { p_platform: 'ios' });
await phone2.db.rpc('record_app_platform', { p_platform: 'ios' });
await phone.db.rpc('record_app_platform', { p_platform: 'ios' });
const a1 = await metrics();
check('two iPhone accounts are counted once each', a1.iphone_accounts_total === a0.iphone_accounts_total + 2, `${a0.iphone_accounts_total} -> ${a1.iphone_accounts_total}`);
check('none has alerts on yet', a1.push_enabled_accounts === a0.push_enabled_accounts);
await sql(`insert into qurtag.push_devices (user_id, token, environment) values ($1, $2, 'sandbox')`, [phone.id, 'ab'.repeat(32)]);
const a2 = await metrics();
check('an account with a push device counts as alerts on', a2.push_enabled_accounts === a0.push_enabled_accounts + 1);
check('the opt-in rate is alerts on over iPhone accounts', Math.abs(a2.push_opt_in_rate - a2.push_enabled_accounts / a2.iphone_accounts_total) < 0.0001, String(a2.push_opt_in_rate));
await sql(`insert into qurtag.push_devices (user_id, token, environment) select id, $1, 'production' from qurtag.auth_users where email = $2`, ['cd'.repeat(32), `ch-none-${stamp}@example.com`]);
const a3 = await metrics();
check('a push device with no platform record still counts as an iPhone account (so the rate never passes 100%)', a3.iphone_accounts_total === a2.iphone_accounts_total + 1 && a3.push_opt_in_rate <= 1);

// ------------------------------------------------------------------ 8. nobody can read the new tables

const NEW_TABLES = ['tag_print_events', 'app_platforms'];
for (const t of NEW_TABLES) {
  const rls = (await sql(`select relrowsecurity from pg_class where oid = to_regclass('qurtag.${t}')`)).rows[0];
  check(`${t} has row security`, rls?.relrowsecurity === true);
  const noPolicy = (await sql(`select count(*)::int as n from pg_policies where schemaname = 'qurtag' and tablename = $1`, [t])).rows[0].n;
  check(`${t} has no policy for anyone`, noPolicy === 0);
  const anon = await new Person('visitor', '10.60.8.1').req(`/api/data/${t}?select=*`, { headers: { authorization: '' } });
  check(`${t}: a visitor with no pass gets nothing`, anon.status === 401, `${anon.status}`);
  const owner = await fb.req(`/api/data/${t}?select=*`);
  check(`${t}: a signed-in owner cannot read it through the data API`, owner.status >= 400 && !Array.isArray(owner.json), `${owner.status}`);
  for (const [who, client, role] of [['the visitor role', dataDb, 'qurtag_anon'], ['the owner role', dataDb, 'qurtag_user']]) {
    let denied = false;
    await client.query('begin');
    try {
      await client.query(`set local role ${role}`);
      await client.query(`select * from qurtag.${t}`);
    } catch (e) {
      denied = /permission denied/.test(e.message);
    }
    await client.query('rollback');
    check(`${t}: ${who} is denied`, denied);
  }
  let serverDenied = false;
  try {
    await serverDb.query(`select * from qurtag.${t}`);
  } catch (e) {
    serverDenied = /permission denied/.test(e.message);
  }
  check(`${t}: the server login is denied`, serverDenied);
}
for (const col of ['returned_at']) {
  const readable = (await sql(`select has_column_privilege('qurtag_user', 'qurtag.threads', $1, 'SELECT') or has_column_privilege('qurtag_anon', 'qurtag.threads', $1, 'SELECT') as r`, [col])).rows[0].r;
  check(`threads.${col} is readable by no request role`, readable === false);
}
const funcs = (await sql(`select has_function_privilege('qurtag_anon', 'qurtag.record_tag_print(text,text,text,text,text)', 'EXECUTE') or has_function_privilege('qurtag_anon', 'qurtag.record_app_platform(text)', 'EXECUTE') or has_function_privilege('qurtag_anon', 'qurtag.measure_paid(text,text)', 'EXECUTE') or has_function_privilege('qurtag_user', 'qurtag.measure_signups_by_channel(integer)', 'EXECUTE') as r`)).rows[0].r;
check('no visitor can call a measure function, and the owner only the two recorders', funcs === false);
const factoryAnon = await new Person('anon', '10.60.8.2').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: 'wrong' }, headers: { authorization: '' } });
check('the counts still refuse a wrong token', factoryAnon.status === 401 || factoryAnon.status === 403, `${factoryAnon.status}`);

await admin.end();
await dataDb.end();
await serverDb.end();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
