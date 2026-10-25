#!/usr/bin/env node
/**
 * Builds every QuR Tag logo file from one drawing:  npm run brand
 *
 * The mark is "QuR" drawn by hand as geometric strokes (no font is needed to show it): Q and R
 * in white, the lowercase u in the brand orange with a small orange smile under it, on a
 * near-black square. The letters fill about 70% of the square's width and are centred with the
 * smile counted in, so the group sits in the optical middle. The lockup's words ("QuR Tag" and
 * the tagline) are Inter outlined into paths with opentype.js, so they also render the same
 * everywhere. Outputs:
 *
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   1024, square, no alpha
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png  the mark on near-black
 *   public/favicon.svg, favicon-32.png, apple-touch-icon.png (180)
 *   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png
 *   public/brand/qurtag-mark.svg, qurtag-lockup-light.svg, qurtag-lockup-dark.svg
 *   public/og.png (1200 x 630)
 *   src/components/brand/logoPaths.ts (the same paths, for the Wordmark component)
 *   scripts/brand/preview/*.png (the icon at 29, 40, 60 and 1024 px, to check legibility)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = (...p) => path.join(ROOT, ...p);
const write = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

// Brand colours: the ink and signal tokens in src/index.css.
const INK = '#0A0B0F';
const ORANGE = '#FF5C2E';
const WHITE = '#FFFFFF';
const PAPER = '#FAFAF7';
const MUTED_LIGHT = '#52545B';
const MUTED_DARK = '#A8A9AE';

// ---------------------------------------------------------------- the mark's letters
// Drawn on a baseline at y = 0 with a cap height of 300 and strokes 64 wide.
const S = 64; // letter stroke
const SMILE = 34; // smile stroke
const Q_CX = 156;
const U_X = 384; // left stem of the u (stroke centre)
const R_X = 638; // stem of the R (stroke centre)
const letters = {
  q: [
    `M ${Q_CX - 124} -150 A 124 124 0 1 0 ${Q_CX + 124} -150 A 124 124 0 1 0 ${Q_CX - 124} -150 Z`,
    `M ${Q_CX + 90} -60 L ${Q_CX + 150} 10`,
  ],
  u: [`M ${U_X} -220 V -107 A 75 75 0 0 0 ${U_X + 150} -107 V -220`],
  smile: `M ${U_X - 6} 66 Q ${U_X + 75} 118 ${U_X + 156} 66`,
  r: [`M ${R_X} -300 V 0`, `M ${R_X} -268 H ${R_X + 80} A 68 68 0 0 1 ${R_X + 80} -132 H ${R_X}`, `M ${R_X + 78} -132 L ${R_X + 166} 0`],
};
// The drawing's extent, smile included: x 0..832, y -306..110.
const BOX = { x: 0, y: -306, w: 832, h: 416 };

/** The letters as SVG, fitted so their width is `fill` of a `size` square, optically centred. */
function letterGroup(size, fill = 0.7, { qr = WHITE } = {}) {
  const k = (size * fill) / BOX.w;
  const tx = (size - BOX.w * k) / 2 - BOX.x * k;
  const ty = (size - BOX.h * k) / 2 - BOX.y * k;
  const stroke = (d, color, w, cap = 'butt') =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
  return [
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})">`,
    stroke(letters.q[0], qr, S),
    stroke(letters.q[1], qr, S, 'round'),
    ...letters.u.map((d) => stroke(d, ORANGE, S)),
    stroke(letters.smile, ORANGE, SMILE, 'round'),
    stroke(letters.r[0], qr, S),
    stroke(letters.r[1], qr, S),
    stroke(letters.r[2], qr, S),
    `</g>`,
  ].join('');
}

/** The mark: letters on the near-black square. `radius` is a share of the side (0 = full bleed). */
function markSvg(size, { radius = 0.225, fill = 0.7, bg = INK } = {}) {
  const r = (size * radius).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${bg}"/>${letterGroup(size, fill)}</svg>`;
}

// ---------------------------------------------------------------- outlined words
const fontFile = (w) => out('node_modules/@fontsource/inter/files', `inter-latin-${w}-normal.woff`);
const semibold = opentype.parse(fs.readFileSync(fontFile(600)).buffer.slice(0));
const regular = opentype.parse(fs.readFileSync(fontFile(400)).buffer.slice(0));

/** Outlines `text` at `size` px with tracking `track` (em), as one path per glyph. */
function outline(font, text, size, track = 0) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let x = 0;
  const parts = [];
  glyphs.forEach((g, i) => {
    const p = g.getPath(x, 0, size);
    parts.push({ char: text[i], d: p.toPathData(2) });
    x += g.advanceWidth * scale + track * size;
    if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  const width = x - track * size;
  return { parts, width, ascent: font.ascender * scale, capHeight: (font.tables.os2?.sCapHeight ?? 1490) * scale };
}

// "QuR Tag" at a reference size of 100 (cap height about 73), with the u in orange.
const NAME = outline(semibold, 'QuR Tag', 100, -0.02);
const TAGLINE_TEXT = 'Stick it on. Get it back.';
const TAGLINE = outline(regular, TAGLINE_TEXT, 100, 0);

function namePaths(color, accent = ORANGE) {
  return NAME.parts
    .filter((p) => p.d)
    .map((p) => `<path d="${p.d}" fill="${p.char === 'u' ? accent : color}"/>`)
    .join('');
}
function joined(o) {
  return o.parts.map((p) => p.d).filter(Boolean).join(' ');
}

/**
 * The horizontal lockup: the mark, then "QuR Tag" over the tagline. Heights: the mark is 120,
 * the name's cap height 46, the tagline 22 px high, so the pair fills the mark's height.
 */
function lockupSvg({ dark }) {
  const MARK = 120;
  const GAP = 28;
  const nameSize = 64;
  const tagSize = 30;
  const nameScale = nameSize / 100;
  const tagScale = tagSize / 100;
  const nameW = NAME.width * nameScale;
  const tagW = TAGLINE.width * tagScale;
  const textX = MARK + GAP;
  const width = Math.ceil(textX + Math.max(nameW, tagW) + 2);
  const nameBase = 60;
  const tagBase = 104;
  const text = dark ? WHITE : INK;
  const muted = dark ? MUTED_DARK : MUTED_LIGHT;
  // On a dark page the near-black square gets a hairline so its edge still reads.
  const ring = dark ? `<rect x="0.5" y="0.5" width="${MARK - 1}" height="${MARK - 1}" rx="${MARK * 0.225}" fill="none" stroke="#FFFFFF" stroke-opacity="0.18"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${MARK}" width="${width}" height="${MARK}" role="img" aria-label="QuR Tag. ${TAGLINE_TEXT}">
<g>${markSvg(MARK).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}${ring}</g>
<g transform="translate(${textX} ${nameBase}) scale(${nameScale})">${namePaths(text)}</g>
<g transform="translate(${textX} ${tagBase}) scale(${tagScale})"><path d="${joined(TAGLINE)}" fill="${muted}"/></g>
</svg>`;
}

// ---------------------------------------------------------------- rendering
function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: undefined }).render().asPng();
}
/** Removes the alpha channel (App Store icons and splash images must have none). */
function flatten(file) {
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(file)}).convert('RGB'); im.save(${JSON.stringify(file)}, optimize=True)`]);
}

// iOS app icon: full bleed (iOS rounds the corners), no transparency.
const appIcon = out('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
write(appIcon, png(markSvg(1024, { radius: 0 }), 1024));
flatten(appIcon);

// Splash: the mark at a third of the short side, on near-black (capacitor.config.ts uses the same colour).
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${INK}"/><g transform="translate(${(2732 - 560) / 2} ${(2732 - 560) / 2})">${markSvg(560, { radius: 0.225 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}<rect x="0.5" y="0.5" width="559" height="559" rx="126" fill="none" stroke="#FFFFFF" stroke-opacity="0.12"/></g></svg>`;
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const f = out('ios/App/App/Assets.xcassets/Splash.imageset', name);
  write(f, png(splashSvg, 2732));
  flatten(f);
}

// Web icons.
const favicon = markSvg(64, { radius: 0.225 });
write(out('public/favicon.svg'), favicon + '\n');
write(out('public/favicon-32.png'), png(favicon, 32));
const touch = out('public/apple-touch-icon.png');
write(touch, png(markSvg(180, { radius: 0 }), 180));
flatten(touch);
write(out('public/icons/icon-192.png'), png(markSvg(192, { radius: 0.225 }), 192));
write(out('public/icons/icon-512.png'), png(markSvg(512, { radius: 0.225 }), 512));
// Maskable: full bleed, letters inside the 80% safe circle.
write(out('public/icons/icon-maskable-512.png'), png(markSvg(512, { radius: 0, fill: 0.6 }), 512));

// Brand files.
write(out('public/brand/qurtag-mark.svg'), markSvg(512) + '\n');
const lockLight = lockupSvg({ dark: false });
const lockDark = lockupSvg({ dark: true });
write(out('public/brand/qurtag-lockup-light.svg'), lockLight + '\n');
write(out('public/brand/qurtag-lockup-dark.svg'), lockDark + '\n');

// Share image: light paper background, the mark large, the name and the tagline.
{
  const W = 1200;
  const H = 630;
  const MARK = 220;
  const mx = 96;
  const my = (H - MARK) / 2;
  const tx = mx + MARK + 56;
  const nameScale = 1.18;
  const tagScale = 0.6;
  const subScale = 0.3;
  const SUB = outline(regular, 'Free QR tags for everyday things. No app for the finder.', 100, 0);
  const URL = outline(semibold, 'qurtag.com', 100, 0);
  const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<g transform="translate(${mx} ${my})">${markSvg(MARK).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>
<g transform="translate(${tx} ${H / 2 - 12}) scale(${nameScale})">${namePaths(INK)}</g>
<g transform="translate(${tx} ${H / 2 + 70}) scale(${tagScale})"><path d="${joined(TAGLINE)}" fill="${INK}"/></g>
<g transform="translate(${mx} ${H - 64}) scale(${subScale})"><path d="${joined(SUB)}" fill="${MUTED_LIGHT}"/></g>
<g transform="translate(${W - 96 - URL.width * subScale} ${H - 64}) scale(${subScale})"><path d="${joined(URL)}" fill="${INK}"/></g>
</svg>`;
  const f = out('public/og.png');
  write(f, png(og, W));
  flatten(f);
  write(out('scripts/brand/preview/og.svg'), og);
}

// Legibility previews at the sizes iOS shows the icon.
for (const s of [29, 40, 60, 1024]) write(out(`scripts/brand/preview/icon-${s}.png`), png(markSvg(1024, { radius: 0.225 }), s));
write(out('scripts/brand/preview/lockup-light.png'), png(lockLight, 900));
write(out('scripts/brand/preview/lockup-dark.png'), png(lockDark, 900));

// The same drawing for the React components.
const ts = `// Generated by scripts/brand/build-brand.mjs (npm run brand). Do not edit by hand.
/* eslint-disable */
export const MARK_LETTERS = ${JSON.stringify({ ...letters, box: BOX, stroke: S, smileStroke: SMILE })} as const;
/** "QuR Tag" in Inter SemiBold at 100px: one path per glyph; the u is the accent. */
export const NAME_GLYPHS = ${JSON.stringify(NAME.parts.filter((p) => p.d).map((p) => ({ accent: p.char === 'u', d: p.d })))} as const;
export const NAME_BOX = ${JSON.stringify({ width: Math.ceil(NAME.width), ascent: Math.ceil(NAME.capHeight) })} as const;
/** "${TAGLINE_TEXT}" in Inter Regular at 100px. */
export const TAGLINE = ${JSON.stringify({ text: TAGLINE_TEXT, d: joined(TAGLINE), width: Math.ceil(TAGLINE.width) })} as const;
`;
write(out('src/components/brand/logoPaths.ts'), ts);
console.log('brand files written');
