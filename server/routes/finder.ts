/**
 * The finder's side of QuR Tag: what a person who scanned a tag may see and do, with no
 * account. vercel.json sends /api/fn/(.*) to api/fn/index.ts, which routes here:
 *
 *   POST /api/fn/finder-view  { tag, token?, scan? }
 *        The finder-safe card for the tag's item (name, photo, the owner's reward or
 *        thank-you text, whether it is marked lost) and, when the browser holds this
 *        conversation's token, the conversation. 404 for a tag that is unknown,
 *        switched off, replaced or has no item.
 *   POST /api/fn/finder-send  { tag, token?, body }
 *        Without a token: opens a new conversation with this first note, and answers
 *        the new token, which only this browser ever receives. With a token: adds the
 *        note to that conversation, if the token belongs to it under this tag.
 *
 * Why through the server and not the data API: a finder has no pass, and nothing in
 * schema qurtag is open to a visitor without one. The server login (qurtag_server) has
 * no table rights either; it may only call server_finder_view, server_finder_open and
 * server_finder_post, which hand back exactly the finder-safe fields and check the
 * conversation token themselves (db/qurtag.sql, section 10). On top of that, this file
 * copies only the known fields into each answer (finderCard, finderThread), so a field
 * added to those functions later cannot reach a finder by accident.
 *
 * The token: 32 random bytes, base64url (43 characters), made here. The database keeps
 * only its SHA-256. Tokens travel in the request body, never in an address, so they do
 * not land in logs or browser history.
 *
 * Limits: per network address and function instance, 60 views and 12 notes a minute;
 * the database adds its own per tag and per conversation (20 new conversations per tag a
 * day, 30 notes per conversation an hour).
 */
import { randomBytes } from 'node:crypto';
import { trustedOrigins } from '../auth/origins.js';
import { kickOutbox, json, serverPool } from './core.js';

/** A tag's public id, as db/qurtag.sql makes them (qurtag.new_public_id). */
export const TAG_ID = /^[2-9A-HJ-NP-Za-km-z]{12}$/;
/** A conversation token, as newThreadToken makes them. */
export const THREAD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_NOTE_LENGTH = 2000;
const MAX_BODY_BYTES = 8 * 1024;

export function newThreadToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A rough device type for the scan record; never the full user agent. */
export function deviceClass(userAgent: string | null): string {
  const ua = (userAgent ?? '').toLowerCase();
  if (/ipad/.test(ua)) return 'ipad';
  if (/iphone|ipod/.test(ua)) return 'iphone';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os x/.test(ua)) return 'mac';
  if (/windows/.test(ua)) return 'windows';
  return 'other';
}

export interface FinderCard {
  name: string;
  photo: string | null;
  reward_text: string | null;
  lost: boolean;
}

export interface FinderMessage {
  id: string;
  sender_kind: 'finder' | 'owner' | 'system';
  body: string;
  created_at: string;
}

export interface FinderThread {
  status: 'open' | 'closed' | 'reunited';
  messages: FinderMessage[];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Only the finder-safe fields of an item, whatever else the database sent. */
export function finderCard(raw: unknown): FinderCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;
  const photo = str(r.photo);
  return {
    name,
    photo: photo && /^data:image\/(jpeg|png|webp);base64,/.test(photo) ? photo : null,
    reward_text: str(r.reward_text),
    lost: r.lost === true,
  };
}

/** Only the finder-safe fields of a conversation. */
export function finderThread(raw: unknown): FinderThread | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = r.status === 'closed' || r.status === 'reunited' ? r.status : 'open';
  const list = Array.isArray(r.messages) ? r.messages : [];
  const messages: FinderMessage[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    const kind = x.sender_kind === 'owner' || x.sender_kind === 'system' ? x.sender_kind : x.sender_kind === 'finder' ? 'finder' : null;
    const id = str(x.id);
    const body = str(x.body);
    const at = str(x.created_at);
    if (!kind || !id || body === null || !at) continue;
    messages.push({ id, sender_kind: kind, body, created_at: at });
  }
  return { status, messages };
}

// ------------------------------------------------------------------ limits

class Window {
  private counts = new Map<string, { start: number; n: number }>();
  constructor(private limit: number) {}
  over(key: string, now = Date.now()): boolean {
    if (this.counts.size > 20_000) this.counts.clear();
    const c = this.counts.get(key);
    if (!c || now - c.start >= 60_000) {
      this.counts.set(key, { start: now, n: 1 });
      return false;
    }
    c.n += 1;
    return c.n > this.limit;
  }
}
const viewLimit = new Window(60);
const sendLimit = new Window(12);

function clientIp(request: Request): string {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// ------------------------------------------------------------------ requests

export type Query = (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const defaultQuery: Query = (text, values) => serverPool().query(text, values);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A page on another site may not drive these routes from a visitor's browser. */
function originAllowed(request: Request, env: NodeJS.ProcessEnv): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  if (origin === new URL(request.url).origin) return true;
  try {
    return trustedOrigins(env).includes(origin);
  } catch {
    return false;
  }
}

const notFound = () => json(404, { error: 'not_found', message: "This tag isn't registered." });

/** Words for the reasons the database gives, as the finder's page shows them. */
const REASONS: Record<string, [number, string, string]> = {
  tag_not_found: [404, 'not_found', "This tag isn't registered."],
  thread_not_found: [404, 'thread_not_found', 'That conversation could not be found on this phone. Send a new note instead.'],
  thread_closed: [409, 'thread_closed', 'The owner closed this conversation.'],
  too_many: [429, 'too_many', 'Too many notes for now. Please wait a little and try again.'],
  empty_message: [400, 'empty_message', 'Write a short note first.'],
  bad_token: [400, 'bad_request', 'That request is not valid.'],
};

function fromDatabase(e: unknown): Response {
  const message = (e as { message?: string })?.message ?? '';
  const known = Object.prototype.hasOwnProperty.call(REASONS, message) ? REASONS[message] : null;
  if (known) return json(known[0], { error: known[1], message: known[2] });
  console.error(`qurtag finder: database error ${(e as { code?: string })?.code ?? 'unknown'}`);
  return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
}

export function createFinderRoutes(opts: { query?: Query; env?: NodeJS.ProcessEnv; afterNote?: () => void } = {}) {
  const env = opts.env ?? process.env;
  const query = opts.query ?? defaultQuery;
  const afterNote = opts.afterNote ?? (() => kickOutbox(env));

  async function view(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    if (viewLimit.over(clientIp(request))) return json(429, { error: 'too_many', message: 'Please wait a moment.' });
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    const tag = str(body.tag);
    if (!tag || !TAG_ID.test(tag)) return notFound();
    const token = str(body.token);
    const usable = token && THREAD_TOKEN.test(token) ? token : null;
    let rows: Record<string, unknown>[];
    try {
      ({ rows } = await query('select qurtag.server_finder_view($1, $2, $3, $4) as v', [
        tag,
        usable,
        deviceClass(request.headers.get('user-agent')),
        body.scan === true,
      ]));
    } catch (e) {
      return fromDatabase(e);
    }
    const v = rows[0]?.v as Record<string, unknown> | null | undefined;
    const item = finderCard(v?.item);
    if (!v || !item) return notFound();
    const thread = finderThread(v.thread);
    return json(200, { item, thread, tokenValid: usable ? thread !== null : null });
  }

  async function send(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!originAllowed(request, env)) return json(403, { error: 'forbidden' });
    if (sendLimit.over(clientIp(request))) return json(429, { error: 'too_many', message: 'Too many notes for now. Please wait a little.' });
    const body = await readJson(request);
    if (!body) return json(400, { error: 'bad_request' });
    const tag = str(body.tag);
    if (!tag || !TAG_ID.test(tag)) return notFound();
    const note = (str(body.body) ?? '').trim();
    if (!note) return json(400, { error: 'empty_message', message: 'Write a short note first.' });
    if (note.length > MAX_NOTE_LENGTH) return json(400, { error: 'too_long', message: `Keep it under ${MAX_NOTE_LENGTH} characters.` });
    const given = str(body.token);
    try {
      if (given) {
        if (!THREAD_TOKEN.test(given)) return json(404, { error: 'thread_not_found', message: REASONS.thread_not_found[2] });
        await query('select qurtag.server_finder_post($1, $2, $3)', [tag, given, note]);
        afterNote();
        return json(200, { ok: true });
      }
      const token = newThreadToken();
      await query('select qurtag.server_finder_open($1, $2, $3)', [tag, token, note]);
      afterNote();
      return json(200, { ok: true, token });
    } catch (e) {
      return fromDatabase(e);
    }
  }

  return { view, send };
}
