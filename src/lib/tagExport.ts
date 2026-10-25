/**
 * Getting a tag out of the app: the PDF to print, and the print-ready PNG and PDF for an online
 * sticker printer.
 *
 * The browser draws the SVG of a page onto a canvas at the dots per inch asked for (600 for the
 * print-ready PNG), and the PNG is stamped with that resolution so a printer reads its size as
 * exactly the tag's size plus bleed. Saving goes through saveFile: the browser downloads, the
 * iPhone app opens the iOS share sheet (Print, Save to Files, AirDrop).
 */
import { saveFile } from './saveFile';
import { pageToPdf } from './tagPdf';
import { pageToSvg } from './tagSvg';
import type { Page } from './tagScene';

/** The most pixels a phone's canvas can hold (iOS Safari stops at about 16.7 million). */
const MAX_PIXELS = 16_000_000;

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** A PNG with its resolution written in (pHYs), just after the header chunk. */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, perMetre);
  dv.setUint32(12, perMetre);
  chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const headerEnd = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, headerEnd), 0);
  out.set(chunk, headerEnd);
  out.set(png.subarray(headerEnd), headerEnd + chunk.length);
  return out;
}

/** The page as PNG bytes at `dpi` dots per inch (browser only). */
export async function pageToPng(page: Page, dpi = 600): Promise<Uint8Array> {
  const scale = Math.min(dpi, Math.floor(Math.sqrt(MAX_PIXELS / (page.w * page.h))));
  const width = Math.round(page.w * scale);
  const height = Math.round(page.h * scale);
  const svg = pageToSvg(page);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('The tag could not be drawn.'));
    el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot draw the tag.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The tag could not be saved as a picture.');
  return pngWithDpi(new Uint8Array(await blob.arrayBuffer()), scale);
}

export async function saveTagPdf(page: Page, filename: string, dialogTitle: string): Promise<void> {
  await saveFile({ filename, mime: 'application/pdf', bytes: pageToPdf(page, { title: 'QuR Tag' }), dialogTitle });
}

export async function saveTagPng(page: Page, filename: string, dpi = 600): Promise<void> {
  await saveFile({ filename, mime: 'image/png', bytes: await pageToPng(page, dpi), dialogTitle: 'Save your sticker file' });
}
