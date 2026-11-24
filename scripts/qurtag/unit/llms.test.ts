import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_PAGES, pageUrl } from '../../../src/seo/pages';
import { llmsText } from '../../../src/seo/llms';

// /llms.txt, the plain-text summary for answer engines (src/seo/llms.ts, written by scripts/seo/prerender.mjs).

const read = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

test('llms.txt names QuR Tag, sums it up in one line and links every page the sitemap lists', () => {
  const txt = llmsText();
  const lines = txt.split('\n');
  assert.equal(lines[0], '# QuR Tag');
  assert.match(lines[2] ?? '', /^> .{40,200}$/);
  for (const p of PUBLIC_PAGES) assert.ok(txt.includes(`](${pageUrl(p.path)})`), `${p.path} is missing`);
  const links = [...txt.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.every((u) => u?.startsWith('https://www.qurtag.com/')), 'every link is on the www host');
});

test('llms.txt says what QuR Tag does not hold: no payment card details and no location', () => {
  const txt = llmsText();
  assert.match(txt, /does not hold payment card/i);
  assert.match(txt, /does not (collect|track|hold)[^.]*location/i);
  assert.ok(!/[—–]/.test(txt), 'no dashes a person reads');
});

test('the build writes llms.txt', () => {
  assert.match(read('scripts/seo/prerender.mjs'), /writeFile\(path\.join\(dist, 'llms\.txt'\), llmsText\(\)\)/);
});
