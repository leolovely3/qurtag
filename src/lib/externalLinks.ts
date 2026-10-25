/**
 * In the iPhone app, a link to another website opens in the in-app Safari sheet
 * (with a Done button) instead of replacing the app or doing nothing. On the
 * web, links keep their normal behaviour. tel:, sms:, mailto: and links on the
 * app's own domain are never intercepted.
 */
const APP_HOSTS = new Set(['localhost', 'qurtag.com', 'www.qurtag.com']);

/** The http(s) address to open in the in-app browser, or null if the link should behave normally. */
export function externalUrl(href: string | null | undefined, baseHref: string): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, baseHref);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (APP_HOSTS.has(url.hostname)) return null;
  return url.href;
}

interface OpenerDeps {
  native: () => boolean;
  open: (url: string) => void | Promise<void>;
  baseHref: () => string;
}

/** A click handler for the whole document: returns true when it took over the link. */
export function handleLinkClick(
  anchor: { getAttribute(name: string): string | null } | null,
  event: { preventDefault(): void; defaultPrevented?: boolean },
  deps: OpenerDeps,
): boolean {
  if (!anchor || event.defaultPrevented || !deps.native()) return false;
  const target = externalUrl(anchor.getAttribute('href'), deps.baseHref());
  if (!target) return false;
  event.preventDefault();
  void deps.open(target);
  return true;
}

/** window.open replacement: true when it was routed to the in-app browser. */
export function handleWindowOpen(url: string | URL | undefined, deps: OpenerDeps): boolean {
  if (!deps.native() || url === undefined) return false;
  const target = externalUrl(String(url), deps.baseHref());
  if (!target) return false;
  void deps.open(target);
  return true;
}

let installed = false;

/** Installs the one global handler. Safe to call more than once. */
export function installExternalLinks(
  doc: Document,
  win: Window & typeof globalThis,
  deps: OpenerDeps,
): void {
  if (installed || !deps.native()) return;
  installed = true;
  doc.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('a[href]') ?? null;
      handleLinkClick(el, e, deps);
    },
    true,
  );
  const original = win.open.bind(win);
  win.open = ((url?: string | URL, ...rest: unknown[]) => {
    if (handleWindowOpen(url, deps)) return null;
    return (original as (...a: unknown[]) => Window | null)(url, ...rest);
  }) as typeof win.open;
}
