/**
 * Apple Push Notification service for QuR Tag: the alert text, the request to Apple and the
 * token that signs it. No Firebase and no push vendor: the server talks to Apple directly,
 * over HTTP/2, with a token (ES256 JWT) made from the company's .p8 key.
 *
 * Settings (Vercel, project `qurtag`; README lists them):
 *   APNS_KEY_ID      the key's 10-character id
 *   APNS_TEAM_ID     the Apple team id (CQUVU6BHHA)
 *   APNS_KEY_P8      the .p8 file's contents (the PEM text)
 *   APNS_BUNDLE_ID   the app's bundle id; default app.impactconsultingai.qurtag
 *   APNS_ENV         production (default; TestFlight and App Store builds) or sandbox (builds run
 *                    from Xcode). A phone registers with the server its build uses, and this
 *                    deployment sends only to phones of its own kind, so a sandbox token is
 *                    never sent to the production server, where Apple would call it invalid.
 * Without the first three, `apnsFromEnv` answers null and sending is a no-op (the outbox says
 * so once). `QURTAG_APNS_URL` replaces Apple's address and exists for the local tests only.
 *
 * What a push carries. Only what the lock screen shows, the conversation's id (so a tap opens
 * it and "Reply" knows where to post) and the category (which says whether the notification
 * offers Reply). Never a finder's token, the finder's words beyond the note shown, an email
 * address or a name. The note text is the finder's own; with "Hide note text on the lock
 * screen" on, the alert says only "You have a new note": no note, no item name.
 *
 * Why only found and new-message alerts are time-sensitive: a stranger holding your lost thing
 * is the one case where breaking through a Focus is right. A scan alert is a nice-to-know.
 * Time-sensitive needs the Time Sensitive Notifications entitlement in the iPhone app and
 * priority 10, which every alert here uses.
 */
import { createPrivateKey, sign } from 'node:crypto';
import http2 from 'node:http2';

export type PushKind = 'found' | 'message' | 'scan';

/** The categories the iPhone app registers (ios/App/App/QurTagNotifications.swift). */
export const CATEGORY_FOUND = 'QURTAG_FOUND';
export const CATEGORY_MESSAGE = 'QURTAG_MESSAGE';
export const DEFAULT_BUNDLE_ID = 'app.impactconsultingai.qurtag';
export const HIDDEN_TITLE = 'You have a new note';

export interface PushInput {
  kind: PushKind;
  itemName: string;
  /** The finder's note (found and message). */
  note?: string | null;
  /** The conversation (found and message). */
  threadId?: string | null;
  hideText: boolean;
  /** Notes the person has not read, for the badge on the app icon. */
  unread: number;
}

export interface PushPayload {
  aps: {
    alert: { title: string; body?: string };
    badge: number;
    sound: 'default';
    'thread-id'?: string;
    category?: string;
    'interruption-level'?: 'time-sensitive';
  };
  /** The conversation to open and reply to. Absent for a scan. */
  thread?: string;
}

const NOTE_PREVIEW = 120;

function preview(note: string): string {
  const flat = note.replace(/\s+/g, ' ').trim();
  return flat.length <= NOTE_PREVIEW ? flat : `${flat.slice(0, NOTE_PREVIEW - 1).trimEnd()}…`;
}

/** Whether a kind breaks through a Focus. Found and new-message alerts only. */
export const isTimeSensitive = (kind: PushKind): boolean => kind === 'found' || kind === 'message';

export function buildPayload(input: PushInput): PushPayload {
  const badge = Number.isFinite(input.unread) ? Math.max(0, Math.min(9999, Math.trunc(input.unread))) : 0;
  const name = input.itemName.trim();
  let alert: PushPayload['aps']['alert'];
  if (input.kind === 'scan') {
    alert = input.hideText
      ? { title: 'Your tag was scanned' }
      : { title: 'Your tag was scanned', body: `Someone opened the page for your ${name}.` };
  } else if (input.hideText) {
    alert = { title: HIDDEN_TITLE };
  } else {
    alert = {
      title: input.kind === 'found' ? `Someone found your ${name}` : `New note about your ${name}`,
      ...(input.note ? { body: preview(input.note) } : {}),
    };
  }
  const aps: PushPayload['aps'] = { alert, badge, sound: 'default' };
  const payload: PushPayload = { aps };
  if (input.kind !== 'scan' && input.threadId) {
    aps['thread-id'] = input.threadId;
    aps.category = input.kind === 'found' ? CATEGORY_FOUND : CATEGORY_MESSAGE;
    payload.thread = input.threadId;
  }
  if (isTimeSensitive(input.kind)) aps['interruption-level'] = 'time-sensitive';
  return payload;
}

// ------------------------------------------------------------------ the signing token

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Accepts the key as pasted into a settings page: real line breaks, literal \n, or no header lines. */
export function normalizePem(raw: string): string {
  let t = raw.trim().replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!t.includes('BEGIN')) {
    t = `-----BEGIN PRIVATE KEY-----\n${t.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
  }
  return t;
}

/** The provider token Apple wants: ES256, the key id in the header, the team id as issuer. */
export function apnsJwt(keyId: string, teamId: string, keyPem: string, nowSec: number): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: nowSec }));
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key: createPrivateKey(normalizePem(keyPem)), dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64url(sig)}`;
}

// ------------------------------------------------------------------ sending

export type SendResult = 'sent' | 'gone' | 'failed';

export interface Device {
  token: string;
  environment: 'sandbox' | 'production';
}

export interface Apns {
  /** The server this deployment sends to; devices registered for the other one are skipped. */
  environment: 'sandbox' | 'production';
  send(deviceToken: string, kind: PushKind, payload: PushPayload, collapseId?: string): Promise<SendResult>;
  close(): void;
}

/** Apple's reasons that mean the token will never work again. */
const GONE_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

/** The first line of a result for logs: a reason Apple gave, never a token. */
function logOnce(set: Set<string>, line: string): void {
  if (set.has(line)) return;
  set.add(line);
  console.error(line);
}
const logged = new Set<string>();

export function apnsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.APNS_KEY_ID?.trim() && env.APNS_TEAM_ID?.trim() && env.APNS_KEY_P8?.trim());
}

/** The sender, or null when the key is not set (then sending is a no-op, said once). */
export function apnsFromEnv(env: NodeJS.ProcessEnv = process.env, now: () => number = () => Date.now()): Apns | null {
  if (!apnsConfigured(env)) {
    logOnce(logged, 'qurtag push: APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY_P8 are not all set; push notifications are not sent');
    return null;
  }
  const keyId = env.APNS_KEY_ID!.trim();
  const teamId = env.APNS_TEAM_ID!.trim();
  const keyPem = env.APNS_KEY_P8!;
  const topic = env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
  const environment = env.APNS_ENV?.trim() === 'sandbox' ? 'sandbox' : 'production';
  const origin = env.QURTAG_APNS_URL?.trim() || (environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');

  let jwt = '';
  let jwtAt = 0;
  let session: http2.ClientHttp2Session | null = null;

  function token(): string {
    const t = Math.floor(now() / 1000);
    // Apple wants the token renewed no more than every 20 minutes and at least every hour.
    if (!jwt || t - jwtAt > 40 * 60) {
      jwt = apnsJwt(keyId, teamId, keyPem, t);
      jwtAt = t;
    }
    return jwt;
  }

  function connection(): http2.ClientHttp2Session {
    if (session && !session.closed && !session.destroyed) return session;
    const s = http2.connect(origin);
    s.on('error', (e) => {
      logOnce(logged, `qurtag push: connection to Apple failed (${(e as NodeJS.ErrnoException)?.code ?? 'error'})`);
      if (session === s) session = null;
    });
    s.on('close', () => {
      if (session === s) session = null;
    });
    s.unref();
    session = s;
    return s;
  }

  return {
    environment,
    send(deviceToken, kind, payload, collapseId) {
      return new Promise<SendResult>((resolve) => {
        let done = false;
        const finish = (r: SendResult) => {
          if (!done) {
            done = true;
            resolve(r);
          }
        };
        try {
          const headers: http2.OutgoingHttpHeaders = {
            ':method': 'POST',
            ':path': `/3/device/${deviceToken}`,
            authorization: `bearer ${token()}`,
            'apns-topic': topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': String(Math.floor(now() / 1000) + (kind === 'scan' ? 3600 : 86400)),
            'content-type': 'application/json',
          };
          // A repeat of the same note replaces the first on the phone instead of showing twice.
          if (collapseId && collapseId.length <= 64) headers['apns-collapse-id'] = collapseId;
          const req = connection().request(headers);
          req.setTimeout(8000, () => {
            req.close(http2.constants.NGHTTP2_CANCEL);
            logOnce(logged, 'qurtag push: Apple did not answer in time');
            finish('failed');
          });
          let status = 0;
          let body = '';
          req.on('response', (h) => {
            status = Number(h[':status']);
          });
          req.on('data', (c: Buffer) => {
            if (body.length < 2000) body += c.toString('utf8');
          });
          req.on('error', (e) => {
            logOnce(logged, `qurtag push: request to Apple failed (${(e as NodeJS.ErrnoException)?.code ?? 'error'})`);
            finish('failed');
          });
          req.on('end', () => {
            if (status === 200) return finish('sent');
            let reason = '';
            try {
              reason = String((JSON.parse(body) as { reason?: unknown }).reason ?? '');
            } catch {
              /* no reason given */
            }
            if (status === 410 || (status === 400 && GONE_REASONS.has(reason))) return finish('gone');
            if (reason === 'ExpiredProviderToken') jwt = '';
            logOnce(logged, `qurtag push: Apple answered ${status} ${reason || '(no reason)'}`);
            finish('failed');
          });
          req.end(JSON.stringify(payload));
        } catch (e) {
          logOnce(logged, `qurtag push: could not send (${(e as Error)?.message ?? 'unknown'})`);
          finish('failed');
        }
      });
    },
    close() {
      session?.close();
      session = null;
    },
  };
}

/** The devices this deployment can reach: those registered for the Apple server it talks to. */
export function devicesFor(apns: Apns, devices: Device[]): Device[] {
  return devices.filter((d) => d.environment === apns.environment);
}
