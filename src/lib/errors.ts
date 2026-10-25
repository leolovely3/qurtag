/**
 * Crash and error reports to Sentry (project "cairn", the register's QuR Tag), on the website and in the
 * iPhone app. Errors only, and nothing personal:
 *
 *   - sendDefaultPii is off: no IP address, no cookies, no user. No user, email or account id is ever set.
 *   - Breadcrumbs are off (they record clicks, console lines and requests, which can hold a finder's
 *     note or an owner's reply), and so are release-health sessions. No performance tracing, no session
 *     replay, no feedback widget.
 *   - What an event still carries is scrubbed before it leaves the device (scrubEvent): request bodies,
 *     cookies, headers and query strings are removed, and tag codes, short codes, invite and reset tokens,
 *     and any long token-like string are cut out of addresses, transaction names and messages.
 *   - It does not run in an automated browser (the company's own checks) or on localhost, where a developer
 *     would use up the monthly allowance (src/lib/telemetryGate.ts). The iPhone app's pages are served from
 *     capacitor://localhost, so it passes its own name to the gate instead of the page's host.
 *
 * Loaded after the page is up, so it never slows the first screen. The address of the project
 * (VITE_SENTRY_DSN) is set in Vercel; without it nothing is sent. The Privacy page names Sentry.
 */
import { telemetryAllowed } from './telemetryGate';

/** A path with the codes that identify a tag, an invite or a reset cut out. */
export function scrubPath(path: string | undefined): string | undefined {
  if (!path) return path;
  return path
    .replace(/\/find\/[^/?#]+/gi, '/find/:tag')
    .replace(/\/join\/[^/?#]+/gi, '/join/:token')
    .replace(/\/reset-password[^?#]*/gi, '/reset-password')
    .replace(/(https?:\/\/[^/]+)\/[2-9a-km-np-z]{5,6}(?=[?#]|$)/gi, '$1/:short')
    .replace(/^\/[2-9a-km-np-z]{5,6}(?=[?#]|$)/i, '/:short')
    .replace(/[?#].*$/, '');
}

/** A message with token-like strings (24 or more letters, digits, "-" or "_") cut out. */
export function scrubText(s: string | undefined): string | undefined {
  return s?.replace(/[A-Za-z0-9_-]{24,}/g, ':token');
}

type AnyEvent = {
  user?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  message?: string;
  transaction?: string;
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown };
  exception?: { values?: { value?: string }[] };
};

/** Removes everything personal from an event. Pure; used by beforeSend. */
export function scrubEvent<T extends AnyEvent>(event: T): T {
  if (event.request) {
    event.request.url = scrubPath(event.request.url);
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.transaction) event.transaction = scrubPath(event.transaction);
  if (event.message) event.message = scrubText(event.message);
  for (const v of event.exception?.values ?? []) v.value = scrubText(v.value);
  return event;
}

export function startErrorReports(native: boolean): void {
  const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  // The app's pages are served from capacitor://localhost, which is a real device, not a developer's machine.
  if (!DSN || !telemetryAllowed(native ? { hostname: 'qurtag-ios-app' } : undefined)) return;
  const go = () =>
    import('@sentry/browser')
      .then((Sentry) =>
        Sentry.init({
          dsn: DSN,
          release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
          environment: native ? 'ios' : 'web',
          // Sentry 11 sends no personal data by default and no longer types this option; the explicit false
          // keeps an older or changed SDK off as well.
          ...({ sendDefaultPii: false } as object),
          tracesSampleRate: 0,
          integrations: (all) => all.filter((i) => i.name !== 'Breadcrumbs' && i.name !== 'BrowserSession'),
          beforeSend: (event) => scrubEvent(event),
        }),
      )
      .catch(() => {});
  if (document.readyState === 'complete') setTimeout(go, 0);
  else addEventListener('load', () => setTimeout(go, 0), { once: true });
}
