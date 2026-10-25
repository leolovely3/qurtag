import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AX_ROOT_PX, AXX_ROOT_PX, textSizeClasses } from '../../../src/lib/textSize';
import { SITE_TITLE, pageTitle, titleForPath } from '../../../src/lib/pageTitle';

// The iPhone's text sizes as root font sizes in px (body style): xSmall to xxxLarge, then
// Accessibility 1 to 5.
const STANDARD = [14, 15, 16, 17, 19, 21];
const LARGEST_STANDARD = 23;
const ACCESSIBILITY = [28, 33, 40, 47, 53];

test('the default and the smaller standard text sizes keep the normal layout', () => {
  for (const px of STANDARD) assert.deepEqual(textSizeClasses(px), { ax: false, axx: false }, `${px} px`);
});

test('the largest standard size and every Accessibility size stack rows', () => {
  assert.equal(textSizeClasses(LARGEST_STANDARD).ax, true);
  for (const px of ACCESSIBILITY) assert.equal(textSizeClasses(px).ax, true, `${px} px`);
  assert.ok(AX_ROOT_PX > 21 && AX_ROOT_PX <= LARGEST_STANDARD);
});

test('the very largest sizes get the extra-large layout, Accessibility 1 and 2 do not', () => {
  assert.equal(textSizeClasses(28).axx, false);
  assert.equal(textSizeClasses(33).axx, false);
  for (const px of [40, 47, 53]) assert.equal(textSizeClasses(px).axx, true, `${px} px`);
  assert.ok(AXX_ROOT_PX > 33 && AXX_ROOT_PX <= 40);
});

test('each page has its own title, ending in the product name', () => {
  assert.equal(titleForPath('/pricing'), 'Pricing | QuR Tag');
  assert.equal(titleForPath('/help/'), 'Help | QuR Tag');
  assert.equal(titleForPath('/terms'), 'Terms | QuR Tag');
  assert.equal(titleForPath('/make-it-last'), 'Make your tag last | QuR Tag');
  assert.equal(titleForPath('/join/abc'), 'Join a family | QuR Tag');
  assert.equal(titleForPath('/find/AbCdEfGhJkMn'), 'You found something | QuR Tag');
  assert.equal(titleForPath('/'), SITE_TITLE);
  assert.equal(pageTitle('Inbox'), 'Inbox | QuR Tag');
  const titled = ['/how-it-works', '/pricing', '/security', '/help', '/tags', '/privacy', '/terms', '/start'];
  assert.equal(new Set(titled.map(titleForPath)).size, titled.length, 'no two public pages share a title');
});
