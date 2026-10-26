/** The "Unlimited with Plus" link on Items: who sees it, and when. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showPlusNudge, type NudgeMembership } from '../../../src/lib/plusNudge.ts';
import { FREE_ITEM_LIMIT } from '../../../server/billing/catalog.ts';

const free: NudgeMembership = { plan: 'free', items_plan: 'free', own_household_id: 'h1', household_id: 'h1' };

test('free, at the limit or one below it, with memberships available: shown', () => {
  assert.equal(showPlusNudge(free, FREE_ITEM_LIMIT, true), true);
  assert.equal(showPlusNudge(free, FREE_ITEM_LIMIT - 1, true), true);
});

test('free with fewer items, or over the limit: hidden', () => {
  for (let n = 0; n < FREE_ITEM_LIMIT - 1; n++) assert.equal(showPlusNudge(free, n, true), false, String(n));
  assert.equal(showPlusNudge(free, FREE_ITEM_LIMIT + 1, true), false);
});

test('the limit comes from the catalog: a different limit moves the window', () => {
  assert.equal(showPlusNudge(free, 4, true, 5), true);
  assert.equal(showPlusNudge(free, 3, true, 5), false);
});

test('hidden while memberships are not available (Apple not serving products)', () => {
  assert.equal(showPlusNudge(free, FREE_ITEM_LIMIT, false), false);
});

test('never for Plus or Family members, or for Family invitees', () => {
  assert.equal(showPlusNudge({ ...free, plan: 'plus', items_plan: 'plus' }, FREE_ITEM_LIMIT, true), false);
  assert.equal(showPlusNudge({ ...free, plan: 'family', items_plan: 'family' }, FREE_ITEM_LIMIT, true), false);
  assert.equal(showPlusNudge({ ...free, items_plan: 'family', household_id: 'fam' }, FREE_ITEM_LIMIT, true), false);
  // Even if the family's plan read as free (lapsed), an invitee is not offered Plus here.
  assert.equal(showPlusNudge({ ...free, household_id: 'fam' }, FREE_ITEM_LIMIT, true), false);
});

test('no membership loaded yet: hidden', () => {
  assert.equal(showPlusNudge(null, FREE_ITEM_LIMIT, true), false);
});
