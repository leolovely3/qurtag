/**
 * The sizes behind every printed tag: the six styles, the two paper sizes, how many copies fit
 * on a page and where, and the rule that a QR code is never printed too small to scan.
 *
 * All lengths are inches. This file is arithmetic only (no drawing, no browser), so the unit
 * tests can check it.
 *
 * Why these numbers
 * - A QR code with error correction level H and a 37 by 37 module grid (the address of a
 *   finder page) reads reliably from a phone when each module is at least about half a
 *   millimetre, which is a symbol 0.75 in (19 mm) wide. MIN_QR_IN is that floor and
 *   qrSize() refuses to hand out less, so no style, look or paper can print a smaller code.
 * - The quiet zone is the empty margin the code needs on every side to be found. The standard
 *   asks for 4 modules; the two smallest styles have room for 2 or 3, and MIN_QUIET_MODULES (2)
 *   is the least any style may use.
 * - The small sticker is 1.25 in square, not 1 in. A 0.75 in code with its quiet zone is 0.87 in
 *   across, which leaves 0.1 in of a 1 in sticker: too little for a line of lettering a person can
 *   read from arm's length. At 1.25 in the line "LOST? SCAN ME" is about 9 pt bold (capitals
 *   2.3 mm high) and the QR code is unchanged.
 * - The label strip fits the standard 30 per sheet address label sheet on Letter (3 across, 10
 *   down, labels 2 5/8 by 1 in), so the printer puts each tag exactly on a label. Every other
 *   style prints as a grid with cut marks, because no single sheet size is common for it.
 */

export const MIN_QR_IN = 0.75;
export const MIN_QUIET_MODULES = 2;
/** The extra the print-ready file paints beyond the cut line, so a trim that drifts shows no white edge. */
export const BLEED_IN = 0.125;

export type PaperId = 'letter' | 'a4';
export interface Paper {
  id: PaperId;
  name: string;
  w: number;
  h: number;
}
export const PAPERS: Record<PaperId, Paper> = {
  letter: { id: 'letter', name: 'US Letter', w: 8.5, h: 11 },
  a4: { id: 'a4', name: 'A4', w: 210 / 25.4, h: 297 / 25.4 },
};

export type StyleId = 'sticker' | 'strip' | 'fob' | 'wallet' | 'bag' | 'clothing';
export type LookId = 'clean' | 'bold' | 'playful';
export const LOOKS: { id: LookId; name: string; note: string }[] = [
  { id: 'clean', name: 'Clean', note: 'White with a thin outline.' },
  { id: 'bold', name: 'Bold', note: 'Heavy black, easy to read from far away.' },
  { id: 'playful', name: 'Playful', note: 'Bright and friendly, good for kids’ things.' },
];

export interface StyleSpec {
  id: StyleId;
  name: string;
  /** The size of one piece as it is cut out (a folded piece counts both halves), in words. */
  sizeLabel: string;
  /** Plain words for what it suits. */
  suits: string;
  /** One piece, in inches. A folded piece is two panels one above the other. */
  w: number;
  h: number;
  panels: 1 | 2;
  /** The printed size of the QR symbol itself (without its quiet zone). */
  qr: number;
  /** The quiet zone this style uses, in modules. */
  quiet: number;
  /** Space between pieces on a plain-paper grid. */
  gap: number;
  /** The least blank paper left around the grid (printers cannot reach the edge). */
  margin: number;
  /** What to do with the printed piece. */
  howTo: string;
  /** True when the page can be printed mirrored for iron-on transfer paper. */
  mirrorable: boolean;
  /** True when the page lines up with a standard label sheet on Letter. */
  labelSheet: boolean;
}

export const STYLES: StyleSpec[] = [
  {
    id: 'sticker',
    name: 'Small sticker',
    sizeLabel: '1.25 in (3.2 cm) square',
    suits: 'Bottles, chargers, glasses cases, remotes',
    w: 1.25,
    h: 1.25,
    panels: 1,
    qr: 0.75,
    quiet: 3,
    gap: 0.2,
    margin: 0.5,
    howTo: 'Print on sticker paper and cut along the marks. Several copies print, so you have spares.',
    mirrorable: false,
    labelSheet: false,
  },
  {
    id: 'strip',
    name: 'Label strip',
    sizeLabel: '2.625 x 1 in (67 x 25 mm)',
    suits: 'Lunchboxes, instrument cases, laptops',
    w: 2.625,
    h: 1,
    panels: 1,
    qr: 0.78,
    quiet: 3,
    gap: 0.2,
    margin: 0.5,
    howTo:
      'On US Letter this lines up with the standard 30 per sheet address label sheet (3 across, 10 down). Print at 100% with no scaling.',
    mirrorable: false,
    labelSheet: true,
  },
  {
    id: 'fob',
    name: 'Key fob insert',
    sizeLabel: '1 x 1.4 in (25 x 36 mm), two sides',
    suits: 'Key rings and bag zippers with a clear photo holder',
    w: 1,
    h: 2.8,
    panels: 2,
    qr: 0.75,
    quiet: 2,
    gap: 0.16,
    margin: 0.5,
    howTo: 'Cut along the marks, fold on the dashed line with the printing outside, and slide it into the holder.',
    mirrorable: false,
    labelSheet: false,
  },
  {
    id: 'wallet',
    name: 'Wallet card',
    sizeLabel: '3.375 x 2.125 in (credit card size)',
    suits: 'Bag tags, wallets, walkers, strollers',
    w: 3.375,
    h: 2.125,
    panels: 1,
    qr: 1.2,
    quiet: 4,
    gap: 0.16,
    margin: 0.5,
    howTo: 'Print on thick paper or card, cut along the marks, and slide it into a clear card holder.',
    mirrorable: false,
    labelSheet: false,
  },
  {
    id: 'bag',
    name: 'Bag tag',
    sizeLabel: '2.4 x 3.5 in folded (2.4 x 7 in flat)',
    suits: 'Backpacks, gym bags and luggage',
    w: 2.4,
    h: 7,
    panels: 2,
    qr: 1.5,
    quiet: 4,
    gap: 0.12,
    margin: 0.3,
    howTo: 'Print on thick paper, cut along the marks, fold on the dashed line with the printing outside, and put it in a clear holder or cover it with packing tape.',
    mirrorable: false,
    labelSheet: false,
  },
  {
    id: 'clothing',
    name: 'Clothing strip',
    sizeLabel: '2.5 x 1 in (64 x 25 mm)',
    suits: 'Jackets, school clothes, sports uniforms (iron-on transfer paper)',
    w: 2.5,
    h: 1,
    panels: 1,
    qr: 0.75,
    quiet: 3,
    gap: 0.2,
    margin: 0.5,
    howTo: 'Print on iron-on transfer paper, cut out each strip, and iron it inside the collar or on a care label.',
    mirrorable: true,
    labelSheet: false,
  },
];

export function styleById(id: StyleId): StyleSpec {
  const s = STYLES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown tag style ${id}`);
  return s;
}

/** The size of the panel a person sees: one half of a folded piece, or the whole piece. */
export function panelSize(style: StyleSpec): { w: number; h: number } {
  return { w: style.w, h: style.h / style.panels };
}

/**
 * The QR symbol's printed size for a style. Throws if it would be under the scanning floor, so a
 * mistake in a style's numbers fails loudly in the unit tests and in the app, never on paper.
 */
export function qrSize(style: StyleSpec): number {
  if (style.qr < MIN_QR_IN - 1e-9) {
    throw new RangeError(`${style.name}: a QR code of ${style.qr} in is below the ${MIN_QR_IN} in minimum`);
  }
  return style.qr;
}

/** The empty margin round the QR symbol, in inches, for a code of `modules` modules across. */
export function quietZone(style: StyleSpec, modules: number): number {
  const n = Math.max(MIN_QUIET_MODULES, style.quiet);
  return (n * qrSize(style)) / modules;
}

export interface Grid {
  cols: number;
  rows: number;
  /** Copies that fit on the page. */
  count: number;
  /** Top left of the first piece. */
  x0: number;
  y0: number;
  pitchX: number;
  pitchY: number;
  /** Cut marks are printed in the gaps (plain paper). A label sheet has none. */
  marks: boolean;
  /** True when this is the standard label sheet. */
  labelSheet: boolean;
}

/** A centred grid of equal pieces with `gap` between them, as many as fit inside `margin`. */
export function planGrid(paper: Paper, w: number, h: number, gap: number, margin: number): Grid {
  const cols = Math.max(0, Math.floor((paper.w - 2 * margin + gap + 1e-9) / (w + gap)));
  const rows = Math.max(0, Math.floor((paper.h - 2 * margin + gap + 1e-9) / (h + gap)));
  const usedW = cols * w + (cols - 1) * gap;
  const usedH = rows * h + (rows - 1) * gap;
  return {
    cols,
    rows,
    count: cols * rows,
    x0: (paper.w - usedW) / 2,
    y0: (paper.h - usedH) / 2,
    pitchX: w + gap,
    pitchY: h + gap,
    marks: true,
    labelSheet: false,
  };
}

/** Where the copies go on a page for a style and paper size. */
export function gridFor(style: StyleSpec, paperId: PaperId): Grid {
  const paper = PAPERS[paperId];
  if (style.labelSheet && paperId === 'letter') {
    // The standard 30 per sheet address label: 3 across (2.75 in apart) and 10 down (1 in apart).
    return { cols: 3, rows: 10, count: 30, x0: 0.1875, y0: 0.5, pitchX: 2.75, pitchY: 1, marks: false, labelSheet: true };
  }
  return planGrid(paper, style.w, style.h, style.gap, style.margin);
}

/** How many copies to print: what was asked for, never more than fit, at least one. */
export function copiesOnPage(style: StyleSpec, paperId: PaperId, requested?: number | null): number {
  const cap = gridFor(style, paperId).count;
  if (requested == null || !Number.isFinite(requested)) return cap;
  return Math.max(1, Math.min(cap, Math.floor(requested)));
}

/** The copy counts the page offers to print, from the whole page down to a few. */
export function copyChoices(style: StyleSpec, paperId: PaperId): number[] {
  const cap = gridFor(style, paperId).count;
  const options = [cap, 12, 6, 3, 1].filter((n) => n <= cap);
  return [...new Set(options)];
}

/** Which paper to suggest: US Letter in the US, Canada and Mexico, A4 elsewhere. */
export function defaultPaper(locale: string | undefined): PaperId {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? '')?.[1]?.toUpperCase();
  return region && !['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE'].includes(region) ? 'a4' : 'letter';
}

/** Total width and height of one print-ready piece, with bleed all round. */
export function printReadySize(style: StyleSpec, bleed = BLEED_IN): { w: number; h: number } {
  return { w: style.w + 2 * bleed, h: style.h + 2 * bleed };
}

/** The short address printed beside the QR code, for example qurtag.com/k7m2p. */
export function shortAddress(code: string | null | undefined): string {
  return code ? `qurtag.com/${code}` : '';
}
