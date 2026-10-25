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
import { APIError } from 'better-auth/api';
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

export interface QurtagAuthOverrides {
  pool?: pg.Pool;
  sendMail?: MailSender;
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

    user: { modelName: 'auth_users' },
    session: { modelName: 'auth_sessions' },
    account: { modelName: 'auth_identities' },
    verification: { modelName: 'auth_verifications' },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: confirmEmail,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(signInMail('reset-password', user.email, url));
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
            data: { ...user, email: user.email.toLowerCase(), ...(confirmEmail ? {} : { emailVerified: true }) },
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

    plugins: [
      jwt(jwtOptions),
      // The iPhone app cannot hold the web site's cookie (its pages come from
      // capacitor://localhost); it sends the session token as Authorization: Bearer.
      bearer(),
    ],
  });
}

export type QurtagAuth = ReturnType<typeof createQurtagAuth>;
