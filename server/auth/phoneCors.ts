/**
 * CORS for the phone apps on the server routes (/api/auth and /api/fn; /api/data has its own).
 *
 * Used by the routes the phone app calls: /api/auth and /api/fn.
 * The web pages call /api/auth on their own origin and need no CORS. The iPhone
 * app loads its pages from capacitor://localhost and calls the web site; its browser
 * asks first (OPTIONS) and reads the answer only with CORS headers. They carry the session as `Authorization: Bearer` (Better Auth's bearer
 * plugin) and read the session token from the `set-auth-token` answer header, so that
 * header is exposed. No cookie crosses origins. Only that origin gets these
 * headers; every other request goes on unchanged (Better Auth refuses untrusted
 * origins itself).
 */
export const PHONE_APP_ORIGINS: readonly string[] = ['capacitor://localhost'];

export function withPhoneAppCors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (!origin || !PHONE_APP_ORIGINS.includes(origin)) return handler(request);
    const cors: Record<string, string> = {
      'access-control-allow-origin': origin,
      'access-control-expose-headers': 'set-auth-token',
      // The web auth client sends `credentials: 'include'`; without this header the
      // phone's browser throws the answer away and sign-in fails with "Load
      // failed" (seen in the Apero app). Allowed only for the phone origin above.
      'access-control-allow-credentials': 'true',
      vary: 'Origin',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '600',
        },
      });
    }
    const response = await handler(request);
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  };
}
