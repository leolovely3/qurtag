/**
 * Draws the "Print it and stick it on" picture of How it works and the home page
 * (public/how/tags-light.webp and tags-dark.webp): the small sticker and the label strip, Clean
 * look, exactly as src/lib/tagStyles.ts prints them, on the page's light and dark backgrounds.
 *
 *   npx tsx scripts/qurtag/how-tags.mjs        (needs ImageMagick's `magick` and `cwebp`)
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import { pageToSvg } from '../../src/lib/tagSvg.ts';
import { buildPreview } from '../../src/lib/tagStyles.ts';

const data = { finderUrl: 'https://www.qurtag.com/find/Hk3vX9mRtB2q', shortCode: 'k7m2p4' };
const dir = mkdtempSync(join(tmpdir(), 'qurtag-how-'));
const draw = (style, pxPerIn) => {
  const page = buildPreview(style, 'clean', data);
  const file = join(dir, `${style}.png`);
  const r = new Resvg(pageToSvg(page, { background: false }), {
    fitTo: { mode: 'width', value: Math.round(page.w * pxPerIn) },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
  }).render();
  writeFileSync(file, r.asPng());
  return file;
};
const sticker = draw('sticker', 444);
const strip = draw('strip', 333);
for (const [mode, bg] of [['light', 'rgb(237,241,244)'], ['dark', 'rgb(20,24,27)']]) {
  const png = join(dir, `${mode}.png`);
  const shadow = (f) => ['(', f, '(', '+clone', '-background', 'black', '-shadow', '35x14+0+10', ')', '+swap', '-background', 'none', '-layers', 'merge', '+repage', ')'];
  execFileSync('magick', [
    '-size', '1600x800', `xc:${bg}`,
    ...shadow(sticker), '-geometry', '+36+96', '-composite',
    ...shadow(strip), '-geometry', '+662+212', '-composite',
    png,
  ]);
  execFileSync('cwebp', ['-quiet', '-q', '90', png, '-o', `public/how/tags-${mode}.webp`]);
}
console.log('public/how/tags-light.webp and tags-dark.webp written');
