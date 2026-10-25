import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalDetailWarning } from '../../../src/lib/personalDetails.ts';

test('a name in the possessive is caught, whoever it is', () => {
  assert.equal(personalDetailWarning("Maya's backpack")?.kind, 'name');
  assert.equal(personalDetailWarning("Maya's backpack")?.found, 'Maya');
  assert.equal(personalDetailWarning('Grandpa Joe’s keys')?.found, 'Joe');
  assert.equal(personalDetailWarning("Will's violin")?.found, 'Will');
});

test('a common first name is caught anywhere, but everyday words and plain names of things are not', () => {
  assert.equal(personalDetailWarning('Water bottle for Olivia')?.found, 'Olivia');
  assert.equal(personalDetailWarning('Noah school bag')?.found, 'Noah');
  for (const ok of ['Blue water bottle', 'Purple backpack', 'Hydro Flask', 'Violin case', 'Keys', 'Will you help me get it back?', 'Thank you! A coffee is on me.', 'iPad in a red case', '']) {
    assert.equal(personalDetailWarning(ok), null, ok);
  }
  assert.equal(personalDetailWarning(null), null);
});

test('phone numbers, emails and street addresses are caught', () => {
  assert.equal(personalDetailWarning('Call me on 555-201-4433')?.kind, 'phone');
  assert.equal(personalDetailWarning('Call +1 (305) 555 0101')?.kind, 'phone');
  assert.equal(personalDetailWarning('dana@example.com')?.kind, 'email');
  assert.equal(personalDetailWarning('Bring it to 12 Oak Street')?.kind, 'address');
  assert.equal(personalDetailWarning('Reward $20 for its return'), null, 'a small number is not a phone');
});

test('the message tells the owner why and what to write instead', () => {
  assert.match(personalDetailWarning("Maya's backpack")!.message, /leave names out, most of all a child's/);
});
