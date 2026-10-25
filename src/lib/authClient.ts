/**
 * The browser side of QuR Tag's own sign-in (server: server/auth/qurtagAuth.ts).
 *
 * - `authClient` is Better Auth's client. The session lives in an HttpOnly cookie the
 *   page cannot read.
 * - `getDataPass()` returns a short-lived pass for the data API (/api/data), fetched
 *   from /api/auth/token and reused until a minute before it expires; null when nobody
 *   is signed in.
 *
 * Finders never sign in; their page calls the server routes in src/lib/finder.ts.
 */
import { createAuthClient } from 'better-auth/client';
import { jwtClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
  plugins: [jwtClient()],
  fetchOptions: { credentials: 'include' },
});

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

function expiryOf(token: string): number {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return Number(payload.exp) * 1000;
}

/** A fresh pass for the data API, or null when nobody is signed in. */
export async function getDataPass(): Promise<string | null> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  inFlight ??= (async () => {
    try {
      const { data } = await authClient.token();
      cached = data?.token ? { token: data.token, expiresAt: expiryOf(data.token) } : null;
      return cached?.token ?? null;
    } catch {
      cached = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Forget the cached pass, for example straight after signing out. */
export function clearDataPass(): void {
  cached = null;
}
