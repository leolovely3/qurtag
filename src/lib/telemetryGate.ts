// The reference telemetry gate. Copy this file verbatim to a product's
// `src/lib/telemetryGate.ts` as part of installing Sentry (docs/PROVISIONING.md,
// "Observability, from day one"). Import `telemetryAllowed()` and call it before
// `Sentry.init(...)`; do not call `Sentry.init` unconditionally.
//
// Why this exists: the company's own visual checks load every live product in
// headless Chrome, and a local dev server is `localhost` all day. Neither is a
// user. Without this guard, both count as events against the product's monthly
// Sentry allowance. On ForgeHOA, that noise used up the whole month's quota.
//
// The contract (matches ForgeHOA's install):
//   - `navigator.webdriver` is `true` (an automated browser, e.g. Playwright,
//     Puppeteer, headless Chrome driven by a visual check) -> no Sentry.
//   - the hostname is `localhost`, `127.0.0.1`, `::1` or `0.0.0.0` -> no Sentry.
//   - anything else -> Sentry runs as normal.

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** True when the current browser announces itself as automated. */
export function isAutomatedBrowser(webdriver?: boolean): boolean {
  if (webdriver !== undefined) return webdriver === true;
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/** True when the page is being served from a local address, not a real deploy. */
export function isLocalHostname(hostname?: string): boolean {
  const h = hostname ?? (typeof window !== "undefined" ? window.location.hostname : undefined);
  return Boolean(h && LOCAL_HOSTNAMES.has(h));
}

/**
 * Whether Sentry should run at all. Call this before `Sentry.init(...)`:
 *
 *   import { telemetryAllowed } from "./lib/telemetryGate";
 *   if (telemetryAllowed()) {
 *     Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
 *   }
 *
 * Pass explicit values in tests; in the browser both default to the real
 * `navigator`/`window`.
 */
export function telemetryAllowed(opts?: { webdriver?: boolean; hostname?: string }): boolean {
  if (isAutomatedBrowser(opts?.webdriver)) return false;
  if (isLocalHostname(opts?.hostname)) return false;
  return true;
}
