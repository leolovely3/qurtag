/**
 * The finder page's and the inbox's own rules (src/lib/finder.ts, src/lib/inbox.ts): when a visit
 * counts as a scan, the conversation link, the note starters, and the inbox's finder labels and
 * held-note preview.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOTE_STARTERS, conversationLink, shouldRecordScan, tokenFromHash } from '../../../src/lib/finder.ts';
import { finderLabels, previewLine } from '../../../src/lib/inbox.ts';

test('a scan counts only for a stranger on a first visit', () => {
  assert.equal(shouldRecordScan({ testMode: false, hasToken: false, ownsTag: false }), true);
  // The owner, signed in on this browser (for example scanning the printed tag with their own phone).
  assert.equal(shouldRecordScan({ testMode: false, hasToken: false, ownsTag: true }), false);
  // The owner's test view.
  assert.equal(shouldRecordScan({ testMode: true, hasToken: false, ownsTag: false }), false);
  // A finder coming back to read the reply.
  assert.equal(shouldRecordScan({ testMode: false, hasToken: true, ownsTag: false }), false);
});

test('the saved conversation link carries the token after #, and reads back', () => {
  const token = 'a'.repeat(43);
  const link = conversationLink('https://www.qurtag.com', 'AbCdEf234567', token);
  assert.equal(link, `https://www.qurtag.com/find/AbCdEf234567#t=${token}`);
  assert.equal(tokenFromHash(new URL(link).hash), token);
});

test('note starters are openings to finish, not finished notes', () => {
  assert.ok(NOTE_STARTERS.length >= 3);
  for (const s of NOTE_STARTERS) assert.match(s, / $/);
});

const row = (id: string, item: string, created: string, extra: Partial<Parameters<typeof previewLine>[0]> = {}) => ({
  id,
  item_id: item,
  created_at: created,
  last_message: { sender_kind: 'finder' as const, body: 'Found it' },
  ...extra,
});

test('several conversations about one item are told apart as Finder 1, Finder 2', () => {
  const labels = finderLabels([
    row('b', 'bottle', '2026-10-02T00:00:00Z'),
    row('a', 'bottle', '2026-10-01T00:00:00Z'),
    row('c', 'keys', '2026-10-01T00:00:00Z'),
  ]);
  assert.equal(labels.get('a'), 'Finder 1');
  assert.equal(labels.get('b'), 'Finder 2');
  assert.equal(labels.has('c'), false);
});

test('a held note is previewed without its words; replies are not called "You" in a shared inbox', () => {
  assert.equal(previewLine(row('a', 'x', 'z', { held_count: 1, last_message: null })), 'A note was held back. Open to decide.');
  assert.equal(previewLine(row('a', 'x', 'z', { held_count: 2 })), 'A note was held back. Open to decide.');
  assert.equal(previewLine(row('a', 'x', 'z', { last_message: null })), 'No messages yet.');
  assert.equal(previewLine(row('a', 'x', 'z')), 'They wrote: Found it');
  assert.equal(previewLine(row('a', 'x', 'z', { last_message: { sender_kind: 'owner', body: 'Thanks' } })), 'Replied: Thanks');
});

test("the owner's emails say how to keep the next one out of spam", async () => {
  const { finderMessageMail, signInMail, testAlertMail } = await import('../../../server/auth/mailer.ts');
  for (const m of [
    finderMessageMail('a@example.test', 'Purple backpack', 'https://www.qurtag.com/app/inbox'),
    signInMail('verify-email', 'a@example.test', 'https://www.qurtag.com/x'),
    testAlertMail('a@example.test', 'https://www.qurtag.com/app/settings'),
  ]) {
    assert.match(m.text, /spam or junk/);
    assert.match(m.html, /spam or junk/);
  }
});

test('in a Family, a reply is shown with the first name of who wrote it; your own as "You"', async () => {
  const { familyNames } = await import('../../../src/lib/inbox.ts');
  const names = familyNames({ role: 'owner', members: [{ user_id: 'u1', name: 'Dana Rivera' }, { user_id: 'u2', name: 'Sam' }] });
  assert.equal(names.get('u1'), 'Dana');
  assert.equal(familyNames({ role: 'none' }).size, 0);
  const t = row('a', 'x', 'z', { last_message: { sender_kind: 'owner', body: 'On my way', sender_user_id: 'u2' } });
  assert.equal(previewLine(t, names, 'u1'), 'Sam: On my way');
  assert.equal(previewLine(t, names, 'u2'), 'You: On my way');
  assert.equal(previewLine(t), 'Replied: On my way');
});
