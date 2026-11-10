/** The phone stores' words and addresses (src/lib/storeText.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purchaseFailedText, storeSubscriptionsUrl } from '../../../src/lib/storeText';

test('a purchase the store could not take says which store and that nothing was charged', () => {
  // RevenueCat: STORE_PROBLEM_ERROR "2", PURCHASE_NOT_ALLOWED_ERROR "3" (Google Play missing or signed out).
  for (const code of ['2', '3']) {
    const t = purchaseFailedText({ code }, 'Google Play');
    assert.match(t, /^Google Play is not available on this phone right now/);
    assert.match(t, /signed in to Google Play/);
    assert.match(t, /You were not charged/);
  }
  assert.match(purchaseFailedText({ code: '0' }, 'the App Store'), /^The App Store could not complete the purchase\. You were not charged/);
  assert.match(purchaseFailedText(new Error('x'), 'Google Play'), /^Google Play could not complete/);
  assert.match(purchaseFailedText({ code: '20' }, 'Google Play'), /waiting to be confirmed/);
  assert.match(purchaseFailedText({ code: '6' }, 'Google Play'), /Restore purchases/);
});

test('manage subscription opens the right store page', () => {
  assert.equal(storeSubscriptionsUrl('apple'), 'https://apps.apple.com/account/subscriptions');
  assert.equal(storeSubscriptionsUrl('google'), 'https://play.google.com/store/account/subscriptions');
  assert.equal(
    storeSubscriptionsUrl('google', 'app.impactconsultingai.qurtag.plus.yearly'),
    'https://play.google.com/store/account/subscriptions?sku=app.impactconsultingai.qurtag.plus.yearly&package=app.impactconsultingai.qurtag',
  );
});
