# QuR Tag

A free QR tag, so a kind stranger can message you. Live at https://www.qurtag.com.

An owner makes an account, adds up to two things (a water bottle, a violin case, keys) and
prints a QR tag for each. Someone who finds the thing scans the tag with their phone camera:
a page opens with no app and no account, shows a finder-safe card for the item, and lets
them send a note. The owner reads it in the inbox at /app and replies; the finder reads the
reply on the same tag page. Neither side sees the other's email or phone number.

The landing page is at `/`, the app at `/app`, a tag's page at `/find/<tag code>`.

Run by Impact Consulting AI LLC, a Florida limited liability company. Contact:
info@impactconsulting.ai.

## Backend

QuR Tag lives in its own schema, `qurtag`, inside the company's shared Supabase project
(ImpactConsulting, ref nqpumwrtiukrwmhvarst), the same way Apero lives in `tentables`. It
never uses Supabase Auth (`auth.users`), Supabase Storage, the `public` schema or the
project's own data API.

| Part | Where | Database login |
| --- | --- | --- |
| Schema, rules, functions | `db/qurtag.sql` | applied once as `postgres` |
| Logins and their passwords | `db/logins.sql` | applied once as `postgres` |
| Sign-in (Better Auth, email and password) | `api/auth`, `server/auth/qurtagAuth.ts` | `qurtag_auth`: the `auth_*` tables only |
| Data API for signed-in owners (PostgREST-style) | `api/data`, `server/data/` | `qurtag_authenticator`, which can only become `qurtag_user` or `qurtag_anon` |
| Finder routes | `api/fn` (`finder-view`, `finder-send`), `server/routes/finder.ts` | `qurtag_server`: no table rights, only the `server_*` functions |
| Outbox and daily job | `api/jobs`, `server/routes/outbox.ts`, Vercel cron 05:00 UTC | `qurtag_server` |

Privacy by structure: a finder never reaches a table. The finder routes call
`qurtag.server_finder_view`, `server_finder_open` and `server_finder_post`, which return only
the item's name, photo, the owner's note for the finder and the lost flag, plus the finder's
own conversation when the browser holds its secret token. The database keeps only the
token's SHA-256. No policy in the schema is open to a visitor without a pass.

Email goes through Resend, called from the server. Password reset ("Forgot password?" at
`/forgot-password`, the link opens `/reset-password`) sends its email inside the request, not
through the outbox. The link works once and expires in 1 hour; a reset ends every session of
the account. Requests are limited to 3 per 5 minutes per IP address and 3 per hour per email
address, and the answer is the same whether or not the account exists. Until `RESEND_API_KEY`
is set, new accounts are confirmed at once, the forgot-password page says "We couldn't send
the email right now, please try again later", and owners read notes in the inbox (the outbox
finishes its rows unsent).

### Settings (Vercel, project `qurtag`)

`QURTAG_DATABASE_URL`, `QURTAG_DATABASE_URL_DATA`, `QURTAG_DATABASE_URL_SERVER` (the three
logins on the transaction pooler), `QURTAG_DATABASE_CA_CERT`, `QURTAG_AUTH_SECRET`,
`QURTAG_AUTH_URL` (production: https://www.qurtag.com), `CRON_SECRET`. Values are kept in
`~/Claude/Backups/QurTag/secrets.env` on the founder's Mac. Email: `RESEND_API_KEY` (server side only) and
`QURTAG_EMAIL_FROM` (default `QuR Tag <no-reply@qurtag.com>`; the domain must be verified in
Resend). Replies go to info@impactconsulting.ai.

The rollout that creates the schema and logins in production is
`~/Claude/Rollouts/QurTag-rollout-schema` (its README lists the steps).

## Features that are switched off

`src/lib/features.ts` hides code built for a bigger plan that cannot work yet: cash rewards,
courier labels, trips, partner drop-off points, insurance packets, wallet passes, location
sharing, web push, household sharing, and block or report tools. Their tables are not in
schema `qurtag`. `VITE_QURTAG_LABS=1` shows them for local work only. The old Supabase
migrations and Edge Functions for them are kept in `supabase/` for reference; they are not
deployed.

## Working on it

```bash
npm install
npm run typecheck     # app, Vite config and server code
npm run test:unit     # the finder routes, with a stand-in database
npm run test:e2e      # the whole loop on a throwaway local Postgres (needs Docker)
npm run build
```

To try the app by hand: `npm run dev:local` (a local database with the schema, plus the
server functions on 127.0.0.1:56861), then in another Terminal
`QURTAG_API_PROXY=http://127.0.0.1:56861 npm run dev` and open http://localhost:5173.

Stack: React 18, TypeScript, Vite, Tailwind, React Router 7, Better Auth 1.7.7, pg,
postgrest-js. QR codes are drawn in the browser (`qrcode.react`); the tag page prints from
the browser, or saves as PDF from the print dialog.

## iPhone app

The iPhone app (bundle id `app.impactconsultingai.qurtag`) is this web app in a Capacitor
shell (`capacitor.config.ts`, `ios/`). The old Expo stub in `mobile/` is not used.

- `npm run cap:sync` builds the web app and copies it into `ios/`; `npm run cap:ios` also opens Xcode.
- The app loads its pages from `capacitor://localhost`, so it calls the live site by full
  address (`src/lib/platform.ts`). The server answers that origin with CORS including
  credentials (`server/auth/phoneCors.ts`, the data API) and Better Auth trusts it
  (`server/auth/origins.ts`). The session is a bearer token kept on the phone (Better Auth's
  `bearer` plugin), never a cookie across origins.
- The app opens to `/app`. Links to other sites open in Safari's sheet, which has a Done button back to the app.
- The app requests no camera, location, NFC or photo-library permission. Printing a tag opens
  the print page in Safari, because the app's own page cannot print.
- Version and build number are `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
  `ios/App/App.xcodeproj/project.pbxproj`.
