/**
 * Vercel serverless function (Node runtime) for QuR Tag's data API: /api/data/<table>
 * and /api/data/rpc/<function>, for signed-in owners (and, with no pass, the Factory's
 * counts only). vercel.json sends every /api/data/* path here. The rules live in
 * server/data/ (dataApi.ts, translate.ts, allowlist.ts, passCheck.ts).
 *
 * Connects with QURTAG_DATABASE_URL_DATA, a login as qurtag_authenticator and nothing
 * else. Built once per function instance, on the first request.
 */
import pg from 'pg';
import { createDataApi, dataApiOptionsFromEnv } from '../../server/data/dataApi.js';

export const config = { runtime: 'nodejs' };

let handle: ((request: Request) => Promise<Response>) | undefined;

function handler(): (request: Request) => Promise<Response> {
  if (!handle) {
    const connectionString = process.env.QURTAG_DATABASE_URL_DATA;
    if (!connectionString) throw new Error('Missing environment variable QURTAG_DATABASE_URL_DATA');
    // The database's CA certificate (PEM text), to check the server it connects to.
    const ca = process.env.QURTAG_DATABASE_CA_CERT;
    const pool = new pg.Pool({
      connectionString,
      max: Number(process.env.QURTAG_DATA_POOL_MAX ?? 2),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 15_000,
      ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    });
    // An idle connection the server dropped must not crash the instance.
    pool.on('error', () => {});
    handle = createDataApi(dataApiOptionsFromEnv(process.env, pool));
  }
  return handle;
}

const serve = (request: Request) => handler()(request);

export const GET = serve;
export const HEAD = serve;
export const POST = serve;
export const PATCH = serve;
export const DELETE = serve;
export const OPTIONS = serve;
