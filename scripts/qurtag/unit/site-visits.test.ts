// The anonymous page view counter (src/lib/visitCounter.ts, src/lib/siteVisits.ts, db/page-views.sql):
//   classification: the link's tag first, then the kind of referring site, then direct, never the host;
//   dedupe: one count per path per tab;
//   paths: route patterns, never a tag code, a short code, an id, a query or free text;
//   crawlers and scripted browsers are not counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySource, visitPath, claimVisit, tabSource, countVisit, hostCategory, isCrawler } from '../../../src/lib/visitCounter';
import { KEEP_SLUG, TAG_PARAMS, UNKNOWN, VISIT_ROUTES } from '../../../src/lib/siteVisitRoutes';

const OWN = 'qurtag.com';
const mem = () => {
  const s = new Map<string, string>();
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v), size: () => s.size };
};
const PATTERNS = [...VISIT_ROUTES, ...UNKNOWN];
const path = (p: string) => visitPath(p, PATTERNS, KEEP_SLUG);

test('no referrer and no tag is direct; our own host is direct', () => {
  assert.equal(classifySource('', '', OWN), 'direct');
  assert.equal(classifySource('', 'https://www.qurtag.com/pricing', OWN), 'direct');
});

test('referrers are reduced to a kind and the host is never the source', () => {
  assert.equal(classifySource('', 'https://www.google.co.uk/search?q=x', OWN), 'search');
  assert.equal(classifySource('', 'https://chatgpt.com/', OWN), 'ai');
  assert.equal(classifySource('', 'https://l.facebook.com/l.php?u=secret', OWN), 'social');
  assert.equal(classifySource('', 'https://someblog.example.org/post', OWN), 'referral');
  assert.equal(hostCategory('gemini.google.com'), 'ai');
  assert.equal(classifySource('', 'file:///x', OWN), 'direct');
});

test('a safe tag wins over the referrer; ?ch= is read as the product already does; an unsafe tag is ignored', () => {
  assert.equal(classifySource('?utm_source=Newsletter', 'https://www.google.com/', OWN, TAG_PARAMS), 'newsletter');
  assert.equal(classifySource('?ch=mom-group&utm_source=x', '', OWN, TAG_PARAMS), 'mom-group');
  assert.equal(classifySource('?utm_source=Jane Doe', 'https://www.google.com/', OWN, TAG_PARAMS), 'search');
});

test('paths: a tag page, an item, a conversation, an invitation and an account are their pattern', () => {
  assert.equal(path('/find/AB12CD34EF'), '/find/:tagId');
  assert.equal(path('/find/anything?x=1#y'), '/find/:tagId');
  assert.equal(path('/app/items/3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f'), '/app/items/:itemId');
  assert.equal(path('/app/items/3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f/insurance-packet'), '/app/items/:itemId/insurance-packet');
  assert.equal(path('/app/inbox/abc'), '/app/inbox/:threadId');
  assert.equal(path('/app/tags/9f/print'), '/app/tags/:tagId/print');
  assert.equal(path('/join/some-invite-token'), '/join/:token');
  assert.equal(path('/app/admin/accounts/jane-doe'), '/app/admin/accounts/:userId');
  assert.equal(path('/app/tags/sheet'), '/app/tags/sheet');
  assert.equal(path('/'), '/');
  assert.equal(path('/pricing'), '/pricing');
});

test('paths: a short code or any unknown address is never counted as spelled', () => {
  assert.equal(path('/k7m2p'), '/:other', 'a short code names a tag');
  assert.equal(path('/jane-doe'), '/:other');
  assert.equal(path('/a/b'), '/:other/:other');
  assert.equal(path('/a/b/c/d/e/f/g'), '/:other/:other/:other/:other/:other/:other/:other');
  for (const p of ['/k7m2p', '/jane@example.com', '/a/b/c/d/e/f/g/h/i/j', '/' + Array.from({ length: 49 }, () => 'q').join('/'), '/' + 'x'.repeat(200)]) {
    const out = path(p);
    assert.ok(out === null || !/k7m2p|jane|example|xxx|\/i\/j|\/q\//.test(out), `${p} -> ${out}`);
  }
});

test('dedupe: a path counts once per tab; blocked storage counts nothing', () => {
  const s = mem();
  assert.equal(claimVisit(s, '/pricing'), true);
  assert.equal(claimVisit(s, '/pricing'), false);
  assert.equal(claimVisit({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }, '/x'), false);
});

test('the tab keeps the source it arrived with', () => {
  const s = mem();
  assert.equal(tabSource(s, 'search'), 'search');
  assert.equal(tabSource(s, 'direct'), 'search');
});

const env = (over: Partial<Parameters<typeof countVisit>[0]> = {}) => {
  const sent: Array<[string, string]> = [];
  return { sent, e: { pathname: '/pricing', search: '', referrer: '', protocol: 'https:', hostname: OWN, webdriver: false, store: mem(), send: (p: string, s: string) => void sent.push([p, s]), patterns: PATTERNS, keep: KEEP_SLUG, tagParams: TAG_PARAMS, ...over } };
};

test('countVisit: first load sends path and source once; a refresh does not', () => {
  const { sent, e } = env({ referrer: 'https://www.google.com/' });
  assert.deepEqual(countVisit(e), { path: '/pricing', source: 'search' });
  assert.equal(countVisit(e), null);
  assert.deepEqual(sent, [['/pricing', 'search']]);
});

test('countVisit: scripted browsers, development servers and crawlers send nothing', () => {
  assert.equal(countVisit(env({ webdriver: true }).e), null);
  assert.equal(countVisit(env({ hostname: 'localhost', protocol: 'http:' }).e), null);
  const ua = (userAgent: string) => env({ userAgent });
  const bad = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  ];
  for (const u of bad) {
    const { sent, e } = ua(u);
    assert.equal(countVisit(e), null, u);
    assert.equal(sent.length, 0);
    assert.equal(isCrawler(u), true, u);
  }
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  assert.equal(isCrawler(iphone), false);
  const { sent, e } = ua(iphone);
  assert.deepEqual(countVisit(e), { path: '/pricing', source: 'direct' });
  assert.equal(sent.length, 1);
});

test('countVisit: a send that throws does not reach the page', () => {
  const { e } = env({ send: () => { throw new Error('offline'); } });
  assert.deepEqual(countVisit(e), { path: '/pricing', source: 'direct' });
});

test('every path in src/routes.tsx is in the route list', () => {
  const routes = readFileSync(new URL('../../../src/routes.tsx', import.meta.url), 'utf8');
  const found = [...new Set([...routes.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*'))].sort();
  assert.ok(found.length > 30, 'the pattern found the routes');
  const known = new Set<string>([...VISIT_ROUTES, ...KEEP_SLUG]);
  assert.deepEqual(found.filter((r) => !known.has(r)), []);
});

test('the browser source names the visit function and sends only a path and a source', () => {
  const src = readFileSync(new URL('../../../src/lib/siteVisits.ts', import.meta.url), 'utf8');
  assert.match(src, /rpc\('record_visit', \{ p_path: path, p_source: source \}\)/);
});
