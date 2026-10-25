/**
 * Short codes: qurtag.com/k7m2p4 opens the same finder page as the QR code on the tag.
 *
 * vercel.json sends any path of 5 or 6 letters and digits that holds a digit (and so is never a
 * page of the site) to /api/fn?go=<code>, which lands here:
 *
 *   found          302 to /find/<the tag's public id> (not cached, so a replaced tag stops working at once)
 *   not found      404, a plain page that says so ("This code isn't registered"), never a redirect
 *   too many tries 429, a plain page that says to wait
 *
 * Guessing codes in bulk is stopped in two places. This file counts requests per network
 * address and function instance (30 a minute). The database counts wrong guesses per visitor
 * and in total across every instance (db/shortcodes.sql: 20 wrong guesses per 10 minutes for a
 * visitor, 600 a minute for everyone) and refuses with 'too_many'. A visitor is a keyed hash
 * of the network address, so the database never holds an address.
 */
import { createHmac } from 'node:crypto';
import { json, serverPool } from './core.js';
import { TAG_ID, Window, clientIp, type Query } from './finder.js';

/** A short code as typed: 5 or 6 characters of the 31 character alphabet, with at least one digit, in any case. */
export const SHORT_CODE = /^(?=[a-hj-km-np-z]*[2-9])[a-hj-km-np-z2-9]{5,6}$/i;

const lookupLimit = new Window(30);

const page = (status: number, title: string, body: string, extra: Record<string, string> = {}): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${title} | QuR Tag</title>` +
      `<style>body{font:18px/1.5 -apple-system,Helvetica,Arial,sans-serif;margin:0;padding:2.5rem 1.25rem;background:#fff;color:#0A0B0F}` +
      `main{max-width:30rem;margin:0 auto}h1{font-size:1.6rem;line-height:1.2}a{color:#0A0B0F}</style></head>` +
      `<body><main><h1>${title}</h1><p>${body}</p><p><a href="https://www.qurtag.com/">QuR Tag</a></p></main></body></html>`,
    {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer', ...extra },
    },
  );

export function createShortCodeRoute(opts: { query?: Query; env?: NodeJS.ProcessEnv } = {}) {
  const env = opts.env ?? process.env;
  const query: Query = opts.query ?? ((text, values) => serverPool().query(text, values));
  const secret = env.QURTAG_AUTH_SECRET ?? env.CRON_SECRET ?? 'qurtag';

  return async function go(request: Request, code: string): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'method_not_allowed' });
    const ip = clientIp(request);
    const tooMany = () => page(429, 'Please wait a moment', 'There have been a lot of tries from your connection. Wait a few minutes and try again.', { 'retry-after': '600' });
    if (lookupLimit.over(ip)) return tooMany();
    const key = createHmac('sha256', secret).update(`short-code:${ip}`).digest('hex');
    const typed = SHORT_CODE.test(code) ? code.toLowerCase() : '';
    try {
      // A code that cannot exist still goes to the database, so wrong guesses are counted whatever their shape.
      const { rows } = await query('select qurtag.server_short_code_lookup($1, $2) as id', [typed || 'invalid', key]);
      const id = rows[0]?.id;
      if (typeof id === 'string' && TAG_ID.test(id)) {
        return new Response(null, { status: 302, headers: { location: `/find/${id}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
      }
    } catch (e) {
      if ((e as { message?: string })?.message === 'too_many') return tooMany();
      console.error(`qurtag short code: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
      return page(500, 'Something went wrong', 'Please try again in a moment.');
    }
    return page(404, "This code isn't registered", 'Check the letters and numbers and try again. Codes are not case sensitive. If this is on something you found, scan the QR code next to it instead.');
  };
}
