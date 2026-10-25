/**
 * Sends what the database queued in qurtag.outbox:
 *
 *   finder_message  a finder wrote a note. Everyone who reads the household's inbox (the owner
 *                   and, on a Family plan, every member) is told, each by their own settings:
 *                   an iPhone alert to each of their phones ("Someone found your X" for the
 *                   first note of a conversation, "New note about your X" for the later ones),
 *                   or, when no alert could go out, the email at once. The email says nothing
 *                   about the finder and does not carry the note itself.
 *   push_email      10 minutes after the note: the email copy, for people who were sent an
 *                   alert and have not read the note since (opening the alert opens the
 *                   conversation and marks it read; so does reading it anywhere else). Not sent
 *                   to a person who turned the copy off.
 *   push_scan       2 minutes after a scan: "Your tag was scanned" to the people who asked for it,
 *                   once an hour per tag and person, unless the finder wrote a note meanwhile.
 *
 * Runs when the finder route nudges /api/jobs/outbox after a note, and every 5 minutes from the
 * scheduler (the email copy and the scan alert are due minutes later; vercel.json). Each run takes
 * up to 25 due rows (rows another run holds are skipped). A row that fails is tried again later
 * (1, 5, 30 minutes, 2 hours, 12 hours), at most six times; the error stays on the row. When email
 * is not set up (no RESEND_API_KEY), the email parts are finished without sending: the note is in
 * the owner's inbox either way. When Apple's key is not set up (no APNS_KEY_P8 and friends), the
 * alert parts are skipped, so the person gets the email at once as before.
 *
 * Who is emailed at once. A person with no phone registered gets the email at once, as before
 * the iPhone alerts existed. A person with a phone gets it at once only when no alert could be
 * delivered (Apple refused the phone's token, or the key is not set up) and they have not turned
 * the email copy off. A person with a phone who switched that alert off gets nothing about it.
 *
 * Why a retry never repeats itself: each person's outcome for a note is recorded as it happens
 * (qurtag.note_alerts), so a retry skips anyone already alerted or emailed, and a repeated alert
 * carries the note's id as Apple's collapse id, which replaces the first instead of showing twice.
 *
 * The server login reaches the outbox only through qurtag.server_outbox_take,
 * server_outbox_finish and the server_* functions of db/qurtag.sql and db/push.sql.
 */
import type pg from 'pg';
import { finderMessageMail, mailConfigured, senderFromEnv, type MailSender } from '../auth/mailer.js';
import { siteUrl } from '../auth/origins.js';
import { apnsFromEnv, buildPayload, devicesFor, type Apns, type Device, type PushInput, type PushKind } from '../push/apns.js';
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
  /** Alerts Apple accepted. */
  pushed: number;
  /** Device tokens deleted because Apple said they are gone. */
  pruned: number;
  /** Emails sent. */
  emailed: number;
}

interface Row {
  id: string;
  kind: 'finder_message' | 'push_email' | 'push_scan';
  ref: string;
  attempts: number;
}

interface NoteRecipient {
  user_id: string;
  email: string;
  item_name: string;
  thread_id: string;
  body: string;
  is_first: boolean;
  found_on: boolean;
  message_on: boolean;
  hide_text: boolean;
  email_copy: boolean;
  unread: number;
  devices: Device[];
  handled: boolean;
}

interface ScanRecipient {
  user_id: string;
  item_name: string;
  hide_text: boolean;
  unread: number;
  devices: Device[];
}

export interface DrainOptions {
  /** Replaces the Apple sender (tests). */
  apns?: Apns | null;
  /** Replaces the email sender (tests). */
  sendMail?: MailSender;
}

export async function drainOutbox(env: NodeJS.ProcessEnv = process.env, db: pg.Pool = serverPool(env), opts: DrainOptions = {}): Promise<DrainResult> {
  const { rows } = await db.query<Row>('select * from qurtag.server_outbox_take($1, $2)', [BATCH, MAX_ATTEMPTS]);
  const result: DrainResult = { taken: rows.length, done: 0, failed: 0, unsent: 0, pushed: 0, pruned: 0, emailed: 0 };
  if (rows.length === 0) return result;
  const canMail = mailConfigured(env);
  const sendMail = canMail ? (opts.sendMail ?? senderFromEnv(env)) : null;
  const apns = opts.apns !== undefined ? opts.apns : apnsFromEnv(env);
  const inbox = `${siteUrl(env)}/app/inbox`;

  /** Sends to each phone this deployment can reach: whether Apple accepted any, and whether a try failed for a reason that may pass. */
  async function pushTo(devices: Device[], kind: PushKind, input: Omit<PushInput, 'kind'>, collapseId?: string) {
    let sent = false;
    let transient = false;
    if (!apns) return { sent, transient };
    const payload = buildPayload({ ...input, kind });
    for (const d of devicesFor(apns, devices)) {
      const r = await apns.send(d.token, kind, payload, collapseId);
      if (r === 'sent') {
        sent = true;
        result.pushed++;
      } else if (r === 'gone') {
        await db.query('select qurtag.server_push_forget($1)', [d.token]);
        result.pruned++;
      } else {
        transient = true;
      }
    }
    return { sent, transient };
  }

  async function note(row: Row): Promise<void> {
    const { rows: people } = await db.query<NoteRecipient>('select * from qurtag.server_note_recipients($1)', [row.ref]);
    let retry = false;
    for (const p of people) {
      if (p.handled) continue;
      const kind: PushKind = p.is_first ? 'found' : 'message';
      const wanted = p.is_first ? p.found_on : p.message_on;
      let sent = false;
      if (wanted && p.devices.length > 0) {
        const r = await pushTo(
          p.devices,
          kind,
          { itemName: p.item_name, note: p.body, threadId: p.thread_id, hideText: p.hide_text, unread: p.unread },
          row.ref,
        );
        sent = r.sent;
        // Apple could not be reached this time: try the whole note again later, unless this was the last try.
        if (!sent && r.transient && row.attempts < MAX_ATTEMPTS) {
          retry = true;
          continue;
        }
      }
      if (sent) {
        await db.query('select qurtag.server_alert_record($1, $2, true, false)', [row.ref, p.user_id]);
        continue;
      }
      // Someone who uses the app and switched this alert off wants nothing about it, and
      // someone who turned the email copy off wants no email when the alert could not go out.
      if (p.devices.length > 0 && (!wanted || !p.email_copy)) continue;
      if (!sendMail) {
        result.unsent++;
        continue;
      }
      await sendMail(finderMessageMail(p.email, p.item_name, inbox));
      result.emailed++;
      await db.query('select qurtag.server_alert_record($1, $2, false, true)', [row.ref, p.user_id]);
    }
    if (retry) throw new Error('Apple could not be reached; the alert will be tried again');
  }

  async function copy(row: Row): Promise<void> {
    const { rows: due } = await db.query<{ user_id: string; email: string; item_name: string }>(
      'select * from qurtag.server_push_email_due($1)',
      [row.ref],
    );
    for (const p of due) {
      if (!sendMail) {
        result.unsent++;
        continue;
      }
      await sendMail(finderMessageMail(p.email, p.item_name, inbox));
      result.emailed++;
      await db.query('select qurtag.server_alert_record($1, $2, false, true)', [row.ref, p.user_id]);
    }
  }

  async function scan(row: Row): Promise<void> {
    if (!apns) return;
    const { rows: people } = await db.query<ScanRecipient>('select * from qurtag.server_scan_recipients($1)', [row.ref]);
    // A scan alert is a nice-to-know: if Apple cannot be reached now, it is not tried again.
    for (const p of people) {
      await pushTo(p.devices, 'scan', { itemName: p.item_name, hideText: p.hide_text, unread: p.unread });
    }
  }

  try {
    for (const row of rows) {
      try {
        if (row.kind === 'finder_message') await note(row);
        else if (row.kind === 'push_email') await copy(row);
        else if (row.kind === 'push_scan') await scan(row);
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
  } finally {
    apns?.close();
  }
  return result;
}
