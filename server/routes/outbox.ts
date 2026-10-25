/**
 * Sends what the database queued in qurtag.outbox:
 *
 *   finder_message  a finder wrote a note: email the item's owner that a note is
 *                   waiting, with a link to the inbox. The email says nothing about the
 *                   finder and does not carry the note itself.
 *
 * Runs when the finder route nudges /api/jobs/outbox after a note, and once a day from
 * the scheduler. Each run takes up to 25 due rows (rows another run holds are skipped).
 * A row that fails is tried again later (1, 5, 30 minutes, 2 hours, 12 hours), at most
 * six times; the error stays on the row. When email is not set up (no RESEND_API_KEY),
 * the row is finished without sending: the note is in the owner's inbox either way.
 *
 * The server login reaches the outbox only through qurtag.server_outbox_take,
 * server_outbox_finish and server_finder_message_notice (db/qurtag.sql, section 10).
 */
import type pg from 'pg';
import { finderMessageMail, mailConfigured, senderFromEnv } from '../auth/mailer.js';
import { siteUrl } from '../auth/origins.js';
import { serverPool } from './core.js';

const BATCH = 25;
const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

export interface DrainResult {
  taken: number;
  done: number;
  failed: number;
  /** Finished without an email, because email is not set up. */
  unsent: number;
}

interface Row {
  id: string;
  kind: 'finder_message';
  ref: string;
  attempts: number;
}

export async function drainOutbox(env: NodeJS.ProcessEnv = process.env, db: pg.Pool = serverPool(env)): Promise<DrainResult> {
  const { rows } = await db.query<Row>('select * from qurtag.server_outbox_take($1, $2)', [BATCH, MAX_ATTEMPTS]);
  const result: DrainResult = { taken: rows.length, done: 0, failed: 0, unsent: 0 };
  const canMail = mailConfigured(env);
  const sendMail = canMail ? senderFromEnv(env) : null;
  for (const row of rows) {
    try {
      if (row.kind === 'finder_message') {
        if (!sendMail) {
          result.unsent++;
        } else {
          const { rows: notice } = await db.query<{ owner_email: string; item_name: string }>(
            'select * from qurtag.server_finder_message_notice($1)',
            [row.ref],
          );
          // The account or item may have been deleted since; nothing to send then.
          if (notice[0]) await sendMail(finderMessageMail(notice[0].owner_email, notice[0].item_name, `${siteUrl(env)}/app/inbox`));
        }
      }
      await db.query('select qurtag.server_outbox_finish($1, null, 0)', [row.id]);
      result.done++;
    } catch (e) {
      const wait = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)];
      await db.query('select qurtag.server_outbox_finish($1, $2, $3)', [
        row.id,
        (e instanceof Error ? e.message : String(e)).slice(0, 500),
        wait,
      ]);
      result.failed++;
    }
  }
  return result;
}
