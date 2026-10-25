/**
 * The browser side of QuR Tag's own sign-in (server: server/auth/qurtagAuth.ts).
 *
 * - `authClient` is Better Auth's client. On the web the session lives in an HttpOnly
 *   cookie the page cannot read. The iPhone app's pages come from capacitor://localhost,
 *   which cannot hold the site's cookie, so there the app keeps the session token the
 *   server sends in its `set-auth-token` answer header and sends it back as
 *   `Authorization: Bearer`; it calls the live site by full address (src/lib/platform.ts). The
 *   token is also handed to the app's native code (src/lib/nativeSession.ts) for Reply in a
 *   notification.
 * - `getDataPass()` returns a short-lived pass for the data API (/api/data), fetched
 *   from /api/auth/token and reused until a minute before it expires; null when nobody
 *   is signed in.
 *
 * Finders never sign in; their page calls the server routes in src/lib/finder.ts.
 */
import { createAuthClient } from 'better-auth/client';
import { jwtClient } from 'better-auth/client/plugins';
import { syncNativeSession } from './nativeSession';
import { isNative, serverUrl } from './platform';

/** Where the iPhone app keeps its session token (the app's own storage; the web keeps none). */
const TOKEN_KEY = 'qurtag.session-token';
const phoneToken = {
  get(): string | null {
    if (!isNative()) return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    if (!isNative()) return;
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage off: the next start signs in again */
    }
    // The app's native code keeps its own copy, so a reply typed in a notification works with the app closed.
    void syncNativeSession(token);
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing kept */
    }
    void syncNativeSession(null);
  },
};

export const authClient = createAuthClient({
  baseURL: serverUrl('/api/auth'),
  plugins: [jwtClient()],
  fetchOptions: {
    // The iPhone app carries the session as a bearer token, never a cookie across origins.
    credentials: isNative() ? 'omit' : 'include',
    auth: { type: 'Bearer', token: () => phoneToken.get() ?? undefined },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token');
      if (token) phoneToken.set(token);
    },
  },
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

/** Gives the app's native code the session token already kept on this phone (a person who signed in before it kept its own copy). */
export function shareSessionWithApp(): void {
  const token = phoneToken.get();
  if (token) void syncNativeSession(token);
}

/** Forget the cached pass, for example straight after signing out. */
export function clearDataPass(): void {
  cached = null;
}

/** Forget the pass and, in the iPhone app, the kept session token: after signing out, and before a new sign-in. */
export function forgetSession(): void {
  cached = null;
  phoneToken.clear();
}
