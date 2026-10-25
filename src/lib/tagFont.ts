/**
 * Text widths for the two PDF base fonts the printed tags use, Helvetica and Helvetica-Bold.
 *
 * A PDF does not lay text out: the page has to say where each line starts. To centre a line, fit
 * it into a column or wrap it, the width of every letter must be known, so these are the
 * standard Adobe widths (thousandths of the font size) for the printable ASCII range. The base
 * fonts need no file inside the PDF, which keeps a tag sheet at a few kilobytes and makes the
 * text sharp at any size.
 */

// Characters 32 (space) to 126 (~), in order.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];

/** The width of `text` in inches at `pt` points. Anything outside printable ASCII counts as a question mark. */
export function textWidth(text: string, pt: number, bold = false): number {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : table['?'.charCodeAt(0) - 32];
  }
  return (units / 1000) * (pt / 72);
}

/** The largest size, up to `maxPt`, at which `text` is no wider than `maxWidth` inches. */
export function fitSize(text: string, maxWidth: number, maxPt: number, bold = false): number {
  const w = textWidth(text, maxPt, bold);
  return w <= maxWidth ? maxPt : (maxPt * maxWidth) / w;
}

/** Breaks `text` into lines no wider than `maxWidth` inches; a single word wider than that stays whole. */
export function wrapText(text: string, maxWidth: number, pt: number, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, pt, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text a PDF base font can print as is (printable ASCII). A name with other letters is left off a tag. */
export function isPlainText(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

/** The height of a capital letter, as a fraction of the font size. */
export const CAP_HEIGHT = 0.72;
