#!/usr/bin/env node
/**
 * End-to-end test of iPhone push notifications, after the other tests, on the same throwaway
 * Postgres (run through run-local.sh, which applies db/push.sql and starts a copy of the server
 * functions with a made-up Apple signing key, email captured to a file, and Apple's address
 * pointed at the stand-in server this file runs). Nothing here reaches Apple.
 *
 * It follows the loop as people do it:
 *   - an owner registers a phone; a finder's first note sends "Someone found your <item>", the
 *     next sends "New note about your <item>", each time-sensitive, each with Reply, each with the
 *     unread count as the badge, and neither carrying the finder's token;
 *   - "Hide note text on the lock screen" sends only "You have a new note";
 *   - a reply typed in the notification posts to the conversation as the owner, nobody else's;
 *   - the email copy goes out only for a note still unread 10 minutes later, once, and not when
 *     the owner turned it off or read the note;
 *   - a scan alerts only a person who asked for it, only if no note followed, once an hour;
 *   - every member of a Family household is alerted, each by their own settings;
 *   - a token Apple calls gone is deleted, a sandbox token is never sent to the production server,
 *     a failed try is retried without alerting anyone twice;
 *   - no login the app uses can read a token, and signing out or deleting the account removes it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';
import pg from 'pg';
import { Person } from './people.mjs';

const PUSH = process.env.QURTAG_TEST_PUSH_BASE;
const MAIN = process.env.QURTAG_TEST_BASE;
const MAIL_FILE = process.env.QURTAG_TEST_MAIL_FILE;
const CRON = process.env.CRON_SECRET;
const KEY_ID = process.env.QURTAG_TEST_APNS_KEY_ID;
const PUB = crypto.createPublicKey(fs.readFileSync(process.env.QURTAG_TEST_APNS_PUB, 'utf8'));
const RC_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH;

let passed = 0;
const failures = [];
let dumped = false;
async function dumpState() {
  if (dumped) return;
  dumped = true;
  const { rows } = await sql(`select id, kind, attempts, left(last_error, 60) as err, sent_at is not null as done, next_attempt_at > now() as later from qurtag.outbox order by id desc limit 12`);
  console.log('   outbox (newest first):', JSON.stringify(rows));
  const al = await sql(`select left(m.body, 20) as body, a.push_sent, a.emailed_at is not null as emailed from qurtag.note_alerts a join qurtag.messages m on m.id = a.message_id order by m.created_at`);
  console.log('   note_alerts:', JSON.stringify(al), 'mails:', mails().map((m) => `${m.to}:${m.kind}`).join(','));
  console.log('   apple so far:', JSON.stringify(apple.map((r) => `${r.token.slice(0, 2)}:${r.payload.aps.alert.title}`)));
}
function check(name, ok, detail = '') {
  if (ok) passed++;
  else {
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
    void dumpState();
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
}

const admin = new pg.Client({ connectionString: process.env.QURTAG_TEST_ADMIN_DB });
await admin.connect();
const sql = (text, values) => admin.query(text, values);

// ------------------------------------------------------------------ Apple, as a stand-in

const apple = [];
const answers = new Map(); // device token -> { status, reason }
const mock = http2.createServer();
mock.on('stream', (stream, headers) => {
  let body = '';
  stream.on('data', (c) => (body += c));
  stream.on('end', () => {
    const token = String(headers[':path']).split('/').pop();
    apple.push({ token, headers, payload: JSON.parse(body || '{}'), raw: body });
    const a = answers.get(token) ?? { status: 200 };
    stream.respond({ ':status': a.status, 'content-type': 'application/json' });
    stream.end(a.reason ? JSON.stringify({ reason: a.reason }) : '');
  });
});
await new Promise((r) => mock.listen(Number(process.env.QURTAG_TEST_APNS_PORT), '127.0.0.1', r));

const hex = (c) => c.repeat(64);
const to = (token) => apple.filter((r) => r.token === token);

// ------------------------------------------------------------------ helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs the outbox on the push copy of the server, as the scheduler would. */
async function drain(base = PUSH) {
  const r = await fetch(`${base}/api/jobs/outbox`, { method: 'POST', headers: { authorization: `Bearer ${CRON}`, 'content-type': 'application/json' }, body: '{}' });
  const out = (await r.json()).outbox;
  if (process.env.QURTAG_TEST_DEBUG) console.log('   drain', base === PUSH ? 'push' : 'main', JSON.stringify(out), `apple=${apple.length}`);
  return out;
}

/** Makes everything waiting due now (the email copy and the scan alert wait minutes). */
const makeDue = () => sql(`update qurtag.outbox set next_attempt_at = now() where sent_at is null`);

/**
 * Waits for the nudge the finder route sends after a note (or does its work), until every note's
 * alert is either finished or waiting for a retry.
 */
async function settle() {
  await sleep(300);
  for (let i = 0; i < 60; i++) {
    const { rows } = await sql(`select attempts, last_error from qurtag.outbox where kind = 'finder_message' and sent_at is null`);
    if (process.env.QURTAG_TEST_DEBUG) console.log('   settle', JSON.stringify(rows));
    if (rows.every((r) => r.last_error !== null)) return;
    if (rows.some((r) => r.attempts === 0)) await drain();
    await sleep(100);
  }
}

const mails = () => (fs.existsSync(MAIL_FILE) ? fs.readFileSync(MAIL_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const mailsTo = (email) => mails().filter((m) => m.to === email && m.kind === 'finder-message');

/**
 * The push copy of the server has email set up (captured to a file), so a new account there must
 * confirm its email first. Accounts are made on the main copy, which confirms at once, and then
 * sign in on this one, so their pass is issued, and checked, by the copy they talk to.
 */
async function signUp(p, email, name) {
  const home = p.base;
  p.base = MAIN;
  await p.signUp(email, name);
  p.base = home;
  if (home !== MAIN) {
    p.cookie = '';
    p.pass = null;
    const r = await p.req('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'correct horse battery' }, headers: { authorization: '' } });
    if (r.status !== 200) throw new Error(`${p.label}: sign-in answered ${r.status}`);
    await p.getPass();
  }
  const { rows } = await sql(`select u.id, h.id as household from qurtag.auth_users u join qurtag.households h on h.owner_user_id = u.id where u.email = $1`, [email.toLowerCase()]);
  p.id = rows[0]?.id;
  p.household = rows[0]?.household;
  if (!p.id || !p.pass) throw new Error(`${p.label}: sign-up failed`);
}

async function newItem(p, name) {
  const r = await p.db.rpc('create_item', { p_name: name });
  if (r.error) throw new Error(`create_item: ${JSON.stringify(r.error)}`);
  return r.data; // { item_id, tag_id, public_id }
}

const register = (p, token, environment = 'production') => p.post('/api/fn/push-register', { token, environment });
const settingsOf = async (p) => (await p.db.rpc('my_push_settings')).data;
const setSettings = (p, s) => p.db.rpc('set_push_settings', s);
const unread = async (p) => ((await p.db.from('messages').select('id', { count: 'exact', head: true }).eq('sender_kind', 'finder').is('read_by_owner_at', null)).count ?? 0);
const threadOf = async (publicId) => (await sql(`select th.id from qurtag.threads th join qurtag.tags t on t.id = th.tag_id where t.public_id = $1 order by th.created_at desc limit 1`, [publicId])).rows[0]?.id;
const devicesOf = async (userId) => (await sql(`select token, environment from qurtag.push_devices where user_id = $1 order by created_at`, [userId])).rows;
const alertedBody = (r) => JSON.stringify(r.payload);

// Each pretend finder has its own network address, so the per-address limits do not mix them up.
let finderIp = 0;
const finder = (base = PUSH) => new Person('finder', `10.8.${Math.floor(++finderIp / 200)}.${finderIp % 200}`, base);

function verifiedBearer(headers) {
  const [scheme, jwt] = String(headers.authorization).split(' ');
  const [h, c, s] = jwt.split('.');
  const head = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  const ok = scheme === 'bearer' && crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: PUB, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return { ok, head, claims };
}

// The earlier tests used the main copy of the server, whose finder route may still owe the outbox a
// nudge (it waits up to 5 seconds between nudges). That nudge would run this test's work on a copy
// with no Apple key. Let it go by first.
await sleep(6000);

// ------------------------------------------------------------------ 1. the first note and the next

const olive = new Person('olive (owner)', '10.8.250.1', PUSH);
await signUp(olive, 'push.olive@example.com', 'Olive Owner');
const bottle = await newItem(olive, 'Blue bottle');
const D1 = hex('a');

{
  check('settings start as: found on, new message on, scan off, hide off, email copy on',
    JSON.stringify(await settingsOf(olive)) === JSON.stringify({ found_on: true, message_on: true, scan_on: false, hide_text: false, email_copy: true }), JSON.stringify(await settingsOf(olive)));

  check('registering needs a signed-in person', (await new Person('anon', '10.8.250.9', PUSH).post('/api/fn/push-register', { token: D1, environment: 'production' })).status === 401);
  check('registering refuses a token that is not hex', (await register(olive, 'not-a-token')).status === 400);
  check('registering refuses an unknown environment', (await register(olive, D1, 'staging')).status === 400);
  const reg = await register(olive, D1);
  check('a signed-in phone registers its token', reg.status === 200 && reg.json?.ok === true && !reg.text.includes(D1));
  check('the token is stored for the account, as production', JSON.stringify(await devicesOf(olive.id)) === JSON.stringify([{ token: D1, environment: 'production' }]));
  await register(olive, D1);
  check('registering the same token again keeps one row', (await devicesOf(olive.id)).length === 1);

  const f = finder();
  const first = await f.send(bottle.public_id, null, 'I found your bottle at the park, token=secret-ish');
  check('the finder\'s first note is accepted', first.status === 200 && !!first.json?.token);
  await settle();
  const sent = to(D1);
  check('the first note sends exactly one alert to the phone', sent.length === 1, `${sent.length}`);
  const a = sent[0];
  const thread = await threadOf(bottle.public_id);
  check('the alert is "Someone found your <item>" with the note', a?.payload.aps.alert.title === 'Someone found your Blue bottle' && a.payload.aps.alert.body.startsWith('I found your bottle'), JSON.stringify(a?.payload.aps.alert));
  check('found is time-sensitive, with the Reply category, the thread id and a badge of 1',
    a?.payload.aps['interruption-level'] === 'time-sensitive' && a.payload.aps.category === 'QURTAG_FOUND' && a.payload.aps['thread-id'] === thread && a.payload.thread === thread && a.payload.aps.badge === 1 && a.payload.aps.sound === 'default');
  check('the request is to Apple\'s device path, priority 10, alert type, with the app\'s topic',
    a?.headers[':path'] === `/3/device/${D1}` && a.headers['apns-priority'] === '10' && a.headers['apns-push-type'] === 'alert' && a.headers['apns-topic'] === 'app.impactconsultingai.qurtag');
  const jwt = verifiedBearer(a.headers);
  check('the request is signed with the key: ES256, key id, team id', jwt.ok && jwt.head.alg === 'ES256' && jwt.head.kid === KEY_ID && jwt.claims.iss === 'CQUVU6BHHA');
  check('the payload never carries the finder\'s token', !a.raw.includes(first.json.token));
  check('the payload keys are only aps and thread', JSON.stringify(Object.keys(a.payload).sort()) === JSON.stringify(['aps', 'thread']));
  const msg = (await sql(`select id from qurtag.messages where thread_id = $1 and sender_kind = 'finder' order by created_at limit 1`, [thread])).rows[0];
  check('the message id is the collapse id, so a repeat replaces the first', a?.headers['apns-collapse-id'] === msg.id);
  check('an owner with a phone is not emailed at once', mailsTo('push.olive@example.com').length === 0);

  const second = await f.send(bottle.public_id, first.json.token, 'Are you still there?');
  check('the finder\'s second note is accepted', second.status === 200);
  await settle();
  const b = to(D1)[1];
  check('the second note sends one more alert: "New note about your <item>"', to(D1).length === 2 && b?.payload.aps.alert.title === 'New note about your Blue bottle' && b.payload.aps.alert.body === 'Are you still there?', JSON.stringify(b?.payload.aps.alert));
  check('a new message is time-sensitive with the message category and a badge of 2', b?.payload.aps['interruption-level'] === 'time-sensitive' && b.payload.aps.category === 'QURTAG_MESSAGE' && b.payload.aps.badge === 2);
  check('the badge matches what the app counts as unread', (await unread(olive)) === 2);

  // ---------------------------------------------------------------- hide the text
  check('hiding the note text is a saved setting', (await setSettings(olive, { p_hide_text: true })).data?.hide_text === true && (await settingsOf(olive)).found_on === true);
  const third = await f.send(bottle.public_id, first.json.token, 'Please call me on 555-0100');
  check('the third note is accepted', third.status === 200);
  await settle();
  const c = to(D1)[2];
  check('with the text hidden the alert says only "You have a new note"', c && JSON.stringify(c.payload.aps.alert) === JSON.stringify({ title: 'You have a new note' }), JSON.stringify(c?.payload.aps.alert));
  check('the hidden alert carries no item name and no note anywhere', c && !c.raw.includes('Blue bottle') && !c.raw.includes('555-0100'));
  check('the hidden alert is still time-sensitive, threaded and able to Reply', c?.payload.aps['interruption-level'] === 'time-sensitive' && c.payload.aps.category === 'QURTAG_MESSAGE' && c.payload.aps['thread-id'] === thread);
  await setSettings(olive, { p_hide_text: false });

  // ---------------------------------------------------------------- the email copy
  const copiesBefore = mailsTo('push.olive@example.com').length;
  await drain();
  check('the email copy is not sent before 10 minutes are up', mailsTo('push.olive@example.com').length === copiesBefore);
  const dueRows = (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'push_email' and sent_at is null and next_attempt_at > now() + interval '9 minutes'`)).rows[0].n;
  check('each note queued its email copy 10 minutes ahead', dueRows >= 3, `${dueRows}`);
  await makeDue();
  const run = await drain();
  const copies = mailsTo('push.olive@example.com');
  check('after 10 minutes an unread conversation gets one email copy, not one per note', copies.length === copiesBefore + 1 && run.emailed === 1, `${copies.length} ${JSON.stringify(run)}`);
  check('the copy says nothing about the finder and holds no note', copies.at(-1) && !copies.at(-1).text.includes('555-0100') && /Blue bottle/.test(copies.at(-1).subject));
  await makeDue();
  await drain();
  check('the copy is never sent twice', mailsTo('push.olive@example.com').length === copiesBefore + 1);

  // ---------------------------------------------------------------- reading it cancels the copy, and the switch turns it off
  const f2 = finder();
  const n1 = await f2.send(bottle.public_id, null, 'Second finder, hello');
  await settle();
  const th2 = await threadOf(bottle.public_id);
  await olive.db.rpc('mark_thread_read', { p_thread_id: th2 });
  await makeDue();
  const mailsNow = mailsTo('push.olive@example.com').length;
  await drain();
  check('a note the owner read in time gets no email copy', n1.status === 200 && mailsTo('push.olive@example.com').length === mailsNow);

  await setSettings(olive, { p_email_copy: false });
  const f3 = finder();
  await f3.send(bottle.public_id, null, 'Third finder, hello');
  await settle();
  await makeDue();
  await drain();
  check('with the email copy switched off, no copy is sent', mailsTo('push.olive@example.com').length === mailsNow);
  await setSettings(olive, { p_email_copy: true });
  await olive.db.rpc('mark_thread_read', { p_thread_id: await threadOf(bottle.public_id) });
  await olive.db.rpc('mark_thread_read', { p_thread_id: thread });
  await olive.db.rpc('mark_thread_read', { p_thread_id: th2 });
}

// ------------------------------------------------------------------ 2. reply from the notification

{
  const thread = await threadOf(bottle.public_id);
  const bad = await olive.post('/api/fn/push-reply', { thread, body: '   ' });
  check('an empty reply is refused', bad.status === 400);
  const noAuth = await new Person('anon', '10.8.250.8', PUSH).post('/api/fn/push-reply', { thread, body: 'hello' });
  check('a reply needs a signed-in person', noAuth.status === 401);
  const forged = await new Person('forger', '10.8.250.7', PUSH).req('/api/fn/push-reply', { method: 'POST', body: { thread, body: 'hello' }, headers: { authorization: 'Bearer eyJhbGciOiJFUzI1NiJ9.e30.AAAA' } });
  check('a forged pass cannot reply', forged.status === 401);

  const stranger = new Person('stranger', '10.8.250.6', PUSH);
  await signUp(stranger, 'push.stranger@example.com', 'Stranger');
  const theft = await stranger.post('/api/fn/push-reply', { thread, body: 'I am not the owner' });
  check('another account cannot reply into this conversation', theft.status === 404 && (await sql(`select count(*)::int as n from qurtag.messages where body = 'I am not the owner'`)).rows[0].n === 0, `${theft.status}`);

  const before = await unread(olive);
  const f = finder();
  const note = await f.send(bottle.public_id, null, 'Anyone there? Reply test');
  await settle();
  const th = await threadOf(bottle.public_id);
  const r = await olive.post('/api/fn/push-reply', { thread: th, body: 'Yes! Thank you. I can meet you at 5.' });
  check('the reply from the notification posts and answers the unread count', r.status === 200 && r.json?.ok === true && typeof r.json.unread === 'number', JSON.stringify(r.json));
  const row = (await sql(`select sender_kind, body from qurtag.messages where thread_id = $1 order by created_at desc, id limit 1`, [th])).rows[0];
  check('it is stored as the owner\'s message in that conversation', row?.sender_kind === 'owner' && row.body === 'Yes! Thank you. I can meet you at 5.');
  check('it marks that conversation\'s notes read', (await unread(olive)) === before && r.json.unread === before, `${await unread(olive)} ${before} ${r.json?.unread}`);
  const seen = await f.view(bottle.public_id, note.json.token);
  check('the finder reads the reply on the tag page', seen.json?.thread?.messages?.some((m) => m.sender_kind === 'owner' && m.body.startsWith('Yes! Thank you')));
  const mailBase = mailsTo('push.olive@example.com').length;
  await makeDue();
  await drain();
  check('a replied conversation gets no email copy', mailsTo('push.olive@example.com').length === mailBase);
}

// ------------------------------------------------------------------ 3. a scan

{
  const violin = await newItem(olive, 'Violin case');
  const f = finder();
  await f.view(violin.public_id, null, true);
  check('with scan alerts off (the default) a scan queues nothing', (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'push_scan'`)).rows[0].n === 0);

  const set = await setSettings(olive, { p_scan_on: true });
  check('scan alerts are a setting', set.data?.scan_on === true);
  const countBefore = apple.length;
  await f.view(violin.public_id, null, true);
  const row = (await sql(`select next_attempt_at > now() + interval '90 seconds' as waits from qurtag.outbox where kind = 'push_scan'`)).rows[0];
  check('a scan alert waits 2 minutes, to see whether a note follows', row?.waits === true);
  await drain();
  check('nothing is sent before then', apple.length === countBefore);
  await makeDue();
  await drain();
  const s = apple.slice(countBefore);
  check('after that the owner is told "Your tag was scanned"', s.length === 1 && s[0].payload.aps.alert.title === 'Your tag was scanned', JSON.stringify(s.map((x) => x.payload.aps.alert)));
  check('a scan alert is not time-sensitive and offers no Reply', s[0] && s[0].payload.aps['interruption-level'] === undefined && s[0].payload.aps.category === undefined && s[0].payload.thread === undefined);

  const again = apple.length;
  await f.view(violin.public_id, null, true);
  await makeDue();
  await drain();
  check('a second scan within the hour sends nothing', apple.length === again);
  await sql(`update qurtag.push_scan_marks set notified_at = now() - interval '2 hours'`);
  await f.view(violin.public_id, null, true);
  await makeDue();
  await drain();
  check('an hour later the next scan alerts again', apple.length === again + 1);

  // A scan followed by a note is not announced as "scanned".
  await sql(`update qurtag.push_scan_marks set notified_at = now() - interval '2 hours'`);
  const g = finder();
  await g.view(violin.public_id, null, true);
  await g.send(violin.public_id, null, 'Found it, writing now');
  await settle();
  const afterNote = apple.length;
  await makeDue();
  await drain();
  const scanTitles = apple.slice(afterNote).filter((x) => x.payload.aps.alert.title === 'Your tag was scanned');
  check('a scan followed by a note sends no "scanned" alert', scanTitles.length === 0);
  check('...the note itself alerted as found', apple.slice(again + 1).some((x) => x.payload.aps.alert.title === 'Someone found your Violin case'));

  // A finder coming back with their conversation token is not a scan (the page sends scan=false then).
  await setSettings(olive, { p_scan_on: false });
  const quiet = (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'push_scan' and sent_at is null`)).rows[0].n;
  await finder().view(violin.public_id, null, true);
  check('turning scan alerts off stops new scan work', (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'push_scan' and sent_at is null`)).rows[0].n === quiet);
  await olive.db.rpc('mark_thread_read', { p_thread_id: await threadOf(violin.public_id) });
}

// ------------------------------------------------------------------ 4. a Family household: everyone, each by their own settings

{
  const fay = new Person('fay (family owner)', '10.8.251.1', PUSH);
  const gil = new Person('gil (member)', '10.8.251.2', PUSH);
  await signUp(fay, 'push.fay@example.com', 'Fay Family');
  await signUp(gil, 'push.gil@example.com', 'Gil Member');
  const rc = await fetch(`${MAIN}/api/fn/revenuecat-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: RC_AUTH },
    body: JSON.stringify({ api_version: '1.0', event: { id: `rc_push_${Date.now()}`, type: 'INITIAL_PURCHASE', app_user_id: fay.id, original_app_user_id: fay.id, aliases: [fay.id], product_id: 'app.impactconsultingai.qurtag.family.monthly', store: 'APP_STORE', environment: 'SANDBOX', original_transaction_id: '7100000000001', transaction_id: '7100000000001', expiration_at_ms: Date.now() + 30 * 86400_000, event_timestamp_ms: Date.now() } }),
  });
  check('Fay is on the Family plan', rc.status === 200 && (await fay.db.rpc('my_membership')).data?.plan === 'family');
  const kayak = await newItem(fay, 'Family kayak');
  const inv = await fay.post('/api/fn/family-invite', { email: 'push.gil@example.com' });
  const join = await gil.db.rpc('accept_invite', { p_token: inv.json.link.split('/join/')[1] });
  check('Gil joins the family', !join.error && join.data?.household_id === fay.household, JSON.stringify(join.error ?? join.data));

  const FAY = hex('b');
  const GIL = hex('c');
  const GIL_GONE = hex('d');
  await register(fay, FAY);
  await register(gil, GIL);
  await setSettings(gil, { p_hide_text: true });

  const f = finder();
  const first = await f.send(kayak.public_id, null, 'The kayak is on the dock');
  await settle();
  check('every member of the household is alerted for the first note', to(FAY).length === 1 && to(GIL).length === 1, `${to(FAY).length} ${to(GIL).length}`);
  check('Fay\'s alert shows the item; Gil\'s, by his own setting, is hidden',
    to(FAY)[0]?.payload.aps.alert.title === 'Someone found your Family kayak' && JSON.stringify(to(GIL)[0]?.payload.aps.alert) === JSON.stringify({ title: 'You have a new note' }));
  check('each alert has the same conversation id', to(FAY)[0].payload.thread === to(GIL)[0].payload.thread && !!to(FAY)[0].payload.thread);
  check('the badge is each person\'s own count', to(FAY)[0].payload.aps.badge === 1 && to(GIL)[0].payload.aps.badge === 1);

  await setSettings(gil, { p_message_on: false });
  await f.send(kayak.public_id, first.json.token, 'Second note');
  await settle();
  check('a member who switched new-message alerts off is not alerted for later notes', to(FAY).length === 2 && to(GIL).length === 1);
  check('...and, having a phone and the alert off, is not emailed either', mailsTo('push.gil@example.com').length === 0);

  // A member who is removed from the family stops being alerted.
  const out = await fay.db.rpc('remove_member', { p_user: gil.id });
  check('Fay removes Gil', !out.error);
  await f.send(kayak.public_id, first.json.token, 'Third note');
  await settle();
  check('a removed member gets no more alerts about the family\'s items', to(FAY).length === 3 && to(GIL).length === 1);
  await fay.db.rpc('mark_thread_read', { p_thread_id: await threadOf(kayak.public_id) });

  // ---------------------------------------------------------------- 5. gone tokens, sandbox tokens, retries
  const hank = new Person('hank (owner)', '10.8.252.1', PUSH);
  await signUp(hank, 'push.hank@example.com', 'Hank Owner');
  const sled = await newItem(hank, 'Red sled');
  const HG = hex('e');
  const HOK = hex('f');
  const HSAND = hex('1');
  const HBAD = hex('2');
  await register(hank, HG);
  await register(hank, HOK);
  await register(hank, HSAND, 'sandbox');
  await register(hank, HBAD);
  answers.set(HG, { status: 410, reason: 'Unregistered' });
  answers.set(HBAD, { status: 400, reason: 'BadDeviceToken' });
  await finder().send(sled.public_id, null, 'Found a sled');
  await settle();
  const left = (await devicesOf(hank.id)).map((d) => d.token);
  check('a token Apple calls gone (410) is deleted', !left.includes(HG));
  check('a token Apple calls bad (400 BadDeviceToken) is deleted', !left.includes(HBAD));
  check('a working token is kept and alerted', left.includes(HOK) && to(HOK).length === 1);
  check('a sandbox token is not sent to the production server, and not deleted for it', to(HSAND).length === 0 && left.includes(HSAND));
  check('the pruned tokens are no longer sent to', to(HG).length === 1 && to(HBAD).length === 1);

  // A try that fails for a passing reason is repeated, and nobody is alerted twice.
  const ivy = new Person('ivy (owner)', '10.8.252.2', PUSH);
  await signUp(ivy, 'push.ivy@example.com', 'Ivy Owner');
  const kite = await newItem(ivy, 'Red kite');
  const IV = hex('3');
  await register(ivy, IV);
  answers.set(IV, { status: 503, reason: 'ServiceUnavailable' });
  await finder().send(kite.public_id, null, 'Found a kite');
  await settle();
  const failedRow = (await sql(`select attempts, last_error, sent_at from qurtag.outbox o join qurtag.messages m on m.id = o.ref join qurtag.threads t on t.id = m.thread_id join qurtag.tags tg on tg.id = t.tag_id where o.kind = 'finder_message' and tg.public_id = $1`, [kite.public_id])).rows[0];
  check('an alert Apple could not take is kept for another try', failedRow?.sent_at === null && /tried again/.test(failedRow?.last_error ?? ''), JSON.stringify(failedRow));
  check('the token is kept when the failure may pass', (await devicesOf(ivy.id)).length === 1);
  check('...and no email went out meanwhile', mailsTo('push.ivy@example.com').length === 0);
  answers.delete(IV);
  await makeDue();
  await drain();
  check('the retry delivers the alert', to(IV).filter((r) => r.headers[':path'].endsWith(IV)).some((r) => r.payload.aps.alert.title === 'Someone found your Red kite'));
  const sentAfter = to(IV).length;
  await makeDue();
  await drain();
  check('a finished alert is not sent again', to(IV).length === sentAfter);

  // A phone that Apple refuses leaves the person with the email at once.
  const jo = new Person('jo (owner)', '10.8.252.3', PUSH);
  await signUp(jo, 'push.jo@example.com', 'Jo Owner');
  const drum = await newItem(jo, 'Snare drum');
  const JG = hex('4');
  await register(jo, JG);
  answers.set(JG, { status: 410, reason: 'Unregistered' });
  await finder().send(drum.public_id, null, 'Found a drum');
  await settle();
  check('when Apple says the only phone is gone, the owner is emailed at once instead', mailsTo('push.jo@example.com').length === 1 && (await devicesOf(jo.id)).length === 0);

  // ---------------------------------------------------------------- 6. nobody can read a token
  const dataDb = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_DATA });
  const serverDb = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_SERVER });
  await dataDb.connect();
  await serverDb.connect();
  for (const t of ['push_devices', 'push_settings', 'note_alerts', 'push_scan_marks']) {
    let denied = 0;
    for (const c of [serverDb]) {
      try {
        await c.query(`select * from qurtag.${t} limit 1`);
      } catch (e) {
        if (e.code === '42501') denied++;
      }
    }
    check(`the server login has no right on ${t}`, denied === 1);
  }
  const viaApi = await hank.req('/api/data/push_devices?select=*');
  check('the data API does not serve the devices table', viaApi.status >= 400 && !viaApi.text.includes(HOK), `${viaApi.status}`);
  const viaRpc = await hank.req('/api/data/rpc/server_note_recipients', { method: 'POST', body: {} });
  check('the data API cannot call the server functions that list tokens', viaRpc.status >= 400 && !viaRpc.text.includes(HOK), `${viaRpc.status}`);
  let userCanRead = false;
  try {
    await dataDb.query('select qurtag.server_note_recipients(null)');
    userCanRead = true;
  } catch {
    /* denied, as it should be */
  }
  check('the data login cannot call the function that lists tokens', userCanRead === false);
  await dataDb.end();
  await serverDb.end();
  const leak = JSON.stringify((await hank.db.rpc('my_push_settings')).data);
  check('nothing the app can ask for contains a device token', !leak.includes(HOK));

  // ---------------------------------------------------------------- 7. sign out and delete the account
  const other = await register(ivy, HOK);
  check('a token moves to whoever registers it on that phone', other.status === 200 && (await devicesOf(hank.id)).every((d) => d.token !== HOK) && (await devicesOf(ivy.id)).some((d) => d.token === HOK));
  const wrongUnreg = await hank.post('/api/fn/push-unregister', { token: HOK });
  check('signing out cannot remove someone else\'s token', wrongUnreg.status === 200 && (await devicesOf(ivy.id)).some((d) => d.token === HOK));
  const unreg = await ivy.post('/api/fn/push-unregister', { token: HOK });
  check('signing out forgets the phone\'s token', unreg.status === 200 && (await devicesOf(ivy.id)).every((d) => d.token !== HOK));
  await register(hank, HSAND, 'sandbox');
  const del = await hank.db.rpc('delete_my_account');
  check('deleting the account removes its tokens and settings', !del.error && (await devicesOf(hank.id)).length === 0 && (await sql(`select count(*)::int as n from qurtag.push_settings where user_id = $1`, [hank.id])).rows[0].n === 0, JSON.stringify(del.error));
}

// ------------------------------------------------------------------ 8. without Apple's key

await sleep(6000); // the push copy's own pending nudge, as above

{
  const kim = new Person('kim (owner)', '10.8.253.1', MAIN);
  await signUp(kim, 'push.kim@example.com', 'Kim Owner');
  const hat = await newItem(kim, 'Straw hat');
  const KT = hex('5');
  await register(kim, KT);
  const before = apple.length;
  await finder(MAIN).send(hat.public_id, null, 'Found your hat');
  await sleep(500);
  const run = await drain(MAIN);
  check('without the key the outbox still finishes and sends no alert', apple.length === before && (run === undefined || run.pushed === 0));
  const row = (await sql(`select o.sent_at from qurtag.outbox o join qurtag.messages m on m.id = o.ref join qurtag.threads t on t.id = m.thread_id join qurtag.tags tg on tg.id = t.tag_id where o.kind = 'finder_message' and tg.public_id = $1`, [hat.public_id])).rows[0];
  check('the note\'s outbox row is finished, not stuck', !!row?.sent_at);
}

// ------------------------------------------------------------------ 9. alerts to super admins (db/moderation.sql)

{
  const adminAlerts = () => apple.filter((r) => r.payload.aps.category === 'QURTAG_ADMIN');
  const adminMails = () => mails().filter((m) => m.kind === 'admin-report');
  const NOTE = 'SECRET-NOTE-TEXT you stupid faggot';
  const boss = new Person('bea (super admin)', '10.8.251.1', PUSH);
  await signUp(boss, 'push.bea@example.com', 'Bea Boss');
  await sql('insert into qurtag.super_admins (user_id) values ($1)', [boss.id]);
  const BT = hex('b');
  await register(boss, BT);
  const nia = new Person('nia (owner)', '10.8.251.2', PUSH);
  await signUp(nia, 'push.nia@example.com', 'Nia Owner');
  const NT = hex('c');
  await register(nia, NT);
  const coat = await newItem(nia, 'Wool coat');
  // Time passes: the last alert, and the events it covered, are now more than 10 minutes old.
  const windowEnds = async () => {
    await sql(`update qurtag.outbox set created_at = created_at - interval '12 minutes' where kind = 'admin_alert' and sent_at is not null`);
    await sql(`update qurtag.admin_alert_state set last_sent_at = now() - interval '11 minutes'`);
  };
  const reportNote = async (text) => {
    const f = finder();
    const tok = (await f.send(coat.public_id, null, text)).json?.token;
    const th = (await sql(`select th.id from qurtag.threads th where th.finder_token_sha256 = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [tok])).rows[0].id;
    const m = (await sql('select id from qurtag.messages where thread_id = $1', [th])).rows[0].id;
    return { th, m };
  };
  await sleep(1500);
  await drain(); // the notes' own alerts

  check('the admin alert setting is shown to a super admin, on by default', (await boss.db.rpc('my_admin_alerts')).data === true);
  check('and to nobody else', (await nia.db.rpc('my_admin_alerts')).data === null);
  check('a normal owner cannot change it', !!(await nia.db.rpc('set_admin_alerts', { p_on: false })).error);

  const first = await reportNote('Please stop writing to me about my coat');
  const r1 = await nia.db.rpc('report_message', { p_message: first.m, p_reason: 'harassment', p_comment: 'SECRET-COMMENT' });
  check('a report is accepted', !r1.error, JSON.stringify(r1.error));
  await drain();
  const a = adminAlerts();
  check('a report sends the super admin one push', a.length === 1 && a[0].token === BT, `${a.length}`);
  const p = a[0]?.payload;
  check('it says only that a report is waiting, with the Admin deep link and a time-sensitive level',
    p?.aps.alert.title === 'New report on QuR Tag' && p.aps.alert.body === 'Review it in Admin.' && p.aps.category === 'QURTAG_ADMIN'
    && p.aps['interruption-level'] === 'time-sensitive' && p.open === '/app/admin#reported-notes' && p.thread === undefined && p.aps['thread-id'] === undefined, JSON.stringify(p));
  check('the push carries no note text, comment or owner address', !/SECRET|stop writing|coat|nia|@/i.test(alertedBody(a[0])), alertedBody(a[0]));
  check('the owner who reported gets no admin push', to(NT).every((r) => r.payload.aps.category !== 'QURTAG_ADMIN'));
  const mail1 = adminMails();
  check('one email goes to info@impactconsulting.ai with a link to Admin and no note text',
    mail1.length === 1 && mail1[0].to === 'info@impactconsulting.ai' && /\/app\/admin/.test(mail1[0].text) && !/stop writing|SECRET|coat/i.test(JSON.stringify(mail1[0])), JSON.stringify(mail1));
  check('the alert row is finished', (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'admin_alert' and sent_at is null`)).rows[0].n === 0);

  // Bursts: three more reports and a held note within the window.
  const burst = [];
  for (let i = 0; i < 3; i++) burst.push(await reportNote(`burst note ${i}`));
  for (const b of burst) await nia.db.rpc('report_message', { p_message: b.m, p_reason: 'spam' });
  await reportNote(NOTE); // held by the filter
  const waiting = (await sql(`select count(*)::int as n, min(next_attempt_at) > now() + interval '8 minutes' as later from qurtag.outbox where kind = 'admin_alert' and sent_at is null`)).rows[0];
  check('events inside the 10 minute window are queued, due when it ends (the filter\'s held note too)', waiting.n === 4 && waiting.later === true, JSON.stringify(waiting));
  await drain();
  check('nothing more is sent inside the window', adminAlerts().length === 1 && adminMails().length === 1);

  // The window ends.
  await windowEnds();
  await sql(`update qurtag.outbox set next_attempt_at = now() where kind = 'admin_alert' and sent_at is null`);
  await drain();
  const b = adminAlerts();
  check('then one push says how many are waiting', b.length === 2 && b[1].payload.aps.alert.title === '4 new reports on QuR Tag' && b[1].payload.aps.alert.body === 'Review them in Admin.', JSON.stringify(b[1]?.payload.aps.alert));
  check('the second push also carries no note text', !/SECRET|burst|faggot/i.test(alertedBody(b[1])));
  check('and one email', adminMails().length === 2 && /4 new reports/.test(adminMails()[1].text));
  check('every queued alert row is finished, none dropped', (await sql(`select count(*)::int as n from qurtag.outbox where kind = 'admin_alert' and sent_at is null`)).rows[0].n === 0);

  // A failure puts the window back.
  answers.set(BT, { status: 500, reason: 'InternalServerError' });
  await windowEnds();
  const fail = await reportNote('another one');
  await nia.db.rpc('report_message', { p_message: fail.m, p_reason: 'other' });
  await sql(`update qurtag.outbox set next_attempt_at = now() where kind = 'admin_alert' and sent_at is null`);
  await drain();
  const afterFail = (await sql(`select a.last_sent_at < now() - interval '10 minutes' as reopened, (select count(*)::int from qurtag.outbox where kind = 'admin_alert' and sent_at is null) as open from qurtag.admin_alert_state a`)).rows[0];
  check('when Apple cannot be reached the alert is not lost: the window reopens and the row waits', afterFail.reopened === true && afterFail.open === 1, JSON.stringify(afterFail));
  answers.delete(BT);
  await sql(`update qurtag.outbox set next_attempt_at = now() where kind = 'admin_alert' and sent_at is null`);
  await drain();
  check('and it goes out on the next try', adminAlerts().length >= 4 && adminAlerts().at(-1).payload.aps.alert.title === 'New report on QuR Tag');

  // The switch.
  const off = await boss.db.rpc('set_admin_alerts', { p_on: false });
  check('a super admin can turn admin alerts off', off.data === false && (await boss.db.rpc('my_admin_alerts')).data === false);
  const sentBefore = adminAlerts().length;
  const mailsBefore = adminMails().length;
  await windowEnds();
  const quiet = await reportNote('quiet one');
  await nia.db.rpc('report_message', { p_message: quiet.m, p_reason: 'spam' });
  await sql(`update qurtag.outbox set next_attempt_at = now() where kind = 'admin_alert' and sent_at is null`);
  await drain();
  check('with the switch off no push goes to that admin, but the email still does', adminAlerts().length === sentBefore && adminMails().length === mailsBefore + 1);
  await boss.db.rpc('set_admin_alerts', { p_on: true });
  check('and it can be turned back on', (await boss.db.rpc('my_admin_alerts')).data === true);
  check('a report from a normal owner never alerts a normal owner', to(NT).every((r) => r.payload.aps.category !== 'QURTAG_ADMIN'));
}

mock.close();
await admin.end();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
process.exit(0);
