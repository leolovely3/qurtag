/**
 * The drawn tags: every style and look at actual size, as a PDF and as a picture, with the QR code
 * decoded back to the finder address (so a printed code is proved readable, at the smallest
 * size, at 300 dots per inch).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jsQR from 'jsqr';
import { Resvg } from '@resvg/resvg-js';
import { LOOKS, MIN_QR_IN, PAPERS, STYLES, gridFor, styleById } from '../../../src/lib/tagLayout.ts';
import { pageToPdf, toBase64 } from '../../../src/lib/tagPdf.ts';
import { pageToSvg } from '../../../src/lib/tagSvg.ts';
import { buildPiece, buildPreview, buildPrintReady, buildSheet } from '../../../src/lib/tagStyles.ts';
import { parsePath, qrModules } from '../../../src/lib/tagScene.ts';
import { pngWithDpi } from '../../../src/lib/tagExport.ts';

const data = { finderUrl: 'https://www.qurtag.com/find/Hk3vX9mRtB2q', shortCode: 'k7m2p', itemName: 'Blue water bottle' };

function raster(svg: string, dpi: number, inches: number): { data: Uint8ClampedArray; width: number; height: number } {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(inches * dpi) }, background: '#ffffff' }).render();
  return { data: new Uint8ClampedArray(r.pixels), width: r.width, height: r.height };
}

test('the QR code reads back as the finder address for every style and look at 300 dpi', () => {
  for (const s of STYLES) {
    for (const l of LOOKS) {
      const page = buildPreview(s.id, l.id, data);
      const img = raster(pageToSvg(page), 300, page.w);
      const code = jsQR(img.data, img.width, img.height);
      assert.equal(code?.data, data.finderUrl, `${s.id} ${l.id}`);
    }
  }
});

test('the print-ready file reads back too, with bleed, and is the piece plus bleed in size', () => {
  for (const s of STYLES) {
    const page = buildPrintReady(s.id, 'bold', data);
    assert.ok(Math.abs(page.w - (s.w + 0.25)) < 1e-9 && Math.abs(page.h - (s.h + 0.25)) < 1e-9);
    assert.deepEqual(page.trim, { x: 0.125, y: 0.125, w: s.w, h: s.h });
    const img = raster(pageToSvg(page), 300, page.w);
    assert.equal(jsQR(img.data, img.width, img.height)?.data, data.finderUrl, s.id);
  }
});

test('the QR symbol on the page is never smaller than the minimum', () => {
  for (const s of STYLES) {
    for (const l of LOOKS) {
      const walk = (items: ReturnType<typeof buildPiece>['items']): number[] =>
        items.flatMap((i) => (i.t === 'modules' ? [i.size] : i.t === 'group' ? walk(i.items) : []));
      const sizes = walk(buildPiece(s.id, l.id, data).items);
      assert.ok(sizes.length >= 1 && sizes.every((z) => z >= MIN_QR_IN - 1e-9), `${s.id} ${l.id}`);
    }
  }
});

test('a PDF has the right page size, one page, valid offsets and the short code', () => {
  for (const paper of ['letter', 'a4'] as const) {
    const page = buildSheet('wallet', 'clean', data, { paper });
    const bytes = pageToPdf(page);
    const text = Buffer.from(bytes).toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    const w = Math.round(PAPERS[paper].w * 72 * 10000) / 10000;
    assert.ok(text.includes(`/MediaBox [0 0 ${w} `), paper);
    assert.equal((text.match(/\/Type \/Page /g) ?? []).length, 1);
    assert.ok(text.includes('(qurtag.com/k7m2p)'));
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    assert.equal(text.slice(xrefAt, xrefAt + 4), 'xref');
    const count = Number(/xref\n0 (\d+)/.exec(text)![1]);
    const entries = text.slice(xrefAt).split('\n').slice(3, 2 + count);
    entries.forEach((line, i) => {
      const off = Number(line.slice(0, 10));
      assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
    });
    assert.ok(bytes.length < 200_000, 'a page of tags is small');
  }
});

test('the print-ready PDF carries a trim box inside its bleed box', () => {
  const text = Buffer.from(pageToPdf(buildPrintReady('sticker', 'clean', data))).toString('latin1');
  assert.ok(text.includes('/TrimBox [9 9 81 81]'), text.match(/\/TrimBox[^\]]*\]/)?.[0]);
  assert.ok(text.includes('/BleedBox [0 0 90 90]'));
});

test('copies on a page match the grid', () => {
  for (const s of STYLES) {
    const page = buildSheet(s.id, 'clean', data, { paper: 'letter' });
    assert.equal(page.items.filter((i) => i.t === 'use').length, gridFor(s, 'letter').count, s.id);
    const few = buildSheet(s.id, 'clean', data, { paper: 'letter', copies: 2 });
    assert.equal(few.items.filter((i) => i.t === 'use').length, 2);
  }
});

test('mirroring flips the page for transfer paper, and only for the clothing strip', () => {
  const plain = buildSheet('clothing', 'clean', data, { paper: 'letter' });
  const flipped = buildSheet('clothing', 'clean', data, { paper: 'letter', mirror: true });
  assert.equal(plain.items.some((i) => i.t === 'group'), false);
  const g = flipped.items[0];
  assert.ok(g.t === 'group' && g.m[0] === -1 && g.m[4] === 8.5);
  const noMirror = buildSheet('sticker', 'clean', data, { paper: 'letter', mirror: true });
  assert.equal(noMirror.items.some((i) => i.t === 'group'), false);
  assert.ok(pageToSvg(flipped).includes('matrix(-1 0 0 1 8.5 0)'));
});

test('a name a PDF font cannot print is left off, and a missing short code leaves the line out', () => {
  const odd = { ...data, itemName: 'Leo’s 工具' };
  const text = Buffer.from(pageToPdf(buildSheet('wallet', 'clean', odd, { paper: 'letter' }))).toString('latin1');
  assert.ok(!text.includes('(On:'));
  const none = Buffer.from(pageToPdf(buildSheet('wallet', 'clean', { ...data, shortCode: null }, { paper: 'letter' }))).toString('latin1');
  assert.ok(!none.includes('qurtag.com/'));
});

test('the QR code is level H: it still reads with a twelfth of it blanked out', () => {
  const page = buildPreview('wallet', 'clean', data);
  const qr = page.forms.piece.items.find((i) => i.t === 'modules');
  assert.ok(qr && qr.t === 'modules');
  const side = qr.size * 0.29;
  const hole = `<rect x="${qr.x + (qr.size - side) / 2}" y="${qr.y + (qr.size - side) / 2}" width="${side}" height="${side}" fill="#fff"/>`;
  const img = raster(pageToSvg(page).replace('</svg>', `${hole}</svg>`), 300, page.w);
  assert.equal(jsQR(img.data, img.width, img.height)?.data, data.finderUrl);
});

test('paths parse to lines and curves, and the logo path commands are all understood', () => {
  const segs = parsePath('M 0 0 L 10 0 H 20 V 5 Q 25 5 30 0 A 5 5 0 0 1 40 0 Z');
  assert.deepEqual(segs.map((g) => g[0]).filter((c, i, a) => c !== a[i - 1]), ['M', 'L', 'C', 'Z']);
  assert.equal(qrModules(data.finderUrl).n, 37);
});

test('the PNG gets its dots per inch, so a printer knows the size', () => {
  const r = new Resvg(pageToSvg(buildPreview('sticker', 'clean', data)), { fitTo: { mode: 'width', value: 100 } }).render();
  const png = new Uint8Array(r.asPng());
  const out = pngWithDpi(png, 600);
  assert.equal(out.length, png.length + 21);
  assert.deepEqual([...out.subarray(12, 16)], [0x49, 0x48, 0x44, 0x52], 'the header chunk is still first');
  const dv = new DataView(out.buffer, out.byteOffset);
  assert.equal(dv.getUint32(33), 9);
  assert.deepEqual([...out.subarray(37, 41)], [0x70, 0x48, 0x59, 0x73]);
  assert.equal(dv.getUint32(41), 23622);
  assert.equal(dv.getUint32(45), 23622);
  assert.equal(out[49], 1);
  assert.deepEqual([...out.subarray(54)], [...png.subarray(33)], 'the rest is untouched');
  assert.equal(toBase64(Uint8Array.from([104, 105])), 'aGk=');
});
