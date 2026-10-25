/**
 * QuR Tag's own sign-in service, built on Better Auth.
 *
 * Why QuR Tag has its own accounts instead of Supabase Auth: QuR Tag lives as one schema
 * (`qurtag`) inside the database the company shares between its apps. Supabase Auth
 * keeps one user table (auth.users) for the whole project, so QuR Tag's people would be
 * mixed with every other app's, and a pass from one app could be read as a pass for
 * another. Here everything about a QuR Tag account lives in schema `qurtag`
 * (db/qurtag.sql):
 *
 *   qurtag.auth_users, auth_sessions, auth_identities, auth_verifications, auth_jwks,
 *   auth_rate_limits
 *       Only the login `qurtag_auth` (the login this service uses) can touch them.
 *   qurtag.households, household_members
 *       Made by the database when the account is made.
 *
 * Owners sign up and in with email and password. Finders never have an account. When
 * email can be sent (mailConfigured: RESEND_API_KEY is set), a new account must confirm
 * its email before it can sign in, and the confirmation link signs it in. Until then
 * accounts are confirmed at once, because no confirmation could reach them. Password
 * reset sends a link that works once, for one hour, and ends every other session.
 *
 * The data API (api/data) trusts a short-lived pass (an ES256 JWT) this service signs
 * with the key in qurtag.auth_jwks:
 *   sub = the account id   sid = the session id   role = "qurtag_user"
 *   app = "qurtag"         aud = "qurtag"         iss = the site's address
 * The database checks the session behind a pass on every request, so signing out ends
 * data access at once.
 */
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { createHash } from 'node:crypto';
import { bearer } from 'better-auth/plugins/bearer';
import { jwt } from 'better-auth/plugins/jwt';
import { PostgresDialect } from 'kysely';
import pg from 'pg';
import { mailConfigured, senderFromEnv, signInMail, type MailSender } from './mailer.js';
import { PASS_APP, PASS_AUDIENCE, USER_ROLE, siteUrl, trustedOrigins } from './origins.js';

/** How long a pass lives. Short, because it cannot be recalled once issued. */
export const PASS_LIFETIME = '10m';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** A sign-up channel as the database accepts it (lowercase letters, digits, "-" and "_", 32 at most), else null. */
export function cleanSignupChannel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(s) ? s : null;
}

export interface QurtagAuthOverrides {
  pool?: pg.Pool;
  sendMail?: MailSender;
}

export const RESET_MESSAGE = 'If an account exists, we have sent a link.';
export const RESET_UNAVAILABLE = "We couldn't send the email right now, please try again later.";
const RESET_PER_EMAIL = 3;
const RESET_WINDOW_MS = 3_600_000;

/** Counts one reset request for an email address (kept as a hash) in the rate-limit table. */
async function takeResetSlot(pool: pg.Pool, email: string): Promise<boolean> {
  const key = 'reset-email:' + createHash('sha256').update(email).digest('hex');
  const now = Date.now();
  const { rows } = await pool.query<{ count: number }>(
    `insert into qurtag.auth_rate_limits ("key", "count", "lastRequest") values ($1, 1, $2)
     on conflict ("key") do update set
       "count" = case when qurtag.auth_rate_limits."lastRequest" < $2 - $3 then 1 else qurtag.auth_rate_limits."count" + 1 end,
       "lastRequest" = case when qurtag.auth_rate_limits."lastRequest" < $2 - $3 then $2 else qurtag.auth_rate_limits."lastRequest" end
     returning "count"`,
    [key, now, RESET_WINDOW_MS],
  );
  return rows[0].count <= RESET_PER_EMAIL;
}

export async function accountOk(pool: pg.Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>('select qurtag.auth_account_ok($1) as ok', [userId]);
  return rows[0]?.ok === true;
}

export function createQurtagAuth(env: NodeJS.ProcessEnv = process.env, overrides: QurtagAuthOverrides = {}) {
  const baseURL = siteUrl(env);
  const pool =
    overrides.pool ??
    new pg.Pool({
      connectionString: required(env, 'QURTAG_DATABASE_URL'),
      // Serverless: keep the pool small; each function instance holds its own.
      max: Number(env.QURTAG_DATABASE_POOL_MAX ?? 3),
      ...(env.QURTAG_DATABASE_CA_CERT ? { ssl: { ca: env.QURTAG_DATABASE_CA_CERT, rejectUnauthorized: true } } : {}),
    });
  pool.on('error', () => {});
  const sendMail = overrides.sendMail ?? senderFromEnv(env);
  const confirmEmail = mailConfigured(env);

  const jwtOptions = {
    jwks: { keyPairConfig: { alg: 'ES256' as const } },
    jwt: {
      issuer: baseURL,
      audience: PASS_AUDIENCE,
      expirationTime: PASS_LIFETIME,
      // Only what the database needs: no email or name.
      definePayload: async ({ session }: { session: { id: string; userId: string } }) => {
        if (!(await accountOk(pool, session.userId))) {
          throw new APIError('FORBIDDEN', { code: 'NO_ACCESS', message: 'This account is not active.' });
        }
        return { role: USER_ROLE, app: PASS_APP, sid: session.id };
      },
    },
    // A pass is handed out only by /token, never as a side effect of reading the session.
    disableSettingJwtHeader: true,
    schema: { jwks: { modelName: 'auth_jwks' } },
  };

  return betterAuth({
    appName: 'QuR Tag',
    baseURL,
    basePath: '/api/auth',
    secret: required(env, 'QURTAG_AUTH_SECRET'),
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      // Every statement names qurtag."auth_users" etc., so the connection's
      // search_path never matters (transaction poolers drop it anyway).
      schemaName: 'qurtag',
    },
    trustedOrigins: trustedOrigins(env),

    user: {
      modelName: 'auth_users',
      // The channel a person came from (db/measures.sql), sent once at sign-up. Never returned to a browser.
      additionalFields: { signup_channel: { type: 'string', required: false, input: true, returned: false } },
    },
    session: { modelName: 'auth_sessions' },
    account: { modelName: 'auth_identities' },
    verification: { modelName: 'auth_verifications' },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: confirmEmail,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      // Sent inside the request, so the email leaves at once (no outbox, no cron). A send
      // that fails is logged by kind and domain only and answered like a success: an
      // error here would exist only for real accounts and so reveal them.
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendMail(signInMail('reset-password', user.email, url));
        } catch (e) {
          console.error('reset-password email failed:', (e as Error).message, `(to a ${user.email.split('@')[1]} address)`);
        }
      },
    },
    emailVerification: {
      sendOnSignUp: confirmEmail,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(signInMail('verify-email', user.email, url));
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              email: user.email.toLowerCase(),
              ...(confirmEmail ? {} : { emailVerified: true }),
              // Only a short lowercase label is kept; anything else is dropped, and the sign-up goes on.
              signup_channel: cleanSignupChannel((user as { signup_channel?: unknown }).signup_channel),
            },
          }),
        },
      },
    },

    rateLimit: {
      enabled: true,
      // Serverless instances share nothing in memory, so counts live in the database.
      storage: 'database',
      modelName: 'auth_rate_limits',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },

    advanced: {
      cookiePrefix: 'qurtag',
      useSecureCookies: baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      // Vercel sets x-real-ip and x-forwarded-for itself and drops any value the client sent.
      ipAddress: { ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'] },
      database: { generateId: 'uuid' },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/request-password-reset') return;
        // No email service: say so to everyone alike, so this never depends on the account.
        if (!mailConfigured(env)) {
          console.error('reset-password requested but email is not set up (RESEND_API_KEY)');
          throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_NOT_AVAILABLE', message: RESET_UNAVAILABLE });
        }
        // Per email address: 3 requests an hour (per IP is the customRule above). Over the
        // limit the answer is the usual success and nothing is sent.
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
        if (email && !(await takeResetSlot(pool, email))) {
          return ctx.json({ status: true, message: RESET_MESSAGE });
        }
      }),
    },

    plugins: [
      jwt(jwtOptions),
      // The iPhone app cannot hold the web site's cookie (its pages come from
      // capacitor://localhost); it sends the session token as Authorization: Bearer.
      bearer(),
    ],
  });
}

export type QurtagAuth = ReturnType<typeof createQurtagAuth>;
