// Short channel addresses (vercel.json redirects): a post or a profile bio that cannot carry a tagged link
// uses /fb, /ig, /x, /li, /tt, /yt, /th or /rd. Each is a 302 (never cached as permanent) to the home page with
// the source tags; Vercel appends any query the visitor added to the destination's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')) as {
  redirects: Array<{ source: string; destination: string; statusCode?: number; permanent?: boolean }>;
};
const ROUTES: Array<[string, string]> = [
  ['/fb', 'facebook'], ['/ig', 'instagram'], ['/x', 'x'], ['/li', 'linkedin'],
  ['/tt', 'tiktok'], ['/yt', 'youtube'], ['/th', 'threads'], ['/rd', 'reddit'],
];

for (const [path, source] of ROUTES) {
  test(`${path} sends a visitor to the home page tagged utm_source=${source}, as a 302`, () => {
    const hits = config.redirects.filter((r) => r.source === path);
    assert.equal(hits.length, 1, 'exactly one redirect for the path');
    const r = hits[0];
    assert.equal(r.statusCode, 302);
    assert.notEqual(r.permanent, true);
    assert.equal(r.destination, `/?utm_source=${source}&utm_medium=social&utm_campaign=profile`);
    assert.ok(!r.destination.includes('utm_content'), 'a post appends its own utm_content later');
  });
}
