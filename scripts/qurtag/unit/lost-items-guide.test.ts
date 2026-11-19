import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_PAGES, pageUrl } from '../../../src/seo/pages';
import { titleForPath } from '../../../src/lib/pageTitle';
import { LOST_ITEMS_GUIDE as G } from '../../../src/lib/lostItemsGuide';

// The guide that answers "how do QR stickers for lost items work" for people who do not know the name yet.

const read = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const words = (s: string) => s.trim().split(/\s+/).length;
const allText = () => [G.h1, G.answer, ...G.sections.flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.bullets ?? [])])].join(' ');

test('the guide asks the question as its heading and answers it first in 40 to 60 words naming bottles, keys, bags and instruments', () => {
  assert.equal(G.h1, 'How do QR stickers for lost items work?');
  const n = words(G.answer);
  assert.ok(n >= 40 && n <= 60, `the answer is ${n} words`);
  for (const thing of ['bottles', 'keys', 'bags', 'instruments']) assert.match(G.answer, new RegExp(`\\b${thing}\\b`), thing);
});

test('the guide is a public page with its own title, a description, a canonical address and a place in the sitemap list', () => {
  const page = PUBLIC_PAGES.find((p) => p.path === G.path);
  assert.ok(page, `${G.path} is not in PUBLIC_PAGES, so it is not in sitemap.xml`);
  assert.equal(page.title, 'How QR stickers for lost items work | QuR Tag');
  assert.equal(titleForPath(G.path), page.title, 'the browser tab and the served title agree');
  assert.ok(page.title.length <= 60, `title is ${page.title.length} characters`);
  assert.ok(page.description.length >= 70 && page.description.length <= 160, `description is ${page.description.length} characters`);
  assert.equal(pageUrl(G.path), 'https://www.qurtag.com/qr-stickers-for-lost-items');
});

test('the guide has a route, is not blocked by robots.txt and is not rewritten to the app shell', () => {
  assert.match(read('src/routes.tsx'), new RegExp(`path: '${G.path}', element: <LostItemsGuide />`));
  const disallowed = [...read('public/robots.txt').matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1].replace(/\*$/, ''));
  for (const d of disallowed) assert.ok(!G.path.startsWith(d), `robots.txt blocks ${G.path} with ${d}`);
  const rewrites = (JSON.parse(read('vercel.json')).rewrites as { source: string }[]).map((r) => new RegExp(`^${r.source}$`));
  assert.ok(!rewrites.some((re) => re.test(G.path)), `${G.path} is caught by a rewrite`);
});

test('the guide makes none of the claims the honest-site rewrite removed and uses no dashes', () => {
  const text = allText();
  assert.ok(!/[—–]/.test(text), 'a dash in text a person reads');
  for (const claim of [/leather/i, /premium/i, /testimonial/i, /\bGPS\b/i, /\btrips?\b/i, /drop-off/i, /partner/i, /we sell/i, /guarantee/i, /\$\d/]) {
    assert.ok(!claim.test(text), `the guide says ${claim}`);
  }
  // It says what QuR Tag is not, as every other page does.
  assert.match(text, /not a tracker/);
});
