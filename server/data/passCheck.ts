/**
 * Checks a QuR Tag pass (an ES256 JWT from QuR Tag's sign-in service, server/auth/)
 * for the data API and the server routes.
 *
 * A pass is accepted only when all of these hold:
 *   - the header says alg ES256 and names a key id (kid) that is one of the sign-in
 *     service's own public keys, and the signature verifies with that key;
 *   - aud is "qurtag" and app is "qurtag";
 *   - role is exactly "qurtag_user" (qurtag_anon is what a request with no pass
 *     runs as, so a pass never names it);
 *   - iss is the site's address;
 *   - it has not expired (30 seconds of clock difference allowed) and is not from the
 *     future (nbf, iat);
 *   - sub and sid are ids.
 * Anything else is refused before the database is touched. Whether the session behind
 * the pass is still live is checked by the database itself (qurtag.current_account(),
 * qurtag.server_who()), so signing out or a suspension ends access at once.
 *
 * Where the public keys come from: `loadKeys`, which reads them from the database
 * (qurtag.pass_public_keys(), public halves only), or QURTAG_PASS_JWKS when set.
 * Reading them from the database, not from the site's /api/auth/jwks, works the same on
 * a preview deployment behind Vercel's login wall. They are kept for ten minutes and
 * read again (at most every 30 seconds) when a pass names a key id not seen yet, so a
 * new signing key works without a redeploy.
 *
 * Verification uses Node's own crypto; no JWT library is involved.
 */
import crypto from 'node:crypto';
import { PASS_APP, PASS_AUDIENCE, USER_ROLE } from '../auth/origins.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
const MAX_PASS_LENGTH = 4096;
const LEEWAY_SECONDS = 30;
const KEYS_FRESH_MS = 10 * 60_000;
const REFETCH_GAP_MS = 30_000;

export interface PassClaims {
  sub: string;
  sid: string;
  role: typeof USER_ROLE;
  app: string;
  aud: string | string[];
  exp: number;
  [k: string]: unknown;
}

export type PassResult = { ok: true; claims: PassClaims } | { ok: false; reason: string };

interface PublicJwk {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
}

export interface PassCheckOptions {
  /** The JSON of a key set ({"keys":[...]}) or one key; takes precedence over loadKeys. */
  jwks?: string;
  /** Reads the current public keys (a key set, or a list of keys). */
  loadKeys?: () => Promise<unknown>;
  /** The expected iss. */
  issuer: string;
  now?: () => number;
}

export function toKeyMap(set: unknown): Map<string, crypto.KeyObject> {
  const list: PublicJwk[] = Array.isArray(set)
    ? (set as PublicJwk[])
    : set && typeof set === 'object' && Array.isArray((set as { keys?: unknown }).keys)
      ? ((set as { keys: PublicJwk[] }).keys)
      : set && typeof set === 'object'
        ? [set as PublicJwk]
        : [];
  const out = new Map<string, crypto.KeyObject>();
  for (const k of list) {
    if (!k || k.kty !== 'EC' || k.crv !== 'P-256' || !k.x || !k.y || !k.kid) continue;
    if (k.alg && k.alg !== 'ES256') continue;
    // Only the public half is ever used, even if a private key was pasted by mistake.
    out.set(k.kid, crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, format: 'jwk' }));
  }
  return out;
}

function decodePart(part: string): Record<string, unknown> | null {
  if (!B64URL.test(part)) return null;
  try {
    const v = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createPassCheck(opts: PassCheckOptions) {
  const now = opts.now ?? (() => Date.now());
  const fixed = opts.jwks ? toKeyMap(JSON.parse(opts.jwks)) : null;
  if (fixed && fixed.size === 0) throw new Error('QURTAG_PASS_JWKS holds no ES256 public key');
  if (!fixed && !opts.loadKeys) throw new Error('The pass check needs QURTAG_PASS_JWKS or a key loader');

  let keys = fixed ?? new Map<string, crypto.KeyObject>();
  let fetchedAt = 0;
  let lastTry = 0;
  let inFlight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    if (fixed) return;
    if (now() - lastTry < REFETCH_GAP_MS && fetchedAt) return;
    inFlight ??= (async () => {
      lastTry = now();
      try {
        const next = toKeyMap(await opts.loadKeys!());
        if (next.size) {
          keys = next;
          fetchedAt = now();
        }
      } catch {
        // Keep the keys we have; a pass with an unknown key is refused.
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  }

  async function keyFor(kid: string): Promise<crypto.KeyObject | undefined> {
    if (!fixed && (now() - fetchedAt > KEYS_FRESH_MS || !keys.has(kid))) await refresh();
    return keys.get(kid);
  }

  return async function checkPass(token: string): Promise<PassResult> {
    if (token.length > MAX_PASS_LENGTH) return { ok: false, reason: 'too long' };
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every((p) => B64URL.test(p))) return { ok: false, reason: 'not a pass' };
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (!header || !claims) return { ok: false, reason: 'not a pass' };
    if (header.alg !== 'ES256' || typeof header.kid !== 'string' || header.crit !== undefined) {
      return { ok: false, reason: 'wrong algorithm or no key id' };
    }
    const key = await keyFor(header.kid);
    if (!key) return { ok: false, reason: 'unknown key' };
    const signature = Buffer.from(parts[2], 'base64url');
    if (signature.length !== 64) return { ok: false, reason: 'bad signature' };
    const signed = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, signature);
    if (!signed) return { ok: false, reason: 'bad signature' };

    const t = Math.floor(now() / 1000);
    const aud = claims.aud;
    if (!(aud === PASS_AUDIENCE || (Array.isArray(aud) && aud.includes(PASS_AUDIENCE)))) return { ok: false, reason: 'wrong audience' };
    if (claims.iss !== opts.issuer) return { ok: false, reason: 'wrong issuer' };
    if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_SECONDS < t) return { ok: false, reason: 'expired' };
    if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY_SECONDS > t) return { ok: false, reason: 'not yet valid' };
    if (typeof claims.iat === 'number' && claims.iat - LEEWAY_SECONDS > t) return { ok: false, reason: 'issued in the future' };
    if (claims.app !== PASS_APP) return { ok: false, reason: 'wrong app' };
    if (claims.role !== USER_ROLE) return { ok: false, reason: 'wrong role' };
    if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)) return { ok: false, reason: 'bad subject' };
    if (typeof claims.sid !== 'string' || !UUID.test(claims.sid)) return { ok: false, reason: 'bad session' };
    return { ok: true, claims: claims as PassClaims };
  };
}
