/*
 * The app must never be a blank screen. If something throws while the page
 * starts, or React renders nothing within a few seconds, a plain message with
 * a Reload button replaces the white page, and the real error is written to
 * the console with its stack (an Error object logged as an object prints as
 * {} in the native console, which is what hid the first blank-screen report).
 */

export function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ''}`;
  try {
    return typeof e === 'string' ? e : JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

export const BOOT_CHECK_MS = 6000;

export function showBootFailure(doc: Document, detail?: string, win: Window = window): void {
  if (doc.getElementById('boot-failure')) return;
  const box = doc.createElement('div');
  box.id = 'boot-failure';
  box.setAttribute('role', 'alert');
  const dark = typeof win.matchMedia === 'function' && win.matchMedia('(prefers-color-scheme: dark)').matches;
  box.style.cssText =
    'position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;background:'+(dark?'#0A0B0F':'#FFFFFF')+';color:'+(dark?'#F5F1EA':'#0A0B0F')+';font:18px/1.5 -apple-system,system-ui,sans-serif';
  const h = doc.createElement('p');
  h.style.cssText = 'font-size:22px;font-weight:700;margin:0';
  h.textContent = 'QuR Tag did not open properly.';
  const p = doc.createElement('p');
  p.style.cssText = 'margin:0';
  p.textContent = 'Please try again. Nothing you saved has been lost.';
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = 'Reload';
  b.style.cssText = 'min-height:56px;padding:0 32px;border-radius:9999px;border:0;background:'+(dark?'#F5F1EA':'#0A0B0F')+';color:'+(dark?'#0A0B0F':'#fff')+';font:700 18px -apple-system,system-ui,sans-serif';
  b.addEventListener('click', () => window.location.reload());
  box.append(h, p, b);
  if (detail) box.setAttribute('data-detail', detail.slice(0, 500));
  doc.body.appendChild(box);
}

/** Call first at start-up. Logs every uncaught error properly and guards against an empty page. */
export function installBootGuard(win: Window = window): void {
  const doc = win.document;
  win.addEventListener('error', (ev) => {
    console.error('Uncaught error:', describeError(ev.error ?? ev.message));
  });
  win.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled rejection:', describeError(ev.reason));
  });
  win.setTimeout(() => {
    const root = doc.getElementById('root');
    if (root && root.childElementCount === 0) {
      console.error('Boot guard: nothing rendered after ' + BOOT_CHECK_MS + ' ms');
      showBootFailure(doc, 'empty root', win);
    }
  }, BOOT_CHECK_MS);
}
