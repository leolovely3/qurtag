/**
 * The finder's conversation code, the keyed network hash and the sealed finder email: the pure helpers
 * behind server/routes/finderLoop.ts and server/routes/finder.ts. Why each is built the way it is: see
 * the block comment of server/routes/finderLoop.ts.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { siteUrl } from '../auth/origins.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE_LENGTH = 12;
const CODE = /^[a-hj-km-np-z2-9]{12}$/;
export const EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]+\.[^@\s<>"',;]{2,}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function finderSecret(env: NodeJS.ProcessEnv): string | null {
  return env.QURTAG_FINDER_SECRET?.trim() || env.QURTAG_AUTH_SECRET?.trim() || null;
}

/** A new conversation code, lower case without separators (12 characters, each equally likely). */
export function newConversationCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** A code as typed (any case, spaces or dashes), or null when it cannot be one. */
export function normalizeCode(typed: string): string | null {
  const c = typed.toLowerCase().replace(/[\s-]/g, '');
  return CODE.test(c) ? c : null;
}

/** K7M2-P9XQ-4TRB: how the code is shown. */
export function displayCode(code: string): string {
  return code.toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

/** The conversation token a code stands for (43 characters, like a random token). */
export function tokenForCode(code: string, env: NodeJS.ProcessEnv): string | null {
  const secret = finderSecret(env);
  if (!secret) return null;
  return createHmac('sha256', secret).update(`qurtag-conversation-code:v1:${code}`).digest('base64url');
}

/** A keyed hash of a network address, for the database's counters and blocks; never the address. */
export function networkKey(purpose: string, ip: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', finderSecret(env) ?? env.CRON_SECRET ?? 'qurtag').update(`${purpose}:${ip}`).digest('hex');
}

function emailKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = finderSecret(env);
  if (!secret) throw new Error('no secret for finder emails');
  return Buffer.from(hkdfSync('sha256', secret, 'qurtag', 'finder-email v1', 32));
}

export interface FinderContact {
  email: string;
  token: string;
}

/** v1.<base64url of iv, ciphertext and tag>: what the database stores. */
export function sealContact(contact: FinderContact, env: NodeJS.ProcessEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', emailKey(env), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ e: contact.email, t: contact.token }), 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
}

export function openContact(sealed: string, env: NodeJS.ProcessEnv): FinderContact | null {
  try {
    if (!sealed.startsWith('v1.')) return null;
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', emailKey(env), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8');
    const v = JSON.parse(text) as { e?: unknown; t?: unknown };
    return typeof v.e === 'string' && typeof v.t === 'string' ? { email: v.e, token: v.t } : null;
  } catch {
    return null;
  }
}

/** The signature on a conversation's "Stop these emails" link. */
export function stopSignature(threadId: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', finderSecret(env) ?? 'qurtag').update(`finder-email-stop:${threadId}`).digest('base64url');
}

export function stopUrl(threadId: string, env: NodeJS.ProcessEnv): string {
  return `${siteUrl(env)}/api/fn/finder-email-stop?t=${threadId}&s=${stopSignature(threadId, env)}`;
}

export function signatureOk(threadId: string, given: string, env: NodeJS.ProcessEnv): boolean {
  const want = Buffer.from(stopSignature(threadId, env));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

