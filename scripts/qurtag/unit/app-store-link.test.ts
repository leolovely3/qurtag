/** The home page and /help carry a plain link to QuR Tag's App Store listing in their server-rendered HTML. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const LISTING = 'https://apps.apple.com/app/id6826832888';

// The same render the build runs (src/seo/entry-server.tsx), loaded through Vite so the '@/' paths
// resolve. Middleware mode opens no port. The API address is the one `npm run build:pages` sets.
process.env.VITE_QURTAG_API_URL ??= 'https://www.qurtag.com';
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
after(() => vite.close());
const { render } = (await vite.ssrLoadModule('/src/seo/entry-server.tsx')) as {
  render: (path: string) => Promise<{ html: string; status: number }>;
};

/** The visible words inside every <a> whose href is exactly the listing. */
function listingLinks(html: string): string[] {
  const href = new RegExp(`\\bhref="${LISTING.replace(/[.?/]/g, '\\$&')}"`);
  const found: string[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (!href.test(m[1] ?? '')) continue;
    found.push((m[2] ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim());
  }
  return found;
}

for (const path of ['/', '/help']) {
  test(`the server-rendered ${path} page has a plain link to the QuR Tag App Store listing with visible text`, async () => {
    const { html, status } = await render(path);
    assert.equal(status, 200);
    const links = listingLinks(html);
    assert.ok(links.length > 0, `${path} has no <a href="${LISTING}">`);
    assert.ok(links.some((t) => /App Store/.test(t)), `${path}: the link text is ${JSON.stringify(links)}`);
  });
}
