/**
 * QuR Tag's data API, as a web-standard request handler (the Vercel function
 * api/data/index.ts, to which vercel.json sends every /api/data/* path, and
 * scripts/qurtag/local-server.ts locally). It answers the PostgREST-style requests
 * the app's postgrest-js client sends to /api/data; the accepted shapes are listed in
 * server/data/translate.ts.
 *
 * Why QuR Tag serves its data itself: the shared Supabase project's own data API must
 * never trust QuR Tag's signing key (a key it trusted could sign a pass for any role in
 * the project, service_role included), and it never serves schema qurtag.
 *
 * Each request:
 *   1. Rate limit per network address (per function instance, so it bounds bursts from
 *      one client, not the total across instances).
 *   2. CORS: only QuR Tag's own pages (server/auth/origins.ts) get CORS headers; a
 *      request from any other page is refused. Requests without an Origin header and
 *      same-origin requests pass.
 *   3. Size limit: bodies up to 128 KB.
 *   4. The pass (server/data/passCheck.ts): a pass that fails any check is refused with
 *      401 and never reaches the database. A valid pass runs as qurtag_user; no pass
 *      runs as qurtag_anon, which may only call the functions the list opens to
 *      everyone. The role is a constant here, never text from the request.
 *   5. The request becomes one parameterized statement (translate.ts, allowlist.ts),
 *      plus a count when asked.
 *   6. On one pooled connection, logged in as qurtag_authenticator, in one
 *      transaction (read only for reads): set_config('role', <role>, true), the verified
 *      claims into request.jwt.claims, the client's address into qurtag.client_ip,
 *      statement_timeout and an empty search_path, all local to the transaction; then
 *      the statement; then commit. Nothing outlives the transaction, so the connection
 *      goes back to the pool as plain qurtag_authenticator, which is also why a
 *      transaction pooler is safe.
 *   7. Errors: the client gets a status, a code and a plain sentence. Messages raised on
 *      purpose by QuR Tag's own functions (not_found, empty_message, ...) pass
 *      through, because the screens show them; database wording, SQL, table and
 *      constraint names never do.
 *
 * The login itself can never leave schema qurtag, even if this code were changed: it
 * can become only the two request roles and has no rights of its own (db/logins.sql).
 */
import type pg from 'pg';
import { siteUrl, trustedOrigins } from '../auth/origins.js';
import { kickOutbox } from '../routes/core.js';
import { createPassCheck, type PassClaims } from './passCheck.js';
import { plan, RequestError, type Plan } from './translate.js';
import type { Visitor } from './allowlist.js';

export const MAX_BODY_BYTES = 128 * 1024;
const SIGNED_IN_TIMEOUT = '8s';
const ANON_TIMEOUT = '3s';
const RAW_TEXT = { getTypeParser: () => (value: string) => value } as unknown as pg.CustomTypesConfig;

/** The database role for each kind of visitor: a constant, never text from the request. */
const DB_ROLE = { user: 'qurtag_user', anon: 'qurtag_anon' } as const;

type Queryable = Pick<pg.Pool, 'connect'>;

export interface DataApiOptions {
  /** A pool that logs in as qurtag_authenticator. */
  pool: Queryable;
  /**
   * Called after a function call committed (its name only). An owner's reply runs the outbox at
   * once, so a finder who asked for an email hears about it within seconds, not at the next
   * scheduled run (server/routes/finderLoop.ts).
   */
  afterRpc?: (name: string) => void;
  checkPass: (token: string) => Promise<{ ok: true; claims: PassClaims } | { ok: false; reason: string }>;
  /** Pages allowed to call from a browser. */
  origins: string[];
  /** Requests per minute per IP and per account (per function instance). */
  perIpPerMinute?: number;
  perAccountPerMinute?: number;
  /** For logs; defaults to console.error. Never given SQL, values or passes. */
  log?: (line: string) => void;
}

// ------------------------------------------------------------------ rate limits

class Window {
  private counts = new Map<string, { start: number; n: number }>();
  constructor(private limit: number) {}
  /** Seconds to wait when over the limit, else 0. */
  hit(key: string, now: number): number {
    if (this.counts.size > 20_000) {
      for (const [k, v] of this.counts) if (now - v.start >= 60_000) this.counts.delete(k);
      if (this.counts.size > 20_000) this.counts.clear();
    }
    const c = this.counts.get(key);
    if (!c || now - c.start >= 60_000) {
      this.counts.set(key, { start: now, n: 1 });
      return 0;
    }
    c.n += 1;
    return c.n > this.limit ? Math.ceil((c.start + 60_000 - now) / 1000) : 0;
  }
}

// ------------------------------------------------------------------ responses

function errorBody(code: string, message: string) {
  return JSON.stringify({ code, message, details: null, hint: null });
}

/** The plain answer for a database error; never the database's own wording. */
export function fromDatabaseError(e: unknown, signedIn: boolean): { status: number; code: string; message: string } {
  const err = (e ?? {}) as { code?: string; message?: string; where?: string };
  const code = typeof err.code === 'string' ? err.code : '';
  // Raised on purpose by one of QuR Tag's own functions or triggers: short words the
  // screens show or match on (not_found, empty_message, ...).
  const ownRaise = typeof err.where === 'string' && /PL\/pgSQL function qurtag\.[a-z_]+\([^)]*\) line \d+ at RAISE/.test(err.where);
  const own = ownRaise && err.message ? err.message.slice(0, 200) : null;
  switch (code) {
    case '42501':
      return { status: signedIn ? 403 : 401, code, message: own ?? 'You do not have access to that.' };
    case 'P0002':
      return { status: 404, code, message: own ?? 'Not found.' };
    case '22023':
    case '54000':
    case 'P0001':
      return { status: 400, code, message: own ?? 'That request is not valid.' };
    case '23505':
      return { status: 409, code, message: 'That is already there.' };
    case '23503':
      return { status: 409, code, message: 'That refers to something that is not there.' };
    case '57014':
      return { status: 504, code, message: 'That took too long. Please try again.' };
    case '40001':
    case '40P01':
      return { status: 503, code, message: 'Busy right now. Please try again.' };
  }
  if (/^(22|23)/.test(code)) {
    return { status: 400, code: code.startsWith('23') ? '23514' : '22023', message: 'Some of the details are not valid. Check them and try again.' };
  }
  if (code === '42703' || code === '42883' || code === '42804') return { status: 400, code: 'PGRST100', message: 'That request is not valid.' };
  return { status: 500, code: 'PGRST000', message: 'Something went wrong. Please try again.' };
}

async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'DELETE' || request.method === 'OPTIONS') return { ok: true, value: undefined };
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413 };
  if (!request.body) return { ok: true, value: undefined };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function clientIp(request: Request): string {
  // On Vercel, x-real-ip and the first x-forwarded-for entry are set by the platform.
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

/** Reads the sign-in service's public keys as qurtag_anon, in a short read-only transaction. */
export function databaseKeys(pool: Queryable): () => Promise<unknown> {
  return async () => {
    const client = await pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('begin isolation level read committed read only');
      await client.query(
        `select set_config('role', 'qurtag_anon', true), set_config('statement_timeout', '3s', true), set_config('search_path', '', true)`,
      );
      const { rows } = await client.query<{ k: unknown }>('select qurtag.pass_public_keys() as k');
      await client.query('commit');
      return rows.map((r) => r.k);
    } catch (e) {
      await client.query('rollback').catch((re: Error) => {
        broken = re;
      });
      if (!(e as { code?: string }).code) broken ??= e as Error;
      throw e;
    } finally {
      client.release(broken);
    }
  };
}

// ------------------------------------------------------------------ the handler

export function createDataApi(opts: DataApiOptions) {
  const perIp = new Window(opts.perIpPerMinute ?? 1200);
  const perAccount = new Window(opts.perAccountPerMinute ?? 600);
  const log = opts.log ?? ((line: string) => console.error(line));

  // Anything unexpected becomes a plain 500; the client never sees a stack trace.
  return async function handleSafely(request: Request): Promise<Response> {
    try {
      return await handle(request);
    } catch (e) {
      log(`qurtag data api: unexpected error (${(e as Error)?.name ?? 'unknown'})`);
      return new Response(errorBody('PGRST000', 'Something went wrong. Please try again.'), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  };

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const baseHeaders: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', vary: 'Origin' };
    const send = (status: number, body: string | null, extra: Record<string, string> = {}) =>
      new Response(status === 204 || request.method === 'HEAD' ? null : body, {
        status,
        headers: { ...baseHeaders, ...(body !== null && status !== 204 ? { 'content-type': 'application/json; charset=utf-8' } : {}), ...extra },
      });
    const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
      send(status, errorBody(code, message), extra);

    const ip = clientIp(request);
    const now = Date.now();
    const ipWait = perIp.hit(ip || 'unknown', now);
    if (ipWait) return fail(429, 'PGRST000', 'Too many requests. Please wait a moment.', { 'retry-after': String(ipWait) });

    const sameOrigin = origin !== null && origin === url.origin;
    const corsOk = origin !== null && opts.origins.includes(origin);
    if (corsOk) {
      baseHeaders['access-control-allow-origin'] = origin;
      baseHeaders['access-control-expose-headers'] = 'content-range, retry-after';
      // A client fetching with credentials needs this, or its browser drops the answer.
      baseHeaders['access-control-allow-credentials'] = 'true';
    }
    if (origin !== null && !corsOk && !sameOrigin) return fail(403, 'PGRST000', 'This page may not use the QuR Tag data API.');

    if (request.method === 'OPTIONS') {
      if (!corsOk) return send(204, null);
      return send(204, null, {
        'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type, accept, accept-profile, content-profile, prefer, range, x-client-info',
        'access-control-max-age': '600',
      });
    }

    // Path: /api/data/<table> or /api/data/rpc/<fn>; /api/data/rest/v1/... is accepted too.
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'api' || segments[1] !== 'data') return fail(404, 'PGRST205', 'Not found.');
    let path: string[];
    try {
      path = segments.slice(2).map((s) => decodeURIComponent(s));
    } catch {
      return fail(404, 'PGRST205', 'Not found.');
    }
    if (path[0] === 'rest' && path[1] === 'v1') path = path.slice(2);
    if (!path.length) return fail(404, 'PGRST205', 'Not found.');

    // Only schema qurtag is served.
    for (const h of ['accept-profile', 'content-profile']) {
      const p = request.headers.get(h);
      if (p !== null && p !== 'qurtag') return fail(406, 'PGRST106', 'Only schema qurtag is served.');
    }

    const body = await readBody(request);
    if (!body.ok) {
      return body.status === 413 ? fail(413, 'PGRST100', 'That is too large.') : fail(400, 'PGRST100', 'That request is not valid.');
    }

    // Who is asking. The Factory's metrics reader sends its own key in Authorization;
    // the counting function always runs with no pass, so that header is not read as one.
    let claims: PassClaims | null = null;
    const guestOnly = path.length === 2 && path[0] === 'rpc' && path[1] === 'factory_metrics';
    const auth = guestOnly ? null : request.headers.get('authorization');
    if (auth !== null) {
      const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
      const result = token ? await opts.checkPass(token) : { ok: false as const, reason: 'not a bearer pass' };
      if (!result.ok) return fail(401, 'PGRST301', 'Please sign in again.', { 'www-authenticate': 'Bearer' });
      claims = result.claims;
      const wait = perAccount.hit(claims.sub, now);
      if (wait) return fail(429, 'PGRST000', 'Too many requests. Please wait a moment.', { 'retry-after': String(wait) });
    }
    const visitor: Visitor = claims ? 'user' : 'anon';

    let p: Plan;
    try {
      p = plan(
        {
          method: request.method,
          path,
          query: url.searchParams,
          prefer: request.headers.get('prefer') ?? '',
          wantsObject: (request.headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json'),
          body: body.value,
        },
        visitor,
      );
    } catch (e) {
      if (e instanceof RequestError) {
        return fail(e.status, e.code, e.message, e.status === 401 ? { 'www-authenticate': 'Bearer' } : {});
      }
      throw e;
    }

    // One transaction, as the visitor's role.
    const role = DB_ROLE[visitor];
    const claimsJson = JSON.stringify(claims ?? { role: DB_ROLE.anon });
    let client: pg.PoolClient;
    try {
      client = await opts.pool.connect();
    } catch (e) {
      log(`qurtag data api: no database connection (${(e as { code?: string }).code ?? 'unknown'})`);
      return fail(503, 'PGRST001', 'Busy right now. Please try again.');
    }
    let broken: Error | undefined;
    try {
      await client.query(p.readOnly ? 'begin isolation level read committed read only' : 'begin');
      await client.query(
        `select set_config('role', $1, true), set_config('request.jwt.claims', $2, true),
                set_config('statement_timeout', $3, true), set_config('search_path', '', true),
                set_config('qurtag.client_ip', $4, true)`,
        [role, claimsJson, claims ? SIGNED_IN_TIMEOUT : ANON_TIMEOUT, ip.slice(0, 64)],
      );

      let total: string | null = null;
      if (p.count) {
        const { rows } = await client.query<{ n: string }>({ text: p.count.sql, values: p.count.params, types: RAW_TEXT });
        total = rows[0]?.n ?? '0';
      }
      // A HEAD with a count needs only the count.
      const skipRows = p.head && p.count;
      // The rows come back as the JSON text Postgres wrote (no parsing and re-encoding),
      // so dates, times and numbers reach the app exactly as PostgREST would send them.
      const rows = skipRows ? [] : (await client.query<{ j: string | null }>({ text: p.sql, values: p.params, types: RAW_TEXT })).rows;

      const extra: Record<string, string> = {};
      if (p.result === 'rows' && !p.single) {
        const range = rows.length ? `${p.offset}-${p.offset + rows.length - 1}` : '*';
        extra['content-range'] = `${range}/${total ?? '*'}`;
      }

      let payload: string | null;
      if (p.result === 'none') payload = null;
      else if (p.result === 'value') payload = rows[0]?.j ?? 'null';
      else if (p.single) {
        if (rows.length !== 1) {
          await client.query('rollback');
          return send(406, JSON.stringify({
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: `The result contains ${rows.length} rows`,
            hint: null,
          }));
        }
        payload = rows[0].j ?? 'null';
      } else payload = `[${rows.map((r) => r.j ?? 'null').join(',')}]`;

      await client.query('commit');
      if (path[0] === 'rpc' && path.length === 2 && opts.afterRpc) {
        try {
          opts.afterRpc(path[1]);
        } catch {
          /* a nudge never fails the request */
        }
      }
      return send(p.status, payload, extra);
    } catch (e) {
      await client.query('rollback').catch((re: Error) => {
        broken = re;
      });
      const mapped = fromDatabaseError(e, !!claims);
      if (mapped.status >= 500) log(`qurtag data api: database error ${(e as { code?: string }).code ?? 'unknown'}`);
      if (!(e as { code?: string }).code) broken ??= e as Error;
      return fail(mapped.status, mapped.code, mapped.message);
    } finally {
      client.release(broken);
    }
  }
}

/** Builds the handler from the environment (names only; see README.md, "Backend"). */
export function dataApiOptionsFromEnv(env: NodeJS.ProcessEnv, pool: Queryable): DataApiOptions {
  return {
    pool,
    checkPass: createPassCheck({
      jwks: env.QURTAG_PASS_JWKS || undefined,
      loadKeys: databaseKeys(pool),
      issuer: siteUrl(env),
    }),
    origins: trustedOrigins(env),
    perIpPerMinute: env.QURTAG_DATA_RATE_PER_IP ? Number(env.QURTAG_DATA_RATE_PER_IP) : undefined,
    perAccountPerMinute: env.QURTAG_DATA_RATE_PER_ACCOUNT ? Number(env.QURTAG_DATA_RATE_PER_ACCOUNT) : undefined,
    afterRpc: (name) => {
      if (name === 'owner_reply') kickOutbox(env);
    },
  };
}
