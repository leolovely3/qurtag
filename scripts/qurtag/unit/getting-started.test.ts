/** The first-tag recommendation and the Getting started checklist state. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PICKS, recommendStyle } from '../../../src/lib/tagRecommend.ts';
import { STYLES } from '../../../src/lib/tagLayout.ts';
import {
  closeCard,
  emptyProgress,
  isFinished,
  loadProgress,
  markDone,
  markSkipped,
  nextStep,
  saveProgress,
  stepStates,
  type StorageLike,
} from '../../../src/lib/gettingStarted.ts';

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

test('every quick pick recommends a style that exists', () => {
  const ids = STYLES.map((s) => s.id);
  for (const p of PICKS) assert.ok(ids.includes(p.style), p.id);
});

test('the quick picks get the style that suits them', () => {
  const style = (id: string) => recommendStyle(id as never, PICKS.find((p) => p.id === id)!.name);
  assert.equal(style('bottle'), 'sticker');
  assert.equal(style('glasses'), 'sticker');
  assert.equal(style('laptop'), 'strip');
  assert.equal(style('instrument'), 'strip');
  assert.equal(style('keys'), 'fob');
  assert.equal(style('backpack'), 'bag');
  assert.equal(style('other'), 'sticker');
});

test('words typed for something else choose the style', () => {
  assert.equal(recommendStyle('other', "Maya's lunchbox"), 'strip');
  assert.equal(recommendStyle('other', 'Phone charger'), 'sticker');
  assert.equal(recommendStyle('other', 'Gym bag'), 'bag');
  assert.equal(recommendStyle('other', 'Carry-on suitcase'), 'bag');
  assert.equal(recommendStyle('other', 'Rain jacket'), 'clothing');
  assert.equal(recommendStyle('other', 'House keys'), 'fob');
  assert.equal(recommendStyle('bottle', 'Violin case'), 'strip');
  assert.equal(recommendStyle(null, ''), 'sticker');
});

test('the checklist: add is derived from the items, the rest are remembered', () => {
  const facts = { itemCount: 0, native: false, alertsOn: false };
  let p = emptyProgress();
  assert.deepEqual(stepStates(p, facts).map((s) => s.id), ['add', 'print', 'stick', 'test']);
  assert.equal(nextStep(p, facts), 'add');
  assert.equal(nextStep(p, { ...facts, itemCount: 1 }), 'print');
  p = markDone(p, 'print');
  assert.equal(nextStep(p, { ...facts, itemCount: 1 }), 'stick');
  assert.equal(isFinished(p, { ...facts, itemCount: 1 }), false);
});

test('alerts are a step only in the iPhone app and are done when allowed', () => {
  const web = { itemCount: 1, native: false, alertsOn: false };
  const phone = { itemCount: 1, native: true, alertsOn: false };
  assert.ok(!stepStates(emptyProgress(), web).some((s) => s.id === 'alerts'));
  assert.ok(stepStates(emptyProgress(), phone).some((s) => s.id === 'alerts' && !s.done));
  assert.ok(stepStates(emptyProgress(), { ...phone, alertsOn: true }).some((s) => s.id === 'alerts' && s.done));
});

test('dismissed and done steps finish the card; a closed card is finished', () => {
  const facts = { itemCount: 1, native: true, alertsOn: false };
  let p = emptyProgress();
  p = markDone(p, 'print');
  p = markDone(p, 'stick');
  p = markSkipped(p, 'test');
  assert.equal(isFinished(p, facts), false);
  p = markSkipped(p, 'alerts');
  assert.equal(isFinished(p, facts), true);
  assert.equal(isFinished(closeCard(emptyProgress()), { itemCount: 0, native: false, alertsOn: false }), true);
});

test('doing a dismissed step brings it back as done', () => {
  let p = markSkipped(emptyProgress(), 'test');
  p = markDone(p, 'test');
  assert.deepEqual(p.skipped, []);
  assert.deepEqual(p.done, ['test']);
});

test('progress is kept per account and survives bad data', () => {
  const s = memory();
  saveProgress(s, 'user-a', markDone(emptyProgress(), 'print'));
  assert.deepEqual(loadProgress(s, 'user-a').done, ['print']);
  assert.deepEqual(loadProgress(s, 'user-b').done, []);
  s.setItem('qurtag.start.user-c', '{not json');
  assert.deepEqual(loadProgress(s, 'user-c'), emptyProgress());
  s.setItem('qurtag.start.user-d', JSON.stringify({ done: ['print', 'bogus'], skipped: 5, closed: 'yes' }));
  assert.deepEqual(loadProgress(s, 'user-d'), { done: ['print'], skipped: [], closed: false });
  assert.deepEqual(loadProgress(null, 'x'), emptyProgress());
});

import { HELP, visibleHelp } from '../../../src/lib/helpContent.ts';

test('Help: every answer has a unique id and every link points inside the app', () => {
  const ids = HELP.flatMap((s) => [s.id, ...s.entries.map((e) => e.id)]);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of HELP) for (const e of s.entries) if (e.action) assert.match(e.action.to, /^\/(app|start)(\/|$|#)/);
  for (const s of HELP) for (const e of s.entries) assert.ok(!(e.q + e.a).includes('—'), e.id);
});

test('Help: plan answers are hidden while memberships are hidden, and search narrows the answers', () => {
  const all = visibleHelp(HELP, { memberships: true, native: false, query: '' });
  const hidden = visibleHelp(HELP, { memberships: false, native: true, query: '' });
  const count = (s: typeof all) => s.reduce((n, x) => n + x.entries.length, 0);
  assert.ok(count(hidden) < count(all));
  assert.ok(!hidden.some((s) => s.entries.some((e) => e.paid)));
  assert.equal(hidden.find((s) => s.id === 'account')?.title, 'Account');
  assert.equal(all.find((s) => s.id === 'account')?.title, 'Account and membership');
  const found = visibleHelp(HELP, { memberships: true, native: false, query: 'block finder' });
  assert.ok(found.some((s) => s.entries.some((e) => e.id === 'report-block')));
  assert.equal(visibleHelp(HELP, { memberships: true, native: false, query: 'zzzzqq' }).length, 0);
});
