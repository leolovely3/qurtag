import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipsAvailable } from '../../../src/lib/membership-flag';

test('in the iPhone app, memberships are hidden without the key', () => {
  assert.equal(membershipsAvailable({ native: true, hasKey: false, offeringsLoaded: false }), false);
  assert.equal(membershipsAvailable({ native: true, hasKey: false, offeringsLoaded: true }), false);
});

test('in the iPhone app, memberships are hidden while no offerings are returned', () => {
  assert.equal(membershipsAvailable({ native: true, hasKey: true, offeringsLoaded: false }), false);
});

test('in the iPhone app, memberships show once the key is set and offerings load', () => {
  assert.equal(membershipsAvailable({ native: true, hasKey: true, offeringsLoaded: true }), true);
});

test('on the web nothing changes', () => {
  assert.equal(membershipsAvailable({ native: false, hasKey: false, offeringsLoaded: false }), true);
});
