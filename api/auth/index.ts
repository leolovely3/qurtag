/**
 * Vercel serverless function (Node runtime) that serves every /api/auth/* route of
 * QuR Tag's own sign-in service: sign-up, sign-in, sign-out, email confirmation,
 * password reset, the data pass (/api/auth/token) and the public keys
 * (/api/auth/jwks). The service itself is server/auth/qurtagAuth.ts.
 *
 * It lives at api/auth/index.ts, not api/auth/[...all].ts: outside Next.js a Vercel
 * catch-all file matches one path segment only, so vercel.json sends /api/auth/(.*)
 * here instead. The auth object is built once per function instance, on the first
 * request, so a missing environment variable fails that request instead of the build.
 */
import { withPhoneAppCors } from '../../server/auth/phoneCors.js';
import { createQurtagAuth, type QurtagAuth } from '../../server/auth/qurtagAuth.js';

export const config = { runtime: 'nodejs' };

let auth: QurtagAuth | undefined;

const handle = withPhoneAppCors((request: Request): Promise<Response> => {
  auth ??= createQurtagAuth();
  return auth.handler(request);
});

export const GET = handle;
export const POST = handle;
// OPTIONS: the iPhone app's browser asks first (see server/auth/phoneCors.ts).
export const OPTIONS = handle;
