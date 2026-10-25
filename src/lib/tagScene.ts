/**
 * A printed tag as a list of simple shapes, drawn in inches from the top left.
 *
 * One list is drawn two ways: as SVG (the live preview on screen, and the picture turned into
 * the PNG) and as PDF page content (tagPdf.ts). Because both come from the same list, the
 * preview shows what the PDF prints. Nothing here touches the browser, so it runs in the tests.
 *
 * The QR code is a list of square modules, so it stays sharp at any size and a printer never has
 * to smooth it. The logo is the same drawing the app uses (components/brand/logoPaths.ts).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { MARK_LETTERS, NAME_BOX, NAME_GLYPHS, TAGLINE } from '../components/brand/logoPaths';

export const INK = '#0A0B0F';
export const MUTED = '#52545B';
export const ORANGE = '#FF5C2E';
export const YELLOW = '#FFD23F';
export const WHITE = '#FFFFFF';

export type Seg =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export interface Paint {
  fill?: string;
  stroke?: string;
  /** Stroke width in inches. */
  sw?: number;
  dash?: readonly [number, number];
  cap?: 'butt' | 'round';
}

export type Item =
  | ({ t: 'path'; segs: readonly Seg[]; tx: number; ty: number; s: number } & Paint)
  | ({ t: 'line'; x1: number; y1: number; x2: number; y2: number } & Paint)
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      /** Font size in points. */
      pt: number;
      bold?: boolean;
      color: string;
      anchor?: 'start' | 'middle' | 'end';
      /** Extra space between letters, in points. */
      spacing?: number;
      /** Degrees clockwise about (x, y). */
      rot?: number;
    }
  | { t: 'modules'; x: number; y: number; size: number; n: number; runs: readonly (readonly [number, number, number])[]; color: string }
  | { t: 'use'; form: string; x: number; y: number }
  | { t: 'group'; items: Item[]; m: readonly [number, number, number, number, number, number] };

export interface Form {
  w: number;
  h: number;
  items: Item[];
}

export interface Page {
  /** Page size in inches. */
  w: number;
  h: number;
  forms: Record<string, Form>;
  items: Item[];
  /** Where the finished piece lies when the page has bleed. */
  trim?: { x: number; y: number; w: number; h: number };
  bleed?: number;
}

// ---------------------------------------------------------------- paths

/** Turns an SVG path (M L H V Q A Z, capital letters) into lines and cubic curves. */
export function parsePath(d: string): Seg[] {
  const tokens = d.match(/[MLHVQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: Seg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') {
      out.push(['Z']);
      cx = sx;
      cy = sy;
    } else if (cmd === 'M') {
      cx = num();
      cy = num();
      sx = cx;
      sy = cy;
      out.push(['M', cx, cy]);
    } else if (cmd === 'L') {
      cx = num();
      cy = num();
      out.push(['L', cx, cy]);
    } else if (cmd === 'H') {
      cx = num();
      out.push(['L', cx, cy]);
    } else if (cmd === 'V') {
      cy = num();
      out.push(['L', cx, cy]);
    } else if (cmd === 'Q') {
      const qx = num();
      const qy = num();
      const x = num();
      const y = num();
      out.push(['C', cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y]);
      cx = x;
      cy = y;
    } else if (cmd === 'A') {
      const rx = num();
      const ry = num();
      const rot = num();
      const large = num();
      const sweep = num();
      const x = num();
      const y = num();
      out.push(...arcToCurves(cx, cy, rx, ry, rot, large === 1, sweep === 1, x, y));
      cx = x;
      cy = y;
    } else {
      throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  return out;
}

/** An SVG elliptical arc as cubic curves (the PDF format has no arcs). */
function arcToCurves(x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const step = dTheta / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const out: Seg[] = [];
  let a = theta1;
  for (let k = 0; k < n; k++) {
    const b = a + step;
    const p = (ang: number, d: number): [number, number] => {
      const ex = rx * (Math.cos(ang) - d * t * Math.sin(ang));
      const ey = ry * (Math.sin(ang) + d * t * Math.cos(ang));
      return [cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy];
    };
    const [c1x, c1y] = p(a, 1);
    const [c2x, c2y] = p(b, -1);
    const end = k === n - 1 ? [x2, y2] : p(b, 0);
    out.push(['C', c1x, c1y, c2x, c2y, end[0], end[1]]);
    a = b;
  }
  return out;
}

const KAPPA = 0.5522847498;

/** A rectangle path with a different corner radius on each corner (top left, top right, bottom right, bottom left). */
export function roundRect(x: number, y: number, w: number, h: number, r: number | readonly [number, number, number, number]): Seg[] {
  const lim = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) => Math.max(0, Math.min(v, lim)));
  const k = KAPPA;
  const segs: Seg[] = [['M', x + tl, y], ['L', x + w - tr, y]];
  if (tr) segs.push(['C', x + w - tr + tr * k, y, x + w, y + tr - tr * k, x + w, y + tr]);
  segs.push(['L', x + w, y + h - br]);
  if (br) segs.push(['C', x + w, y + h - br + br * k, x + w - br + br * k, y + h, x + w - br, y + h]);
  segs.push(['L', x + bl, y + h]);
  if (bl) segs.push(['C', x + bl - bl * k, y + h, x, y + h - bl + bl * k, x, y + h - bl]);
  segs.push(['L', x, y + tl]);
  if (tl) segs.push(['C', x, y + tl - tl * k, x + tl - tl * k, y, x + tl, y]);
  segs.push(['Z']);
  return segs;
}

export function rectItem(x: number, y: number, w: number, h: number, paint: Paint, r: number | readonly [number, number, number, number] = 0): Item {
  return { t: 'path', segs: roundRect(x, y, w, h, r), tx: 0, ty: 0, s: 1, ...paint };
}

// ---------------------------------------------------------------- QR code

export interface QrModules {
  /** Modules across. */
  n: number;
  /** Dark runs: [column, row, length] along a row. */
  runs: [number, number, number][];
}

/** The dark modules of a QR code at error correction level H, from the same library the screens use. */
export function qrModules(value: string): QrModules {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value, size: 100, level: 'H', marginSize: 0 }));
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  if (!Number.isInteger(n) || n < 21) throw new Error('The QR code could not be drawn.');
  const runs: [number, number, number][] = [];
  const dark = /fill="#000000" d="([^"]*)"/.exec(svg)?.[1] ?? '';
  for (const m of dark.matchAll(/M(\d+)[ ,](\d+) ?h(\d+)v1H\d+z/g)) runs.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  if (runs.length === 0) throw new Error('The QR code could not be drawn.');
  return { n, runs };
}

/** The QR symbol at (x, y), `size` inches across, on a white square that also covers the quiet zone. */
export function qrItems(qr: QrModules, x: number, y: number, size: number, quiet: number): Item[] {
  return [
    { t: 'path', segs: roundRect(x - quiet, y - quiet, size + 2 * quiet, size + 2 * quiet, 0), tx: 0, ty: 0, s: 1, fill: WHITE },
    { t: 'modules', x, y, size, n: qr.n, runs: qr.runs, color: INK },
  ];
}

// ---------------------------------------------------------------- logo

const MARK_PATHS = {
  q: MARK_LETTERS.q.map(parsePath),
  u: MARK_LETTERS.u.map(parsePath),
  smile: parsePath(MARK_LETTERS.smile),
  r: MARK_LETTERS.r.map(parsePath),
};
const NAME_PATHS = NAME_GLYPHS.map((g) => ({ accent: g.accent, segs: parsePath(g.d) }));
const TAG_PATH = parsePath(TAGLINE.d);

/** The QuR mark: the near-black rounded square with Q, u and R. `ring` outlines it for use on a dark band. */
export function markItems(x: number, y: number, size: number, ring?: string): Item[] {
  const items: Item[] = [{ t: 'path', segs: roundRect(x, y, size, size, size * 0.225), tx: 0, ty: 0, s: 1, fill: INK, ...(ring ? { stroke: ring, sw: size * 0.03 } : {}) }];
  const box = MARK_LETTERS.box;
  const k = (100 * 0.7) / box.w;
  const u = size / 100;
  const s = k * u;
  const tx = x + ((100 - box.w * k) / 2 - box.x * k) * u;
  const ty = y + ((100 - box.h * k) / 2 - box.y * k) * u;
  const stroke = (segs: Seg[], color: string, width: number, cap: 'butt' | 'round' = 'butt'): Item => ({ t: 'path', segs, tx, ty, s, stroke: color, sw: width * s, cap });
  MARK_PATHS.q.forEach((p, i) => items.push(stroke(p, WHITE, MARK_LETTERS.stroke, i === 1 ? 'round' : 'butt')));
  MARK_PATHS.u.forEach((p) => items.push(stroke(p, ORANGE, MARK_LETTERS.stroke)));
  items.push(stroke(MARK_PATHS.smile, ORANGE, MARK_LETTERS.smileStroke, 'round'));
  MARK_PATHS.r.forEach((p) => items.push(stroke(p, WHITE, MARK_LETTERS.stroke)));
  return items;
}

/** The width of the full lockup (mark, name, tagline) when the mark is `size` inches tall. */
export function lockupWidth(size: number, tagline: boolean): number {
  const nameW = NAME_BOX.width * 0.5;
  const tagW = tagline ? TAGLINE.width * 0.24 : 0;
  return ((124 + Math.max(nameW, tagW)) * size) / 100;
}

/**
 * The lockup: the mark, "QuR Tag" and (optionally) the tagline "Stick it on. Get it back.".
 * `nameColor` is the colour of the letters other than the orange u: dark on white, white on a band.
 */
export function lockupItems(x: number, y: number, size: number, opts: { tagline?: boolean; nameColor?: string; taglineColor?: string; accentColor?: string; ring?: string } = {}): Item[] {
  const u = size / 100;
  const items = markItems(x, y, size, opts.ring);
  NAME_PATHS.forEach((g) =>
    items.push({ t: 'path', segs: g.segs, tx: x + 124 * u, ty: y + 50 * u, s: 0.5 * u, fill: g.accent ? opts.accentColor ?? ORANGE : opts.nameColor ?? INK }),
  );
  if (opts.tagline) items.push({ t: 'path', segs: TAG_PATH, tx: x + 124 * u, ty: y + 84 * u, s: 0.24 * u, fill: opts.taglineColor ?? MUTED });
  return items;
}

/** The smile from the logo, as a small stroke: used by the playful look. */
export function smileItem(x: number, y: number, w: number, color: string, sw: number): Item {
  const segs = parsePath('M 0 0 Q 50 40 100 0');
  return { t: 'path', segs, tx: x, ty: y, s: w / 100, stroke: color, sw, cap: 'round' };
}

// ---------------------------------------------------------------- shapes in groups

/** Items turned half way round about the centre of a box (the back of a folded tag). */
export function rotated180(items: Item[], cx: number, cy: number): Item {
  return { t: 'group', items, m: [-1, 0, 0, -1, 2 * cx, 2 * cy] };
}

/** Items mirrored left to right across a page of width `w` (for iron-on transfer paper). */
export function mirrored(items: Item[], w: number): Item {
  return { t: 'group', items, m: [-1, 0, 0, 1, w, 0] };
}

export function textItem(
  x: number,
  y: number,
  text: string,
  pt: number,
  color: string,
  opts: { bold?: boolean; anchor?: 'start' | 'middle' | 'end'; spacing?: number; rot?: number } = {},
): Item {
  return { t: 'text', x, y, text, pt, color, ...opts };
}
