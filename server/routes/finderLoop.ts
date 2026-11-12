/**
 * How a finder gets back to their conversation and hears about a reply, with no account
 * (db/ux-fixes.sql, rollout step 13).
 *
 *   POST /api/fn/finder-resume       { code }                 a typed conversation code: answers the tag
 *                                                             and the conversation token for this browser
 *   POST /api/fn/finder-email        { tag, token, email }    an optional email for the finder's own
 *                                                             conversation; email null takes it back
 *   GET  /api/fn/finder-email-stop?t=<conversation>&s=<sig>  a page with one button: stop these emails
 *   POST /api/fn/finder-email-stop?t=...&s=...               stops them (also the one-click unsubscribe
 *                                                             mail programs send, RFC 8058)
 *
 * The conversation code. Each new conversation gets a code a person can read and type, 12 characters
 * from the short code alphabet (no 0, o, 1, l or i), shown as K7M2-P9XQ-4TRB: about 59 bits. The
 * conversation token is not random any more but derived from the code with a keyed hash
 * (HMAC-SHA256 with QURTAG_FINDER_SECRET, else QURTAG_AUTH_SECRET), so the database keeps exactly what
 * it kept before (the token's SHA-256) and holds nothing that could give a code back. Typing the code on
 * any browser lets the server derive the same token and find the conversation. Why that is safe: the
 * key never leaves the server, so a token cannot be worked out from a code anywhere else, and guessing
 * codes goes through server_finder_resume, which counts wrong tries per visitor (a keyed hash of the
 * network address) and for everyone, under the short code limits (20 per visitor in 10 minutes, 600 a
 * minute in all). At 600 guesses a minute it would take about 24 years to hit any one of 100,000 live
 * conversations. Changing the secret makes old codes stop working; old links (the token itself)
 * still work.
 *
 * The finder's email. Kept only for that conversation, never shown to the owner, an admin or any
 * client. It is encrypted here (AES-256-GCM, a key derived with HKDF from the same secret) together
 * with the conversation token, and only the ciphertext goes to the database: the server has to send to
 * the plain address, so a hash would not do, and the token lets the email link straight back to the
 * conversation. The database deletes it when the conversation closes, the finder is blocked, after the
 * last email when the owner marks the thing returned, on unsubscribe, and after 30 days without a note.
 *
 * Limits per network address and function instance: 20 resume tries and 10 email changes a minute.
 */
import { mailConfigured } from '../auth/mailer.js';
import { json, serverPool } from './core.js';
import { TAG_ID, THREAD_TOKEN, Window, clientIp, originAllowed, type Query } from './finder.js';
import { EMAIL, UUID, finderSecret, networkKey, normalizeCode, sealContact, signatureOk, tokenForCode } from './finderCrypto.js';

const page = (status: number, title: string, body: string): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${title} | QuR Tag</title>` +
      `<style>body{font:18px/1.5 -apple-system,Helvetica,Arial,sans-serif;margin:0;padding:2.5rem 1.25rem;background:#fff;color:#0A0B0F}` +
      `main{max-width:30rem;margin:0 auto}h1{font-size:1.6rem;line-height:1.2}a{color:#0A0B0F}` +
      `button{font:inherit;min-height:44px;padding:0 1.25rem;border-radius:999px;border:0;background:#0A0B0F;color:#fff}</style></head>` +
      `<body><main><h1>${title}</h1>${body}<p><a href="https://www.qurtag.com/">QuR Tag</a></p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } },
  );

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? '0') > 4096) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const resumeLimit = new Window(20);
const emailLimit = new Window(10);

export function createFinderLoopRoutes(opts: { query?: Query; env?: NodeJS.ProcessEnv } = {}) {
  const env = opts.env ?? process.env;
  const query: Query = opts.query ?? ((text, values) => serverPool(env).query(text, values));

  async function resume(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    const ip = clientIp(request);
    const tooMany = () => json(429, { error: 'too_many', message: 'There have been a lot of tries. Wait a few minutes and try again.' });
    if (resumeLimit.over(ip)) return tooMany();
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    const code = normalizeCode(typeof body.code === 'string' ? body.code : '');
    const token = code ? tokenForCode(code, env) : null;
    try {
      // A code that cannot exist still goes to the database, so every wrong try is counted.
      const { rows } = await query('select qurtag.server_finder_resume($1, $2) as tag', [token, networkKey('conversation-code', ip, env)]);
      const tag = rows[0]?.tag;
      if (token && typeof tag === 'string' && TAG_ID.test(tag)) return json(200, { tag, token });
    } catch (e) {
      if ((e as { message?: string })?.message === 'too_many') return tooMany();
      console.error(`qurtag finder resume: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
      return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
    }
    return json(404, { error: 'not_found', message: 'We could not find a conversation with that code. Check it and try again.' });
  }

  async function email(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    if (emailLimit.over(clientIp(request))) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    const tag = typeof body.tag === 'string' ? body.tag : '';
    const token = typeof body.token === 'string' ? body.token : '';
    if (!TAG_ID.test(tag) || !THREAD_TOKEN.test(token)) return json(404, { error: 'thread_not_found', message: 'That conversation could not be found.' });
    const given = body.email === null ? null : typeof body.email === 'string' ? body.email.trim() : undefined;
    if (given === undefined) return json(400, { error: 'bad_request' });
    if (given !== null) {
      if (!mailConfigured(env) || !finderSecret(env)) return json(503, { error: 'email_off', message: 'Email is not available right now. Keep this page or your conversation code instead.' });
      if (given.length > 254 || !EMAIL.test(given)) return json(400, { error: 'bad_email', message: 'Check the email address and try again.' });
    }
    try {
      const sealed = given === null ? null : sealContact({ email: given, token }, env);
      await query('select qurtag.server_finder_set_email($1, $2, $3)', [tag, token, sealed]);
      return json(200, { ok: true, email_on: given !== null });
    } catch (e) {
      const m = (e as { message?: string })?.message ?? '';
      if (m === 'thread_not_found') return json(404, { error: 'thread_not_found', message: 'That conversation could not be found.' });
      if (m === 'thread_closed') return json(409, { error: 'thread_closed', message: 'This conversation has ended, so there is nothing more to tell you.' });
      console.error(`qurtag finder email: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
      return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
    }
  }

  async function stop(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const t = url.searchParams.get('t') ?? '';
    const s = url.searchParams.get('s') ?? '';
    if (!UUID.test(t) || !signatureOk(t, s, env)) return page(404, 'This link is not valid', '<p>It may have been copied wrongly.</p>');
    if (request.method === 'GET' || request.method === 'HEAD') {
      return page(
        200,
        'Stop these emails?',
        `<p>We will stop emailing you about this conversation and delete your email address. The conversation itself stays, and you can still read it from your private link or conversation code.</p>` +
          `<form method="post"><button type="submit">Stop the emails</button></form>`,
      );
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    try {
      await query('select qurtag.server_finder_email_forget($1)', [t]);
    } catch (e) {
      console.error(`qurtag finder email stop: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
      return page(500, 'Something went wrong', '<p>Please try again in a moment.</p>');
    }
    return page(200, 'Done. No more emails', '<p>We deleted your email address from this conversation. Thank you for helping.</p>');
  }

  return { resume, email, stop };
}
