#!/usr/bin/env node
/**
 * End-to-end test of db/factory-signup-sources.sql, after signup-source.test.mjs, on the same throwaway Postgres
 * and server functions. The Company OS reads where sign-ups came from through qurtag.factory_signup_sources, the
 * way it reads qurtag.factory_metrics: the data API's rpc route, no pass, the metrics token in the body.
 *   - a wrong token and no token are refused, and a signed-in owner's pass does not change that;
 *   - each recorded sign-up comes back as a day, source, post tag, referrer host, channel and "ours";
 *   - an account on a test or company address is ours, a customer's is not;
 *   - the window is held to 1..90 days and a sign-up older than the window is left out;
 *   - the answer holds no email, no name, no account id and no landing path;
 *   - an empty window is an answer (rows: []), not an error;
 *   - the table itself is still unreadable by every login.
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

const TOKEN = process.env.QURTAG_TEST_FACTORY_TOKEN;
const asker = new Person('factory', '10.62.9.9');
const read = (token, days, headers = { authorization: '' }) =>
  asker.req('/api/data/rpc/factory_signup_sources', { method: 'POST', body: { p_token: token, ...(days === undefined ? {} : { p_days: days }) }, headers });

const stamp = Date.now();
const src = (over = {}) => ({ p_utm_source: 'x', p_utm_medium: 'social', p_utm_campaign: 'posts', p_utm_term: null, p_utm_content: 'P-1424', p_referrer_url: 'https://www.t.co/abc', p_landing_path: '/pricing', p_channel: 'organic_social', ...over });

// A customer with a post tag, a customer from a search engine, one of ours on a test name, one on the company's domain, and an old one.
const cust = await new Person('cust', '10.62.1.1').signUp(`reader-cust-${stamp}@gmail.com`, 'Customer');
await cust.db.rpc('record_signup_source', src());
const search = await new Person('search', '10.62.1.2').signUp(`reader-search-${stamp}@gmail.com`, 'Searcher');
await search.db.rpc('record_signup_source', src({ p_utm_source: null, p_utm_content: null, p_referrer_url: 'https://www.google.com/', p_channel: 'organic_search' }));
const qa = await new Person('qa', '10.62.1.3').signUp(`qa-${stamp}@gmail.com`, 'Our QA');
await qa.db.rpc('record_signup_source', src({ p_utm_source: 'facebook', p_utm_content: null, p_referrer_url: null, p_channel: 'organic_social' }));
const own = await new Person('own', '10.62.1.4').signUp(`reader-own-${stamp}@impactconsulting.ai`, 'Our domain');
await own.db.rpc('record_signup_source', src({ p_utm_source: 'linkedin', p_utm_content: 'P-1500', p_referrer_url: null }));
const old = await new Person('old', '10.62.1.5').signUp(`reader-old-${stamp}@gmail.com`, 'Old');
await old.db.rpc('record_signup_source', src({ p_utm_source: 'reddit', p_utm_content: 'P-1', p_referrer_url: null }));
await sql(`update qurtag.signup_sources set recorded_at = now() - interval '40 days' where user_id = (select id from qurtag.auth_users where email = $1)`, [old.email]);

const wrong = await read('not-the-token');
check('a wrong token is refused', wrong.status >= 400 && !wrong.json?.rows);
const none = await read(null);
check('no token is refused', none.status >= 400 && !none.json?.rows);
const withPass = await read('not-the-token', 28, { authorization: `Bearer ${cust.token ?? 'x'}` });
check('a pass does not stand in for the token', withPass.status >= 400 && !withPass.json?.rows);

const ok = await read(TOKEN, 28);
check('the token is answered', ok.status === 200 && Array.isArray(ok.json?.rows), JSON.stringify(ok.json)?.slice(0, 200));
const rows = ok.json?.rows ?? [];
const post = rows.find((r) => r.utm_content === 'P-1424' && !r.ours);
check('a customer comes back with source, post tag, referrer host and channel', post?.utm_source === 'x' && post?.referrer_host === 't.co' && post?.channel === 'organic_social' && /^\d{4}-\d\d-\d\d$/.test(post?.day ?? ''));
const srch = rows.find((r) => r.referrer_host === 'google.com');
check('a search sign-up has no source tag and a host', srch && srch.utm_source === null && srch.channel === 'organic_search' && srch.ours === false);
check('a test name is ours', rows.find((r) => r.utm_source === 'facebook')?.ours === true);
check('an address on the company domain is ours', rows.find((r) => r.utm_content === 'P-1500')?.ours === true);
check('a sign-up 40 days ago is outside 28 days', !rows.some((r) => r.utm_source === 'reddit'));
const wide = await read(TOKEN, 90);
check('and inside 90 days', (wide.json?.rows ?? []).some((r) => r.utm_source === 'reddit'));
const capped = await read(TOKEN, 1000);
check('the window is held to 90 days', capped.json?.days === 90);
const text = JSON.stringify(ok.json);
check('the answer holds no email, name, id or landing path', !/@/.test(text) && !text.includes('Customer') && !text.includes('/pricing') && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text));
check('the answer has the keys the Company OS reads', rows.every((r) => ['day', 'utm_source', 'utm_content', 'referrer_host', 'channel', 'ours'].every((k) => k in r)) && Object.keys(rows[0] ?? {}).length === 6);

// An empty window is an answer.
await sql('update qurtag.signup_sources set recorded_at = now() - interval \'80 days\'');
const empty = await read(TOKEN, 28);
check('an empty window answers with no rows, not an error', empty.status === 200 && Array.isArray(empty.json?.rows) && empty.json.rows.length === 0 && empty.json.truncated === false);

for (const [label, client] of [['the data login', dataDb], ['the server login', serverDb]]) {
  let refused = false;
  try { await client.query('select * from qurtag.signup_sources'); } catch { refused = true; }
  check(`${label} still cannot read the table`, refused);
}
await admin.end(); await dataDb.end(); await serverDb.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
