/**
 * The large text check: the app's screens at the text sizes iPhone owners really use.
 *
 *   QURTAG_TEST_BASE=http://localhost:5181 node scripts/qurtag/large-text.check.mjs
 *
 * The iPhone app takes its root font size from the phone's text size (Dynamic Type, see
 * `html.native-app` in src/index.css) and every size in the app is in rem, so a page at a root
 * size of 28, 33 or 53 px is what an owner at Accessibility 1, 2 or 5 sees. This opens each
 * screen in WebKit (the iPhone's engine) at 375, 402 and 430 px wide, as the app (the
 * `native-app` class on <html>) and at the root sizes 17 (the default), 23 (the largest
 * standard size), 28, 33 and 53 px, and fails when a screen:
 *
 *   - scrolls sideways;
 *   - breaks a word in the middle (not an email or web address) that would fit on a line of a card by itself ("W a t e r");
 *   - lets two controls, or a control and a heading, overlap;
 *   - makes a button, tab or switch smaller than 44 by 44 px (links inside a sentence are exempt);
 *   - cuts off a heading;
 *   - (Items) does not name the Inbox tab "Inbox, 1 unread" (with its count) for a screen reader.
 *
 * It needs a running app with a throwaway database (npm run dev:local, then `npx vite` with
 * QURTAG_API_PROXY), never production: it makes an account, an item and a finder's note. It
 * needs Playwright with its WebKit, which is not a dependency of the app; any copy works
 * (`NODE_PATH=<folder holding playwright> node ...`). QURTAG_TEXT_SIZES and QURTAG_WIDTHS
 * (comma separated) narrow the run; QURTAG_SHOTS=<folder> saves a screenshot of each case.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Person } from './people.mjs';

const BASE = process.env.QURTAG_TEST_BASE;
if (!BASE || /qurtag\.com/.test(BASE)) {
  console.error('Set QURTAG_TEST_BASE to a local app (for example http://localhost:5181). Never production.');
  process.exit(2);
}
let playwright;
try {
  playwright = createRequire(import.meta.url)('playwright');
} catch {
  console.error('Playwright is not installed here. Run with NODE_PATH set to a folder that holds it.');
  process.exit(2);
}

const SIZES = (process.env.QURTAG_TEXT_SIZES ?? '17,23,28,33,53').split(',').map(Number);
const WIDTHS = (process.env.QURTAG_WIDTHS ?? '375,402,430').split(',').map(Number);
const SHOTS = process.env.QURTAG_SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ------------------------------------------------------------------ an owner with things to show

const owner = new Person('owner', '10.77.0.1', BASE);
const email = `large-text-${Date.now()}@example.com`;
await owner.signUp(email, 'Margaret');
const item = await owner.db.rpc('create_item', { p_name: 'Reading glasses in the blue case' });
if (item.error) throw new Error(`create_item: ${JSON.stringify(item.error)}`);
const tagPublicId = item.data.public_id;
await owner.db.rpc('create_item', { p_name: 'Water bottle' });
const finder = new Person('finder', '10.77.0.2', BASE);
// (Each width below adds a conversation of its own, so the Inbox has one unread note.)
const sent = await finder.send(tagPublicId, null, 'Hello, I found your glasses on the bench by the library. I left them with the front desk.');
if (sent.status !== 200) throw new Error(`finder-send answered ${sent.status}`);
const { data: threads } = await owner.db.from('threads').select('id').limit(1);
const { data: items } = await owner.db.from('items').select('id').order('created_at').limit(1);
const { data: tags } = await owner.db.from('tags').select('id').limit(1);
const threadId = threads?.[0]?.id;
// Someone with nothing tagged yet, for the first-tag walkthrough.
const newcomer = new Person('newcomer', '10.77.0.3', BASE);
const newcomerEmail = `large-text-new-${Date.now()}@example.com`;
await newcomer.signUp(newcomerEmail, 'Walter');
const itemId = items?.[0]?.id;
const tagId = tags?.[0]?.id;

const screens = [
  { name: 'sign-up', path: '/start', signedOut: true },
  // The iPhone app's first-open welcome (src/lib/firstOpen.ts): only drawn when the page believes it is in the app.
  { name: 'welcome', path: '/start?next=%2Fapp', phone: true },
  { name: 'items', path: '/app' },
  { name: 'item', path: `/app/items/${itemId}` },
  { name: 'add-item', path: '/start/setup' },
  { name: 'walkthrough', path: '/app/first-tag', newcomer: true },
  { name: 'inbox', path: '/app/inbox' },
  { name: 'conversation', path: `/app/inbox/${threadId}` },
  { name: 'tags', path: '/app/tags' },
  { name: 'print', path: `/app/tags/${tagId}/print` },
  { name: 'settings', path: '/app/settings' },
  { name: 'account', path: '/app/account' },
  { name: 'membership', path: '/app/membership' },
  { name: 'privacy', path: '/app/privacy' },
  { name: 'help', path: '/app/help' },
  { name: 'make-it-last', path: '/app/make-it-last' },
  { name: 'forgot-password', path: '/forgot-password', signedOut: true },
  { name: 'public-help', path: '/help', signedOut: true },
  { name: 'public-terms', path: '/terms', signedOut: true },
  { name: 'finder', path: `/find/${tagPublicId}#test=1`, signedOut: true },
];

// ------------------------------------------------------------------ what is measured in the page

/* eslint-disable no-undef */
function measure() {
  const problems = [];
  // A page that did not draw (a build error, a crash) must never pass.
  if (document.querySelector('vite-error-overlay') || !document.querySelector('h1')) return ['the screen did not draw (no heading)'];
  const vw = document.documentElement.clientWidth;
  const sw = document.scrollingElement.scrollWidth;
  if (sw > vw + 1) {
    // Name the innermost things that stick out, so the fix is easy to find.
    const out = [...document.body.querySelectorAll('*')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > vw + 1);
    });
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (out.length < 3 && tw.nextNode()) {
      const r = document.createRange();
      r.selectNodeContents(tw.currentNode);
      if ([...r.getClientRects()].some((x) => x.right > vw + 1)) out.push(tw.currentNode.parentElement);
    }
    // Still nothing named (a form control's own width): find the leaf whose removal ends it.
    if (!out.length) {
      for (const e of document.body.querySelectorAll('*')) {
        if (out.length >= 3 || e.children.length || e.closest('svg')) continue;
        const before = e.style.display;
        e.style.display = 'none';
        if (document.scrollingElement.scrollWidth <= vw + 1) out.push(e.parentElement ?? e);
        e.style.display = before;
      }
    }
    const names = out.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 4).join('.')} "${(e.textContent || '').trim().slice(0, 24)}"`);
    problems.push(`scrolls sideways (${sw} px wide in ${vw}): ${names.join('; ')}`);
  }

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"], .sr-only, .skip-link, [hidden]')) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    for (const d of [...document.querySelectorAll('details:not([open])')]) {
      if (d.contains(el) && !d.querySelector(':scope > summary')?.contains(el)) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Words broken in the middle although they would fit on a line of the screen by themselves.
  // Email addresses and web addresses may break: at the largest sizes they cannot fit.
  const line = vw - 64; // the page's gutters and a card's padding
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const broken = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el || !visible(el)) continue;
    const chunks = /\S+/g;
    let c;
    while ((c = chunks.exec(node.data))) {
      if (/[@/=?]|\w\.\w/.test(c[0])) continue;
      const re = /[A-Za-z0-9']{2,}/g;
      let m;
      while ((m = re.exec(c[0]))) {
        const range = document.createRange();
        range.setStart(node, c.index + m.index);
        range.setEnd(node, c.index + m.index + m[0].length);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0);
        if (new Set(rects.map((x) => Math.round(x.top))).size < 2) continue;
        const width = rects.reduce((s, x) => s + x.width, 0);
        if (width <= line) broken.add(m[0]);
      }
    }
  }
  if (broken.size) problems.push(`words broken mid-word: ${[...broken].slice(0, 6).join(', ')}`);

  // The layer an element scrolls with: fixed and sticky bars overlap the page by design.
  const layer = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return e;
    }
    return null;
  };
  const controls = [...document.querySelectorAll('a[href], button, [role="tab"], [role="switch"], input:not([type="hidden"]), select, textarea, h1, h2')]
    .filter(visible)
    .filter((el) => !(el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')));
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      if (a.contains(b) || b.contains(a) || layer(a) !== layer(b)) continue;
      // Links inside a sentence wrap from line to line; their boxes touch by nature.
      if (getComputedStyle(a).display === 'inline' && getComputedStyle(b).display === 'inline') continue;
      // A button drawn inside a text field (Show password) sits on it by design.
      const field = (x) => x.matches('input, textarea');
      const placed = (x) => {
        for (let e = x; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'absolute') return true;
        return false;
      };
      if ((field(a) && placed(b)) || (field(b) && placed(a))) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2) problems.push(`"${label(a)}" overlaps "${label(b)}"`);
    }
  }

  for (const el of controls) {
    if (el.matches('h1, h2, input, select, textarea')) continue;
    // A link inside a sentence is exempt (WCAG 2.5.8): it flows with the text.
    if (el.matches('a, button') && getComputedStyle(el).display === 'inline') continue;
    if (el.closest('footer')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) problems.push(`"${label(el)}" is ${Math.round(r.width)} by ${Math.round(r.height)} px`);
  }

  for (const h of document.querySelectorAll('h1, h2')) {
    if (!visible(h)) continue;
    // A one-line title may end in "..." at the standard sizes, as iOS's own bars do.
    const ellipsis = getComputedStyle(h).textOverflow === 'ellipsis';
    if (ellipsis && !document.documentElement.classList.contains('text-ax')) continue;
    if (h.scrollWidth > h.clientWidth + 1) problems.push(`heading "${label(h)}" is cut off`);
  }
  return [...new Set(problems)];
}
/* eslint-enable no-undef */

// ------------------------------------------------------------------ the run

const browser = await playwright.webkit.launch();
let failures = 0;
let cases = 0;
try {
  for (const width of WIDTHS) {
    const signedIn = await browser.newContext({ viewport: { width, height: 874 }, deviceScaleFactor: 2 });
    const signin = await signedIn.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email, password: 'correct horse battery' },
      headers: { origin: BASE, 'x-forwarded-for': `10.79.1.${width % 250}` },
    });
    if (!signin.ok()) throw new Error(`sign-in answered ${signin.status()}`);
    const signedOut = await browser.newContext({ viewport: { width, height: 874 }, deviceScaleFactor: 2 });
    const fresh = await browser.newContext({ viewport: { width, height: 874 }, deviceScaleFactor: 2 });
    // Signed out, on a phone that has never had an account. Capacitor reads the iPhone's message
    // bridge to decide it is in the app; a stand-in bridge that answers nothing is enough for
    // /start. The app then addresses the live site, so those calls are stopped here.
    const phone = await browser.newContext({ viewport: { width, height: 874 }, deviceScaleFactor: 2 });
    await phone.addInitScript(() => {
      window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    });
    await phone.route(/qurtag\.com/, (r) => r.abort());
    const freshIn = await fresh.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email: newcomerEmail, password: 'correct horse battery' },
      headers: { origin: BASE, 'x-forwarded-for': `10.79.0.${width % 250}` },
    });
    if (!freshIn.ok()) throw new Error(`sign-in answered ${freshIn.status()}`);
    for (const size of SIZES) {
      // A new note each round (the conversation screen reads the last one), so the Inbox tab
      // always has something unread to name.
      if (cases > 0) {
        const again = await finder.send(tagPublicId, null, `Hello again, I found your glasses (${width}, ${size}).`);
        if (again.status !== 200) throw new Error(`finder-send answered ${again.status}`);
      }
      for (const ctx of [signedIn, signedOut, fresh, phone]) {
        await ctx.addInitScript((px) => {
          const apply = () => {
            document.documentElement.classList.add('native-app');
            document.documentElement.style.fontSize = `${px}px`;
          };
          if (document.documentElement) apply();
          document.addEventListener('DOMContentLoaded', apply);
        }, size);
      }
      for (const s of screens) {
        const page = await (s.phone ? phone : s.signedOut ? signedOut : s.newcomer ? fresh : signedIn).newPage();
        // Each page load asks the sign-in service for the session; a page of its own network
        // address keeps the run under the per-address limit a real person never reaches.
        await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.78.${cases % 250}.${(cases >> 8) % 250 + 1}` });
        await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
        await page.evaluate((px) => {
          document.documentElement.classList.add('native-app');
          document.documentElement.style.fontSize = `${px}px`;
        }, size);
        await page.waitForTimeout(400);
        const problems = await page.evaluate(measure);
        // The phone tab bar names the inbox with its count after the label (WCAG 2.5.3).
        if (s.name === 'items') {
          const named = await page
            .getByRole('link', { name: /^Inbox, \d+ unread$/ })
            .first()
            .waitFor({ state: 'attached', timeout: 8000 })
            .then(() => true, () => false);
          if (!named) problems.push('the Inbox tab is not named "Inbox, N unread"');
        }
        cases += 1;
        const tag = `${s.name} at ${width} px wide, text ${size} px`;
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${s.name}-${width}-${size}.png`), fullPage: true });
        if (problems.length) {
          failures += 1;
          console.log(`FAIL ${tag}\n  - ${problems.join('\n  - ')}`);
        } else {
          console.log(`ok   ${tag}`);
        }
        await page.close();
      }
    }
    await signedIn.close();
    await signedOut.close();
    await fresh.close();
    await phone.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${cases - failures} of ${cases} screens pass at large text sizes.`);
process.exit(failures ? 1 : 0);
