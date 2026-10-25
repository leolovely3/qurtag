/** The layout arithmetic: sizes, copies per page, the QR minimum, the paper choice. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLEED_IN,
  LOOKS,
  MIN_QR_IN,
  MIN_QUIET_MODULES,
  PAPERS,
  STYLES,
  copiesOnPage,
  copyChoices,
  defaultPaper,
  gridFor,
  panelSize,
  planGrid,
  printReadySize,
  qrSize,
  quietZone,
  shortAddress,
  styleById,
  type PaperId,
  type StyleSpec,
} from '../../../src/lib/tagLayout.ts';
import { fitSize, textWidth, wrapText } from '../../../src/lib/tagFont.ts';

const papers: PaperId[] = ['letter', 'a4'];

test('there are six styles and three looks', () => {
  assert.deepEqual(STYLES.map((s) => s.id), ['sticker', 'strip', 'fob', 'wallet', 'bag', 'clothing']);
  assert.deepEqual(LOOKS.map((l) => l.id), ['clean', 'bold', 'playful']);
});

test('the stated sizes', () => {
  assert.deepEqual([styleById('sticker').w, styleById('sticker').h], [1.25, 1.25]);
  assert.deepEqual([styleById('strip').w, styleById('strip').h], [2.625, 1]);
  assert.deepEqual(panelSize(styleById('fob')), { w: 1, h: 1.4 });
  assert.deepEqual([styleById('wallet').w, styleById('wallet').h], [3.375, 2.125]);
  assert.equal(styleById('fob').panels, 2);
  assert.equal(styleById('bag').panels, 2);
  assert.equal(styleById('clothing').mirrorable, true);
  assert.equal(STYLES.filter((s) => s.mirrorable).length, 1);
});

test('every style prints the QR code at least 0.75 in with its quiet zone, and it fits the panel', () => {
  for (const s of STYLES) {
    assert.ok(qrSize(s) >= MIN_QR_IN, `${s.name} QR ${s.qr}`);
    const q = quietZone(s, 37);
    assert.ok(q >= (MIN_QUIET_MODULES * s.qr) / 37 - 1e-9, `${s.name} quiet zone`);
    const p = panelSize(s);
    assert.ok(s.qr + 2 * q <= p.w + 1e-9, `${s.name}: QR and quiet zone fit across`);
    assert.ok(s.qr + 2 * q <= p.h + 1e-9, `${s.name}: QR and quiet zone fit down`);
  }
});

test('the small sticker is 1.25 in: the code with its quiet zone plus a readable line fits, and 1 in would not', () => {
  const s = styleById('sticker');
  const zone = s.qr + 2 * quietZone(s, 37);
  const line = textWidth('LOST? SCAN ME', 9, true);
  assert.ok(s.qr >= MIN_QR_IN);
  assert.ok(zone + 0.2 <= s.h - 0.092 + 1e-9, 'zone and a 0.2 in band fit down');
  assert.ok(zone + 0.2 > 1 - 0.092, 'the same would not fit a 1 in sticker');
  assert.ok(line <= s.w - 0.092 - 0.12 + 1e-9, 'a 9 pt line fits across');
});

test('a QR code under the minimum is refused', () => {
  const small: StyleSpec = { ...styleById('sticker'), qr: 0.7 };
  assert.throws(() => qrSize(small), RangeError);
  assert.throws(() => quietZone(small, 37), RangeError);
});

test('the label strip on Letter is the standard 30 per sheet address label sheet', () => {
  const g = gridFor(styleById('strip'), 'letter');
  assert.equal(g.count, 30);
  assert.deepEqual([g.cols, g.rows, g.pitchX, g.pitchY, g.marks, g.labelSheet], [3, 10, 2.75, 1, false, true]);
  // Margins: 0.1875 left and right, 0.5 top and bottom.
  assert.equal(g.x0 * 2 + 3 * 2.625 + 2 * 0.125, 8.5);
  assert.equal(g.y0 * 2 + 10, 11);
});

test('copies per page, on both papers', () => {
  const expected: Record<string, [number, number]> = { sticker: [35, 35], strip: [30, 18], fob: [18, 18], wallet: [8, 8], bag: [3, 3], clothing: [16, 18] };
  for (const s of STYLES) {
    const [letter, a4] = expected[s.id];
    assert.equal(gridFor(s, 'letter').count, letter, `${s.id} letter`);
    assert.equal(gridFor(s, 'a4').count, a4, `${s.id} a4`);
    assert.ok(letter >= 3 && a4 >= 3, `${s.id} prints several copies, so there are spares`);
  }
});

test('every grid stays inside the paper, with the least margin, and pieces do not overlap', () => {
  for (const s of STYLES) {
    for (const id of papers) {
      const g = gridFor(s, id);
      const paper = PAPERS[id];
      const right = g.x0 + (g.cols - 1) * g.pitchX + s.w;
      const bottom = g.y0 + (g.rows - 1) * g.pitchY + s.h;
      const margin = g.labelSheet ? 0.1875 : s.margin;
      assert.ok(g.x0 >= margin - 1e-9 && g.y0 >= Math.min(margin, 0.5) - 1e-9, `${s.id} ${id} top left`);
      assert.ok(right <= paper.w - margin + 1e-9 && bottom <= paper.h - Math.min(margin, 0.5) + 1e-9, `${s.id} ${id} bottom right`);
      assert.ok(g.pitchX >= s.w - 1e-9 && g.pitchY >= s.h - 1e-9);
    }
  }
});

test('copiesOnPage clamps the request', () => {
  const s = styleById('wallet');
  assert.equal(copiesOnPage(s, 'letter'), 8);
  assert.equal(copiesOnPage(s, 'letter', 100), 8);
  assert.equal(copiesOnPage(s, 'letter', 3), 3);
  assert.equal(copiesOnPage(s, 'letter', 0), 1);
  assert.equal(copiesOnPage(s, 'letter', Number.NaN), 8);
  assert.deepEqual(copyChoices(s, 'letter'), [8, 6, 3, 1]);
  assert.deepEqual(copyChoices(styleById('bag'), 'letter'), [3, 1]);
});

test('planGrid centres the grid and counts what fits', () => {
  const g = planGrid(PAPERS.letter, 1, 1, 0.5, 0.5);
  assert.equal(g.cols, Math.floor((7.5 + 0.5) / 1.5));
  assert.ok(Math.abs(g.x0 + (g.cols * 1 + (g.cols - 1) * 0.5) / 2 - 4.25) < 1e-9);
  assert.equal(planGrid(PAPERS.letter, 9, 9, 0, 0.5).count, 0);
});

test('paper default follows the region', () => {
  assert.equal(defaultPaper('en-US'), 'letter');
  assert.equal(defaultPaper('en-CA'), 'letter');
  assert.equal(defaultPaper('en-GB'), 'a4');
  assert.equal(defaultPaper('de-DE'), 'a4');
  assert.equal(defaultPaper('en'), 'letter');
  assert.equal(defaultPaper(undefined), 'letter');
  assert.ok(Math.abs(PAPERS.a4.w * 25.4 - 210) < 1e-9);
});

test('print-ready size is the piece plus bleed on every side', () => {
  const s = styleById('wallet');
  assert.deepEqual(printReadySize(s), { w: 3.375 + 2 * BLEED_IN, h: 2.125 + 2 * BLEED_IN });
  assert.equal(BLEED_IN, 0.125);
});

test('the short address', () => {
  assert.equal(shortAddress('k7m2p'), 'qurtag.com/k7m2p');
  assert.equal(shortAddress(null), '');
});

test('text widths follow the Helvetica tables', () => {
  assert.ok(Math.abs(textWidth('HH', 72) - 2 * 0.722) < 1e-9);
  assert.ok(textWidth('If found', 10, true) > textWidth('If found', 10, false));
  assert.ok(fitSize('If found, scan me', 1, 40, true) < 40);
  assert.ok(textWidth('If found, scan me', fitSize('If found, scan me', 1, 40, true), true) <= 1 + 1e-9);
  assert.equal(fitSize('a', 5, 12), 12);
  const lines = wrapText('Scan to send the owner a note. No app needed.', 1.2, 7);
  assert.ok(lines.length > 1 && lines.every((l) => textWidth(l, 7) <= 1.2 + 1e-9));
});
