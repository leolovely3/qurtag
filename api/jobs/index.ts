/**
 * Vercel serverless function (Node runtime) for QuR Tag's scheduled work
 * (server/routes/jobs.ts); vercel.json sends /api/jobs/(.*) here and schedules it.
 */
import { json } from '../../server/routes/core.js';
import { jobs } from '../../server/routes/jobs.js';

export const config = { runtime: 'nodejs' };

const handle = async (request: Request): Promise<Response> => {
  try {
    return await jobs(request);
  } catch (e) {
    console.error(`qurtag jobs: ${(e as Error)?.message ?? 'failed'}`);
    return json(500, { error: 'server_error' });
  }
};

export const GET = handle;
export const POST = handle;
