/**
 * QuR Tag's scheduled work. Each answers only the scheduler (Vercel Cron sends
 * Authorization: Bearer <CRON_SECRET>) or the finder route's nudge, which sends the same.
 *
 *   /api/jobs/outbox   send what the database queued (server/routes/outbox.ts): alerts to
 *                      phones, emails, the email copy and the scan alert. Asked by the finder
 *                      route after each note, and by the scheduler every 5 minutes.
 *   /api/jobs/daily    every day at 05:00 UTC: the outbox again, for anything a nudge
 *                      missed or that is due for another try, memberships past their
 *                      end are marked expired, and finders' emails with no note for 30 days,
 *                      network keys older than 30 days and expired blocks are deleted
 */
import { isScheduler, json, serverPool } from './core.js';
import { drainOutbox } from './outbox.js';

export async function jobs(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const name = new URL(request.url).pathname.replace(/^\/api\/jobs\/?/, '').replace(/\/+$/, '');
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!isScheduler(request, env)) return json(401, { error: 'unauthorized' });
  switch (name) {
    case 'outbox':
      return json(200, { outbox: await drainOutbox(env) });
    case 'daily': {
      const outbox = await drainOutbox(env);
      // Memberships past their end stop counting (the plan is read from the clock anyway).
      const { rows } = await serverPool(env).query<{ n: number }>('select qurtag.server_membership_sweep() as n');
      // Finders' emails after 30 days without a note, network keys after 30 days, expired blocks.
      const swept = await serverPool(env).query<{ r: Record<string, number> }>('select qurtag.server_finder_sweep() as r');
      return json(200, { outbox, memberships_expired: rows[0]?.n ?? 0, finder: swept.rows[0]?.r ?? null });
    }
    default:
      return json(404, { error: 'not_found' });
  }
}
