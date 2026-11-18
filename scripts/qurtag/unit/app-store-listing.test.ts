import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingVerdict } from '../check-app-store-listing';

// The pre-merge check that the App Store address on Home and Help is a live QuR Tag listing
// (scripts/qurtag/check-app-store-listing.ts), so no visitor lands on a dead page.

const LISTING = 'https://apps.apple.com/us/app/qur-tag/id1234567890';
const PAGE = '<html><head><title>QuR Tag App - App Store</title></head><body>QuR Tag</body></html>';

test('a listing that answers 200 with the QuR Tag page passes', () => {
  assert.deepEqual(listingVerdict(LISTING, 200, PAGE), { ok: true, reason: `${LISTING} answers 200 with the QuR Tag listing` });
});

test('an unset App Store address fails, because there is nothing to link to yet', () => {
  const v = listingVerdict(null, null, null);
  assert.equal(v.ok, false);
  assert.match(v.reason, /APP_STORE_URL is not set/);
});

test('a dead listing fails: a 404 or any status other than 200', () => {
  for (const status of [404, 301, 500]) {
    const v = listingVerdict(LISTING, status, PAGE);
    assert.equal(v.ok, false, String(status));
    assert.match(v.reason, new RegExp(`answers ${status}`));
  }
});

test('a 200 that is not the QuR Tag listing fails', () => {
  const v = listingVerdict(LISTING, 200, '<title>Some Other App - App Store</title>');
  assert.equal(v.ok, false);
  assert.match(v.reason, /not the QuR Tag listing/);
});

test('an address that is not an App Store listing fails before anything is fetched', () => {
  const v = listingVerdict('https://example.com/qur-tag', null, null);
  assert.equal(v.ok, false);
  assert.match(v.reason, /not an App Store listing/);
});
