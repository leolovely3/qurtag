/**
 * Vercel serverless function (Node runtime) for QuR Tag's server routes (vercel.json
 * sends /api/fn/(.*) here):
 *
 *   POST /api/fn/finder-view   the finder-safe item card and the finder's own conversation
 *   POST /api/fn/finder-send   a finder's note (opens a conversation, or adds to theirs)
 *
 * Both are in server/routes/finder.ts. Errors become a plain 500; nothing internal
 * reaches the caller.
 */
import { withPhoneAppCors } from '../../server/auth/phoneCors.js';
import { json } from '../../server/routes/core.js';
import { createFinderRoutes } from '../../server/routes/finder.js';

export const config = { runtime: 'nodejs' };

const finder = createFinderRoutes();

const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  'finder-view': finder.view,
  'finder-send': finder.send,
};

const handle = withPhoneAppCors(async (request: Request): Promise<Response> => {
  const name = new URL(request.url).pathname.replace(/^\/api\/fn\/?/, '').replace(/\/+$/, '');
  const route = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : undefined;
  if (!route) return json(404, { error: 'not_found' });
  try {
    return await route(request);
  } catch (e) {
    console.error(`qurtag /api/fn/${name}: ${(e as Error)?.message ?? 'failed'}`);
    return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
});

export const GET = handle;
export const POST = handle;
// OPTIONS: the iPhone app's browser asks first (see server/auth/phoneCors.ts).
export const OPTIONS = handle;
