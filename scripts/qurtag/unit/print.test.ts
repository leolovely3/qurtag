/**
 * Printing: several items on one sheet, the style a tag opens on, fewer copies by default, the
 * item's name kept off the tag unless asked for, the small sticker's address and mark, and the
 * notice for browsers inside other apps.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jsQR from 'jsqr';
import { Resvg } from '@resvg/resvg-js';
import { STYLES, defaultCopies, gridFor, styleById } from '../../../src/lib/tagLayout.ts';
import { pageToPdf } from '../../../src/lib/tagPdf.ts';
import { pageToSvg } from '../../../src/lib/tagSvg.ts';
import { buildMixedSheet, buildPiece, buildSheet, fitEntries, sheetLabel } from '../../../src/lib/tagStyles.ts';
import { initialStyle } from '../../../src/lib/printPrefs.ts';
import { chromeIntentUrl, inAppBrowserName } from '../../../src/lib/inAppBrowser.ts';
import type { Item } from '../../../src/lib/tagScene.ts';

const bottle = { finderUrl: 'https://www.qurtag.com/find/Hk3vX9mRtB2q', shortCode: 'k7m2p4', itemName: 'Blue water bottle' };
const bag = { finderUrl: 'https://www.qurtag.com/find/Zz8qWm4RtB7p', shortCode: 'r43a24', itemName: 'Purple backpack' };
const pdfText = (page: Parameters<typeof pageToPdf>[0]) => Buffer.from(pageToPdf(page)).toString('latin1');

test('several items share one sheet, in order, each with its own code', () => {
  const page = buildMixedSheet('sticker', 'clean', [{ data: bottle, copies: 3 }, { data: bag, copies: 2 }], { paper: 'letter' });
  const uses = page.items.filter((i): i is Extract<Item, { t: 'use' }> => i.t === 'use');
  assert.deepEqual(uses.map((u) => u.form), ['piece', 'piece', 'piece', 'piece1', 'piece1']);
  assert.deepEqual(Object.keys(page.forms), ['piece', 'piece1']);
  // Each piece's QR code reads back as its own item's page.
  for (const [form, want] of [['piece', bottle.finderUrl], ['piece1', bag.finderUrl]] as const) {
    const f = page.forms[form];
    const svg = pageToSvg({ w: f.w, h: f.h, forms: { piece: f }, items: [{ t: 'use', form: 'piece', x: 0, y: 0 }] });
    const r = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(f.w * 300) }, background: '#fff' }).render();
    assert.equal(jsQR(new Uint8ClampedArray(r.pixels), r.width, r.height)?.data, want);
  }
  const text = pdfText(page);
  assert.ok(text.includes('(QuR Tag: Blue water bottle \\(qurtag.com/k7m2p4\\), Purple backpack \\(qurtag.com/r43a24\\))'), 'the margin names each item');
});

test('a sheet never holds more than fit, and items with no copies are left out', () => {
  const cap = gridFor(styleById('bag'), 'letter').count;
  const fitted = fitEntries('bag', 'letter', [{ data: bottle, copies: 2 }, { data: bag, copies: 0 }, { data: bag, copies: 5 }]);
  assert.equal(fitted.reduce((n, e) => n + e.copies, 0), cap);
  assert.deepEqual(fitted.map((e) => e.copies), [2, cap - 2]);
  assert.deepEqual(fitEntries('sticker', 'a4', [{ data: bottle, copies: -3 }, { data: bag, copies: 2.7 }]).map((e) => e.copies), [2]);
  assert.equal(buildMixedSheet('sticker', 'clean', [], { paper: 'letter' }).items.filter((i) => i.t === 'use').length, 0);
});

test('the sheet label leaves out a name a PDF font cannot print, and is empty with nothing to say', () => {
  assert.equal(sheetLabel([{ data: { ...bottle, itemName: '工具' }, copies: 1 }]), 'QuR Tag: qurtag.com/k7m2p4');
  assert.equal(sheetLabel([{ data: { finderUrl: bottle.finderUrl }, copies: 1 }]), '');
});

test('a few copies by default, not a full sheet of one code', () => {
  for (const s of STYLES) {
    const n = defaultCopies(s, 'letter');
    assert.ok(n >= 1 && n <= gridFor(s, 'letter').count, s.id);
    if (gridFor(s, 'letter').count > 4) assert.ok(n < gridFor(s, 'letter').count, `${s.id} is not a full page`);
  }
  assert.equal(defaultCopies(styleById('sticker'), 'letter'), 4);
});

test('the item name is off the wallet card and bag tag unless the owner asks for it', () => {
  for (const id of ['wallet', 'bag'] as const) {
    assert.ok(styleById(id).showsName);
    assert.ok(!pdfText(buildSheet(id, 'clean', bottle, { paper: 'letter' })).includes('(On: '), `${id} off by default`);
    assert.ok(pdfText(buildSheet(id, 'clean', { ...bottle, showName: true }, { paper: 'letter' })).includes('(On: Blue water bottle)'), `${id} on when asked`);
  }
  assert.deepEqual(STYLES.filter((s) => s.showsName).map((s) => s.id), ['wallet', 'bag']);
});

test('a tag never printed opens on the style its item suits, not the last style used', () => {
  assert.equal(initialStyle({}, 't1', 'Purple backpack'), 'bag');
  assert.equal(initialStyle({}, 't1', 'House keys'), 'fob');
  assert.equal(initialStyle({}, 't1', 'Water bottle'), 'sticker');
  assert.equal(initialStyle({ t1: 'wallet' }, 't1', 'Purple backpack'), 'wallet', 'the style it was printed in');
  assert.equal(initialStyle({ t2: 'wallet' }, 't1', 'Purple backpack'), 'bag', 'another tag does not count');
  assert.equal(initialStyle({ t1: 'nonsense' }, 't1', 'Purple backpack'), 'bag');
});

test('the small sticker carries the QuR mark and a horizontal short address of 7 pt or more under the code', () => {
  for (const look of ['clean', 'bold', 'playful'] as const) {
    const items = buildPiece('sticker', look, bottle).items;
    const addr = items.find((i) => i.t === 'text' && i.text === 'qurtag.com/k7m2p4');
    assert.ok(addr && addr.t === 'text' && !addr.rot && addr.pt >= 7, look);
    const qr = items.find((i) => i.t === 'modules');
    assert.ok(qr && qr.t === 'modules' && addr.y > qr.y + qr.size, 'under the code');
    assert.ok(items.some((i) => i.t === 'text' && i.text === 'LOST? SCAN ME' && i.bold), 'the heavy line stays');
    assert.ok(items.filter((i) => i.t === 'path' && i.fill === '#0A0B0F').length >= 1, 'the mark is drawn');
  }
});

test('browsers inside other apps are recognised, ordinary browsers are not', () => {
  const ua = {
    facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_US)',
    messenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0]',
    tiktok: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 trill_330000 BytedanceWebview/d8a21c6',
    linkedin: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  };
  assert.equal(inAppBrowserName(ua.facebook), 'Facebook');
  assert.equal(inAppBrowserName(ua.instagram), 'Instagram');
  assert.equal(inAppBrowserName(ua.messenger), 'Messenger');
  assert.equal(inAppBrowserName(ua.tiktok), 'TikTok');
  assert.equal(inAppBrowserName(ua.linkedin), 'LinkedIn');
  for (const ok of [ua.safari, ua.chrome, ua.mac, '', null]) assert.equal(inAppBrowserName(ok), null);
  assert.equal(
    chromeIntentUrl('https://www.qurtag.com/app/tags/abc/print'),
    'intent://www.qurtag.com/app/tags/abc/print#Intent;scheme=https;package=com.android.chrome;end',
  );
});
