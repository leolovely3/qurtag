/**
 * Draws every tag style in every look to files you can look at, the way the app prints them.
 *
 *   npx tsx scripts/qurtag/render-tags.mjs <folder> [dpi]
 *
 * For each style and look it writes the Letter and A4 sheets and the print-ready file as PDF,
 * then (with `pdftoppm` from poppler, if installed) one PNG per PDF page, which is what a printer
 * would put on paper. It also writes a preview SVG of one piece. The visual check in the QuR Tag
 * pull request is these files; scripts/qurtag/unit/tag-render.test.ts decodes the QR codes in them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { LOOKS, STYLES } from '../../src/lib/tagLayout.ts';
import { pageToPdf } from '../../src/lib/tagPdf.ts';
import { pageToSvg } from '../../src/lib/tagSvg.ts';
import { buildPreview, buildPrintReady, buildSheet } from '../../src/lib/tagStyles.ts';

const out = process.argv[2];
const dpi = process.argv[3] ?? '100';
if (!out) throw new Error('Usage: render-tags.mjs <folder> [dpi]');
mkdirSync(out, { recursive: true });

const data = { finderUrl: 'https://www.qurtag.com/find/Hk3vX9mRtB2q', shortCode: 'k7m2p', itemName: 'Blue water bottle' };
const written: string[] = [];
for (const style of STYLES) {
  for (const look of LOOKS) {
    const base = `${style.id}-${look.id}`;
    const pages = [
      [`${base}-letter`, buildSheet(style.id, look.id, data, { paper: 'letter' })],
      [`${base}-a4`, buildSheet(style.id, look.id, data, { paper: 'a4' })],
      [`${base}-printready`, buildPrintReady(style.id, look.id, data)],
    ] as const;
    for (const [name, page] of pages) {
      writeFileSync(join(out, `${name}.pdf`), pageToPdf(page));
      written.push(name);
    }
    writeFileSync(join(out, `${base}-piece.svg`), pageToSvg(buildPreview(style.id, look.id, data)));
  }
}
writeFileSync(join(out, 'clothing-mirrored-letter.pdf'), pageToPdf(buildSheet('clothing', 'clean', data, { paper: 'letter', mirror: true })));
written.push('clothing-mirrored-letter');
for (const name of written) {
  const r = spawnSync('pdftoppm', ['-png', '-r', name.endsWith('printready') ? '600' : dpi, '-singlefile', join(out, `${name}.pdf`), join(out, name)]);
  if (r.error) {
    console.warn('pdftoppm is not installed; PDFs written without PNGs');
    break;
  }
}
console.log(`${written.length} PDFs in ${out}`);
