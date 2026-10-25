/**
 * A tag page as SVG: the live preview on the tag page, and the picture that becomes the PNG.
 * Sizes are in inches, so an SVG shown at width="3.375in" is a wallet card at true size.
 */
import type { Form, Item, Page, Seg } from './tagScene';

const FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif';

export const n4 = (v: number): string => {
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A path's segments moved and scaled into page coordinates. */
export function placedSegs(item: Extract<Item, { t: 'path' }>): Seg[] {
  const { tx, ty, s } = item;
  const X = (v: number) => v * s + tx;
  const Y = (v: number) => v * s + ty;
  return item.segs.map((g): Seg => {
    if (g[0] === 'Z') return g;
    if (g[0] === 'C') return ['C', X(g[1]), Y(g[2]), X(g[3]), Y(g[4]), X(g[5]), Y(g[6])];
    return [g[0], X(g[1]), Y(g[2])];
  });
}

function pathData(segs: readonly Seg[]): string {
  return segs
    .map((g) => {
      if (g[0] === 'Z') return 'Z';
      if (g[0] === 'C') return `C${n4(g[1])} ${n4(g[2])} ${n4(g[3])} ${n4(g[4])} ${n4(g[5])} ${n4(g[6])}`;
      return `${g[0]}${n4(g[1])} ${n4(g[2])}`;
    })
    .join('');
}

function paintAttrs(p: { fill?: string; stroke?: string; sw?: number; dash?: readonly [number, number]; cap?: 'butt' | 'round' }): string {
  let a = p.fill ? ` fill="${p.fill}"` : ' fill="none"';
  if (p.stroke) {
    a += ` stroke="${p.stroke}" stroke-width="${n4(p.sw ?? 0.01)}" stroke-linejoin="round"`;
    if (p.cap === 'round') a += ' stroke-linecap="round"';
    if (p.dash) a += ` stroke-dasharray="${n4(p.dash[0])} ${n4(p.dash[1])}"`;
  }
  return a;
}

function itemSvg(it: Item): string {
  switch (it.t) {
    case 'path':
      return `<path d="${pathData(placedSegs(it))}"${paintAttrs(it)}/>`;
    case 'line':
      return `<line x1="${n4(it.x1)}" y1="${n4(it.y1)}" x2="${n4(it.x2)}" y2="${n4(it.y2)}"${paintAttrs(it)}/>`;
    case 'text': {
      const anchor = it.anchor && it.anchor !== 'start' ? ` text-anchor="${it.anchor}"` : '';
      const spacing = it.spacing ? ` letter-spacing="${n4(it.spacing / 72)}"` : '';
      const rot = it.rot ? ` transform="rotate(${it.rot} ${n4(it.x)} ${n4(it.y)})"` : '';
      return `<text x="${n4(it.x)}" y="${n4(it.y)}" font-family='${FONT}' font-weight="${it.bold ? 700 : 400}" font-size="${n4(it.pt / 72)}" fill="${it.color}"${anchor}${spacing}${rot}>${esc(it.text)}</text>`;
    }
    case 'modules': {
      const u = it.size / it.n;
      const d = it.runs.map(([c, r, len]) => `M${n4(it.x + c * u)} ${n4(it.y + r * u)}h${n4(len * u)}v${n4(u)}h${n4(-len * u)}z`).join('');
      return `<path d="${d}" fill="${it.color}" shape-rendering="crispEdges"/>`;
    }
    case 'use':
      return `<use href="#form-${it.form}" x="${n4(it.x)}" y="${n4(it.y)}"/>`;
    case 'group':
      return `<g transform="matrix(${it.m.map(n4).join(' ')})">${it.items.map(itemSvg).join('')}</g>`;
  }
}

function formSvg(id: string, f: Form): string {
  return `<g id="form-${id}">${f.items.map(itemSvg).join('')}</g>`;
}

/** The whole page as one SVG document string. */
export function pageToSvg(page: Page, opts: { background?: boolean; responsive?: boolean } = {}): string {
  const defs = Object.entries(page.forms)
    .map(([id, f]) => formSvg(id, f))
    .join('');
  const bg = opts.background === false ? '' : `<rect x="0" y="0" width="${n4(page.w)}" height="${n4(page.h)}" fill="#FFFFFF"/>`;
  const size = opts.responsive ? 'width="100%"' : `width="${n4(page.w)}in" height="${n4(page.h)}in"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${n4(page.w)} ${n4(page.h)}">` +
    `<defs>${defs}</defs>${bg}${page.items.map(itemSvg).join('')}</svg>`
  );
}
