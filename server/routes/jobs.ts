/**
 * QuR Tag's scheduled work. Each answers only the scheduler (Vercel Cron sends
 * Authorization: Bearer <CRON_SECRET>) or the finder route's nudge, which sends the same.
 *
 *   /api/jobs/outbox   send what the database queued (server/routes/outbox.ts). Asked
 *                      by the finder route after each note.
 *   /api/jobs/daily    every day at 05:00 UTC: the outbox again, for anything a nudge
 *                      missed or that is due for another try
 */
import { isScheduler, json } from './core.js';
import { drainOutbox } from './outbox.js';

export async function jobs(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const name = new URL(request.url).pathname.replace(/^\/api\/jobs\/?/, '').replace(/\/+$/, '');
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!isScheduler(request, env)) return json(401, { error: 'unauthorized' });
  switch (name) {
    case 'outbox':
    case 'daily':
      return json(200, { outbox: await drainOutbox(env) });
    default:
      return json(404, { error: 'not_found' });
  }
}
