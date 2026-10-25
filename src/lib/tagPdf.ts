/**
 * A tag page as a PDF, made on the device.
 *
 * The PDF is drawn from the same shapes as the on-screen preview (tagScene.ts), as real vector
 * content: the QR code is a list of squares, the logo is paths, and the text is Helvetica, one of
 * the 14 fonts every PDF viewer and printer already has, so no font travels inside the file. A
 * page of 48 tags is a few tens of kilobytes and prints sharp at the printer's full resolution.
 * Each piece is drawn once as a form and placed once per copy.
 *
 * The iPhone app cannot print its own page, so tagShare.ts writes this PDF to the app's cache and
 * hands it to the iOS share sheet, which offers Print, Save to Files and AirDrop.
 *
 * The page content is written in inches from the top left (a matrix at the start turns the PDF's
 * points from the bottom left into that), which is also how the shapes are described.
 */
import { textWidth } from './tagFont';
import { n4, placedSegs } from './tagSvg';
import type { Form, Item, Page } from './tagScene';

const enc = new TextEncoder();

function rgb(hex: string): string {
  const v = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  return c.map((x) => n4(x)).join(' ');
}

function pdfString(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) out += '?';
    else if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else out += ch;
  }
  return `(${out})`;
}

function paintOps(p: { fill?: string; stroke?: string; sw?: number; dash?: readonly [number, number]; cap?: 'butt' | 'round' }): { pre: string; op: string } {
  let pre = '';
  if (p.fill) pre += `${rgb(p.fill)} rg `;
  if (p.stroke) {
    pre += `${rgb(p.stroke)} RG ${n4(p.sw ?? 0.01)} w 1 j ${p.cap === 'round' ? 1 : 0} J `;
    pre += p.dash ? `[${n4(p.dash[0])} ${n4(p.dash[1])}] 0 d ` : '[] 0 d ';
  }
  const op = p.fill && p.stroke ? 'B' : p.fill ? 'f' : p.stroke ? 'S' : 'n';
  return { pre, op };
}

const FONT_REGULAR = 'F1';
const FONT_BOLD = 'F2';

function itemOps(it: Item, formIds: Record<string, string>): string {
  switch (it.t) {
    case 'path': {
      const { pre, op } = paintOps(it);
      const body = placedSegs(it)
        .map((g) => {
          if (g[0] === 'Z') return 'h';
          if (g[0] === 'M') return `${n4(g[1])} ${n4(g[2])} m`;
          if (g[0] === 'L') return `${n4(g[1])} ${n4(g[2])} l`;
          return `${n4(g[1])} ${n4(g[2])} ${n4(g[3])} ${n4(g[4])} ${n4(g[5])} ${n4(g[6])} c`;
        })
        .join(' ');
      return `q ${pre}${body} ${op} Q\n`;
    }
    case 'line': {
      const { pre } = paintOps({ ...it, fill: undefined });
      return `q ${pre}${n4(it.x1)} ${n4(it.y1)} m ${n4(it.x2)} ${n4(it.y2)} l S Q\n`;
    }
    case 'text': {
      const spacing = (it.spacing ?? 0) / 72;
      const width = textWidth(it.text, it.pt, !!it.bold) + spacing * Math.max(0, it.text.length - 1);
      const shift = it.anchor === 'middle' ? width / 2 : it.anchor === 'end' ? width : 0;
      const th = ((it.rot ?? 0) * Math.PI) / 180;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = it.x - shift * c;
      const y = it.y - shift * s;
      // The page is drawn upside down (y grows downward), so the letters are flipped back by the matrix.
      return `q ${rgb(it.color)} rg BT /${it.bold ? FONT_BOLD : FONT_REGULAR} ${n4(it.pt / 72)} Tf ${spacing ? `${n4(spacing)} Tc ` : ''}${n4(c)} ${n4(s)} ${n4(s)} ${n4(-c)} ${n4(x)} ${n4(y)} Tm ${pdfString(it.text)} Tj ET Q\n`;
    }
    case 'modules': {
      const u = it.size / it.n;
      const rects = it.runs.map(([col, row, len]) => `${n4(it.x + col * u)} ${n4(it.y + row * u)} ${n4(len * u)} ${n4(u)} re`).join(' ');
      return `q ${rgb(it.color)} rg ${rects} f Q\n`;
    }
    case 'use':
      return `q 1 0 0 1 ${n4(it.x)} ${n4(it.y)} cm /${formIds[it.form]} Do Q\n`;
    case 'group':
      return `q ${it.m.map(n4).join(' ')} cm\n${it.items.map((x) => itemOps(x, formIds)).join('')}Q\n`;
  }
}

function formOps(f: Form, formIds: Record<string, string>): string {
  return f.items.map((x) => itemOps(x, formIds)).join('');
}

/** A PDF of the page: one page, vector shapes, Helvetica text. */
export function pageToPdf(page: Page, opts: { title?: string } = {}): Uint8Array {
  const formNames = Object.keys(page.forms);
  const formIds: Record<string, string> = {};
  formNames.forEach((name, i) => (formIds[name] = `Fm${i + 1}`));
  // Object numbers: 1 catalog, 2 pages, 3 page, 4 content, 5 and 6 fonts, 7 info, then forms.
  const firstForm = 8;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (s: string | Uint8Array) => {
    const b = typeof s === 'string' ? enc.encode(s) : s;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, dict: string, stream?: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (stream === undefined) push(`${dict}\n`);
    else {
      const body = enc.encode(stream);
      push(`${dict.slice(0, dict.lastIndexOf('>>'))}/Length ${body.length} >>\nstream\n`);
      push(body);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  const wpt = page.w * 72;
  const hpt = page.h * 72;
  push('%PDF-1.4\n');
  const boxes = page.trim
    ? ` /TrimBox [${n4(page.trim.x * 72)} ${n4((page.h - page.trim.y - page.trim.h) * 72)} ${n4((page.trim.x + page.trim.w) * 72)} ${n4((page.h - page.trim.y) * 72)}] /BleedBox [0 0 ${n4(wpt)} ${n4(hpt)}]`
    : '';
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xobjects = formNames.map((name, i) => `/${formIds[name]} ${firstForm + i} 0 R`).join(' ');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n4(wpt)} ${n4(hpt)}]${boxes} /Resources << /Font << /${FONT_REGULAR} 5 0 R /${FONT_BOLD} 6 0 R >> /XObject << ${xobjects} >> >> /Contents 4 0 R >>`,
  );
  const content = `72 0 0 -72 0 ${n4(hpt)} cm\n${page.items.map((x) => itemOps(x, formIds)).join('')}`;
  obj(4, '<< >>', content);
  obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(7, `<< /Title ${pdfString(opts.title ?? 'QuR Tag')} /Producer (QuR Tag) >>`);
  formNames.forEach((name, i) => {
    const f = page.forms[name];
    // A form is drawn in the page's inches, so it needs no matrix of its own; its box is generous.
    obj(
      firstForm + i,
      `<< /Type /XObject /Subtype /Form /BBox [-1 -1 ${n4(f.w + 1)} ${n4(f.h + 1)}] /Resources << /Font << /${FONT_REGULAR} 5 0 R /${FONT_BOLD} 6 0 R >> >> >>`,
      formOps(f, formIds),
    );
  });
  const count = firstForm + formNames.length;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size ${count} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
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
