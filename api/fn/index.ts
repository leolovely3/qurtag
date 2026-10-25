/**
 * Vercel serverless function (Node runtime) for QuR Tag's server routes (vercel.json
 * sends /api/fn/(.*) here):
 *
 *   POST /api/fn/finder-view   the finder-safe item card and the finder's own conversation
 *   POST /api/fn/finder-send   a finder's note (opens a conversation, or adds to theirs)
 *   GET  /api/fn?go=<code>     a short code (qurtag.com/k7m2p4) sent on to the finder page
 *
 * Both are in server/routes/finder.ts. The iPhone app's push routes (push-register, push-unregister,
 * push-reply) are in server/routes/push.ts. The membership routes (billing-config, billing-checkout,
 * billing-portal, family-invite, email-test, stripe-webhook, revenuecat-webhook) are in server/routes/billing.ts. Errors become a plain 500; nothing internal
 * reaches the caller.
 */
import { withPhoneAppCors } from '../../server/auth/phoneCors.js';
import { json } from '../../server/routes/core.js';
import { createBillingRoutes } from '../../server/routes/billing.js';
import { createFinderRoutes } from '../../server/routes/finder.js';
import { createPushRoutes } from '../../server/routes/push.js';
import { createShortCodeRoute } from '../../server/routes/shortcode.js';

export const config = { runtime: 'nodejs' };

const finder = createFinderRoutes();
const billing = createBillingRoutes();
const push = createPushRoutes();
const shortCode = createShortCodeRoute();

const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  'finder-view': finder.view,
  'finder-send': finder.send,
  'billing-config': billing.config,
  'billing-checkout': billing.checkout,
  'billing-portal': billing.portal,
  'family-invite': billing.invite,
  'support': billing.support,
  'email-test': billing.emailTest,
  'stripe-webhook': billing.stripeWebhook,
  'revenuecat-webhook': billing.revenueCatWebhook,
  'push-register': push.register,
  'push-unregister': push.unregister,
  'push-reply': push.reply,
};

const handle = withPhoneAppCors(async (request: Request): Promise<Response> => {
  // vercel.json sends qurtag.com/<short code> here as /api/fn?go=<code> (server/routes/shortcode.ts).
  const go = new URL(request.url).searchParams.get('go');
  if (go !== null) return shortCode(request, go.slice(0, 32));
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
