#!/usr/bin/env node
/**
 * End-to-end test of db/page-views.sql (rollout step 18), after the other tests, on the same throwaway
 * Postgres and server functions. A visitor counts a page view through the data API with no pass, and the
 * Company OS reads totals through qurtag.factory_metrics:
 *   - a visitor with no pass counts a view; the same route and source add to one number;
 *   - a bad path or source (a query, a space, a long path, a host) is ignored without an error;
 *   - a signed-in owner's pass is ignored, so the view still counts as a visitor's;
 *   - nobody reads or writes site_visits: not a visitor, an owner or the server login, and the table has
 *     only a day, a path, a source and a number;
 *   - factory_metrics answers "visits" in the shape the Company OS reads, and every key it answered before is still there;
 *   - 5000 different pairs a day is the most kept, and an existing pair still counts at the cap;
 *   - a day older than 30 days is left out of the answer; the day is the database's UTC day.
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

const visitor = new Person('visitor', '10.63.9.1');
const count = (p_path, p_source, headers = { authorization: '' }) =>
  visitor.req('/api/data/rpc/record_visit', { method: 'POST', body: { p_path, p_source }, headers });
const metrics = async () =>
  (await new Person('factory', '10.63.9.9').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: process.env.QURTAG_TEST_FACTORY_TOKEN }, headers: { authorization: '' } })).json;
const today = (await sql(`select (now() at time zone 'utc')::date::text as d`)).rows[0].d;

await sql('truncate qurtag.site_visits');
const before = Object.keys(await metrics());

const a = await count('/pricing', 'search');
check('a visitor with no pass counts a page view', a.status === 204 || a.status === 200, `status ${a.status}`);
await count('/pricing', 'search');
await count('/find/:tagId', 'reels');
const bad = [
  await count('/search?q=Jane Doe', 'direct'),
  await count('/pricing', 'https://example.com'),
  await count(null, 'direct'),
  await count('/' + 'a'.repeat(100), 'direct'),
  await count('pricing', 'direct'),
  await count('/pricing', 'Direct'),
];
check('a bad path or source is ignored without an error', bad.every((r) => r.status === 204 || r.status === 200), bad.map((r) => r.status).join(','));

const owner = await new Person('owner', '10.63.1.1').signUp(`views-${Date.now()}@gmail.com`, 'Views Owner');
const withPass = await count('/app', 'direct', { authorization: `Bearer ${owner.pass ?? 'x'}` });
check("a signed-in owner's pass does not stop a view being counted", withPass.status === 204 || withPass.status === 200, `status ${withPass.status}`);

const rows = (await sql(`select path || '|' || source || '|' || visits as r, day::text as d from qurtag.site_visits order by path`)).rows;
check('same route and source add to one number; bad input counted nothing',
  rows.map((r) => r.r).join(',') === '/app|direct|1,/find/:tagId|reels|1,/pricing|search|2', rows.map((r) => r.r).join(','));
check('the day is the database UTC day', rows.every((r) => r.d === today));

// Rights: nobody reads or writes the table.
const denied = async (client, text) => {
  try {
    await client.query('begin');
    await client.query(text);
    await client.query('rollback');
    return false;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    return e.code === '42501';
  }
};
for (const [who, c, role] of [['the data login as a visitor', dataDb, 'qurtag_anon'], ['the data login as an owner', dataDb, 'qurtag_user'], ['the server login', serverDb, null]]) {
  const pre = role ? `set local role ${role}; ` : '';
  check(`${who} cannot read site_visits`, await denied(c, `${pre}select 1 from qurtag.site_visits`));
  check(`${who} cannot write site_visits`, await denied(c, `${pre}insert into qurtag.site_visits values (current_date, '/x', 'direct', 99)`));
}
check('an owner and the server cannot call record_visit; a visitor can',
  (await denied(dataDb, `set local role qurtag_user; select qurtag.record_visit('/x', 'direct')`))
  && (await denied(serverDb, `select qurtag.record_visit('/x', 'direct')`))
  && !(await denied(dataDb, `set local role qurtag_anon; select qurtag.record_visit('/x', 'direct')`)));
await sql(`delete from qurtag.site_visits where path = '/x'`);
const cols = (await sql(`select array_agg(column_name::text order by ordinal_position) as c from information_schema.columns where table_schema = 'qurtag' and table_name = 'site_visits'`)).rows[0].c;
check('the table holds a day, a path, a source and a number', cols.join(',') === 'day,path,source,visits', cols.join(','));
const noRead = await new Person('v2', '10.63.9.2').req('/api/data/site_visits?select=*', { headers: { authorization: '' } });
check('the data API does not serve the table', noRead.status >= 400 && !Array.isArray(noRead.json), `status ${noRead.status}`);

// What the Company OS reads.
await sql(`insert into qurtag.site_visits (day, path, source, visits) values
  ($1::date - 3, '/pricing', 'search', 5), ($1::date - 20, '/', 'direct', 7), ($1::date - 29, '/', 'direct', 11), ($1::date - 30, '/', 'direct', 1000)`, [today]);
const m = await metrics();
const v = m.visits;
check('factory_metrics still answers every key it did before', before.every((k) => k in m), before.filter((k) => !(k in m)).join(','));
check('visits has the keys the Company OS reads',
  v && ['last_7_days', 'last_30_days', 'by_source_30_days', 'by_path_30_days', 'by_path_7_days', 'days'].every((k) => k in v), JSON.stringify(v));
check('7 and 30 day totals', v.last_7_days === 9 && v.last_30_days === 9 + 7 + 11, `${v.last_7_days} ${v.last_30_days}`);
check('by source', v.by_source_30_days.search === 7 && v.by_source_30_days.direct === 19 && v.by_source_30_days.reels === 1, JSON.stringify(v.by_source_30_days));
check('by path, 30 and 7 days', v.by_path_30_days['/pricing'] === 7 && v.by_path_30_days['/'] === 18 && v.by_path_7_days['/pricing'] === 7 && !('/' in v.by_path_7_days), JSON.stringify([v.by_path_30_days, v.by_path_7_days]));
check('days are UTC days in order, the last 30, a day past them left out',
  v.days.length === 4 && v.days.every((d, i, all) => i === 0 || all[i - 1].day < d.day) && !v.days.some((d) => d.visits === 1000), JSON.stringify(v.days));
check('no figure in visits names a person', !/@|email|user/i.test(JSON.stringify(v)));

// A wrong token still gets nothing.
const wrong = await new Person('w', '10.63.9.3').req('/api/data/rpc/factory_metrics', { method: 'POST', body: { p_token: 'nope' }, headers: { authorization: '' } });
check('a wrong token is refused', wrong.status >= 400 && !wrong.json?.visits);

// 5000 pairs a day.
await sql('truncate qurtag.site_visits');
await sql(`insert into qurtag.site_visits select (now() at time zone 'utc')::date, '/p' || g, 'direct', 1 from generate_series(1, 4999) g`);
await count('/new-one', 'direct');
await count('/over-cap', 'direct');
await count('/p1', 'direct');
const cap = (await sql(`select path, visits from qurtag.site_visits where path in ('/new-one', '/over-cap', '/p1') order by path`)).rows;
check('5000 pairs a day: a new pair under the cap is kept, one over it is dropped, an existing pair still counts',
  cap.length === 2 && cap.find((r) => r.path === '/new-one')?.visits === 1 && cap.find((r) => r.path === '/p1')?.visits === 2, JSON.stringify(cap));
await sql('truncate qurtag.site_visits');

await dataDb.end();
await serverDb.end();
await admin.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
