/**
 * The finder's page talks to QuR Tag's server routes (/api/fn/finder-view and
 * /api/fn/finder-send; server/routes/finder.ts), never to the data API. A finder has
 * no account: the browser keeps one secret token per conversation, in this browser's
 * storage, keyed by the tag. The token goes in the request body only.
 *
 * A finder can also keep a link to their conversation (the token after # in the
 * address, which browsers never send to a server) to open it on another device.
 */
import { serverUrl } from './platform';

export interface FinderItem {
  name: string;
  photo: string | null;
  reward_text: string | null;
  lost: boolean;
  /** The owner paused new notes: a new conversation cannot start (an existing one goes on). */
  paused?: boolean;
}

export interface FinderMessage {
  id: string;
  sender_kind: 'finder' | 'owner' | 'system';
  body: string;
  created_at: string;
  /** A finder's note the owner has read. */
  seen?: boolean;
}

export interface FinderView {
  item: FinderItem;
  thread: { status: 'open' | 'closed' | 'reunited'; messages: FinderMessage[]; email_on?: boolean } | null;
  tokenValid: boolean | null;
  /** Whether the finder can ask to be emailed about replies. */
  emailAvailable?: boolean;
}

const KEY = (tag: string) => `qurtag.finder.${tag}`;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function rememberedToken(tag: string): string | null {
  try {
    const t = window.localStorage.getItem(KEY(tag));
    return t && TOKEN.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function rememberToken(tag: string, token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY(tag), token);
    else {
      window.localStorage.removeItem(KEY(tag));
      window.localStorage.removeItem(CODE_KEY(tag));
    }
  } catch {
    /* private window: the conversation lasts as long as this page */
  }
}

/**
 * The conversation code (K7M2-P9XQ-4TRB), shown once by the server when the first note is sent and kept
 * here so this browser can show it again. Typed at qurtag.com/reply it opens the conversation on any
 * browser (server/routes/finderLoop.ts).
 */
const CODE_KEY = (tag: string) => `qurtag.finder.${tag}.code`;
const SHOWN_CODE = /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/;

export function rememberedCode(tag: string): string | null {
  try {
    const c = window.localStorage.getItem(CODE_KEY(tag));
    return c && SHOWN_CODE.test(c) ? c : null;
  } catch {
    return null;
  }
}

export function rememberCode(tag: string, code: string): void {
  try {
    if (SHOWN_CODE.test(code)) window.localStorage.setItem(CODE_KEY(tag), code);
  } catch {
    /* private window */
  }
}

/** A code as the finder typed it, tidied for the box: upper case, dashes every 4 characters. */
export function tidyCode(typed: string): string {
  const raw = typed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return raw.replace(/(.{4})(?=.)/g, '$1-');
}

/** A token handed over in the address (#t=...), from a saved conversation link. */
export function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

async function call<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const r = await fetch(serverUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as T & { message?: string };
    if (!r.ok) return { ok: false, status: r.status, message: j?.message || 'Something went wrong. Please try again.' };
    return { ok: true, data: j };
  } catch {
    return { ok: false, status: 0, message: 'No connection. Check your signal and try again.' };
  }
}

export function viewTag(tag: string, token: string | null, scan: boolean) {
  return call<FinderView>('/api/fn/finder-view', { tag, ...(token ? { token } : {}), scan });
}

export function sendNote(tag: string, token: string | null, body: string) {
  return call<{ ok: true; token?: string; code?: string }>('/api/fn/finder-send', { tag, ...(token ? { token } : {}), body });
}

/** A typed conversation code: the tag and this conversation's token, to keep in this browser. */
export function resumeConversation(code: string) {
  return call<{ tag: string; token: string }>('/api/fn/finder-resume', { code });
}

/** The finder's optional email for replies; null takes it back. The address is never shown to anyone. */
export function setReplyEmail(tag: string, token: string, email: string | null) {
  return call<{ ok: true; email_on: boolean }>('/api/fn/finder-email', { tag, token, email });
}

/**
 * Whether opening the page should count as a scan. A test view never counts, a finder
 * coming back to their own conversation is not a new scan, and the owner looking at their
 * own tag (signed in on this browser, for example after scanning the printed tag with their
 * own phone) is not a finder, so it is left out of the scan history and the measures.
 */
export function shouldRecordScan(o: { testMode: boolean; hasToken: boolean; ownsTag: boolean }): boolean {
  return !o.testMode && !o.hasToken && !o.ownsTag;
}

/** One-tap openings for a finder's first note, so it can finish the job without a reply. */
export const NOTE_STARTERS = ['I left it at ', 'I have it. I can meet at ', 'I handed it to staff at '] as const;

/** The link that reopens this conversation on another phone or browser (the token after #). */
export function conversationLink(origin: string, tag: string, token: string): string {
  return `${origin}/find/${tag}#t=${token}`;
}
