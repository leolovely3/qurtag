/**
 * The claims a QuR Tag pass carries, the site's own address, and the pages that may
 * call QuR Tag's sign-in service and data API from a browser.
 *
 * Kept free of imports so the data API and the server routes can use it without
 * loading the sign-in library.
 *
 * The site's address (`siteUrl`): QURTAG_AUTH_URL in production
 * (https://www.qurtag.com). A preview deployment has no fixed address, so there it
 * is the deployment's own (VERCEL_URL, which Vercel sets). The sign-in service signs
 * passes with this address as issuer and the data API expects the same, so both always
 * agree within one deployment.
 *
 * Trusted pages: the site's address, the live site, the preview's branch address
 * (VERCEL_BRANCH_URL), local development, and any
 * extra ones in QURTAG_AUTH_TRUSTED_ORIGINS (comma separated).
 */

export const PASS_APP = 'qurtag';
export const PASS_AUDIENCE = 'qurtag';
/** The one role a pass may name; a request with no pass runs as qurtag_anon. */
export const USER_ROLE = 'qurtag_user';

export const PRODUCTION_ORIGINS = ['https://www.qurtag.com', 'https://qurtag.com'];

/**
 * Local development (Vite dev and preview). QuR Tag has no phone app.
 */
export const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The site's own address, without a trailing slash. */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fixed = env.QURTAG_AUTH_URL?.trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  throw new Error('Missing environment variable QURTAG_AUTH_URL');
}

/** Every page allowed to call from a browser. */
export function trustedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const own = [new URL(siteUrl(env)).origin];
  const branch = env.VERCEL_BRANCH_URL ? [`https://${env.VERCEL_BRANCH_URL}`] : [];
  return [...new Set([...own, ...branch, ...PRODUCTION_ORIGINS, ...LOCAL_ORIGINS, ...list(env.QURTAG_AUTH_TRUSTED_ORIGINS)])];
}
