#!/usr/bin/env node
/**
 * End-to-end test of the finder loop (db/ux-fixes.sql, server/routes/finderLoop.ts), after the other
 * tests, on the same throwaway Postgres. It uses the copy of the server functions that captures email
 * to a file and runs its own outbox (the push copy in run-local.sh), so the finder's reply email can be
 * read back. Nothing is sent anywhere.
 *
 *   - a finder's first note gets a conversation code; the code opens the conversation from another
 *     network, a wrong code is refused and guessing is stopped;
 *   - the finder's optional email is stored only encrypted, for that conversation; it never appears in
 *     anything the owner, an admin or the finder's page can read (every answer is searched for it);
 *   - an owner reply sends the finder one email with the reply, a link back and a spam reminder, and
 *     replies close together wait for the same email (one per 10 minutes);
 *   - a note without an email works as before and nobody is emailed;
 *   - closing, a return (after its last email), a block, 30 days without a note and the unsubscribe
 *     link each delete the address; a blocked finder gets no notice;
 *   - a block refuses new conversations from the same network, and unblocking lifts it;
 *   - pausing an item stops new conversations but not existing ones;
 *   - a switched-off tag answers 'gone'; the finder sees when the owner read a note; a finder's new note
 *     brings an archived conversation back; an owner reply records who wrote it.
 */
import fs from 'node:fs';
import pg from 'pg';
import { Person } from './people.mjs';

const MAIN = process.env.QURTAG_TEST_BASE;
const BASE = process.env.QURTAG_TEST_PUSH_BASE;
const MAIL_FILE = process.env.QURTAG_TEST_MAIL_FILE;
const CRON = process.env.CRON_SECRET;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mails = () =>
  fs.existsSync(MAIL_FILE)
    ? fs.readFileSync(MAIL_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
const mailsTo = (to) => mails().filter((m) => m.to === to && m.kind === 'finder-reply');

async function drain() {
  const r = await fetch(`${BASE}/api/jobs/outbox`, { method: 'POST', headers: { authorization: `Bearer ${CRON}`, 'content-type': 'application/json' }, body: '{}' });
  return (await r.json()).outbox;
}
/** Waits for the nudge an owner reply sends (or drains), until no finder_reply row is due. */
async function settle() {
  // A row the nudge has taken is not due (taking it moves it 10 minutes on) until it is finished:
  // wait for those first, then run whatever is due.
  for (let i = 0; i < 40; i++) {
    const { rows } = await sql(`select count(*)::int as n from qurtag.outbox where sent_at is null and attempts > 0 and last_error is null and next_attempt_at > now() + interval '9 minutes' and kind <> 'finder_reply'
                                union all select count(*)::int from qurtag.outbox where kind = 'finder_reply' and sent_at is null and attempts > 0 and last_error is null`);
    if (rows.every((r) => r.n === 0)) break;
    await sleep(100);
  }
  for (let i = 0; i < 20; i++) {
    const { rows } = await sql(`select count(*)::int as n from qurtag.outbox where sent_at is null and next_attempt_at <= now() and attempts < 6`);
    if (rows[0].n === 0) return;
    await drain();
    await sleep(150);
  }
}

let ipN = 0;
const finder = () => new Person(`finder${++ipN}`, `10.77.0.${ipN}`, BASE);
const send = (f, tag, token, body) => f.send(tag, token, body);
const setEmail = (f, tag, token, email) => f.post('/api/fn/finder-email', { tag, token, email });
const emailRow = async (token) =>
  (await sql(`select finder_email_enc, finder_email_at from qurtag.threads where finder_token_sha256 = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [token])).rows[0];
const threadId = async (token) =>
  (await sql(`select id from qurtag.threads where finder_token_sha256 = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [token])).rows[0]?.id;

// ------------------------------------------------------------------ an owner and an item

// Made on the main copy (which confirms at once), then signed in on the copy that sends email, so its
// pass is issued and checked there and an owner reply nudges that copy's outbox.
const owner = new Person('loop-owner', '10.77.1.1', MAIN);
await owner.signUp(`loop-owner-${Date.now()}@example.test`, 'Dana Rivera');
owner.id = (await sql(`select "id" from qurtag.auth_users where "email" = $1`, [owner.email])).rows[0].id;
owner.base = BASE;
owner.cookie = '';
owner.pass = null;
const signedIn = await owner.req('/api/auth/sign-in/email', { method: 'POST', body: { email: owner.email, password: 'correct horse battery' }, headers: { authorization: '' } });
if (signedIn.status !== 200) throw new Error(`owner sign-in answered ${signedIn.status}`);
await owner.getPass();
const made = await owner.db.rpc('create_item', { p_name: 'Purple backpack', p_brand: null, p_color: 'Purple', p_photo: null, p_reward_text: null, p_notes: null });
const TAG = made.data?.public_id;
const ITEM = made.data?.item_id;
check('owner: an item and its tag', !!TAG && !!ITEM, JSON.stringify(made.error));

// ------------------------------------------------------------------ the conversation code

const f1 = finder();
const v0 = await f1.view(TAG, null, true);
check('finder page: the server says email can be offered', v0.status === 200 && v0.json?.emailAvailable === true, JSON.stringify(v0.json));
const s1 = await send(f1, TAG, null, 'I found your backpack at the library.');
const T1 = s1.json?.token;
const CODE = s1.json?.code;
check('first note: a token and a conversation code', s1.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(T1 ?? '') && /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/.test(CODE ?? ''), JSON.stringify(s1.json));

const elsewhere = finder();
const r1 = await elsewhere.post('/api/fn/finder-resume', { code: CODE.toLowerCase().replace(/-/g, ' ') });
check('the code, typed in any case with spaces, opens the same conversation on another network', r1.status === 200 && r1.json?.tag === TAG && r1.json?.token === T1, JSON.stringify(r1.json));
const r1v = await elsewhere.view(TAG, r1.json?.token, false);
check('...and reads it', r1v.status === 200 && r1v.json?.thread?.messages?.length === 1);
const wrong = await elsewhere.post('/api/fn/finder-resume', { code: 'AAAA-BBBB-2222' });
check('a wrong code is refused', wrong.status === 404);
const guesser = finder();
let last = 0;
for (let i = 0; i < 22; i++) last = (await guesser.post('/api/fn/finder-resume', { code: `ZZZZ-ZZZZ-${String(i).padStart(4, '2').replace(/[01]/g, '3')}` })).status;
check('guessing codes is stopped after 20 wrong tries', last === 429, String(last));

// ------------------------------------------------------------------ the finder's email

const EMAIL1 = `finder-one-${Date.now()}@example.test`;
const bad = await setEmail(f1, TAG, T1, 'not an email');
check('a malformed email is refused', bad.status === 400);
const e1 = await setEmail(f1, TAG, T1, EMAIL1);
check('the finder gives an email for replies', e1.status === 200 && e1.json?.email_on === true, JSON.stringify(e1.json));
const row1 = await emailRow(T1);
check('stored encrypted: the row holds no plain address', !!row1?.finder_email_enc && row1.finder_email_enc.startsWith('v1.') && !row1.finder_email_enc.includes(EMAIL1) && !JSON.stringify(row1).includes('finder-one'));
const fv = await f1.view(TAG, T1, false);
check("finder page: says email is on, never the address", fv.json?.thread?.email_on === true && !fv.text.includes(EMAIL1), fv.text.slice(0, 200));

// Everything the owner can read, including the data download and every admin screen.
await sql('insert into qurtag.super_admins (user_id) values ($1) on conflict do nothing', [owner.id]);
await owner.getPass();
const ownerReads = [];
for (const table of ['households', 'items', 'tags', 'scans', 'threads', 'messages']) ownerReads.push(await owner.db.from(table).select('*'));
for (const [fn, args] of [
  ['my_blocked_finders', {}], ['my_held_notes', {}], ['my_family', {}], ['admin_overview', {}], ['admin_list_accounts', { p_search: null }],
  ['admin_account', { p_user: owner.id }], ['admin_reports_list', { p_status: 'open' }], ['admin_support_list', { p_status: 'open' }],
]) ownerReads.push(await owner.db.rpc(fn, args));
const ownerText = JSON.stringify(ownerReads);
check('the email is in no owner or admin answer (tables, data download, admin screens)', !ownerText.includes(EMAIL1) && !ownerText.includes(row1.finder_email_enc) && !ownerText.includes('finder_email'), ownerText.slice(0, 300));
const direct = await owner.db.from('threads').select('id, finder_email_enc');
check("the data API refuses to name the email column", !!direct.error);
const asOwner = await sql(`select has_column_privilege('qurtag_user', 'qurtag.threads', 'finder_email_enc', 'SELECT') as u, has_column_privilege('qurtag_server', 'qurtag.threads', 'finder_email_enc', 'SELECT') as s, has_column_privilege('qurtag_anon', 'qurtag.threads', 'finder_email_enc', 'SELECT') as a`);
check('no role the app uses can read the column', !asOwner.rows[0].u && !asOwner.rows[0].s && !asOwner.rows[0].a);
await sql('delete from qurtag.super_admins where user_id = $1', [owner.id]);
await owner.getPass();

// ------------------------------------------------------------------ an owner reply emails the finder

const TH1 = await threadId(T1);
const before = mailsTo(EMAIL1).length;
const rep1 = await owner.db.rpc('owner_reply', { p_thread_id: TH1, p_body: 'Thank you! I can pick it up after 5.' });
check('owner replies', !rep1.error, JSON.stringify(rep1.error));
await settle();
const got = mailsTo(EMAIL1);
const m1 = got[got.length - 1];
check('the finder is emailed once about the reply', got.length === before + 1, String(got.length - before));
check('...with the reply text', !!m1 && m1.text.includes('I can pick it up after 5.') && m1.html.includes('I can pick it up after 5.'));
check('...a link back to the conversation', !!m1 && m1.text.includes(`/find/${TAG}#t=${T1}`));
check('...a spam reminder and the privacy promise', !!m1 && /spam or junk/.test(m1.text) && /never sees your email/.test(m1.text));
check('...and a one-click unsubscribe', !!m1 && /finder-email-stop\?t=/.test(m1.headers?.['List-Unsubscribe'] ?? '') && m1.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
check('...from the owner, nothing about the owner', !!m1 && !m1.text.includes(owner.email) && !m1.text.includes('Dana'));
const sender = (await sql('select sender_user_id from qurtag.messages where thread_id = $1 and sender_kind = $2', [TH1, 'owner'])).rows[0];
check('the reply records who wrote it', sender?.sender_user_id === owner.id);

// Two more replies right away: they wait for one email, 10 minutes after the last.
await owner.db.rpc('owner_reply', { p_thread_id: TH1, p_body: 'Second reply.' });
await owner.db.rpc('owner_reply', { p_thread_id: TH1, p_body: 'Third reply.' });
await settle();
check('replies within 10 minutes are not emailed at once', mailsTo(EMAIL1).length === before + 1);
const waiting = (await sql(`select count(*)::int as n, bool_and(next_attempt_at > now() + interval '8 minutes') as later from qurtag.outbox where kind = 'finder_reply' and ref = $1 and sent_at is null`, [TH1])).rows[0];
check('...one email waits for them, 10 minutes after the last', waiting.n === 1 && waiting.later === true, JSON.stringify(waiting));
await sql(`update qurtag.outbox set next_attempt_at = now() where kind = 'finder_reply' and ref = $1 and sent_at is null`, [TH1]);
await settle();
const batch = mailsTo(EMAIL1);
const m2 = batch[batch.length - 1];
check('...and both go in that one email', batch.length === before + 2 && m2.text.includes('Second reply.') && m2.text.includes('Third reply.'), String(batch.length - before));

// ------------------------------------------------------------------ seen, archive

await owner.db.rpc('mark_thread_read', { p_thread_id: TH1 });
const seen = await f1.view(TAG, T1, false);
check("the finder sees that the owner read their note", seen.json?.thread?.messages?.find((m) => m.sender_kind === 'finder')?.seen === true);
await owner.db.from('threads').update({ archived_at: new Date().toISOString() }).eq('id', TH1);
await send(f1, TAG, T1, 'Great, see you at 5.');
const arch = (await sql('select archived_at from qurtag.threads where id = $1', [TH1])).rows[0];
check("a finder's new note brings an archived conversation back", arch.archived_at === null);

// ------------------------------------------------------------------ a note without an email

const f2 = finder();
const s2 = await send(f2, TAG, null, 'Found it by the bus stop.');
const T2 = s2.json?.token;
const replyMails = () => mails().filter((m) => m.kind === 'finder-reply').length;
const all0 = replyMails();
await owner.db.rpc('owner_reply', { p_thread_id: await threadId(T2), p_body: 'Thanks!' });
await settle();
check('a note without an email works, and nobody is emailed about its reply', s2.status === 200 && !!T2 && replyMails() === all0);

// ------------------------------------------------------------------ closing deletes the address

check('the first email is still kept while the conversation is open', !!(await emailRow(T1)).finder_email_enc);
await owner.db.from('threads').update({ status: 'closed' }).eq('id', TH1);
const closedRow = await emailRow(T1);
check('closing the conversation deletes the email (the row)', closedRow.finder_email_enc === null && closedRow.finder_email_at === null);
const again = await setEmail(f1, TAG, T1, EMAIL1);
check('a closed conversation takes no new email', again.status === 409);

// ------------------------------------------------------------------ a return: one last email, then gone

const f3 = finder();
const T3 = (await send(f3, TAG, null, 'I have your backpack.')).json?.token;
const EMAIL3 = `finder-three-${Date.now()}@example.test`;
await setEmail(f3, TAG, T3, EMAIL3);
const TH3 = await threadId(T3);
await owner.db.from('threads').update({ status: 'reunited' }).eq('id', TH3);
await settle();
const m3 = mailsTo(EMAIL3);
check('marking it returned sends the finder one last email', m3.length === 1 && /has it back/.test(m3[0].text), JSON.stringify(m3.map((m) => m.subject)));
check('...then deletes the email', (await emailRow(T3)).finder_email_enc === null);

// ------------------------------------------------------------------ a block: no notice, no address, no new conversation

const f4 = finder();
const T4 = (await send(f4, TAG, null, 'Nice bag.')).json?.token;
const EMAIL4 = `finder-four-${Date.now()}@example.test`;
await setEmail(f4, TAG, T4, EMAIL4);
const TH4 = await threadId(T4);
const blk = await owner.db.rpc('block_finder', { p_thread: TH4 });
check('owner blocks the finder', !blk.error, JSON.stringify(blk.error));
check('blocking deletes the email', (await emailRow(T4)).finder_email_enc === null);
const afterBlock = await owner.db.rpc('owner_reply', { p_thread_id: TH4, p_body: 'Hello?' });
await settle();
check('a blocked finder gets no notice', mailsTo(EMAIL4).length === 0 && !!afterBlock.error);
const newWindow = await send(f4, TAG, null, 'Opened a new window. Still here.');
check('a blocked finder cannot start a new conversation from the same network', newWindow.status === 409 && newWindow.json?.error === 'not_taking', JSON.stringify(newWindow.json));
check('...told only that the tag is not taking notes', !/block/i.test(newWindow.json?.message ?? ''));
const other = finder();
check('someone on another network still can', (await send(other, TAG, null, 'Found at the gym.')).status === 200);
await owner.db.rpc('unblock_finder', { p_thread: TH4 });
check('unblocking lifts the network block', (await send(f4, TAG, null, 'Sorry about earlier.')).status === 200);
const keys = (await sql(`select count(*)::int as n from qurtag.threads where finder_net_key is not null and finder_net_key !~ '^[0-9a-f]{64}$'`)).rows[0].n;
check('the network is kept only as a keyed hash', keys === 0 && (await sql(`select count(*)::int as n from qurtag.threads where finder_net_key like '10.%'`)).rows[0].n === 0);

// ------------------------------------------------------------------ 30 days without a note, and unsubscribe

const f5 = finder();
const T5 = (await send(f5, TAG, null, 'Found it again.')).json?.token;
const EMAIL5 = `finder-five-${Date.now()}@example.test`;
await setEmail(f5, TAG, T5, EMAIL5);
const TH5 = await threadId(T5);
await sql(`update qurtag.threads set last_message_at = now() - interval '31 days' where id = $1`, [TH5]);
const daily = await fetch(`${BASE}/api/jobs/daily`, { method: 'POST', headers: { authorization: `Bearer ${CRON}` } });
const dj = await daily.json();
check('the daily sweep deletes an email after 30 days without a note', daily.status === 200 && (await emailRow(T5)).finder_email_enc === null && dj.finder?.finder_emails_deleted >= 1, JSON.stringify(dj.finder));

const f6 = finder();
const T6 = (await send(f6, TAG, null, 'One more find.')).json?.token;
const EMAIL6 = `finder-six-${Date.now()}@example.test`;
await setEmail(f6, TAG, T6, EMAIL6);
const TH6 = await threadId(T6);
await owner.db.rpc('owner_reply', { p_thread_id: TH6, p_body: 'Thank you.' });
await settle();
const m6 = mailsTo(EMAIL6)[0];
const stopUrl = (m6?.headers?.['List-Unsubscribe'] ?? '').replace(/^<|>$/g, '');
const forged = stopUrl.replace(/s=[^&]+$/, 's=AAAA');
check('a forged unsubscribe link is refused', (await fetch(forged.replace(/^https?:\/\/[^/]+/, BASE), { method: 'POST' })).status === 404);
const page = await fetch(stopUrl.replace(/^https?:\/\/[^/]+/, BASE));
check('the unsubscribe link opens a page with one button and changes nothing by itself', page.status === 200 && (await page.text()).includes('<form method="post">') && !!(await emailRow(T6)).finder_email_enc);
const stopped = await fetch(stopUrl.replace(/^https?:\/\/[^/]+/, BASE), { method: 'POST' });
check('unsubscribing deletes the email', stopped.status === 200 && (await emailRow(T6)).finder_email_enc === null);

// ------------------------------------------------------------------ pause, and an old tag

const pz = await owner.db.rpc('set_item_notes_paused', { p_item: ITEM, p_paused: true });
check('owner pauses new notes', !pz.error && pz.data?.paused === true, JSON.stringify(pz));
const pv = await finder().view(TAG, null, false);
check('the finder page says the item is paused', pv.json?.item?.paused === true);
check('a new conversation is refused while paused', (await send(finder(), TAG, null, 'Hello')).status === 409);
check('an existing conversation goes on', (await send(f6, TAG, T6, 'Still here if you need me.')).status === 200);
await owner.db.rpc('set_item_notes_paused', { p_item: ITEM, p_paused: false });
check('unpaused, a new conversation can start', (await send(finder(), TAG, null, 'Found it.')).status === 200);
check('an owner cannot set the pause mark directly', !!(await owner.db.from('items').update({ notes_paused_at: null }).eq('id', ITEM)).error);

await sql(`update qurtag.tags set status = 'inactive' where public_id = $1`, [TAG]);
const gone = await finder().view(TAG, null, true);
check("a switched-off tag answers 'gone', not 'not registered'", gone.status === 410 && gone.json?.error === 'gone');
const unknown = await finder().view('AbCdEf234567', null, true);
check('a code that never existed still answers 404', unknown.status === 404);
await sql(`update qurtag.tags set status = 'active' where public_id = $1`, [TAG]);

await admin.end();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
