#!/usr/bin/env node
/**
 * End-to-end test of db/signup-source.sql, after e2e.test.mjs, on the same throwaway Postgres and server functions.
 * A new owner records where they came from once; a second call changes nothing; an unknown channel is refused; a bad
 * path is dropped; an old account is refused; a visitor cannot call it; nobody can read the table through any login;
 * deleting the account deletes the row.
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

const stamp = Date.now();
const src = { p_utm_source: 'facebook', p_utm_medium: 'social', p_utm_campaign: 'profile', p_utm_term: null, p_utm_content: null, p_referrer_url: 'https://l.facebook.com/', p_landing_path: '/pricing', p_channel: 'organic_social' };

const a = await new Person('source a', '10.61.1.1').signUp(`src-a-${stamp}@example.com`, 'Source A');
const first = await a.db.rpc('record_signup_source', src);
check('a new owner records their source', first.error === null && first.data === true, JSON.stringify(first.error));
const second = await a.db.rpc('record_signup_source', { ...src, p_utm_source: 'other', p_channel: 'email' });
check('a second call changes nothing', second.data === false);
const row = (await sql('select * from qurtag.signup_sources where user_id = (select id from qurtag.auth_users where email = $1)', [a.email])).rows[0];
check('the first touch is what is kept', row?.utm_source === 'facebook' && row?.acquisition_channel === 'organic_social' && row?.landing_path === '/pricing' && row?.referrer_url === 'https://l.facebook.com/');

const b = await new Person('source b', '10.61.1.2').signUp(`src-b-${stamp}@example.com`, 'Source B');
const bad = await b.db.rpc('record_signup_source', { ...src, p_channel: 'made-up' });
check('an unknown channel is refused', bad.data === false);
const path = await b.db.rpc('record_signup_source', { ...src, p_landing_path: '/find/x?email=a@b.c' });
check('a bad path is dropped, the rest kept', path.data === true);
check('and not stored', (await sql('select landing_path from qurtag.signup_sources where user_id = (select id from qurtag.auth_users where email = $1)', [b.email])).rows[0].landing_path === null);

const c = await new Person('source c', '10.61.1.3').signUp(`src-c-${stamp}@example.com`, 'Source C');
await sql(`update qurtag.auth_users set "createdAt" = now() - interval '30 days' where email = $1`, [c.email]);
const old = await c.db.rpc('record_signup_source', src);
check('an account older than 7 days is refused', old.data === false);

const visitor = new Person('visitor', '10.61.1.4');
const anon = await visitor.db.rpc('record_signup_source', src);
check('a visitor with no pass cannot call it', anon.error !== null);

const read = await a.db.from('signup_sources').select('*');
check('an owner cannot read the table, not even their own row', read.error !== null || (read.data ?? []).length === 0);
for (const [label, client] of [['the data login', dataDb], ['the server login', serverDb]]) {
  let refused = false;
  try { await client.query('select * from qurtag.signup_sources'); } catch { refused = true; }
  check(`${label} cannot read the table`, refused);
}

await sql('delete from qurtag.auth_users where email = $1', [a.email]);
check('deleting the account deletes the row', (await sql('select count(*)::int as n from qurtag.signup_sources where user_id not in (select id from qurtag.auth_users)')).rows[0].n === 0);

await admin.end(); await dataDb.end(); await serverDb.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
