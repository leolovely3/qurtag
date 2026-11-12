/**
 * Draws each tag style in each look, and lays pieces out on a page.
 *
 * `buildPiece` draws one finished piece (a sticker, a label strip, a folded card). `buildSheet`
 * puts copies of it on a Letter or A4 page, with cut marks. `buildPrintReady` makes one piece at
 * exact size with bleed, for an online sticker printer. Each returns shapes (tagScene.ts) that
 * the preview, the PNG and the PDF all draw.
 *
 * Looks. Clean is white with a thin outline. Bold is a heavy black plate with white lettering in
 * its text block. Playful is a yellow plate with an orange text block and friendlier words. In
 * every look the QR code sits on plain white with its full quiet zone, in black, so the contrast
 * a phone needs never depends on the look.
 *
 * Every style carries the QuR Tag frame, a thin orange line round the edge, so a tag is known at a
 * glance. On white (Clean) it is a plain orange line. On the black plate (Bold) the orange line
 * sits inside the black edge, which is high contrast. On the yellow plate (Playful) orange alone
 * would nearly vanish, so the line has a thin black keyline on either side.
 *
 * "Scan me" lines. The small sticker, the key fob front and the clothing strip are the pieces
 * a stranger sees from an arm's length, so they carry a heavy capital line (LOST? SCAN ME, or
 * IF FOUND, / SCAN ME) as large as the width allows. The lines are set in Helvetica-Bold, a
 * base font every PDF viewer and printer has, so the weight survives into the PDF.
 *
 * The outer plate (black or yellow) runs out into the bleed, so a trim that drifts a hair shows
 * no white edge. On a sheet or in a preview the plate has rounded corners that show where to cut.
 * In a print-ready file the corners are square, because the sticker printer's cutter makes the shape.
 */
import { CAP_HEIGHT, fitSize, isPlainText, textWidth, wrapText } from './tagFont';
import {
  BLEED_IN,
  PAPERS,
  copiesOnPage,
  gridFor,
  panelSize,
  qrSize,
  quietZone,
  shortAddress,
  styleById,
  type LookId,
  type PaperId,
  type StyleId,
  type StyleSpec,
} from './tagLayout';
import {
  INK,
  MUTED,
  ORANGE,
  WHITE,
  YELLOW,
  lockupItems,
  lockupWidth,
  markItems,
  mirrored,
  qrItems,
  qrModules,
  rectItem,
  rotated180,
  smileItem,
  textItem,
  type Form,
  type Item,
  type Page,
  type QrModules,
  type Seg,
} from './tagScene';

export interface TagData {
  /** The address the QR code opens (the finder page). */
  finderUrl: string;
  /** The short code, for example k7m2p4. Missing before the database change is applied. */
  shortCode?: string | null;
  /** The item's name; printed on the sheet's margin, and on the tag itself only with `showName`. */
  itemName?: string | null;
  /**
   * Print "On: <item name>" on the wallet card and the bag tag. Off unless the owner ticks it: a
   * name such as "Maya's backpack" on a child's bag tells any stranger the child's name.
   */
  showName?: boolean;
}

interface Bleed {
  t: number;
  r: number;
  b: number;
  l: number;
}

interface Ctx {
  spec: StyleSpec;
  look: LookId;
  /** The panel being drawn. */
  w: number;
  h: number;
  bleed: Bleed;
  /** Square outer corners (print-ready files). */
  square: boolean;
  data: TagData;
  qr: QrModules;
  /** Printed QR symbol size and quiet zone, inches. */
  qrIn: number;
  quiet: number;
  addr: string;
  code: string;
}

interface Inner {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const RING = { clean: 0.046, bold: 0.055, playful: 0.055 } as const;
const RADIUS = { clean: 0.05, bold: 0.04, playful: 0.09 } as const;

/** The text block's colours in each look. */
function blockColors(look: LookId): { fill: string | null; fg: string; sub: string } {
  if (look === 'bold') return { fill: INK, fg: WHITE, sub: '#E4E5E8' };
  if (look === 'playful') return { fill: ORANGE, fg: INK, sub: INK };
  return { fill: null, fg: INK, sub: '#34363D' };
}

/**
 * The plate, the inner white panel and the orange QuR Tag frame for a look. `ring` is the width of
 * the plate in Bold and Playful; Clean uses its own, wider-than-the-line margin. The inner panel
 * `p` is clear of the frame, so nothing drawn inside it can touch the line.
 */
function frame(c: Ctx, ring: number): { items: Item[]; p: Inner } {
  const rScale = Math.min(c.w, c.h);
  const rOuter = Math.min(0.28, RADIUS[c.look] * rScale);
  const clean = c.look === 'clean';
  const ringW = clean ? RING.clean : ring;
  const p: Inner = { x: ringW, y: ringW, w: c.w - 2 * ringW, h: c.h - 2 * ringW, r: Math.max(0, rOuter - ringW * 0.6) };
  const items: Item[] = [];
  const plate = c.look === 'bold' ? INK : c.look === 'playful' ? YELLOW : WHITE;
  const b = c.bleed;
  const corners: [number, number, number, number] = c.square ? [0, 0, 0, 0] : [rOuter, rOuter, rOuter, rOuter];
  items.push(rectItem(-b.l, -b.t, c.w + b.l + b.r, c.h + b.t + b.b, { fill: plate }, corners));
  if (!clean) items.push(rectItem(p.x, p.y, p.w, p.h, { fill: WHITE }, p.r));
  const inset = clean ? 0.027 : ringW * 0.5;
  const sw = clean ? 0.02 : ringW * 0.32;
  const line = (stroke: string, w: number) => rectItem(inset, inset, c.w - 2 * inset, c.h - 2 * inset, { stroke, sw: w }, Math.max(0, rOuter - inset));
  if (c.look === 'playful') items.push(line(INK, sw + 0.01));
  items.push(line(ORANGE, sw));
  return { items, p };
}

const cap = (pt: number) => (CAP_HEIGHT * pt) / 72;

/** The short address line, bold, fitted to a width. Empty when there is no code. */
function addressText(c: Ctx, x: number, y: number, maxW: number, maxPt: number, color: string, anchor: 'start' | 'middle' | 'end' = 'start'): Item[] {
  if (!c.addr) return [];
  const pt = fitSize(c.addr, maxW, maxPt, true);
  return [textItem(x, y, c.addr, pt, color, { bold: true, anchor })];
}

/**
 * "On: Blue water bottle" as at most `maxLines` lines no wider than `maxW`; a longer name is cut with "...".
 * Empty if there is no name or it has letters a PDF base font cannot print.
 */
function nameLines(c: Ctx, maxW: number, pt: number, maxLines: number): string[] {
  if (!c.data.showName) return [];
  const name = c.data.itemName?.trim();
  if (!name || !isPlainText(name)) return [];
  const cut = (t: string) => {
    let x = t;
    while (x.length > 1 && textWidth(`${x}...`, pt, true) > maxW) x = x.slice(0, -1).trimEnd();
    return `${x}...`;
  };
  const lines = wrapText(`On: ${name}`, maxW, pt, true).flatMap((l) => (textWidth(l, pt, true) > maxW ? [cut(l)] : [l]));
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), cut(lines.slice(maxLines - 1).join(' '))];
}

// ---------------------------------------------------------------- the styles

/**
 * The small sticker: a heavy one line request on top, the QR code below it with the QuR mark beside
 * it, and the short address across the bottom, horizontal and as large as the width allows (about
 * 8 pt), so a cautious finder sees whose tag it is and can type the address instead of scanning.
 * To make room for that line the code keeps a quiet zone of 2 modules (MIN_QUIET_MODULES) inside
 * the white panel, which is white beyond it as well in every look.
 */
function sticker(c: Ctx): Item[] {
  const { items, p } = frame(c, 0.05);
  const colors = blockColors(c.look);
  const q = c.qrIn;
  const zone = q + 2 * c.quiet;
  const bandH = 0.19;
  if (colors.fill) items.push(rectItem(p.x, p.y, p.w, bandH, { fill: colors.fill }, [p.r, p.r, 0, 0]));
  const pt = fitSize(STICKER_LINE, p.w - 0.1, 14, true);
  items.push(textItem(c.w / 2, p.y + bandH / 2 + cap(pt) / 2, STICKER_LINE, pt, colors.fg, { bold: true, anchor: 'middle' }));
  const zy = p.y + bandH;
  const x = p.x + 0.01 + c.quiet;
  const y = zy + c.quiet;
  items.push(...qrItems(c.qr, x, y, q, c.quiet));
  // The QuR mark in the column to the right of the code, level with its middle.
  const colLeft = x + q + c.quiet;
  const colRight = p.x + p.w - 0.02;
  const mark = Math.min(0.24, colRight - colLeft - 0.02);
  items.push(...markItems((colLeft + colRight) / 2 - mark / 2, y + q / 2 - mark / 2, mark));
  if (c.addr) {
    const apt = Math.min(8.5, fitSize(c.addr, p.w - 0.08, 8.5, true));
    items.push(textItem(c.w / 2, zy + zone + 0.012 + cap(apt), c.addr, apt, INK, { bold: true, anchor: 'middle' }));
  }
  return items;
}

/** The sticker's request, in capitals. The same words in every look, so the longest line sets the size. */
export const STICKER_LINE = 'LOST? SCAN ME';

/**
 * A label with the QR on the left and a text block on the right (label strip, clothing strip).
 * With `stacked`, the headline is two heavy capital lines as large as the block allows.
 */
function stripLike(c: Ctx, text: { headline: string; playful: string; sub: string; stacked?: readonly [string, string]; stackedPlayful?: readonly [string, string] }): Item[] {
  const { items, p } = frame(c, 0.05);
  const q = c.qrIn;
  const x = p.x + c.quiet + 0.01;
  const y = (c.h - q) / 2;
  const bx = x + q + c.quiet;
  const colors = blockColors(c.look);
  if (colors.fill) items.push(rectItem(bx, p.y, p.x + p.w - bx, p.h, { fill: colors.fill }, [0, p.r, p.r, 0]));
  items.push(...qrItems(c.qr, x, y, q, c.quiet));
  const pad = 0.12;
  const tx = bx + pad;
  const colW = p.x + p.w - bx - pad - 0.08;
  const mark = 0.2;
  const stack = c.look === 'playful' ? text.stackedPlayful : text.stacked;
  let subY = p.y + 0.46;
  if (stack) {
    const pt = Math.min(15, ...stack.map((l) => fitSize(l, colW, 15, true)));
    stack.forEach((l, i) => items.push(textItem(tx, p.y + 0.12 + cap(pt) + i * (cap(pt) + 0.07), l, pt, colors.fg, { bold: true })));
    subY = p.y + 0.12 + 2 * cap(pt) + 0.07 + 0.14;
  } else {
    const head = c.look === 'playful' ? text.playful : text.headline;
    items.push(textItem(tx, p.y + 0.3, head, fitSize(head, colW, 11.5, true), colors.fg, { bold: true }));
  }
  wrapText(text.sub, colW, 6, false)
    .slice(0, 2)
    .forEach((ln, i) => items.push(textItem(tx, subY + i * 0.1, ln, 6, colors.sub)));
  items.push(...markItems(p.x + p.w - 0.08 - mark, p.y + p.h - 0.06 - mark, mark, c.look === 'bold' ? WHITE : undefined));
  items.push(...addressText(c, tx, p.y + p.h - 0.1, colW - mark - 0.04, 9, colors.fg));
  return items;
}

function wallet(c: Ctx): Item[] {
  const { items, p } = frame(c, 0.06);
  const q = c.qrIn;
  const colW = q + 2 * c.quiet + 0.02;
  const bw = p.w - colW;
  const colors = blockColors(c.look);
  if (colors.fill) items.push(rectItem(p.x, p.y, bw, p.h, { fill: colors.fill }, [p.r, 0, 0, p.r]));
  const pad = 0.17;
  const tx = p.x + pad;
  const tw = bw - 2 * pad;
  items.push(...lockupItems(tx, p.y + 0.16, 0.3, { nameColor: colors.fg, accentColor: c.look === 'playful' ? WHITE : undefined, ring: c.look === 'bold' ? WHITE : undefined }));
  const head = c.look === 'playful' ? "Oh no, I'm lost!" : 'If found,';
  const head2 = c.look === 'playful' ? 'Please scan me.' : 'please scan.';
  const hpt = Math.min(fitSize(head, tw, 14, true), fitSize(head2, tw, 14, true));
  let y = p.y + 0.16 + 0.3 + 0.34;
  items.push(textItem(tx, y, head, hpt, colors.fg, { bold: true }));
  y += hpt / 72 + 0.06;
  items.push(textItem(tx, y, head2, hpt, colors.fg, { bold: true }));
  y += 0.2;
  const body = 'Scan to send the owner a note. No app needed. Your phone number stays private.';
  for (const ln of wrapText(body, tw, 6.8, false).slice(0, 3)) {
    items.push(textItem(tx, y, ln, 6.8, colors.sub));
    y += 0.125;
  }
  const nm = nameLines(c, tw, 6.8, 2);
  nm.forEach((ln, i) => items.push(textItem(tx, p.y + p.h - 0.12 - (nm.length - 1 - i) * 0.125, ln, 6.8, colors.fg, { bold: true })));
  const cx = p.x + bw + colW / 2;
  const qy = (c.h - q) / 2 - 0.1;
  items.push(...qrItems(c.qr, cx - q / 2, qy, q, c.quiet));
  items.push(...addressText(c, cx, qy + q + c.quiet + 0.13, colW - 0.1, 8.5, INK, 'middle'));
  return items;
}

function fobFront(c: Ctx): Item[] {
  const { items, p } = frame(c, 0.045);
  const colors = blockColors(c.look);
  const q = c.qrIn;
  const lines = c.look === 'playful' ? ["I'M LOST!", 'SCAN ME'] : ['IF FOUND,', 'SCAN ME'];
  const pt = Math.min(10, ...lines.map((l) => fitSize(l, p.w - 0.1, 10, true)));
  const bandH = 0.04 + 2 * cap(pt) + 0.06 + 0.04;
  if (colors.fill) items.push(rectItem(p.x, p.y, p.w, bandH, { fill: colors.fill }, [p.r, p.r, 0, 0]));
  lines.forEach((l, i) => items.push(textItem(c.w / 2, p.y + 0.04 + cap(pt) + i * (cap(pt) + 0.06), l, pt, colors.fg, { bold: true, anchor: 'middle' })));
  const y = p.y + bandH + c.quiet;
  items.push(...qrItems(c.qr, (c.w - q) / 2, y, q, c.quiet));
  items.push(...addressText(c, c.w / 2, y + q + c.quiet + 0.095, c.w - 0.14, 5.4, INK, 'middle'));
  return items;
}

function fobBack(c: Ctx): Item[] {
  const { items, p } = frame(c, 0.035);
  const colors = { fg: INK, sub: '#34363D' };
  items.push(...lockupItems((c.w - lockupWidth(0.2, false)) / 2, p.y + 0.07, 0.2));
  const lines = ['If found, please scan', 'the code on the other', 'side, or visit:'];
  let y = p.y + 0.43;
  lines.forEach((ln) => {
    items.push(textItem(c.w / 2, y, ln, fitSize(ln, c.w - 0.12, 5.2, false), colors.sub, { anchor: 'middle' }));
    y += 0.085;
  });
  if (c.code) {
    const pt = fitSize(c.code, c.w - 0.16, 18, true);
    items.push(textItem(c.w / 2, y + 0.2, c.code, pt, INK, { bold: true, anchor: 'middle', spacing: 0.6 }));
    items.push(...addressText(c, c.w / 2, y + 0.33, c.w - 0.12, 5.4, INK, 'middle'));
  }
  items.push(textItem(c.w / 2, p.y + p.h - 0.08, 'No app needed.', 4.8, MUTED, { anchor: 'middle' }));
  return items;
}

function bagFront(c: Ctx): Item[] {
  const ring = c.look === 'clean' ? RING.clean : 0.07;
  const { items, p } = frame(c, 0.07);
  const colors = blockColors(c.look);
  const bh = 1.08;
  if (colors.fill) items.push(rectItem(p.x, p.y, p.w, bh, { fill: colors.fill }, [p.r, p.r, 0, 0]));
  const head = c.look === 'playful' ? 'HELP ME!' : 'IF FOUND';
  const pt = fitSize(head, p.w - 0.3, 34, true);
  items.push(textItem(c.w / 2, p.y + 0.5 + cap(pt) / 2, head, pt, colors.fg, { bold: true, anchor: 'middle' }));
  const sub = c.look === 'playful' ? 'Please scan to help me get home' : 'Please scan to message the owner';
  items.push(textItem(c.w / 2, p.y + 0.85, sub, fitSize(sub, p.w - 0.24, 8, true), colors.fg, { bold: true, anchor: 'middle' }));
  if (c.look === 'playful') items.push(smileItem(c.w / 2 - 0.25, p.y + 0.96, 0.5, INK, 0.035));
  const q = c.qrIn;
  const qy = p.y + bh + c.quiet + 0.04;
  items.push(...qrItems(c.qr, (c.w - q) / 2, qy, q, c.quiet));
  items.push(...addressText(c, c.w / 2, qy + q + c.quiet + 0.2, p.w - 0.2, 12, INK, 'middle'));
  items.push(textItem(c.w / 2, p.y + p.h - 0.1, 'No app needed.', 6.5, MUTED, { anchor: 'middle' }));
  void ring;
  return items;
}

function bagBack(c: Ctx): Item[] {
  const { items, p } = frame(c, 0.07);
  const pad = 0.22;
  const tw = p.w - 2 * pad;
  items.push(...lockupItems(pad + p.x - 0.05, p.y + 0.2, 0.42, { tagline: true }));
  let y = p.y + 0.95;
  const head = 'Thank you for helping.';
  const hpt = fitSize(head, tw, 13, true);
  items.push(textItem(p.x + pad, y, head, hpt, INK, { bold: true }));
  y += 0.2;
  y += 0.06;
  const body =
    "Scan the code on the other side with your phone camera, or go to the address below. You can send the owner a note. No app and no sign-up. Your phone number stays private.";
  for (const ln of wrapText(body, tw, 8.2, false)) {
    items.push(textItem(p.x + pad, y, ln, 8.2, '#34363D'));
    y += 0.155;
  }
  y += 0.12;
  const nm = nameLines(c, tw, 8.2, 2);
  // The name has its own space at the bottom; the address box never reaches into it.
  const nameTop = p.y + p.h - 0.18 - (Math.max(nm.length, 1) - 1) * 0.15 - 0.17;
  if (c.code) {
    y = Math.min(y, nameTop - 0.62);
    items.push(rectItem(p.x + pad, y, tw, 0.5, { fill: c.look === 'bold' ? INK : c.look === 'playful' ? YELLOW : WHITE, stroke: INK, sw: 0.015 }, 0.06));
    items.push(...addressText(c, c.w / 2, y + 0.32, tw - 0.1, 13, c.look === 'bold' ? WHITE : INK, 'middle'));
    y += 0.62;
  }
  nm.forEach((ln, i) => items.push(textItem(p.x + pad, p.y + p.h - 0.18 - (nm.length - 1 - i) * 0.15, ln, 8.2, INK, { bold: true })));
  return items;
}

const BUILDERS: Record<'sticker' | 'strip' | 'clothing' | 'wallet', (c: Ctx) => Item[]> = {
  sticker,
  strip: (c) => stripLike(c, { headline: 'If found, scan me', playful: "I'm lost! Scan me", sub: 'Send the owner a note. No app needed.' }),
  clothing: (c) =>
    stripLike(c, {
      headline: 'If found, scan',
      playful: "I'm lost! Scan me",
      stacked: ['IF FOUND,', 'SCAN ME'],
      stackedPlayful: ["I'M LOST!", 'SCAN ME'],
      sub: 'No app needed.',
    }),
  wallet,
};

// ---------------------------------------------------------------- pieces

export interface PieceOptions {
  /** Bleed in inches painted beyond the cut line (0 for a sheet). */
  bleed?: number;
  /** Square corners and no fold or cut guides (a print-ready file). */
  printReady?: boolean;
}

/** One finished piece with its trim box at (0, 0). With bleed, the plate runs out to negative coordinates. */
export function buildPiece(styleId: StyleId, look: LookId, data: TagData, opts: PieceOptions = {}): Form {
  const spec = styleById(styleId);
  const bleed = opts.bleed ?? 0;
  const qr = qrModules(data.finderUrl);
  const qrIn = qrSize(spec);
  const { w, h } = panelSize(spec);
  const code = data.shortCode?.trim().toLowerCase() ?? '';
  const base: Omit<Ctx, 'bleed'> = {
    spec,
    look,
    w,
    h,
    square: !!opts.printReady,
    data,
    qr,
    qrIn,
    quiet: quietZone(spec, qr.n),
    addr: shortAddress(code),
    code,
  };
  const items: Item[] = [];
  if (spec.panels === 1) {
    items.push(...BUILDERS[styleId as keyof typeof BUILDERS]({ ...base, bleed: { t: bleed, r: bleed, b: bleed, l: bleed } }));
    return { w, h, items };
  }
  const front = styleId === 'fob' ? fobFront : bagFront;
  const back = styleId === 'fob' ? fobBack : bagBack;
  const side = { t: bleed, r: bleed, b: 0, l: bleed };
  items.push(...front({ ...base, bleed: side }));
  // The back is printed upside down so that, folded with the printing outside, it reads the right way up.
  items.push({ t: 'group', items: [rotated180(back({ ...base, bleed: side }), w / 2, h / 2)], m: [1, 0, 0, 1, 0, h] });
  if (!opts.printReady) {
    items.push({ t: 'line', x1: 0, y1: h, x2: w, y2: h, stroke: '#8A8C93', sw: 0.006, dash: [0.04, 0.03] });
  }
  return { w: spec.w, h: spec.h, items };
}

// ---------------------------------------------------------------- pages

const MARK_COLOR = '#8A8C93';

function cutMarks(x: number, y: number, w: number, h: number, gap: number): Item[] {
  const off = 0.02;
  const len = Math.min(0.12, Math.max(0.05, gap - 2 * off));
  const mk = (x1: number, y1: number, x2: number, y2: number): Item => ({ t: 'line', x1, y1, x2, y2, stroke: MARK_COLOR, sw: 0.005 });
  const out: Item[] = [];
  for (const cx of [x, x + w]) {
    const dir = cx === x ? -1 : 1;
    for (const cy of [y, y + h]) {
      const up = cy === y ? -1 : 1;
      out.push(mk(cx + dir * off, cy, cx + dir * (off + len), cy));
      out.push(mk(cx, cy + up * off, cx, cy + up * (off + len)));
    }
  }
  return out;
}

export interface SheetOptions {
  paper: PaperId;
  /** How many copies; default as many as fit. */
  copies?: number | null;
  /** Mirror the page left to right (iron-on transfer paper). */
  mirror?: boolean;
}

/** One item's tags on a shared sheet: its data and how many copies of it. */
export interface SheetEntry {
  data: TagData;
  copies: number;
}

/**
 * The copies each entry really gets on one page: in order, never more than fit, a negative or
 * fractional request read as whole copies, and an entry with none left out.
 */
export function fitEntries(styleId: StyleId, paper: PaperId, entries: SheetEntry[]): SheetEntry[] {
  let room = gridFor(styleById(styleId), paper).count;
  const out: SheetEntry[] = [];
  for (const e of entries) {
    const n = Math.max(0, Math.min(room, Math.floor(Number.isFinite(e.copies) ? e.copies : 0)));
    if (n > 0) out.push({ data: e.data, copies: n });
    room -= n;
  }
  return out;
}

/**
 * The line in the sheet's top margin that says what is on the page, so sheets printed for several
 * things are not mixed up: each item's name and its short address (the address is printed on every
 * piece, so it tells the pieces apart after cutting). The margin is cut away; the name is never on a
 * piece unless the owner asked for it.
 */
export function sheetLabel(entries: SheetEntry[]): string {
  const parts = entries.map((e) => {
    const name = e.data.itemName?.trim();
    const addr = shortAddress(e.data.shortCode?.trim().toLowerCase());
    const shown = name && isPlainText(name) ? name : '';
    if (shown && addr) return `${shown} (${addr})`;
    return shown || addr;
  });
  const list = parts.filter(Boolean);
  return list.length ? `QuR Tag: ${list.join(', ')}` : '';
}

/** A Letter or A4 page of copies of one item's tag. */
export function buildSheet(styleId: StyleId, look: LookId, data: TagData, opts: SheetOptions): Page {
  const spec = styleById(styleId);
  const n = copiesOnPage(spec, opts.paper, opts.copies);
  return buildMixedSheet(styleId, look, [{ data, copies: n }], { paper: opts.paper, mirror: opts.mirror });
}

/** A Letter or A4 page holding the tags of several items in one style, in the order given. */
export function buildMixedSheet(styleId: StyleId, look: LookId, entries: SheetEntry[], opts: { paper: PaperId; mirror?: boolean }): Page {
  const spec = styleById(styleId);
  const paper = PAPERS[opts.paper];
  const grid = gridFor(spec, opts.paper);
  const fitted = fitEntries(styleId, opts.paper, entries);
  const forms: Record<string, Form> = {};
  const items: Item[] = [];
  let i = 0;
  fitted.forEach((e, k) => {
    const form = k === 0 ? 'piece' : `piece${k}`;
    forms[form] = buildPiece(styleId, look, e.data);
    for (let c = 0; c < e.copies; c++, i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = grid.x0 + col * grid.pitchX;
      const y = grid.y0 + row * grid.pitchY;
      items.push({ t: 'use', form, x, y });
      if (grid.marks) items.push(...cutMarks(x, y, spec.w, spec.h, spec.gap));
    }
  });
  const label = sheetLabel(fitted);
  if (label) {
    // In the top margin, clear of the first row and of the printer's unprintable edge.
    const y = Math.max(0.28, Math.min(0.4, grid.y0 - (grid.marks ? 0.2 : 0.12)));
    if (y + 0.05 < grid.y0) {
      // One line at up to 7 pt; a long list wraps upward at 6 pt, as far as the margin allows.
      const one = fitSize(label, paper.w - 1, 7, false);
      const lines = one >= 6 ? [label] : wrapText(label, paper.w - 1, 6, false);
      const pt = one >= 6 ? one : 6;
      const room = Math.max(1, Math.floor((y - 0.2) / 0.1 + 1e-9) + 1);
      const shown = lines.length <= room ? lines : [...lines.slice(0, room - 1), `${lines[room - 1]} ...`];
      shown.forEach((ln, k) => items.push(textItem(paper.w / 2, y - (shown.length - 1 - k) * 0.1, ln, pt, MUTED, { anchor: 'middle' })));
    }
  }
  if (!grid.labelSheet) {
    const note = spec.mirrorable && opts.mirror ? 'Printed mirrored for iron-on transfer paper. ' : '';
    const text = `${note}${spec.howTo}`;
    wrapText(text, paper.w - 1.2, 6.5, false)
      .slice(0, 2)
      .forEach((ln, i, all) => items.push(textItem(paper.w / 2, paper.h - 0.2 - (all.length - 1 - i) * 0.11, ln, 6.5, MUTED, { anchor: 'middle' })));
  }
  const content = spec.mirrorable && opts.mirror ? [mirrored(items, paper.w)] : items;
  return { w: paper.w, h: paper.h, forms, items: content };
}

/** One piece at exact size with bleed, in a page the size of the piece plus bleed. */
export function buildPrintReady(styleId: StyleId, look: LookId, data: TagData, opts: { mirror?: boolean; bleed?: number } = {}): Page {
  const spec = styleById(styleId);
  const bleed = opts.bleed ?? BLEED_IN;
  const form = buildPiece(styleId, look, data, { bleed, printReady: true });
  const w = spec.w + 2 * bleed;
  const h = spec.h + 2 * bleed;
  const items: Item[] = [{ t: 'use', form: 'piece', x: bleed, y: bleed }];
  return {
    w,
    h,
    forms: { piece: form },
    items: spec.mirrorable && opts.mirror ? [mirrored(items, w)] : items,
    trim: { x: bleed, y: bleed, w: spec.w, h: spec.h },
    bleed,
  };
}

/** One piece on its own, for the live preview. */
export function buildPreview(styleId: StyleId, look: LookId, data: TagData): Page {
  const spec = styleById(styleId);
  return { w: spec.w, h: spec.h, forms: { piece: buildPiece(styleId, look, data) }, items: [{ t: 'use', form: 'piece', x: 0, y: 0 }] };
}

export type { Seg };
