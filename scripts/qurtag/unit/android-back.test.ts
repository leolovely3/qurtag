/** The Android back button: what it does on each screen (src/lib/androidBack.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAction, isFirstScreen } from '../../../src/lib/androidBack';

test('on a first screen back leaves the app', () => {
  for (const p of ['/', '/app', '/app/', '/start']) assert.equal(backAction(p, 3), 'exit', p);
  assert.equal(isFirstScreen('/app/items'), false);
});

test('on a screen reached from another, back goes to it', () => {
  assert.equal(backAction('/app/items/abc', 2), 'history');
  assert.equal(backAction('/app/inbox', 1), 'history');
  assert.equal(backAction('/forgot-password', 1), 'history');
});

test('on a screen with nothing behind it in the app, back goes to Items, never nowhere', () => {
  assert.equal(backAction('/app/settings', 0), 'home');
  assert.equal(backAction('/app/membership', null), 'home');
  assert.equal(backAction('/app/membership', undefined), 'home');
});
