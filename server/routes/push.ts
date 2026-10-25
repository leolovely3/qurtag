/**
 * The iPhone app's side of push notifications. vercel.json sends /api/fn/(.*) to
 * api/fn/index.ts, which routes these names here.
 *
 *   POST /api/fn/push-register    { token, environment }  signed in. Remembers the phone's Apple
 *                                 device token for this account. environment is sandbox (a build
 *                                 run from Xcode) or production (TestFlight, App Store).
 *   POST /api/fn/push-unregister  { token }  signed in. Forgets the token (sign out).
 *   POST /api/fn/push-reply       { thread, body }  signed in. The owner's reply, typed in the
 *                                 notification itself. Answers { ok, unread } so the phone can
 *                                 set the number on the app icon.
 *
 * Signed in means a QuR Tag pass (server/data/passCheck.ts) whose session the database confirms
 * is still alive. The iPhone app gets a pass from /api/auth/token with the session token it
 * keeps (a bearer token): the web view does it for register and unregister, and the app's own
 * native code does it for the reply, so Reply works with the app in the background or closed
 * (ios/App/App/QurTagNotifications.swift). The database login is qurtag_server, which has no
 * table rights: it calls only the server_push_* functions and server_owner_reply of
 * db/push.sql. A device token is never sent back to any client.
 */
import { siteUrl } from '../auth/origins.js';
import { createPassCheck, type PassResult } from '../data/passCheck.js';
import { json, serverPool } from './core.js';
import { clientIp, originAllowed, Window, type Query } from './finder.js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_REPLY_LENGTH = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-fA-F]{32,200}$/;

const accountLimit = new Window(Number(process.env.QURTAG_PUSH_RATE_PER_ACCOUNT ?? 30));
const ipLimit = new Window(Number(process.env.QURTAG_PUSH_RATE_PER_IP ?? 120));

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const REASONS: Record<string, [number, string, string]> = {
  not_authenticated: [401, 'not_authenticated', 'Please sign in again.'],
  bad_token: [400, 'bad_request', 'That request is not valid.'],
  empty_message: [400, 'empty_message', 'Write a reply first.'],
  not_found: [404, 'not_found', 'That conversation could not be found.'],
};

function fromDatabase(e: unknown): Response {
  const message = (e as { message?: string })?.message ?? '';
  const known = Object.prototype.hasOwnProperty.call(REASONS, message) ? REASONS[message] : null;
  if (known) return json(known[0], { error: known[1], message: known[2] });
  console.error(`qurtag push: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
  return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
}

export interface PushRouteOptions {
  query?: Query;
  env?: NodeJS.ProcessEnv;
  /** Replaces the pass check (tests that do not hold the signing keys). */
  checkPass?: (token: string) => Promise<PassResult>;
}

export function createPushRoutes(opts: PushRouteOptions = {}) {
  const env = opts.env ?? process.env;
  const query: Query = opts.query ?? ((text, values) => serverPool(env).query(text, values));

  let pass: ((token: string) => Promise<PassResult>) | undefined = opts.checkPass;
  function checkPass(token: string): Promise<PassResult> {
    pass ??= createPassCheck({
      jwks: env.QURTAG_PASS_JWKS || undefined,
      loadKeys: async () => (await query('select qurtag.pass_public_keys() as k', [])).rows.map((r) => r.k),
      issuer: siteUrl(env),
    });
    return pass(token);
  }

  /** The signed-in person's id and session, or the answer to send. */
  async function signedIn(request: Request): Promise<{ user: string; session: string; body: Record<string, unknown> } | Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    if (ipLimit.over(clientIp(request))) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!m) return json(401, { error: 'not_authenticated', message: REASONS.not_authenticated[2] });
    const checked = await checkPass(m[1]);
    if (!checked.ok) return json(401, { error: 'not_authenticated', message: REASONS.not_authenticated[2] });
    if (accountLimit.over(checked.claims.sub)) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    return { user: checked.claims.sub, session: checked.claims.sid, body };
  }

  async function register(request: Request): Promise<Response> {
    const who = await signedIn(request);
    if (who instanceof Response) return who;
    const token = str(who.body.token);
    const environment = str(who.body.environment);
    if (!token || !TOKEN.test(token) || (environment !== 'sandbox' && environment !== 'production')) {
      return json(400, { error: 'bad_request', message: REASONS.bad_token[2] });
    }
    try {
      await query('select qurtag.server_push_register($1, $2, $3, $4)', [who.user, who.session, token, environment]);
      return json(200, { ok: true });
    } catch (e) {
      return fromDatabase(e);
    }
  }

  async function unregister(request: Request): Promise<Response> {
    const who = await signedIn(request);
    if (who instanceof Response) return who;
    const token = str(who.body.token);
    if (!token || !TOKEN.test(token)) return json(400, { error: 'bad_request', message: REASONS.bad_token[2] });
    try {
      await query('select qurtag.server_push_unregister($1, $2, $3)', [who.user, who.session, token]);
      return json(200, { ok: true });
    } catch (e) {
      return fromDatabase(e);
    }
  }

  async function reply(request: Request): Promise<Response> {
    const who = await signedIn(request);
    if (who instanceof Response) return who;
    const thread = str(who.body.thread);
    const text = (str(who.body.body) ?? '').trim();
    if (!thread || !UUID.test(thread)) return json(400, { error: 'bad_request', message: REASONS.bad_token[2] });
    if (!text) return json(400, { error: 'empty_message', message: REASONS.empty_message[2] });
    if (text.length > MAX_REPLY_LENGTH) return json(400, { error: 'too_long', message: `Keep it under ${MAX_REPLY_LENGTH} characters.` });
    try {
      const { rows } = await query('select qurtag.server_owner_reply($1, $2, $3, $4) as r', [who.user, who.session, thread, text]);
      const r = rows[0]?.r as { message_id?: string; unread?: number } | undefined;
      return json(200, { ok: true, unread: Number(r?.unread ?? 0) });
    } catch (e) {
      return fromDatabase(e);
    }
  }

  return { register, unregister, reply };
}
