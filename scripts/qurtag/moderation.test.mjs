#!/usr/bin/env node
/**
 * End-to-end test of the moderation of finders' notes (db/moderation.sql, server/moderation/),
 * after the other tests, on the same throwaway Postgres (run through run-local.sh):
 *   - the filter: a slur or a threat is held (the finder sees the normal confirmation, the owner
 *     sees no text until choosing "Show it"), links and repeats and fast writing are limited;
 *   - Report: the note is hidden from the owner at once and queued for the Super Admin;
 *   - the queue: only a super admin may read or act on it; Hide for everyone, Dismiss and Block
 *     finder each close the report and are written to the admin log;
 *   - Block: the finder's token can no longer write, their notes leave the owner's inbox, the finder
 *     is told only that the conversation is closed, and the owner can unblock (not an admin's block);
 *   - the Company OS counts include open reports.
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
// The push test, which runs before this one, reports notes too: start from an empty queue.
await sql('delete from qurtag.message_reports');
const CLOSED = 'This conversation is closed.';

const owner = await new Person('mod owner', '10.5.0.1').signUp('modowner@example.com', 'Mo Owner');
const other = await new Person('mod other owner', '10.5.0.2').signUp('modother@example.com', 'Otto Other');
const boss = await new Person('mod admin', '10.5.0.3').signUp('modboss@example.com', 'Bea Boss');
await sql('insert into qurtag.super_admins (user_id) select id from qurtag.auth_users where email = $1', ['modboss@example.com']);
const fA = new Person('finder A', '10.5.1.1');
const fB = new Person('finder B', '10.5.1.2');
const fC = new Person('finder C', '10.5.1.3');
const fD = new Person('finder D', '10.5.1.4');

const item = await owner.db.rpc('create_item', { p_name: 'Green jacket' });
const tag = item.data?.public_id;
const item2 = await owner.db.rpc('create_item', { p_name: 'Red scarf' });
const tag2 = item2.data?.public_id;
check('setup: the owner has two tags', !!tag && !!tag2, JSON.stringify(item.error ?? item2.error));
// A note on the second item, made before the flood tests below fill that tag's hourly limit.
const earlyD = await new Person('finder D2', '10.5.1.60').send(tag2, null, 'I know where you live');
const threadOf = async (token) =>
  (await sql(`select id from qurtag.threads where finder_token_sha256 = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [token])).rows[0]?.id;
const ownerNotes = async (threadId) =>
  (await owner.db.from('messages').select('id, body, sender_kind').eq('thread_id', threadId).order('created_at')).data ?? [];

// ------------------------------------------------------------------ the filter

const SLUR = 'you stupid faggot';
const clean = await fA.send(tag, null, 'Found your green jacket at the park bench.');
const tokA = clean.json?.token;
const threadA = await threadOf(tokA);
check('a clean note goes through and is not held', clean.status === 200 && (await sql('select held_at from qurtag.messages where thread_id = $1', [threadA])).rows[0]?.held_at === null);

const slur = await fA.send(tag, tokA, SLUR);
check('a note with a slur gets the normal confirmation', slur.status === 200 && slur.json?.ok === true, `${slur.status} ${slur.text}`);
{
  const row = (await sql(`select id, held_at, held_reason from qurtag.messages where thread_id = $1 and body = $2`, [threadA, SLUR])).rows[0];
  check('the slur note is stored, held for language', !!row?.held_at && row.held_reason === 'language', JSON.stringify(row));
  const heldId = row?.id;
  const visible = await ownerNotes(threadA);
  check('the owner does not receive the held note in a read of the conversation', visible.length === 1 && !JSON.stringify(visible).includes('faggot'), JSON.stringify(visible));
  const held = await owner.db.rpc('my_held_notes', { p_thread: threadA });
  check('the owner is told a note is held, without its text', held.data?.length === 1 && held.data[0].id === heldId && !JSON.stringify(held.data).includes('faggot') && !('body' in held.data[0]), JSON.stringify(held.data));
  const all = await owner.db.rpc('my_held_notes', {});
  check('held notes can be listed across conversations', all.data?.length === 2 && all.data.some((h) => h.id === heldId));
  const direct = await owner.db.from('messages').select('id, body').eq('id', heldId);
  check('the held note cannot be read straight from the table', (direct.data ?? []).length === 0);
  const view = await fA.view(tag, tokA);
  check("the finder still sees their own note", view.json?.thread?.messages?.some((m) => m.body === SLUR));
  const other1 = await other.db.rpc('release_held_note', { p_message: heldId });
  check("another owner cannot show this owner's held note", !!other1.error);
  const rec = await sql(`select body from qurtag.server_note_recipients($1)`, [heldId]);
  check('an alert about a held note carries no text', rec.rows.length > 0 && rec.rows.every((r) => r.body === ''), JSON.stringify(rec.rows));
  const show = await owner.db.rpc('release_held_note', { p_message: heldId });
  check('"Show it" releases the note', !show.error && (await ownerNotes(threadA)).some((m) => m.body === SLUR));
  const after = await owner.db.rpc('my_held_notes', { p_thread: threadA });
  check('a shown note is no longer held back', after.data?.length === 0);
}
{
  const t = await fA.send(tag, tokA, "I'll kill you if you ever call again");
  const row = (await sql(`select held_reason from qurtag.messages where thread_id = $1 and body like 'I''ll kill you%'`, [threadA])).rows[0];
  check('a threat is accepted and held for threat', t.status === 200 && row?.held_reason === 'threat', `${t.status} ${JSON.stringify(row)}`);
  const disguised = await fB.send(tag, null, 'n1gg3r');
  check('look-alike letters are caught on a first note too', disguised.status === 200 && (await sql(`select held_reason from qurtag.messages order by created_at desc limit 1`)).rows[0].held_reason === 'language');
  const innocent = await fC.send(tag, null, 'Scunthorpe, Essex: we will pass the class assessment at the grassy bench.');
  check('harmless words that contain bad ones are not held', innocent.status === 200 && (await sql(`select held_at from qurtag.messages order by created_at desc limit 1`)).rows[0].held_at === null);
}

// links and repeats
{
  const onlyUrl = await fD.send(tag, null, 'https://spam.example.com/win');
  check('a note of only a link is refused with a plain sentence', onlyUrl.status === 400 && /few words/.test(onlyUrl.json?.message ?? ''), `${onlyUrl.status} ${onlyUrl.text}`);
  const bare = await fD.send(tag, null, 'spam-shop.com');
  check('a bare domain alone is refused too', bare.status === 400);
  const many = await fD.send(tag, null, 'Look http://a.example.com and http://b.example.com and www.c.example.com now');
  check('more than 2 links is refused', many.status === 400 && /2 links/.test(many.json?.message ?? ''), `${many.status} ${many.text}`);
  const two = await fD.send(tag, null, 'I left it at the cafe, map: https://maps.example.com/x or www.cafe.example.com');
  check('a note with 2 links and words goes through', two.status === 200, `${two.status} ${two.text}`);
  const before = (await sql('select count(*)::int as n from qurtag.threads')).rows[0].n;
  check('a refused note creates no conversation', before === (await sql('select count(*)::int as n from qurtag.threads')).rows[0].n);
}
{
  const tokDup = (await fD.send(tag, null, 'First note from D')).json?.token;
  const t = await threadOf(tokDup);
  await fD.send(tag, tokDup, 'Same words again');
  const again = await fD.send(tag, tokDup, 'Same words again');
  const n = (await sql(`select count(*)::int as n from qurtag.messages where thread_id = $1 and body = 'Same words again'`, [t])).rows[0].n;
  check('an identical note within 10 minutes is accepted but stored once', again.status === 200 && n === 1, `${again.status} ${n}`);
}
{
  const g = new Person('burst finder', '10.5.1.50');
  const tok = (await g.send(tag2, null, 'burst 0')).json?.token;
  const codes = [];
  for (let i = 1; i <= 6; i++) codes.push((await g.send(tag2, tok, `burst ${i}`)).status);
  check('more than 5 notes in a minute from one conversation is refused (429)', codes.slice(0, 4).every((c) => c === 200) && codes[5] === 429, codes.join(','));
  const h = new Person('hour finder', '10.5.1.51');
  const tokH = (await h.send(tag2, null, 'hour 0')).json?.token;
  const th = await threadOf(tokH);
  await sql(`insert into qurtag.messages (thread_id, sender_kind, body, created_at)
             select $1, 'finder', 'old ' || g, now() - interval '30 minutes' from generate_series(1, 29) g`, [th]);
  const hourly = await h.send(tag2, tokH, 'one too many this hour');
  check('30 notes an hour from one conversation is the limit (429)', hourly.status === 429, `${hourly.status}`);
  const tagFlood = new Person('tag flood', '10.5.1.52');
  const tokT = (await tagFlood.send(tag2, null, 'flood 0')).json?.token;
  const tt = await threadOf(tokT);
  await sql(`insert into qurtag.messages (thread_id, sender_kind, body, created_at)
             select $1, 'finder', 'flood ' || g, now() - interval '20 minutes' from generate_series(1, 60) g`, [tt]);
  const tagLimit = await new Person('tag victim', '10.5.1.53').send(tag2, null, 'a fresh finder, but the tag is flooded');
  check('60 finder notes an hour on one tag is the limit (429)', tagLimit.status === 429, `${tagLimit.status}`);
}

// ------------------------------------------------------------------ report

const bad1 = await fB.send(tag, null, 'You are a loser and I will keep writing');
const tokB = bad1.json?.token;
const threadB = await threadOf(tokB);
const msgB = (await sql(`select id from qurtag.messages where thread_id = $1`, [threadB])).rows[0].id;
await owner.db.rpc('owner_reply', { p_thread_id: threadB, p_body: 'Please stop.' });
const ownerMsgId = (await sql(`select id from qurtag.messages where thread_id = $1 and sender_kind = 'owner'`, [threadB])).rows[0].id;
{
  check('before the report the owner sees the note', (await ownerNotes(threadB)).some((m) => m.id === msgB));
  check('a bad reason is refused', !!(await owner.db.rpc('report_message', { p_message: msgB, p_reason: 'rude' })).error);
  check("another owner cannot report this owner's note", !!(await other.db.rpc('report_message', { p_message: msgB, p_reason: 'spam' })).error);
  check("a note by the owner themselves cannot be reported", !!(await owner.db.rpc('report_message', { p_message: ownerMsgId, p_reason: 'spam' })).error);
  check('a visitor with no pass cannot report', (await new Person('visitor', '10.5.0.9').req('/api/data/rpc/report_message', { method: 'POST', body: { p_message: msgB, p_reason: 'spam' } })).status === 401);
  const r = await owner.db.rpc('report_message', { p_message: msgB, p_reason: 'harassment', p_comment: '  Keeps insulting me  ' });
  check('Report works', !r.error && r.data?.hidden === true && r.data.thread_id === threadB, JSON.stringify(r.error ?? r.data));
  check('the reported note is hidden from the owner at once', !(await ownerNotes(threadB)).some((m) => m.id === msgB));
  check("the owner's own reply stays", (await ownerNotes(threadB)).some((m) => m.id === ownerMsgId));
  check('the finder still sees their note until an admin decides', (await fB.view(tag, tokB)).json?.thread?.messages?.some((m) => m.id === msgB));
  const again = await owner.db.rpc('report_message', { p_message: msgB, p_reason: 'spam' });
  const rows = (await sql(`select reason, comment, status, reporter_user_id, household_id from qurtag.message_reports where message_id = $1`, [msgB])).rows;
  check('reporting twice is one report', !again.error && rows.length === 1 && rows[0].reason === 'harassment' && rows[0].comment === 'Keeps insulting me' && rows[0].status === 'open', JSON.stringify(rows));
  const direct = await owner.req('/api/data/message_reports');
  check('an owner cannot read the reports table', direct.status >= 400, `${direct.status}`);
  const row = (await sql(`select read_by_owner_at from qurtag.messages where id = $1`, [msgB])).rows[0];
  check('a reported note no longer counts as unread', !!row.read_by_owner_at);
}

// a second and third report, to see the queue order and every action
const bad2 = await fC.send(tag, null, 'Buy cheap watches now, message me');
const msgC = (await sql(`select id, thread_id from qurtag.messages where thread_id = $1`, [await threadOf(bad2.json?.token)])).rows[0];
const tokD2 = earlyD.json?.token;
const threadD2 = await threadOf(tokD2);
const msgD = (await sql(`select id from qurtag.messages where thread_id = $1`, [threadD2])).rows[0].id;
await owner.db.rpc('report_message', { p_message: msgC.id, p_reason: 'spam' });
await owner.db.rpc('report_message', { p_message: msgD, p_reason: 'threats', p_comment: 'Scary' });
await sql(`update qurtag.message_reports set created_at = now() - interval '3 days' where message_id = $1`, [msgB]);
await sql(`update qurtag.message_reports set created_at = now() - interval '2 days' where message_id = $1`, [msgD]);

// ------------------------------------------------------------------ the Super Admin queue

{
  const reportId = (id) => sql(`select id from qurtag.message_reports where message_id = $1`, [id]).then((r) => r.rows[0].id);
  const [rB, rC, rD] = [await reportId(msgB), await reportId(msgC.id), await reportId(msgD)];
  const auditN = async () => Number((await sql('select count(*) as n from qurtag.admin_audit')).rows[0].n);

  const a0 = await auditN();
  for (const [fn, args] of [['admin_reports_list', {}], ['admin_report_resolve', { p_id: rB, p_action: 'dismiss' }]]) {
    const r = await owner.db.rpc(fn, args);
    check(`a normal owner is refused ${fn} (403)`, r.status === 403 && r.data === null, `${r.status}`);
    const v = await new Person('visitor', '10.5.0.10').req(`/api/data/rpc/${fn}`, { method: 'POST', body: args });
    check(`a visitor with no pass is refused ${fn} (401)`, v.status === 401, `${v.status}`);
  }
  check('refused calls write nothing to the admin log', (await auditN()) === a0);
  check('an unresolved report stays open after a refused attempt', (await sql(`select status from qurtag.message_reports where id = $1`, [rB])).rows[0].status === 'open');

  const q = await boss.db.rpc('admin_reports_list', { p_status: 'open' });
  const list = q.data?.reports ?? [];
  check('the queue lists open reports oldest first', !q.error && q.data.open === 3 && list.map((x) => x.id).join() === [rB, rD, rC].join(), JSON.stringify(q.error ?? list.map((x) => x.reason)));
  check('each row has the message text, the reason and the item', list[0].message_text === 'You are a loser and I will keep writing' && list[0].reason === 'harassment' && list[0].item_name === 'Green jacket' && list[1].item_name === 'Red scarf' && list[1].reason === 'threats');
  check("the queue never carries a finder's token", !JSON.stringify(q.data).includes('finder_token') && !JSON.stringify(q.data).includes(tokB));
  check('reading the queue is written to the admin log', (await sql(`select count(*)::int as n from qurtag.admin_audit where action = 'list_reports'`)).rows[0].n === 1);

  const bad = await boss.db.rpc('admin_report_resolve', { p_id: rB, p_action: 'delete' });
  check('an unknown action is refused', !!bad.error);

  // Hide for everyone
  const hide = await boss.db.rpc('admin_report_resolve', { p_id: rB, p_action: 'hide' });
  check('Hide for everyone closes the report', !hide.error && (await sql(`select status, resolution from qurtag.message_reports where id = $1`, [rB])).rows[0].resolution === 'hidden', JSON.stringify(hide.error));
  check('the finder no longer sees a note hidden for everyone', !(await fB.view(tag, tokB)).json?.thread?.messages?.some((m) => m.id === msgB));
  const logHide = (await sql(`select actor_email, target_type, target_id, detail from qurtag.admin_audit where action = 'hide_message' and target_id = $1`, [msgB])).rows;
  check('Hide for everyone is in the admin log with who and which report', logHide.length === 1 && logHide[0].actor_email === 'modboss@example.com' && logHide[0].detail.report_id === rB, JSON.stringify(logHide));
  check('a closed report cannot be acted on again', !!(await boss.db.rpc('admin_report_resolve', { p_id: rB, p_action: 'dismiss' })).error);

  // Dismiss
  const dismiss = await boss.db.rpc('admin_report_resolve', { p_id: rD, p_action: 'dismiss' });
  check('Dismiss closes the report and logs it', !dismiss.error
    && (await sql(`select resolution from qurtag.message_reports where id = $1`, [rD])).rows[0].resolution === 'dismissed'
    && (await sql(`select count(*)::int as n from qurtag.admin_audit where action = 'dismiss_report' and target_id = $1`, [rD])).rows[0].n === 1);
  check('a dismissed report leaves the note hidden from the owner who reported it', !(await ownerNotes(threadD2)).some((m) => m.id === msgD));

  // Block finder
  const block = await boss.db.rpc('admin_report_resolve', { p_id: rC, p_action: 'block' });
  check('Block finder closes the report and logs it', !block.error
    && (await sql(`select resolution from qurtag.message_reports where id = $1`, [rC])).rows[0].resolution === 'blocked'
    && (await sql(`select count(*)::int as n from qurtag.admin_audit where action = 'block_finder' and target_id = $1`, [msgC.thread_id])).rows[0].n === 1);
  const tokC = bad2.json?.token;
  const afterBlock = await fC.send(tag, tokC, 'let me in');
  check('the finder an admin blocked is refused with the neutral words (409)', afterBlock.status === 409 && afterBlock.json?.message === CLOSED, `${afterBlock.status} ${afterBlock.text}`);
  const unblock = await owner.db.rpc('unblock_finder', { p_thread: msgC.thread_id });
  check("the owner cannot unblock a finder an admin blocked", !!unblock.error && /blocked_by_admin/.test(unblock.error.message ?? ''), JSON.stringify(unblock.error));
  const closedList = await boss.db.rpc('admin_reports_list', { p_status: 'closed' });
  check('closed reports are listed with how they ended', closedList.data?.reports?.length === 3 && closedList.data.reports.map((x) => x.resolution).sort().join() === 'blocked,dismissed,hidden');
  check('the queue is empty now', (await boss.db.rpc('admin_reports_list', {})).data?.open === 0);
}

// ------------------------------------------------------------------ block

{
  const tokE = (await fA.send(tag, null, 'Hello, found your jacket (E)')).json?.token;
  // fA already has a conversation: use a new person for a clean block test.
  const e = new Person('finder E', '10.5.2.1');
  const tE = (await e.send(tag, null, 'Hello, I found your jacket')).json.token;
  void tokE;
  const thread = await threadOf(tE);
  check('before the block the owner sees the conversation', (await owner.db.from('threads').select('id').eq('id', thread)).data?.length === 1 && (await ownerNotes(thread)).length === 1);
  check("another owner cannot block this owner's finder", !!(await other.db.rpc('block_finder', { p_thread: thread })).error);
  check('a visitor with no pass cannot block', (await new Person('visitor', '10.5.0.11').req('/api/data/rpc/block_finder', { method: 'POST', body: { p_thread: thread } })).status === 401);
  const b = await owner.db.rpc('block_finder', { p_thread: thread });
  check('Block this finder works', !b.error && b.data?.blocked === true, JSON.stringify(b.error));
  const post = await e.send(tag, tE, 'Please talk to me');
  check('the blocked token can no longer post: neutral message (409)', post.status === 409 && post.json?.message === CLOSED && post.json?.error === 'thread_closed', `${post.status} ${post.text}`);
  check('the refused note was not stored', (await sql(`select count(*)::int as n from qurtag.messages where thread_id = $1`, [thread])).rows[0].n === 1);
  const v = await e.view(tag, tE);
  check('the blocked finder sees only a closed conversation', v.json?.thread?.status === 'closed' && !/block/i.test(v.text));
  check('the old notes are hidden from the owner', (await ownerNotes(thread)).length === 0 && (await owner.db.from('threads').select('id').eq('id', thread)).data?.length === 0);
  let code = null;
  try {
    await sql(`insert into qurtag.messages (thread_id, sender_kind, body) values ($1, 'finder', 'sneaky')`, [thread]);
  } catch (err) {
    code = err.message;
  }
  check('the database itself refuses a finder note in a blocked conversation', code === 'thread_blocked', `${code}`);
  code = null;
  try {
    await sql(`insert into qurtag.messages (thread_id, sender_kind, body) values ($1, 'owner', 'reply')`, [thread]);
  } catch (err) {
    code = err.message;
  }
  check('and an owner reply into it', code === 'thread_blocked', `${code}`);
  const unreadCount = await owner.db.from('messages').select('id', { count: 'exact', head: true }).is('read_by_owner_at', null).eq('sender_kind', 'finder').eq('thread_id', thread);
  check('a blocked finder adds nothing to unread', (unreadCount.count ?? 0) === 0);
  const blocked = await owner.db.rpc('my_blocked_finders');
  const mine = (blocked.data ?? []).find((b) => b.thread_id === thread);
  check('Settings lists the blocked finder by item, with no identity', mine?.item_name === 'Green jacket' && mine.by_admin === false && !JSON.stringify(blocked.data).includes(tE), JSON.stringify(blocked.data));
  check('and one an admin blocked is marked as such', (blocked.data ?? []).some((b) => b.by_admin === true));
  check("another owner's list is empty", (await other.db.rpc('my_blocked_finders')).data?.length === 0);
  check("another owner cannot unblock this owner's finder", !!(await other.db.rpc('unblock_finder', { p_thread: thread })).error);
  // The same finder can still start over only with a new token; the old token stays dead.
  const fresh = await e.send(tag, null, 'A new conversation');
  check('a finder with no token can still open a new conversation (a block is per conversation token)', fresh.status === 200 && !!fresh.json?.token);
  const un = await owner.db.rpc('unblock_finder', { p_thread: thread });
  check('Unblock works', !un.error && un.data?.blocked === false, JSON.stringify(un.error));
  check('the conversation is back in the inbox', (await owner.db.from('threads').select('id').eq('id', thread)).data?.length === 1 && (await ownerNotes(thread)).length === 1);
  const again = await e.send(tag, tE, 'Thanks for unblocking');
  check('the finder can write again', again.status === 200, `${again.status} ${again.text}`);
  check('the unblocked finder is off the list; the admin block stays', (await owner.db.rpc('my_blocked_finders')).data?.length === 1 && (await owner.db.rpc('my_blocked_finders')).data[0].by_admin === true);
}

// ------------------------------------------------------------------ counts, rights, the log

{
  // Two fresh open reports.
  const g = new Person('finder G', '10.5.3.1');
  const tG = (await g.send(tag, null, 'rude note one')).json.token;
  const th = await threadOf(tG);
  const m = (await sql(`select id from qurtag.messages where thread_id = $1`, [th])).rows[0].id;
  await owner.db.rpc('report_message', { p_message: m, p_reason: 'inappropriate' });
  await sql(`update qurtag.message_reports set created_at = now() - interval '2 days 3 hours' where message_id = $1`, [m]);
  const metrics = await new Person('factory', '10.5.0.12').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: process.env.QURTAG_TEST_FACTORY_TOKEN }, headers: { authorization: '' } });
  const d = metrics.json ?? {};
  const support = (await sql(`select count(*)::int as n from qurtag.support_requests where status = 'open'`)).rows[0].n;
  check('the Company OS counts: reports_open is the open reports', d.reports_open === 1, JSON.stringify(d));
  check('reports_oldest_open_days is the age of the oldest open report', d.reports_oldest_open_days === 2, `${d.reports_oldest_open_days}`);
  check('reports_30d counts the reports of 30 days', d.reports_30d === 4, `${d.reports_30d}`);
  check('support_open counts open reports with open contact requests', d.support_open === support + 1, `${d.support_open} vs ${support}+1`);
  check('support_oldest_open_days covers both queues', d.support_oldest_open_days >= 2, `${d.support_oldest_open_days}`);
  check('support_30d includes the reports', d.support_30d >= 4, `${d.support_30d}`);

  const rights = await sql(`select r.rolname from pg_roles r where r.rolname like 'qurtag\\_%' and (has_table_privilege(r.oid, 'qurtag.message_reports', 'SELECT') or has_table_privilege(r.oid, 'qurtag.message_reports', 'INSERT') or has_table_privilege(r.oid, 'qurtag.message_reports', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.message_reports', 'DELETE'))`);
  check('no QuR Tag login has any right on the reports table', rights.rows.length === 0, JSON.stringify(rights.rows));
  const marks = await sql(`select has_column_privilege('qurtag_user', 'qurtag.threads', 'blocked_by_admin', 'SELECT') as a, has_column_privilege('qurtag_user', 'qurtag.messages', 'held_released_at', 'UPDATE') as b, has_column_privilege('qurtag_user', 'qurtag.threads', 'blocked_at', 'UPDATE') as c`);
  check('an owner cannot write or read the moderation marks directly', !marks.rows[0].a && !marks.rows[0].b && !marks.rows[0].c);
  const sneak = await owner.db.from('messages').update({ owner_hidden_at: null }).eq('id', m);
  check('an owner cannot un-hide a reported note by a direct update', !!sneak.error || (sneak.data ?? []).length === 0);
  const server = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_SERVER });
  await server.connect();
  let c1 = null;
  try { await server.query('select qurtag.admin_reports_list()'); } catch (err) { c1 = err.code; }
  let c2 = null;
  try { await server.query(`select qurtag.block_finder('${th}')`); } catch (err) { c2 = err.code; }
  check('the server login cannot run the owner or admin moderation functions', c1 === '42501' && c2 === '42501', `${c1} ${c2}`);
  await server.end();
}

await admin.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
