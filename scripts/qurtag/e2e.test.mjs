#!/usr/bin/env node
/**
 * End-to-end test of QuR Tag on its own backend: the schema (db/qurtag.sql), the logins
 * (db/logins.sql), the sign-in service, the data API, the finder routes and the outbox,
 * against a throwaway local Postgres that stands in for the shared project (with decoy
 * apps from scripts/qurtag/decoys.sql). Run it through run-local.sh, which sets up the
 * database and the server and removes them afterwards.
 *
 * It goes through the whole loop as people do it: an owner signs up, adds an item and
 * gets a tag; a finder with no account opens the tag's page, sends a note, and later
 * reads the owner's reply. Then it tries everything that must be refused: another
 * owner's rows, another finder's conversation, a switched-off or replaced tag, the
 * finder token hash, forged passes, pages on other sites, other apps' data.
 *
 * Environment: QURTAG_TEST_BASE (the local server), QURTAG_TEST_ADMIN_DB (a postgres
 * connection for checks the app cannot make itself), QURTAG_TEST_LOGIN_DB_<ROLE> (each
 * login's own connection), CRON_SECRET, QURTAG_TEST_FACTORY_TOKEN.
 */
import pg from 'pg';
import { PostgrestClient } from '@supabase/postgrest-js';

const BASE = process.env.QURTAG_TEST_BASE;
const ORIGIN = BASE;
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

// A tiny real JPEG (1x1), as the app sends a shrunk photo.
const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

// ------------------------------------------------------------------ people

class Person {
  constructor(label, ip) {
    this.label = label;
    this.ip = ip;
    this.cookie = '';
    this.pass = null;
  }
  async req(path, { method = 'GET', body, headers = {} } = {}) {
    const r = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        origin: ORIGIN,
        'x-forwarded-for': this.ip,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      if (name.startsWith('qurtag.')) {
        const others = this.cookie.split('; ').filter((x) => x && !x.startsWith(`${name}=`));
        this.cookie = [...others, ...(value ? [`${name}=${value}`] : [])].join('; ');
      }
    }
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    return { status: r.status, json, text, headers: r.headers };
  }
  async getPass() {
    const r = await this.req('/api/auth/token');
    this.pass = r.json?.token ?? null;
    return r;
  }
  get db() {
    const self = this;
    return new PostgrestClient(`${BASE}/api/data`, {
      schema: 'qurtag',
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set('origin', ORIGIN);
        h.set('x-forwarded-for', self.ip);
        if (self.pass) h.set('authorization', `Bearer ${self.pass}`);
        return fetch(input, { ...init, headers: h });
      },
    });
  }
  // The finder's page.
  view(tag, token, scan = false) {
    return this.req('/api/fn/finder-view', { method: 'POST', body: { tag, ...(token ? { token } : {}), scan } });
  }
  send(tag, token, body) {
    return this.req('/api/fn/finder-send', { method: 'POST', body: { tag, ...(token ? { token } : {}), body } });
  }
}

async function signUp(p, email, name) {
  const r = await p.req('/api/auth/sign-up/email', { method: 'POST', body: { email, password: 'correct horse battery', name, callbackURL: '/app' } });
  check(`${p.label}: sign-up signs in at once while email is off`, r.status === 200 && !!r.json?.token && p.cookie.includes('qurtag.session_token'), `${r.status}`);
  const t = await p.getPass();
  check(`${p.label}: gets a data pass`, t.status === 200 && !!p.pass, `${t.status}`);
  const { rows } = await sql(
    `select u.id, h.id as household from qurtag.auth_users u join qurtag.households h on h.owner_user_id = u.id where u.email = $1`,
    [email.toLowerCase()],
  );
  p.id = rows[0]?.id;
  p.household = rows[0]?.household;
  check(`${p.label}: the database made a household`, !!p.household);
}

const owner = new Person('owner', '10.0.0.1');
const other = new Person('another owner', '10.0.0.2');
const finder = new Person('finder', '10.0.0.3');
const finder2 = new Person('second finder', '10.0.0.4');

// ------------------------------------------------------------------ accounts

await signUp(owner, 'Owner@example.com', 'Olive Owner');
await signUp(other, 'other@example.com', 'Oscar Other');
{
  const again = await new Person('copycat', '10.0.0.9').req('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email: 'owner@example.com', password: 'another password 1', name: 'Copy' },
  });
  check('a second account with the same email is refused', again.status >= 400 && again.status < 500, `${again.status}`);
  const anon = new Person('nobody', '10.0.0.10');
  const items = await anon.req('/api/data/items');
  check('with no pass, no table is served', items.status === 401, `${items.status}`);
  const wrong = await new Person('guesser', '10.0.0.11').req('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'owner@example.com', password: 'wrong password' },
  });
  check('a wrong password does not sign in', wrong.status === 401, `${wrong.status}`);
}

// ------------------------------------------------------------------ the owner adds an item

const created = await owner.db.rpc('create_item', {
  p_name: 'Blue water bottle',
  p_brand: null,
  p_color: 'Blue',
  p_photo: PHOTO,
  p_reward_text: 'Coffee on me if you get it back to me',
  p_notes: 'PRIVATE-NOTE: bought at the corner shop',
});
check('owner: create_item makes an item and a tag', !created.error && /^[2-9A-HJ-NP-Za-km-z]{12}$/.test(created.data?.public_id ?? ''), JSON.stringify(created.error ?? created.data));
const tagId = created.data?.public_id;
const itemId = created.data?.item_id;
{
  const items = await owner.db.from('items').select('*').order('created_at', { ascending: false });
  check('owner: sees the item', items.data?.length === 1 && items.data[0].name === 'Blue water bottle', JSON.stringify(items.error));
  const tags = await owner.db.from('tags').select('*,items(name)');
  check('owner: sees the tag with its item', tags.data?.length === 1 && tags.data[0].items?.name === 'Blue water bottle', JSON.stringify(tags.error));
  const theirs = await other.db.from('items').select('*');
  check("another owner sees none of the owner's items", theirs.data?.length === 0, JSON.stringify(theirs));
  const theirTags = await other.db.from('tags').select('*');
  check("another owner sees none of the owner's tags", theirTags.data?.length === 0);
  const sneak = await other.db.from('items').update({ name: 'Mine now' }).eq('id', itemId).select();
  check("another owner cannot change the owner's item", (sneak.data ?? []).length === 0);
  const rep = await other.db.rpc('replace_tag', { p_item_id: itemId });
  check("another owner cannot replace the owner's tag", !!rep.error);
  const move = await owner.db.from('items').update({ household_id: other.household }).eq('id', itemId);
  check('an owner cannot move an item to another household (column not writable)', !!move.error);
  const big = await owner.db.rpc('create_item', { p_name: 'Too big', p_photo: `data:image/jpeg;base64,${'A'.repeat(130000)}` });
  check('a photo over the size limit is refused', !!big.error);
  const html = await owner.db.rpc('create_item', { p_name: 'Script', p_photo: 'javascript:alert(1)' });
  check('a photo that is not an image data address is refused', !!html.error);
}

// ------------------------------------------------------------------ a finder scans the tag

{
  const unknown = await finder.view('ABCDEFGHJKLM');
  check('an unknown tag answers "This tag isn\'t registered"', unknown.status === 404 && unknown.json?.message === "This tag isn't registered.", `${unknown.status}`);
  const junk = await finder.view("x' or 1=1 --");
  check('a malformed tag id answers not registered', junk.status === 404);
}
const seen = await finder.view(tagId, null, true);
check('finder: sees the item card', seen.status === 200 && seen.json?.item?.name === 'Blue water bottle', `${seen.status}`);
check('finder: the card holds only name, photo, reward text and lost', JSON.stringify(Object.keys(seen.json?.item ?? {}).sort()) === JSON.stringify(['lost', 'name', 'photo', 'reward_text']));
check('finder: sees the photo and the reward text', seen.json?.item?.photo === PHOTO && seen.json?.item?.reward_text === 'Coffee on me if you get it back to me');
check('finder: never sees the private note, the email or any id', !/PRIVATE-NOTE|owner@example\.com|Olive|household/i.test(seen.text) && !seen.text.includes(itemId) && !seen.text.includes(owner.household));
check('finder: no conversation yet', seen.json?.thread === null);
{
  const { rows } = await sql('select count(*)::int as n, max(user_agent_class) as ua from qurtag.scans');
  check('the scan is recorded with a device type only', rows[0].n === 1, JSON.stringify(rows[0]));
}

const first = await finder.send(tagId, null, 'Hi! I found your blue bottle at the gym. I left it at the front desk.');
const token = first.json?.token;
check('finder: the first note opens a conversation and gives this browser its token', first.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(token ?? ''), `${first.status} ${first.text}`);
{
  const { rows } = await sql('select finder_token_sha256 from qurtag.threads');
  check('the database keeps only the token hash', rows.length === 1 && rows[0].finder_token_sha256 !== token && /^[0-9a-f]{64}$/.test(rows[0].finder_token_sha256));
}
{
  const mine = await finder.view(tagId, token);
  check('finder: sees their conversation', mine.json?.thread?.messages?.length === 1 && mine.json.thread.messages[0].sender_kind === 'finder');
  const second = await finder.send(tagId, token, 'It is the one with the stickers.');
  check('finder: adds a note to their conversation', second.status === 200 && !second.json?.token);
  const nosy = await finder2.view(tagId, 'A'.repeat(43));
  check('a guessed token shows no conversation', nosy.status === 200 && nosy.json?.thread === null && nosy.json?.tokenValid === false);
  const forged = await finder2.send(tagId, 'B'.repeat(43), 'let me in');
  check('a guessed token cannot post', forged.status === 404, `${forged.status}`);
  const empty = await finder2.send(tagId, null, '   ');
  check('an empty note is refused', empty.status === 400);
  const long = await finder2.send(tagId, null, 'x'.repeat(2001));
  check('a note over 2000 characters is refused', long.status === 400);
  const evil = await fetch(`${BASE}/api/fn/finder-view`, {
    method: 'POST',
    headers: { origin: 'https://evil.example.com', 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.66' },
    body: JSON.stringify({ tag: tagId }),
  });
  check('a page on another site cannot use the finder routes', evil.status === 403, `${evil.status}`);
  const get = await fetch(`${BASE}/api/fn/finder-view?tag=${tagId}`, { headers: { 'x-forwarded-for': '10.0.0.67' } });
  check('the finder routes take no tag or token in the address', get.status === 405, `${get.status}`);
}

// A second item: the token of one tag's conversation does not work under another tag.
const created2 = await owner.db.rpc('create_item', { p_name: 'Violin case' });
const tag2 = created2.data?.public_id;
{
  const third = await owner.db.rpc('create_item', { p_name: 'House keys' });
  check('free covers two items: a third is refused', third.error?.message === 'item_limit', JSON.stringify(third.error));

  const cross = await finder.send(tag2, token, 'wrong tag');
  check("a conversation token works only under its own tag", cross.status === 404, `${cross.status}`);
  const crossView = await finder.view(tag2, token);
  check('viewing another tag with a token shows no conversation', crossView.json?.thread === null);
}

// ------------------------------------------------------------------ the owner's inbox

let threadId;
{
  const threads = await owner.db.from('threads').select('*,items(name)').order('last_message_at', { ascending: false });
  threadId = threads.data?.[0]?.id;
  check('owner: the conversation is in the inbox with its item', threads.data?.length === 1 && threads.data[0].items?.name === 'Blue water bottle', JSON.stringify(threads.error));
  check('owner: the inbox never carries the finder token hash', threads.data && !('finder_token_sha256' in threads.data[0]));
  const hash = await owner.db.from('threads').select('finder_token_sha256');
  check('owner: asking for the token hash is refused', !!hash.error);
  const unread = await owner.db.from('messages').select('id', { count: 'exact', head: true }).in('thread_id', [threadId]).eq('sender_kind', 'finder').is('read_by_owner_at', null);
  check('owner: two unread notes', unread.count === 2, JSON.stringify(unread));
  const theirs = await other.db.from('threads').select('*');
  check("another owner sees none of the owner's conversations", theirs.data?.length === 0);
  const theirMsgs = await other.db.from('messages').select('*');
  check('another owner sees no messages', theirMsgs.data?.length === 0);
  const butt = await other.db.rpc('owner_reply', { p_thread_id: threadId, p_body: 'I am not the owner' });
  check("another owner cannot reply in the owner's conversation", !!butt.error);
  const direct = await owner.db.from('messages').insert({ thread_id: threadId, sender_kind: 'owner', body: 'x' });
  check('messages are written only through owner_reply', !!direct.error);
  const reply = await owner.db.rpc('owner_reply', { p_thread_id: threadId, p_body: 'Thank you so much! I will pick it up tonight.' });
  check('owner: replies', !reply.error && typeof reply.data === 'string', JSON.stringify(reply.error));
  const after = await owner.db.from('messages').select('id', { count: 'exact', head: true }).in('thread_id', [threadId]).eq('sender_kind', 'finder').is('read_by_owner_at', null);
  check('owner: replying marks the notes read', after.count === 0);
}

{
  const back = await finder.view(tagId, token);
  const msgs = back.json?.thread?.messages ?? [];
  check("finder: reads the owner's reply on the tag page", msgs.length === 3 && msgs[2].sender_kind === 'owner' && msgs[2].body.startsWith('Thank you'), JSON.stringify(msgs.map((m) => m.sender_kind)));
  check('finder: the conversation shows no owner details', !/owner@example\.com|Olive/.test(back.text));
  const { rows } = await sql("select read_by_finder_at from qurtag.messages where sender_kind = 'owner'");
  check("the owner's reply is marked read by the finder", rows[0]?.read_by_finder_at !== null);
}

// ------------------------------------------------------------------ lost, off, replaced

{
  const lost = await owner.db.from('items').update({ lost_mode: true }).eq('id', itemId).select('lost_mode');
  check('owner: marks the item lost', lost.data?.[0]?.lost_mode === true, JSON.stringify(lost.error));
  const v = await finder.view(tagId);
  check('finder: the page says it is lost', v.json?.item?.lost === true);
  const tagRow = (await owner.db.from('tags').select('id').eq('public_id', tagId)).data?.[0];
  await owner.db.from('tags').update({ status: 'inactive' }).eq('id', tagRow.id);
  const off = await finder.view(tagId, token);
  check('a switched-off tag answers not registered', off.status === 404);
  const offSend = await finder.send(tagId, token, 'hello?');
  check('a switched-off tag takes no notes', offSend.status === 404, `${offSend.status}`);
  await owner.db.from('tags').update({ status: 'active' }).eq('id', tagRow.id);
  const replaced = await owner.db.rpc('replace_tag', { p_item_id: itemId });
  const newTag = replaced.data?.public_id;
  check('owner: replaces the tag', !replaced.error && newTag && newTag !== tagId, JSON.stringify(replaced.error));
  check('the old tag no longer opens anything', (await finder.view(tagId, token)).status === 404);
  check('the new tag opens the item', (await finder.view(newTag)).json?.item?.name === 'Blue water bottle');
  const reuse = await owner.db.from('tags').update({ status: 'active' }).eq('id', tagRow.id).select();
  check('a replaced tag cannot be switched back on', (reuse.data ?? []).length === 0);
}

// ------------------------------------------------------------------ outbox

{
  // Each finder note queues one owner email; the finder route's nudge may already have run.
  const { rows: before } = await sql("select count(*)::int as n from qurtag.outbox where kind = 'finder_message'");
  check("each finder note queued an owner email", before[0].n === 2, JSON.stringify(before));
  const nope = await fetch(`${BASE}/api/jobs/outbox`, { method: 'POST' });
  check('the outbox answers only the scheduler', nope.status === 401);
  const run = await fetch(`${BASE}/api/jobs/outbox`, { method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const j = await run.json();
  const { rows: after } = await sql("select count(*)::int as n from qurtag.outbox where kind = 'finder_message' and sent_at is null");
  check('the outbox finishes its rows (email is off: none sent)', run.status === 200 && after[0].n === 0, JSON.stringify(j));
  // The email copy waits 10 minutes (db/push.sql); it is not due yet, so this run leaves it.
  const { rows: copies } = await sql("select count(*)::int as n from qurtag.outbox where kind = 'push_email' and sent_at is null and next_attempt_at > now() + interval '9 minutes'");
  check('each finder note also queued an email copy for 10 minutes later', copies[0].n === 2, JSON.stringify(copies));
}

// ------------------------------------------------------------------ Factory counts

{
  const anon = new Person('factory', '10.0.0.20');
  const m = await anon.req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: process.env.QURTAG_TEST_FACTORY_TOKEN } });
  check('the Factory reads counts with its token', m.status === 200 && m.json?.accounts_total === 2 && m.json?.conversations_total === 1, JSON.stringify(m.json));
  const bad = await anon.req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: 'wrong' } });
  check('a wrong metrics token is refused', bad.status === 401 || bad.status === 403, `${bad.status}`);
}

// ------------------------------------------------------------------ refusals at the data API

{
  const hdr = (t) => `${Buffer.from(JSON.stringify(t)).toString('base64url')}`;
  const forged = `${hdr({ alg: 'ES256', kid: 'x' })}.${hdr({ sub: owner.id, sid: owner.id, role: 'service_role', app: 'qurtag', aud: 'qurtag' })}.${Buffer.alloc(64).toString('base64url')}`;
  for (const [label, t] of [['a forged pass', forged], ['an unsigned pass', `${hdr({ alg: 'none' })}.${hdr({ role: 'qurtag_user' })}.`], ['a pass from another app', 'abc.def.ghi']]) {
    const r = await finder2.req('/api/data/items', { headers: { authorization: `Bearer ${t}` } });
    check(`${label} is refused before the database`, r.status === 401, `${r.status}`);
  }
  const parts = owner.pass.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const edited = `${parts[0]}.${hdr({ ...claims, sub: other.id })}.${parts[2]}`;
  const r = await finder2.req('/api/data/items', { headers: { authorization: `Bearer ${edited}` } });
  check('an edited pass (someone else) is refused', r.status === 401, `${r.status}`);
  for (const path of ['/api/data/auth_users', '/api/data/outbox', '/api/data/factory_access', '/api/data/rpc/server_finder_view', '/api/data/rpc/server_outbox_take', '/api/data/rpc/pass_public_keys']) {
    const x = await owner.req(path, { headers: { authorization: `Bearer ${owner.pass}` }, method: path.includes('/rpc/') ? 'POST' : 'GET', body: path.includes('/rpc/') ? {} : undefined });
    check(`${path} is not served`, x.status === 404, `${x.status}`);
  }
  const other_schema = await owner.req('/api/data/items', { headers: { authorization: `Bearer ${owner.pass}`, 'accept-profile': 'public' } });
  check('another schema is refused', other_schema.status === 406, `${other_schema.status}`);
  const inj = await owner.req(`/api/data/items?select=id&name=eq.${encodeURIComponent("x' or 1=1 --")}`, { headers: { authorization: `Bearer ${owner.pass}` } });
  check('a value full of SQL is just a value', inj.status === 200 && Array.isArray(inj.json) && inj.json.length === 0, `${inj.status}`);
  const cors = await fetch(`${BASE}/api/data/items`, { headers: { origin: 'https://evil.example.com', authorization: `Bearer ${owner.pass}` } });
  check('a page on another site is refused by the data API', cors.status === 403, `${cors.status}`);
}

// ------------------------------------------------------------------ deleting an item

{
  const extra = await other.db.rpc('create_item', { p_name: 'Gym bag' });
  const extraTag = extra.data?.public_id;
  await finder2.view(extraTag, null, true);
  await finder2.send(extraTag, null, 'Found your gym bag by the lockers.');
  const del = await other.db.from('items').delete().eq('id', extra.data?.item_id);
  check('an owner deletes an item', !del.error, JSON.stringify(del.error));
  const { rows } = await sql(
    `select (select count(*) from qurtag.tags t join qurtag.households h on h.id = t.household_id where h.owner_user_id = $1)::int as tags,
            (select count(*) from qurtag.threads t join qurtag.households h on h.id = t.household_id where h.owner_user_id = $1)::int as threads,
            (select count(*) from qurtag.scans s join qurtag.tags t on t.id = s.tag_id join qurtag.households h on h.id = t.household_id where h.owner_user_id = $1)::int as scans`,
    [other.id],
  );
  check("deleting an item deletes its tag, scans and conversations", rows[0].tags === 0 && rows[0].threads === 0 && rows[0].scans === 0, JSON.stringify(rows[0]));
  check("a deleted item's tag answers not registered", (await finder2.view(extraTag)).status === 404);
}

// ------------------------------------------------------------------ the Super Admin role (db/admin.sql)

{
  const ADMIN_CALLS = [
    ['admin_overview', {}],
    ['admin_list_accounts', { p_search: null, p_limit: 5, p_offset: 0 }],
    ['admin_account', { p_user: owner.id }],
    ['admin_set_tag', { p_tag: '00000000-0000-0000-0000-000000000000', p_active: false }],
    ['admin_set_message_hidden', { p_message: '00000000-0000-0000-0000-000000000000', p_hidden: true }],
    ['admin_delete_account', { p_user: other.id, p_confirm_email: 'other@example.com' }],
  ];
  const auditCount = async () => Number((await sql('select count(*) as n from qurtag.admin_audit')).rows[0].n);

  const boss = new Person('super admin', '10.0.0.30');
  await signUp(boss, 'boss@example.com', 'Bea Boss');
  const doomed = new Person('doomed account', '10.0.0.31');
  await signUp(doomed, 'doomed@example.com', 'Dan Doomed');
  const finder3 = new Person('third finder', '10.0.0.32');

  // Nobody becomes a super admin through the app: not by a request, not by a table.
  const before = await auditCount();
  const noFlag = await sql('select count(*)::int as n from qurtag.super_admins');
  check('nobody is a super admin until a rollout file says so', noFlag.rows[0].n === 0);
  check('a normal owner: is_super_admin answers false', (await owner.db.rpc('is_super_admin')).data === false);
  for (const [fn, args] of ADMIN_CALLS) {
    const r = await owner.db.rpc(fn, args);
    check(`a normal owner is refused ${fn} (403)`, r.status === 403 && r.data === null, `${r.status} ${JSON.stringify(r.error)}`);
  }
  for (const [fn, args] of ADMIN_CALLS) {
    const r = await new Person('visitor', '10.0.0.33').req(`/api/data/rpc/${fn}`, { method: 'POST', body: args });
    check(`a visitor with no pass is refused ${fn} (401)`, r.status === 401, `${r.status}`);
  }
  for (const path of ['/api/data/super_admins', '/api/data/admin_audit']) {
    const r = await owner.req(path, { headers: { authorization: `Bearer ${owner.pass}` } });
    check(`a normal owner cannot read ${path.split('/').pop()}`, r.status >= 400, `${r.status}`);
  }
  for (const fn of ['admin_check', 'admin_log']) {
    const r = await owner.req(`/api/data/rpc/${fn}`, { method: 'POST', headers: { authorization: `Bearer ${owner.pass}` }, body: {} });
    check(`${fn} cannot be called from the app`, r.status >= 400, `${r.status}`);
  }
  {
    const c = new pg.Client({ connectionString: process.env.QURTAG_TEST_LOGIN_DB_DATA });
    await c.connect();
    await c.query('set role qurtag_user');
    for (const q of ['select * from qurtag.super_admins', 'select * from qurtag.admin_audit', `insert into qurtag.super_admins (user_id) values ('${owner.id}')`,
                     `select qurtag.admin_check()`, `select qurtag.admin_log('${owner.id}', 'view_overview', null, null, '{}')`]) {
      let code = null;
      try {
        await c.query(q);
      } catch (e) {
        code = e.code;
      }
      check(`qurtag_user is refused at the database: ${q.slice(0, 48)}`, code === '42501', `${code}`);
    }
    await c.query('reset role');
    await c.end();
  }
  for (const login of ['QURTAG_TEST_LOGIN_DB_SERVER', 'QURTAG_TEST_LOGIN_DB_AUTH']) {
    const c = new pg.Client({ connectionString: process.env[login] });
    await c.connect();
    let code = null;
    try {
      await c.query('select qurtag.admin_overview()');
    } catch (e) {
      code = e.code;
    }
    check(`${login.replace('QURTAG_TEST_LOGIN_DB_', '').toLowerCase()} login cannot run admin functions`, code === '42501', `${code}`);
    await c.end();
  }
  check('refused calls write nothing to the admin log', (await auditCount()) === before);

  // The rollout file's job, done here directly.
  await sql('insert into qurtag.super_admins (user_id) select id from qurtag.auth_users where email = $1', ['boss@example.com']);
  check('a super admin: is_super_admin answers true', (await boss.db.rpc('is_super_admin')).data === true);
  check('an admin flag is not carried by anyone else', (await owner.db.rpc('is_super_admin')).data === false);

  // Counts.
  {
    const o = await boss.db.rpc('admin_overview');
    const { rows } = await sql(`select (select count(*) from qurtag.auth_users)::int as accounts, (select count(*) from qurtag.items)::int as items,
      (select count(*) from qurtag.tags)::int as tags, (select count(*) from qurtag.scans where scanned_at > now() - interval '7 days')::int as scans_7d,
      (select count(*) from qurtag.messages where created_at > now() - interval '30 days')::int as messages_30d`);
    const d = o.data ?? {};
    check('admin: the counts match the database', !o.error && d.accounts === rows[0].accounts && d.items === rows[0].items && d.tags === rows[0].tags && d.scans_7d === rows[0].scans_7d && d.messages_30d === rows[0].messages_30d,
      `${JSON.stringify(o.error)} ${JSON.stringify(d)} ${JSON.stringify(rows[0])}`);
    check('admin: the counts cover 7 and 30 days', ['accounts_7d', 'accounts_30d', 'scans_7d', 'scans_30d', 'messages_7d', 'messages_30d'].every((k) => typeof d[k] === 'number'));
  }

  // The list, and search.
  {
    const all = await boss.db.rpc('admin_list_accounts', { p_search: null, p_limit: 100, p_offset: 0 });
    const emails = (all.data?.accounts ?? []).map((a) => a.email);
    check('admin: lists accounts with email, joined and item count', emails.includes('owner@example.com') && all.data.accounts.every((a) => a.joined && typeof a.item_count === 'number'), JSON.stringify(all.error));
    const ownerRow = all.data?.accounts?.find((a) => a.email === 'owner@example.com');
    check("admin: the owner's item count is right", ownerRow?.item_count === 2, `${ownerRow?.item_count}`);
    const found = await boss.db.rpc('admin_list_accounts', { p_search: 'OWNER@exa', p_limit: 25, p_offset: 0 });
    check('admin: search finds part of an email, any case', found.data?.total === 1 && found.data.accounts.some((a) => a.email === 'owner@example.com'), JSON.stringify(found.data));
    const wild = await boss.db.rpc('admin_list_accounts', { p_search: '%', p_limit: 25, p_offset: 0 });
    check('admin: a percent sign in the search is a plain character', wild.data?.total === 0, JSON.stringify(wild.data));
    const page = await boss.db.rpc('admin_list_accounts', { p_search: null, p_limit: 1, p_offset: 1 });
    check('admin: pages the list', page.data?.accounts?.length === 1 && page.data.total === all.data.total);
  }

  // One account.
  const activeTag = (await sql(`select t.id, t.public_id from qurtag.tags t join qurtag.items i on i.id = t.current_item_id
                                where i.household_id = $1 and t.status = 'active' and i.name = 'Blue water bottle'`, [owner.household])).rows[0];
  const hashes = (await sql('select finder_token_sha256 as h from qurtag.threads')).rows.map((r) => r.h);
  {
    const a = await boss.db.rpc('admin_account', { p_user: owner.id });
    const text = JSON.stringify(a.data);
    check("admin: sees the account's items, tags and conversations", !a.error && a.data.items.length === 2 && a.data.tags.length >= 3 && a.data.threads.length >= 1 && a.data.threads[0].messages.length >= 3, JSON.stringify(a.error));
    check('admin: never sees a finder token hash, sign-in data or private notes',
      hashes.length > 0 && !hashes.some((h) => text.includes(h)) && !/finder_token|password|PRIVATE-NOTE|data:image|session|jwks/i.test(text));
    check('admin: an unknown account is not found', (await boss.db.rpc('admin_account', { p_user: '00000000-0000-0000-0000-000000000000' })).status === 404);
  }

  // Switch a tag off.
  {
    const fresh = await finder3.send(activeTag.public_id, null, 'A rude note the owner should not have to read');
    const tok = fresh.json?.token;
    check('setup: a third finder opens a conversation', fresh.status === 200 && !!tok, `${fresh.status}`);
    check('before: the tag opens', (await finder3.view(activeTag.public_id, tok)).status === 200);
    const off = await boss.db.rpc('admin_set_tag', { p_tag: activeTag.id, p_active: false });
    check('admin: switches a tag off', !off.error && off.data?.status === 'inactive', JSON.stringify(off.error));
    check('a tag an admin switched off answers not registered', (await finder3.view(activeTag.public_id, tok)).status === 404);
    const back = await owner.db.from('tags').update({ status: 'active' }).eq('id', activeTag.id).select();
    check('the owner cannot switch it back on', (back.data ?? []).length === 0, JSON.stringify(back));
    const rep = await owner.db.rpc('replace_tag', { p_item_id: itemId });
    check('the owner cannot get around it with a new tag', rep.status === 403, `${rep.status} ${JSON.stringify(rep.error)}`);
    const again = await boss.db.rpc('admin_set_tag', { p_tag: activeTag.id, p_active: true });
    check('admin: switches it back on', !again.error && again.data?.status === 'active', JSON.stringify(again.error));
    check('then the tag opens again', (await finder3.view(activeTag.public_id, tok)).status === 200);
    const notOwn = await boss.db.rpc('admin_set_tag', { p_tag: activeTag.id, p_active: true });
    check('admin: "on" only undoes an admin switch-off', notOwn.error?.message === 'not_disabled_by_admin', JSON.stringify(notOwn.error));
    const replacedTag = (await sql(`select id from qurtag.tags where status = 'replaced' limit 1`)).rows[0];
    check('admin: a replaced tag cannot be switched', (await boss.db.rpc('admin_set_tag', { p_tag: replacedTag.id, p_active: false })).error?.message === 'tag_replaced');

    // Hide a message.
    const thread = (await sql('select id from qurtag.threads where tag_id = $1', [activeTag.id])).rows[0];
    const msg = (await sql(`select id from qurtag.messages where thread_id = $1 and sender_kind = 'finder'`, [thread.id])).rows[0];
    const mine = await owner.db.from('messages').select('id').eq('thread_id', thread.id);
    check('before: the owner reads the note', mine.data?.some((m) => m.id === msg.id));
    const hide = await boss.db.rpc('admin_set_message_hidden', { p_message: msg.id, p_hidden: true });
    check('admin: hides a message', !hide.error && hide.data?.hidden === true, JSON.stringify(hide.error));
    const after = await owner.db.from('messages').select('id').eq('thread_id', thread.id);
    check("a hidden message is gone from the owner's inbox", !after.data?.some((m) => m.id === msg.id) && !after.error);
    const seen = await finder3.view(activeTag.public_id, tok);
    check("a hidden message is gone from the finder's page", !(seen.json?.thread?.messages ?? []).some((m) => m.id === msg.id));
    const stillThere = await boss.db.rpc('admin_account', { p_user: owner.id });
    check('the admin still sees it, marked hidden', stillThere.data.threads.flatMap((t) => t.messages).some((m) => m.id === msg.id && m.hidden === true));
    check('admin: shows it again', (await boss.db.rpc('admin_set_message_hidden', { p_message: msg.id, p_hidden: false })).data?.hidden === false);
    check('then the owner reads it again', (await owner.db.from('messages').select('id').eq('thread_id', thread.id)).data?.some((m) => m.id === msg.id));
  }

  // Delete an account.
  {
    const made = await doomed.db.rpc('create_item', { p_name: 'Doomed umbrella' });
    check('setup: the account to delete has an item', !made.error);
    const doomedTag = made.data?.public_id;
    await finder3.send(doomedTag, null, 'a note to a doomed owner');
    const wrong = await boss.db.rpc('admin_delete_account', { p_user: doomed.id, p_confirm_email: 'someone@else.com' });
    check('admin: a wrong typed email deletes nothing', wrong.error?.message === 'confirmation_mismatch', JSON.stringify(wrong.error));
    const none = await boss.db.rpc('admin_delete_account', { p_user: doomed.id, p_confirm_email: null });
    check('admin: no typed email deletes nothing', !!none.error);
    check('the account is still there', (await sql('select count(*)::int as n from qurtag.auth_users where id = $1', [doomed.id])).rows[0].n === 1);
    const self = await boss.db.rpc('admin_delete_account', { p_user: boss.id, p_confirm_email: 'boss@example.com' });
    check("admin: a super admin's account cannot be deleted", self.error?.message === 'cannot_delete_admin', JSON.stringify(self.error));
    const ok = await boss.db.rpc('admin_delete_account', { p_user: doomed.id, p_confirm_email: ' Doomed@Example.com ' });
    check('admin: deletes the account after the typed email', !ok.error && ok.data?.deleted === true, JSON.stringify(ok.error));
    const gone = await sql(`select (select count(*) from qurtag.auth_users where id = $1)::int as users, (select count(*) from qurtag.households where owner_user_id = $1)::int as hh,
      (select count(*) from qurtag.items where name = 'Doomed umbrella')::int as items, (select count(*) from qurtag.tags where public_id = $2)::int as tags,
      (select count(*) from qurtag.auth_sessions where "userId" = $1)::int as sessions`, [doomed.id, doomedTag]);
    check('the account, its items, tags and sign-ins are gone', Object.values(gone.rows[0]).every((n) => n === 0), JSON.stringify(gone.rows[0]));
    check("the deleted account's tag answers not registered", (await finder3.view(doomedTag)).status === 404);
  }

  // The log.
  {
    const rows = (await sql('select * from qurtag.admin_audit order by id')).rows;
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['view_overview', 'list_accounts', 'view_account', 'disable_tag', 'enable_tag', 'hide_message', 'unhide_message', 'delete_account']) {
      check(`the admin log holds ${a}`, actions.has(a));
    }
    check('every log row says who (id and email) and when', rows.length > 0 && rows.every((r) => r.actor_id === boss.id && r.actor_email === 'boss@example.com' && r.at instanceof Date));
    const del = rows.find((r) => r.action === 'delete_account');
    check('the log keeps what was deleted after the account is gone', del?.detail?.email === 'doomed@example.com' && del.detail.items === 1 && del.target_id === doomed.id, JSON.stringify(del));
    check('failed attempts (wrong email, an admin) left no delete row', rows.filter((r) => r.action === 'delete_account').length === 1);
    check('only the admin actions above were logged', rows.every((r) => r.actor_id === boss.id));
    let blocked = 0;
    for (const q of ["update qurtag.admin_audit set actor_email = 'x'", 'delete from qurtag.admin_audit', 'truncate qurtag.admin_audit']) {
      try {
        await sql(q);
      } catch {
        blocked++;
      }
    }
    check('the admin log can only be added to', blocked === 3, `${blocked}`);
    // The log row is written in the same step as the action: a failed action leaves none.
    const n0 = await auditCount();
    await boss.db.rpc('admin_set_tag', { p_tag: '00000000-0000-0000-0000-000000000001', p_active: false });
    check('an action that fails leaves no log row', (await auditCount()) === n0);
  }

  // A signed-out admin pass is dead at once.
  {
    const pass = boss.pass;
    await boss.req('/api/auth/sign-out', { method: 'POST', body: {} });
    const r = await owner.req('/api/data/rpc/admin_overview', { method: 'POST', headers: { authorization: `Bearer ${pass}` }, body: {} });
    check("after sign-out, an admin's unexpired pass is refused", r.status === 403, `${r.status}`);
  }
}

// ------------------------------------------------------------------ sign-out and deletion

{
  const pass = other.pass;
  await other.req('/api/auth/sign-out', { method: 'POST', body: {} });
  const after = await other.req('/api/data/households', { headers: { authorization: `Bearer ${pass}` } });
  check('after sign-out, a pass still unexpired reads nothing', after.status === 200 && Array.isArray(after.json) && after.json.length === 0, `${after.status} ${after.text}`);
}
{
  const del = await owner.db.rpc('delete_my_account');
  check('owner: deletes their account', !del.error, JSON.stringify(del.error));
  const { rows } = await sql('select (select count(*) from qurtag.items)::int as items, (select count(*) from qurtag.threads)::int as threads, (select count(*) from qurtag.messages)::int as messages, (select count(*) from qurtag.tags)::int as tags');
  check("deleting the account removes the owner's items, tags and conversations", rows[0].items === 0 && rows[0].threads === 0 && rows[0].messages === 0 && rows[0].tags === 0, JSON.stringify(rows[0]));
  const v = await finder.view(created2.data?.public_id);
  check("a deleted owner's tag answers not registered", v.status === 404);
}

// ------------------------------------------------------------------ isolation in the database

const LOGINS = {
  qurtag_auth: process.env.QURTAG_TEST_LOGIN_DB_AUTH,
  qurtag_authenticator: process.env.QURTAG_TEST_LOGIN_DB_DATA,
  qurtag_server: process.env.QURTAG_TEST_LOGIN_DB_SERVER,
};
const DECOYS = ['perklyy.customers', 'wawe_vote.votes', 'yestonight.plans', 'public.app_secrets', 'auth.users', 'tentables.user_profiles'];
for (const [login, url] of Object.entries(LOGINS)) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const roles = login === 'qurtag_authenticator' ? [null, 'qurtag_user', 'qurtag_anon'] : [null];
  for (const role of roles) {
    const who = role ? `${login} as ${role}` : login;
    if (role) await c.query(`set role ${role}`);
    for (const t of DECOYS) {
      let denied = false;
      try {
        await c.query(`select * from ${t} limit 1`);
      } catch (e) {
        denied = e.code === '42501';
      }
      check(`${who} cannot read ${t}`, denied);
    }
    const { rows } = await c.query(`
      select n.nspname || '.' || c.relname as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'v', 'm', 'p', 'f')
        and n.nspname not in ('qurtag', 'pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%'
        and has_schema_privilege(current_user, n.oid, 'USAGE')
        and (has_table_privilege(current_user, c.oid, 'SELECT') or has_table_privilege(current_user, c.oid, 'INSERT')
             or has_table_privilege(current_user, c.oid, 'UPDATE') or has_table_privilege(current_user, c.oid, 'DELETE'))`);
    const reach = rows.map((r) => r.t).filter((t) => !['net._http_response', 'net.http_request_queue'].includes(t));
    check(`${who} reaches no table outside qurtag (pg_net's two PUBLIC tables aside)`, reach.length === 0, reach.join(', '));
    if (role) await c.query('reset role');
  }
  for (const target of ['postgres', 'anon', 'authenticated', 'service_role', 'authenticator', 'perklyy_staff', 'wawe_vote_api', 'tentables_user', 'qurtag_auth', 'qurtag_server', 'supabase_admin']) {
    if (target === login) continue;
    let refused = false;
    try {
      await c.query(`set role ${target}`);
      await c.query('reset role');
    } catch (e) {
      refused = e.code === '42501' || e.code === '22023';
    }
    check(`${login} cannot become ${target}`, refused);
  }
  if (login !== 'qurtag_auth') {
    let refused = false;
    try {
      await c.query('select count(*) from qurtag.auth_users');
    } catch (e) {
      refused = e.code === '42501';
    }
    check(`${login} cannot read the sign-in tables`, refused);
  }
  await c.end();
}
{
  // The finder's side of the database: the server login and a visitor with no pass reach no QuR Tag table.
  for (const [login, url, role] of [
    ['qurtag_server', LOGINS.qurtag_server, null],
    ['qurtag_authenticator', LOGINS.qurtag_authenticator, 'qurtag_anon'],
  ]) {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    if (role) await c.query(`set role ${role}`);
    for (const t of ['items', 'tags', 'threads', 'messages', 'scans', 'households', 'outbox']) {
      let denied = false;
      try {
        await c.query(`select * from qurtag.${t} limit 1`);
      } catch (e) {
        denied = e.code === '42501';
      }
      check(`${role ?? login} cannot list qurtag.${t}`, denied);
    }
    for (const t of ['messages', 'threads']) {
      let denied = false;
      try {
        await c.query(`update qurtag.${t} set created_at = now()`);
      } catch (e) {
        denied = e.code === '42501';
      }
      check(`${role ?? login} cannot change qurtag.${t}`, denied);
    }
    await c.end();
  }
  const c = new pg.Client({ connectionString: LOGINS.qurtag_authenticator });
  await c.connect();
  await c.query('set role qurtag_user');
  let denied = false;
  try {
    await c.query('select finder_token_sha256 from qurtag.threads');
  } catch (e) {
    denied = e.code === '42501';
  }
  check('qurtag_user cannot read the finder token hash column', denied);
  await c.end();
}
{
  const { rows } = await sql(`select r.rolname from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator', 'perklyy_authenticator', 'wawe_vote_api')
      and (has_schema_privilege(r.rolname, 'qurtag', 'USAGE')
           or pg_has_role(r.rolname, 'qurtag_user', 'USAGE') or pg_has_role(r.rolname, 'qurtag_anon', 'USAGE'))`);
  check("Supabase's API roles and other apps' logins cannot use schema qurtag or act as a QuR Tag role", rows.length === 0, rows.map((r) => r.rolname).join(', '));
  const open = await sql(`select tablename, policyname from pg_policies where schemaname = 'qurtag' and (qual = 'true' and not (roles @> array['qurtag_auth']::name[]))`);
  check('no policy in qurtag is "using (true)" except the sign-in service on its own tables', open.rows.length === 0, JSON.stringify(open.rows));
}

// ------------------------------------------------------------------ the list matches the schema

{
  const { TABLES, RPCS, EMBEDS } = await import('../../server/data/allowlist.ts');
  const { rows } = await sql(`select table_name, column_name from information_schema.columns where table_schema = 'qurtag'`);
  const cols = new Map();
  for (const r of rows) cols.set(r.table_name, [...(cols.get(r.table_name) ?? []), r.column_name]);
  const missing = [];
  for (const [t, rule] of Object.entries(TABLES)) {
    for (const c of [...rule.columns, ...(rule.user?.read ?? []), ...(rule.user?.write ?? [])]) if (!cols.get(t)?.includes(c)) missing.push(`${t}.${c}`);
    if (rule.columns.includes('finder_token_sha256')) missing.push('finder_token_sha256 must never be listed');
  }
  for (const [parent, embeds] of Object.entries(EMBEDS)) {
    for (const e of Object.values(embeds)) {
      if (!cols.get(parent)?.includes(e.local)) missing.push(`${parent}.${e.local}`);
      if (!cols.get(e.table)?.includes(e.remote)) missing.push(`${e.table}.${e.remote}`);
    }
  }
  check('every table, column and embed in the list exists in schema qurtag', missing.length === 0, missing.join(', '));
  const fns = await sql(`select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'qurtag'`);
  const badFns = Object.entries(RPCS).filter(([name, rule]) => {
    const f = fns.rows.find((x) => x.proname === name);
    return !f || Object.keys(rule.args).some((a) => !f.args.includes(a));
  });
  check('every function in the list exists with those arguments', badFns.length === 0, badFns.map((x) => x[0]).join(', '));
}

await admin.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
