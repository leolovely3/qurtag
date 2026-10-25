import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfFromJpeg, toBase64 } from '../../../src/lib/tagPdf.ts';

test('the tag PDF is one Letter page with correct cross-reference offsets', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = pdfFromJpeg(jpeg, 1700, 2200);
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/MediaBox [0 0 612 792]'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.equal(text.slice(xrefAt, xrefAt + 4), 'xref');
  const entries = text.slice(xrefAt).split('\n').slice(3, 8);
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    const n = i + 1;
    assert.equal(text.slice(off, off + `${n} 0 obj`.length), `${n} 0 obj`);
  });
});

test('base64 of the PDF bytes round-trips', () => {
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
  assert.deepEqual(Uint8Array.from(Buffer.from(toBase64(bytes), 'base64')), bytes);
});
