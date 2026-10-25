#!/usr/bin/env node
/**
 * End-to-end test of short codes (db/shortcodes.sql, server/routes/shortcode.ts), after
 * e2e.test.mjs, on the same throwaway Postgres and server functions:
 *
 *   - every new tag, and a replacement tag, gets a code of 6 characters from the unambiguous
 *     alphabet with a digit, unique;
 *   - /<code> (any case) redirects to the tag's finder page, and the finder page then opens;
 *   - a code that is not registered, one of the wrong shape, and the code of a replaced tag
 *     answer an honest 404 page, never a redirect;
 *   - guessing is limited: 20 wrong guesses from one visitor, then 429, and another visitor is
 *     unaffected; right codes still work for a visitor that is not over the limit;
 *   - the owner can read the code on their own tag and nobody else's;
 *   - the database makes unique codes of the right alphabet in bulk.
 */
import pg from 'pg';
import { Person, BASE } from './people.mjs';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
}

const admin = new pg.Client({ connectionString: process.env.QURTAG_TEST_ADMIN_DB });
await admin.connect();

const ALPHABET = /^[a-hj-km-np-z2-9]{6}$/;
const go = async (path, ip) => {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { 'x-forwarded-for': ip } });
  return { status: r.status, location: r.headers.get('location'), text: await r.text(), headers: r.headers };
};

const owner = await new Person('owner', '10.40.0.1').signUp(`sc-owner-${Date.now()}@example.com`, 'Short Owner');
const other = await new Person('other', '10.40.0.2').signUp(`sc-other-${Date.now()}@example.com`, 'Other Owner');

const made = await owner.db.rpc('create_item', { p_name: 'Water bottle' });
const publicId = made.data?.public_id;
check('an item was made with its first tag', !!publicId, JSON.stringify(made.error));
const tags = await owner.db.from('tags').select('id, public_id, short_code, status');
const tag = tags.data?.find((t) => t.public_id === publicId);
check('the owner reads the short code of their tag', ALPHABET.test(tag?.short_code ?? ''), tag?.short_code);
check('the code holds a digit', /[2-9]/.test(tag?.short_code ?? ''));
const otherTags = await other.db.from('tags').select('short_code');
check("nobody else's codes are readable", (otherTags.data ?? []).length === 0);

const code = tag.short_code;
let r = await go(`/${code}`, '10.40.1.1');
check('the short code redirects to the finder page', r.status === 302 && r.location === `/find/${publicId}`, `${r.status} ${r.location}`);
check('the redirect is not cached', /no-store/.test(r.headers.get('cache-control') ?? ''));
r = await go(`/${code.toUpperCase()}`, '10.40.1.1');
check('the code ignores case', r.status === 302 && r.location === `/find/${publicId}`, `${r.status} ${r.location}`);
const view = await fetch(`${BASE}/api/fn/finder-view`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.40.1.2', origin: BASE },
  body: JSON.stringify({ tag: publicId }),
});
check('the finder page opens for the redirected tag', view.status === 200);

// An honest 404.
r = await go('/zzzzz2', '10.40.2.1');
check('an unknown code answers 404, not a redirect', r.status === 404 && !r.location, `${r.status}`);
check('the 404 page says so plainly', /isn't registered/.test(r.text) && /noindex/.test(r.text) && !/—/.test(r.text));
r = await go('/api/fn?go=terms', '10.40.2.1');
check('a code of the wrong shape answers 404', r.status === 404);
r = await go('/api/fn?go=%27%3B%20drop%20table', '10.40.2.1');
check('a hostile code answers 404', r.status === 404);

// A replaced tag stops working; the new one works.
const replaced = await owner.db.rpc('replace_tag', { p_item_id: made.data.item_id });
const newTag = (await owner.db.from('tags').select('public_id, short_code, status')).data?.find((t) => t.public_id === replaced.data?.public_id);
check('a replacement tag gets its own code', ALPHABET.test(newTag?.short_code ?? '') && newTag.short_code !== code);
r = await go(`/${code}`, '10.40.3.1');
check('the code of a replaced tag answers 404', r.status === 404, `${r.status}`);
r = await go(`/${newTag.short_code}`, '10.40.3.1');
check('the replacement code redirects', r.status === 302 && r.location === `/find/${replaced.data.public_id}`);

// The limit.
const statuses = [];
for (let i = 0; i < 24; i++) statuses.push((await go(`/zzzz${2 + (i % 8)}${'abcdefgh'[i % 8]}`.slice(0, 6), '10.40.4.1')).status);
check('20 wrong guesses are answered, then 429', statuses.slice(0, 20).every((s) => s === 404) && statuses.slice(20).every((s) => s === 429), statuses.join(','));
r = await go(`/${newTag.short_code}`, '10.40.4.1');
check('a visitor over the limit is refused even for a right code', r.status === 429, `${r.status}`);
check('the 429 says to wait', /wait/i.test(r.text) && r.headers.get('retry-after') === '600');
r = await go(`/${newTag.short_code}`, '10.40.4.2');
check('another visitor is not affected', r.status === 302);
const tries = await admin.query("select key, sum(misses)::int as misses from qurtag.short_code_tries group by key order by key");
check('the database keeps counts under hashes, never addresses', tries.rows.every((t) => t.key === '*' || /^[0-9a-f]{64}$/.test(t.key)));

// Bulk: unique, in the alphabet.
const bulk = await admin.query('select qurtag.new_short_code() as c from generate_series(1, 5000)');
const set = new Set(bulk.rows.map((x) => x.c));
check('5000 generated codes are unique', set.size === 5000);
check('every generated code is 6 characters of the alphabet with a digit', bulk.rows.every((x) => ALPHABET.test(x.c) && /[2-9]/.test(x.c)));
check('no generated code holds 0, o, 1, l or i', bulk.rows.every((x) => !/[01oli]/.test(x.c)));
const dup = await admin.query('select count(*)::int as n from (select short_code from qurtag.tags group by short_code having count(*) > 1) d');
check('no two tags share a code', dup.rows[0].n === 0);
let refused = false;
try {
  await admin.query("update qurtag.tags set short_code = upper(short_code) where id = (select id from qurtag.tags limit 1)");
} catch {
  refused = true;
}
check('a code in capitals is refused by the table (always stored in lower case)', refused);

await admin.end();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
