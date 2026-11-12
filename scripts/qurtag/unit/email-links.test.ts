// Links in our own emails carry utm_source=email, utm_medium=email, utm_campaign=<kind>. Sign-in, reset, confirm,
// invite and unsubscribe links stay exactly as issued. (QuR Tag has no store links on its own pages to tag: the
// only App Store link is Apple's own subscription settings page.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { emailLink, familyInviteMail, finderMessageMail, signInMail } from '../../../server/auth/mailer';

test('the finder-message email links to the inbox with the three tags', () => {
  const m = finderMessageMail('o@example.com', 'water bottle', 'https://www.qurtag.com/app/inbox');
  assert.match(m.text, /https:\/\/www\.qurtag\.com\/app\/inbox\?utm_source=email&utm_medium=email&utm_campaign=finder-message/);
  assert.match(m.html, /utm_source=email&amp;utm_medium=email&amp;utm_campaign=finder-message/);
});

test('verify, reset and invite links are exactly as issued', () => {
  const u = 'https://www.qurtag.com/reset-password?token=abc';
  assert.equal(signInMail('reset-password', 'a@example.com', u).text.includes(`: ${u}\n`), true);
  const j = 'https://www.qurtag.com/join/AbC123';
  assert.ok(familyInviteMail('a@example.com', 'Sam', j).text.includes(j));
  assert.ok(!familyInviteMail('a@example.com', 'Sam', j).text.includes('utm_'));
  for (const x of ['https://www.qurtag.com/verify-email?token=1', 'https://www.qurtag.com/join/AbC123', 'https://www.qurtag.com/?utm_source=facebook']) assert.equal(emailLink(x, 'k'), x);
});
