#!/usr/bin/env node
/**
 * Applies db/logins.sql to a database with the three login passwords sent as
 * SCRAM-SHA-256 verifiers (so no password reaches the server or its logs) and the
 * Factory's metrics token as its SHA-256. Used by the local test (run-local.sh). The
 * production rollout does the same through its own send.py.
 *
 *   ADMIN=<postgres connection> AUTH_PW=... DATA_PW=... SERVER_PW=... FACTORY_TOKEN=... \
 *     node scripts/qurtag/apply-logins.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802 / 7677). */
export function scramVerifier(password, iterations = 4096) {
  const salt = crypto.randomBytes(16);
  const salted = crypto.pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
  const storedKey = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  const b64 = (b) => b.toString('base64');
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

const client = new pg.Client({ connectionString: process.env.ADMIN });
await client.connect();
try {
  await client.query('begin');
  const set = (name, value) => client.query('select set_config($1, $2, true)', [name, value]);
  if (process.env.AUTH_PW) await set('qurtag.auth_password', scramVerifier(process.env.AUTH_PW));
  if (process.env.DATA_PW) await set('qurtag.authenticator_password', scramVerifier(process.env.DATA_PW));
  if (process.env.SERVER_PW) await set('qurtag.server_password', scramVerifier(process.env.SERVER_PW));
  if (process.env.FACTORY_TOKEN) {
    await set('qurtag.factory_token_sha256', crypto.createHash('sha256').update(process.env.FACTORY_TOKEN, 'utf8').digest('hex'));
  }
  await client.query(fs.readFileSync(path.join(root, 'db/logins.sql'), 'utf8'));
  await client.query('commit');
} catch (e) {
  await client.query('rollback').catch(() => {});
  throw e;
} finally {
  await client.end();
}
