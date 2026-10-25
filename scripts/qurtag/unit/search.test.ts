import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_PAGES, pageUrl } from '../../../src/seo/pages';
import { faqStructuredData, homeStructuredData } from '../../../src/seo/structured';
import { FAQS, plainAnswer, visibleFaqs } from '../../../src/lib/faq';
import { PRODUCTS } from '../../../server/billing/catalog';

// What search engines read from QuR Tag's public pages (src/seo, scripts/seo/prerender.mjs, vercel.json).

const read = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

test('every public page has its own title and a description of 70 to 160 characters', () => {
  const titles = new Set<string>();
  for (const p of PUBLIC_PAGES) {
    assert.ok(p.description.length >= 70 && p.description.length <= 160, `${p.path}: ${p.description.length} characters`);
    assert.ok(!titles.has(p.title), `${p.path} repeats the title "${p.title}"`);
    titles.add(p.title);
    assert.ok(!/[—–]/.test(p.title + p.description), `${p.path} has a dash`);
  }
  assert.equal(PUBLIC_PAGES.filter((p) => p.path === '/').length, 1);
});

test('canonical addresses are on www, with a slash only on the home page', () => {
  assert.equal(pageUrl('/'), 'https://www.qurtag.com/');
  assert.equal(pageUrl('/help'), 'https://www.qurtag.com/help');
});

test('robots.txt names the sitemap on the www host and the app stays out of the sitemap', () => {
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/www\.qurtag\.com\/sitemap\.xml$/m);
  for (const p of PUBLIC_PAGES) assert.ok(!/^\/(app|find|start|join|auth|partners)(\/|$)/.test(p.path), p.path);
});

test('the home page structured data names the publisher, the website and the product with the real prices', () => {
  const g = (homeStructuredData() as { '@graph': Record<string, unknown>[] })['@graph'];
  assert.deepEqual(g.map((x) => x['@type']), ['Organization', 'WebSite', 'SoftwareApplication']);
  assert.equal(g[0].name, 'Impact Consulting AI LLC');
  const offers = (g[2].offers as { name: string; price: string }[]).map((o) => `${o.name}:${o.price}`);
  const price = (plan: string) => (PRODUCTS.find((p) => p.plan === plan)!.cents / 100).toFixed(2);
  assert.deepEqual(offers, ['Free:0', `Plus:${price('plus')}`, `Family:${price('family')}`]);
  assert.deepEqual(offers, ['Free:0', 'Plus:19.00', 'Family:29.00']);
});

test('the Help page markup is the visible list of questions, with plain answers', () => {
  const ld = faqStructuredData() as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
  assert.deepEqual(ld.mainEntity.map((q) => q.name), visibleFaqs(true).map((f) => f.q));
  assert.equal(new Set(FAQS.map((f) => f.q)).size, FAQS.length, 'no repeated question');
  for (const q of ld.mainEntity) {
    assert.ok(!/[[\]{}]/.test(q.acceptedAnswer.text), `${q.name}: markers left in the answer`);
    assert.ok(q.acceptedAnswer.text.length > 20);
  }
  assert.equal(plainAnswer('Read [the guide](/make-it-last) or email {contact}.'), 'Read the guide or email info@impactconsulting.ai.');
  assert.ok(visibleFaqs(false).every((f) => !f.paid));
});

test('vercel.json: real pages and files stay served, the app and finder routes reach the shell, junk gets the 404 page', () => {
  const rewrites = (JSON.parse(read('vercel.json')).rewrites as { source: string; destination: string }[]).map((r) => ({ re: new RegExp(`^${r.source}$`), to: r.destination }));
  const dest = (path: string) => rewrites.find((r) => r.re.test(path))?.to ?? null;
  // The short code of a tag still reaches the function, and comes before everything else.
  assert.match(dest('/k7m2p4') ?? '', /^\/api\/fn\?go=/);
  assert.equal(dest('/help'), null, 'a public page is a file, not a rewrite');
  for (const p of ['/app', '/app/items/x', '/start', '/start/setup', '/find/AbCdEfGhJkMn', '/join/x', '/forgot-password', '/reset-password', '/auth/callback', '/partners']) {
    assert.equal(dest(p), '/app-shell.html', p);
  }
  for (const p of ['/nope', '/factory-search-check-no-such-page-1', '/appx', '/wp-login.php', '/helps']) assert.equal(dest(p), null, `${p} falls through to 404`);
  // Every screen route that is not a public page has a rewrite.
  const routes = read('src/routes.tsx');
  const paths = [...routes.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*' && !PUBLIC_PAGES.some((x) => x.path === p) && p !== '/find');
  assert.ok(paths.length > 20);
  for (const p of paths) assert.equal(dest(p.replace(/:[A-Za-z]+/g, 'x')), '/app-shell.html', p);
});
