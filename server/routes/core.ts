/**
 * What every server route shares: the database login `qurtag_server`, the scheduler's
 * secret, JSON answers, and work that runs after the answer is sent.
 *
 * The server routes (api/fn and api/jobs) never hold a Supabase key. They log in as
 * qurtag_server (QURTAG_DATABASE_URL_SERVER), which has no table rights at all: only
 * the server_* functions of schema qurtag that db/qurtag.sql grants it (section 11).
 */
import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { siteUrl } from '../auth/origins.js';

let pool: pg.Pool | undefined;

/** The pool for qurtag_server, made on first use. */
export function serverPool(env: NodeJS.ProcessEnv = process.env): pg.Pool {
  if (!pool) {
    const connectionString = env.QURTAG_DATABASE_URL_SERVER;
    if (!connectionString) throw new Error('Missing environment variable QURTAG_DATABASE_URL_SERVER');
    const ca = env.QURTAG_DATABASE_CA_CERT;
    pool = new pg.Pool({
      connectionString,
      max: Number(env.QURTAG_SERVER_POOL_MAX ?? 2),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    });
    pool.on('error', () => {});
  }
  return pool;
}

/** Replaces the pool (local tests). */
export function useServerPool(p: pg.Pool): void {
  pool = p;
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export function sameSecret(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The scheduler (Vercel Cron) and the finder route's nudge send Authorization: Bearer <CRON_SECRET>. */
export function isScheduler(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return sameSecret(m?.[1], env.CRON_SECRET);
}

/**
 * Runs `work` after the answer is sent: Vercel's waitUntil when present, otherwise just
 * started (locally the process stays up). Errors are logged, never thrown.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  const run = work().catch((e) => console.error(`qurtag: background work failed (${(e as Error)?.message ?? 'unknown'})`));
  const ctx = (globalThis as { [k: symbol]: { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } })[
    Symbol.for('@vercel/request-context')
  ];
  ctx?.get?.()?.waitUntil?.(run);
}

/**
 * Asks /api/jobs/outbox to send what the database just queued (an owner's email about a
 * finder's note), at most once every 5 seconds per
 * instance; a write inside those 5 seconds makes it ask once more when they are over.
 * The scheduler also runs it once a day. Needs CRON_SECRET.
 */
const KICK_GAP_MS = 5_000;
let lastKick = 0;
let trailingKick = false;
export function kickOutbox(env: NodeJS.ProcessEnv = process.env): void {
  const secret = env.CRON_SECRET;
  if (!secret) return;
  let base: string;
  try {
    base = siteUrl(env);
  } catch {
    return;
  }
  const nudge = () => {
    lastKick = Date.now();
    return fetch(`${base}/api/jobs/outbox`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });
  };
  const wait = KICK_GAP_MS - (Date.now() - lastKick);
  if (wait <= 0) {
    afterResponse(nudge);
    return;
  }
  if (trailingKick) return;
  trailingKick = true;
  afterResponse(async () => {
    await new Promise((r) => setTimeout(r, wait));
    trailingKick = false;
    await nudge();
  });
}
