/**
 * Large text sizes: marks <html> so screens can change their layout, not only their size.
 *
 * Every size in the app is in rem and the iPhone app's root font size is the phone's text size
 * (Dynamic Type, `html.native-app` in src/index.css), so at Accessibility sizes the text grows
 * to 28, 33 and up to 53 px while the screen stays 375 to 430 points wide. A row built for 17 px
 * (a thumbnail, a name, a time and a chevron side by side) then leaves the name a column a few
 * letters wide. Above a threshold the screens stack instead: the `ax:` Tailwind variant
 * (tailwind.config.ts) applies when <html> has the class `text-ax`, and `axx:` when it also has
 * `text-axx` for the very largest sizes.
 *
 * The thresholds are root sizes in px: 22 sits between the two largest standard sizes (21 and
 * 23), so the largest standard size and every Accessibility size (28 to 53) get the stacked
 * layout, and the default (17) and the sizes near it keep the normal one; 40 sits between
 * Accessibility 2 (33) and the larger ones. The same classes apply on the website when a browser's own font size
 * is set that large. The root size can change while the app is open (the owner changes the text
 * size in Settings and comes back), so a hidden 1rem probe is watched for size changes.
 */
export const AX_ROOT_PX = 22;
export const AXX_ROOT_PX = 40;

export function textSizeClasses(rootPx: number): { ax: boolean; axx: boolean } {
  return { ax: rootPx >= AX_ROOT_PX, axx: rootPx >= AXX_ROOT_PX };
}

export function installTextSizeClasses(doc: Document = document): void {
  const root = doc.documentElement;
  const apply = () => {
    const px = parseFloat(getComputedStyle(root).fontSize) || 16;
    const { ax, axx } = textSizeClasses(px);
    root.classList.toggle('text-ax', ax);
    root.classList.toggle('text-axx', axx);
  };
  apply();
  doc.addEventListener('visibilitychange', apply);
  if (typeof ResizeObserver === 'undefined') return;
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1rem;height:0;visibility:hidden;pointer-events:none';
  const attach = () => {
    doc.body.appendChild(probe);
    new ResizeObserver(apply).observe(probe);
  };
  if (doc.body) attach();
  else doc.addEventListener('DOMContentLoaded', attach, { once: true });
}
