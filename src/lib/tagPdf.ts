/**
 * The printable tag as a PDF, made on the device.
 *
 * The iPhone app cannot print its own page, and sending the owner to Safari means signing
 * in again. So the tag (label and QR code) is drawn on a canvas at 200 dpi, wrapped in a
 * one-page Letter PDF, written to the app's cache and handed to the iOS share sheet,
 * which offers Print, Save to Files and AirDrop. A single JPEG page needs no PDF library:
 * the file is a few objects around the image bytes.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { LockupSvg } from '../components/brand/Wordmark';

const DPI = 200;
const PAGE_W = 8.5 * DPI;
const PAGE_H = 11 * DPI;
const INK = '#0A0B0F';
const MUTED = '#52545B';
const FONT = '-apple-system, "SF Pro Text", "Inter", Helvetica, Arial, sans-serif';

export interface TagSheet {
  publicId: string;
  finderUrl: string;
  itemName?: string | null;
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The QR code could not be drawn.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the tag on a Letter-size canvas: white page, the card in the top half. */
export async function drawTagCanvas(tag: TagSheet): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot draw the tag.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = 1 * DPI;
  const top = 1 * DPI;
  const cardW = PAGE_W - margin * 2;
  const cardH = 4.4 * DPI;
  const pad = 0.4 * DPI;

  ctx.strokeStyle = '#D5D6D9';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.roundRect(margin, top, cardW, cardH, 28);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textBaseline = 'alphabetic';
  // The logo: the same drawing as on screen (src/components/brand/Wordmark.tsx).
  const logoH = 0.5 * DPI;
  const logo = await loadSvg(renderToStaticMarkup(createElement(LockupSvg, { height: 100 })));
  ctx.drawImage(logo, margin + pad, top + pad - 0.05 * DPI, (logo.width / logo.height) * logoH, logoH);

  const textX = margin + pad;
  const textW = 2.8 * DPI;
  let y = top + pad + 1.2 * DPI;
  ctx.fillStyle = INK;
  ctx.font = `700 ${0.26 * DPI}px ${FONT}`;
  ctx.fillText('If found, please scan.', textX, y);
  y += 0.42 * DPI;
  ctx.fillStyle = '#1E2026';
  ctx.font = `400 ${0.17 * DPI}px ${FONT}`;
  const body =
    "Scan with your phone camera to send the owner a note. No app needed. Neither of you sees the other's phone number or email.";
  for (const line of wrap(ctx, body, textW)) {
    ctx.fillText(line, textX, y);
    y += 0.26 * DPI;
  }
  if (tag.itemName) {
    y += 0.12 * DPI;
    ctx.fillStyle = MUTED;
    ctx.font = `400 ${0.14 * DPI}px ${FONT}`;
    const linked = wrap(ctx, `On: ${tag.itemName}`, textW);
    for (const line of linked.slice(0, 2)) {
      ctx.fillText(line, textX, y);
      y += 0.21 * DPI;
    }
  }

  // The QR code is drawn from vector markup, so it is sharp at any print size.
  const qrSize = 2.3 * DPI;
  const qrX = margin + cardW - pad - qrSize;
  const qrY = top + pad + 0.7 * DPI;
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: tag.finderUrl,
      size: 1024,
      level: 'H',
      marginSize: 0,
      bgColor: '#FFFFFF',
      fgColor: INK,
    }),
  );
  const qr = await loadSvg(
    svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'),
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = MUTED;
  ctx.font = `400 ${0.13 * DPI}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(tag.finderUrl.replace(/^https?:\/\//, ''), qrX + qrSize / 2, qrY + qrSize + 0.28 * DPI);
  ctx.textAlign = 'left';

  ctx.fillStyle = MUTED;
  ctx.font = `400 ${0.15 * DPI}px ${FONT}`;
  ctx.fillText(
    'Cut it out. Tape it on, slip it into a tag holder, or stick it inside a lid.',
    margin,
    top + cardH + 0.45 * DPI,
  );
  return canvas;
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

/** A one-page PDF (Letter, 612 x 792 points) that shows the JPEG over the whole page. */
export function pdfFromJpeg(jpeg: Uint8Array, pxW: number, pxH: number): Uint8Array {
  const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    parts.push(b);
    length += b.length;
  };
  push(ascii('%PDF-1.4\n'));
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = length;
    push(ascii(`${n} 0 obj\n${body}`));
    if (stream) {
      push(ascii('\nstream\n'));
      push(stream);
      push(ascii('\nendstream'));
    }
    push(ascii('\nendobj\n'));
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
  );
  obj(4, `<< /Length ${content.length} >>`, ascii(content));
  obj(
    5,
    `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  const xref = length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(ascii(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function makeTagPdf(tag: TagSheet): Promise<Uint8Array> {
  const canvas = await drawTagCanvas(tag);
  const url = canvas.toDataURL('image/jpeg', 0.95);
  const jpeg = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  return pdfFromJpeg(jpeg, canvas.width, canvas.height);
}

/** Writes the tag PDF to the app's cache and opens the iOS share sheet (Print, Save to Files, AirDrop). */
export async function shareTagPdf(tag: TagSheet): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const pdf = await makeTagPdf(tag);
  const file = await Filesystem.writeFile({
    path: `qurtag-tag-${tag.publicId}.pdf`,
    data: toBase64(pdf),
    directory: Directory.Cache,
  });
  await Share.share({ title: 'QuR Tag', dialogTitle: 'Print your tag', url: file.uri });
}
