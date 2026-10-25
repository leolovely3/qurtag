/**
 * Runs QuR Tag's four server functions on this computer, for the local tests and for
 * trying the app against a local database. Production runs the same code as the Vercel
 * functions in api/ (vercel.json sends /api/auth, /api/data, /api/fn and /api/jobs paths
 * to them).
 *
 *   QURTAG_LOCAL_PORT=56820 npx tsx scripts/qurtag/local-server.ts
 *
 * Reads the same environment variables as production (README.md). It passes
 * x-forwarded-for through as sent, which the tests use to act as different visitors.
 * Never put it on the internet.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import * as auth from '../../api/auth/index.js';
import * as data from '../../api/data/index.js';
import * as fn from '../../api/fn/index.js';
import * as jobs from '../../api/jobs/index.js';

const port = Number(process.env.QURTAG_LOCAL_PORT ?? 56820);
type Handlers = Record<string, ((r: Request) => Promise<Response>) | unknown>;
const mounts: [string, Handlers][] = [
  ['/api/auth', auth as Handlers],
  ['/api/data', data as Handlers],
  ['/api/fn', fn as Handlers],
  ['/api/jobs', jobs as Handlers],
];

async function serve(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? '/';
  const mount = mounts.find(([prefix]) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
  const method = req.method ?? 'GET';
  const handler = mount?.[1][method] as ((r: Request) => Promise<Response>) | undefined;
  if (!handler) {
    res.statusCode = mount ? 405 : 404;
    res.end();
    return;
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const request = new Request(`http://${req.headers.host ?? `127.0.0.1:${port}`}${url}`, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
  const response = await handler(request);
  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.() ?? [];
  response.headers.forEach((v, k) => {
    if (k !== 'set-cookie') res.setHeader(k, v);
  });
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer((req, res) => {
  serve(req, res).catch((e) => {
    console.error('local server error', (e as Error)?.message);
    res.statusCode = 500;
    res.end();
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`QuR Tag server functions on http://127.0.0.1:${port} (/api/auth, /api/data, /api/fn, /api/jobs)`);
});
