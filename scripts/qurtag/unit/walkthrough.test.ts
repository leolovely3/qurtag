/**
 * The walkthrough and help fixes that are logic: the item's status after printing, the email
 * check reminder, the words at the plan's limit, the plan carried through sign-up, the parents'
 * landing page, and the typed confirmation before deleting an account.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemStatus, markTag, tagProgress } from '../../../src/lib/tagProgress.ts';
import { loadEmailCheck, saveEmailCheck, showEmailReminder } from '../../../src/lib/emailCheck.ts';
import { limitCopy } from '../../../src/lib/itemLimit.ts';
import { planFromNext, planIntentLine } from '../../../src/lib/planIntent.ts';
import { audienceFor, HERO } from '../../../src/lib/audience.ts';
import { needsTypedConfirm, typedOk } from '../../../src/lib/accountDelete.ts';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

test('after printing, the item says printed but not stuck on; after "I stuck it on", that it is on', () => {
  const s = memory();
  assert.equal(itemStatus({ locked: false, hasTag: true, progress: tagProgress(s, 't1') }), 'Tag ready to print');
  markTag(s, 't1', 'printed');
  assert.equal(itemStatus({ locked: false, hasTag: true, progress: tagProgress(s, 't1') }), 'Printed, not stuck on yet');
  assert.equal(itemStatus({ locked: false, hasTag: true, progress: tagProgress(s, 't2') }), 'Tag ready to print', 'per tag');
  markTag(s, 't1', 'stuck');
  assert.equal(itemStatus({ locked: false, hasTag: true, progress: tagProgress(s, 't1') }), 'Tag is on');
  markTag(s, 't3', 'stuck');
  assert.deepEqual(tagProgress(s, 't3'), { printed: true, stuck: true }, 'stuck on means printed');
  assert.equal(itemStatus({ locked: true, hasTag: true, progress: { stuck: true } }), 'Read-only: over your plan');
  assert.equal(itemStatus({ locked: false, hasTag: false, progress: {} }), 'No working tag');
  assert.deepEqual(tagProgress(null, 't1'), {}, 'no storage, no crash');
});

test('Items reminds a web owner to check email until they say the test arrived', () => {
  const s = memory();
  const base = { native: false, emailOn: true, itemCount: 1 };
  assert.equal(showEmailReminder({ ...base, check: loadEmailCheck(s, 'u') }), true);
  saveEmailCheck(s, 'u', 'sent');
  assert.equal(showEmailReminder({ ...base, check: loadEmailCheck(s, 'u') }), true, 'sent is not confirmed');
  saveEmailCheck(s, 'u', 'confirmed');
  assert.equal(showEmailReminder({ ...base, check: loadEmailCheck(s, 'u') }), false);
  assert.equal(loadEmailCheck(s, 'someone-else'), 'unknown', 'per account');
  assert.equal(showEmailReminder({ ...base, native: true, check: 'unknown' }), false, 'the app has alerts');
  assert.equal(showEmailReminder({ ...base, emailOn: false, check: 'unknown' }), false, 'email off: no promise');
  assert.equal(showEmailReminder({ ...base, itemCount: 0, check: 'unknown' }), false);
});

test('at the limit the words point somewhere: plans on the web, deleting an item in the app', () => {
  const web = limitCopy({ membershipsShown: true, itemLimit: 3 });
  assert.equal(web.action, 'plans');
  assert.match(web.title, /three items, the most on Free/);
  const app = limitCopy({ membershipsShown: false, itemLimit: 3 });
  assert.equal(app.action, 'items');
  assert.match(app.body, /More items are coming to the iPhone app/);
  assert.ok(!/Membership/.test(app.body), 'the app has no Membership page to point to');
  assert.equal(limitCopy({ membershipsShown: true, itemLimit: 10 }).action, 'items');
});

test('the paid plan pressed on Pricing is carried through sign-up', () => {
  assert.equal(planFromNext('/app/membership?plan=plus'), 'plus');
  assert.equal(planFromNext('/app/membership?x=1&plan=family'), 'family');
  for (const n of ['/app/membership', '/app/membership?plan=gold', '/join/abc?plan=plus', null, '//evil.example/app/membership?plan=plus']) assert.equal(planFromNext(n), null, String(n));
  assert.equal(planIntentLine('plus'), 'Create your account, then you will pay $19 a year for Plus.');
  assert.equal(planIntentLine('family'), 'Create your account, then you will pay $29 a year for Family.');
});

test('a parents campaign label opens the parents\' first screen; anything else the general one', () => {
  for (const ch of ['parents', 'fb-parents', 'parent', 'school_fall', 'moms-group', 'ig-dads', 'family']) assert.equal(audienceFor(ch), 'parents', ch);
  for (const ch of ['fb', 'reddit', 'grandparents-day', 'transparent', '', null]) assert.equal(audienceFor(ch), 'general', String(ch));
  assert.ok(!JSON.stringify(HERO).includes('—'));
});

test('deleting asks for the typed word when a lot would go', () => {
  assert.equal(needsTypedConfirm({ itemsUsed: 2, familyRole: 'none', otherPeople: 0 }), false);
  assert.equal(needsTypedConfirm({ itemsUsed: 4, familyRole: 'none', otherPeople: 0 }), true);
  assert.equal(needsTypedConfirm({ itemsUsed: 1, familyRole: 'owner', otherPeople: 1 }), true);
  assert.equal(needsTypedConfirm({ itemsUsed: 1, familyRole: 'owner', otherPeople: 0 }), false);
  assert.equal(needsTypedConfirm({ itemsUsed: 1, familyRole: 'member', otherPeople: 3 }), false);
  assert.ok(typedOk(' delete ') && typedOk('DELETE') && !typedOk('DELET') && !typedOk(''));
});
