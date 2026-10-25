# QuR Tag

A free QR tag, so a kind stranger can message you. Live at https://www.qurtag.com.

An owner makes an account, adds things (a water bottle, a violin case, keys; up to two on the Free
plan) and prints a QR tag for each. Someone who finds the thing scans the tag with their phone camera:
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
| Schema, rules, functions for the Super Admin role | `db/admin.sql` | applied once as `postgres`, after the two above |
| Data API for signed-in owners (PostgREST-style) | `api/data`, `server/data/` | `qurtag_authenticator`, which can only become `qurtag_user` or `qurtag_anon` |
| Finder routes | `api/fn` (`finder-view`, `finder-send`), `server/routes/finder.ts` | `qurtag_server`: no table rights, only the `server_*` functions |
| Outbox and daily job | `api/jobs`, `server/routes/outbox.ts`, Vercel cron 05:00 UTC | `qurtag_server` |
| Memberships: checkout, portal, family invites, Stripe and RevenueCat webhooks | `api/fn`, `server/routes/billing.ts`, `server/billing/` | `qurtag_server`: only the `server_*` functions of `db/membership.sql` and `db/family.sql` |

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

### Super admin

`db/admin.sql` (rollout step 3) adds the Super Admin role. Who is one is stored in
`qurtag.super_admins`, written only by a rollout file run by the founder
(`4-make-admin.sql`), never by the app or any request. The admin screens are at `/app/admin`
(counts, accounts with search, an account's items and tags, switch a tag off, hide a
finder message, delete an account after typing its email) and appear only for a super
admin. Every `admin_*` function checks in the database, on every call, that the live
session belongs to a super admin, and writes the action to `qurtag.admin_audit` (who,
what, when; add-only) in the same step. Admins never see finder tokens, sign-in data or
private notes. Tested in `scripts/qurtag/e2e.test.mjs`.

### Settings (Vercel, project `qurtag`)

`QURTAG_DATABASE_URL`, `QURTAG_DATABASE_URL_DATA`, `QURTAG_DATABASE_URL_SERVER` (the three
logins on the transaction pooler), `QURTAG_DATABASE_CA_CERT`, `QURTAG_AUTH_SECRET`,
`QURTAG_AUTH_URL` (production: https://www.qurtag.com), `CRON_SECRET`. Values are kept in
`~/Claude/Backups/QurTag/secrets.env` on the founder's Mac. Email: `RESEND_API_KEY` (server side only) and
`QURTAG_EMAIL_FROM` (default `QuR Tag <no-reply@qurtag.com>`; the domain must be verified in
Resend). Replies go to info@impactconsulting.ai.

The rollout that creates the schema and logins in production is
`~/Claude/Rollouts/QurTag-rollout-schema` (its README lists the steps).

## Memberships (Free, Plus, Family)

| Plan | Items | People | Scan history | Price (US) |
| --- | --- | --- | --- | --- |
| Free | 2 | 1 | last 30 days | $0 |
| Plus | unlimited | 1 | all | $2.99 a month or $19 a year |
| Family | unlimited, shared | up to 5, invited by email | all | $4.99 a month or $39 a year |

The plans and prices are written once, in `server/billing/catalog.ts`, which the server and the screens
both import.

**One entitlement, two ways to pay.** The web pays through Stripe Checkout (with the customer portal to
change or cancel); the iPhone app pays through Apple's in-app purchase, with RevenueCat in between. Both
end up as rows in `qurtag.subscriptions`, written only by `qurtag.server_apply_subscription` after a
webhook passed its check. `qurtag.household_plan` turns the rows and the clock into `free`, `plus` or
`family`; a membership bought either way works on both, and if someone holds two, the better plan counts.
The app never decides a plan: the screens ask `my_membership`.

- Stripe webhook `POST /api/fn/stripe-webhook`: trusted only with a valid `Stripe-Signature` (HMAC-SHA256
  with `STRIPE_WEBHOOK_SECRET`, 5 minute tolerance, constant time). The plan comes from the price that was
  paid. Events: `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`.
- RevenueCat webhook `POST /api/fn/revenuecat-webhook`: trusted only with `Authorization` equal to
  `REVENUECAT_WEBHOOK_AUTH`. The account is RevenueCat's app user id, which the app sets to the QuR Tag
  account id. Products other than the four below are ignored.
- Idempotent: every delivery id is kept (`qurtag.billing_events`); a repeat changes nothing, and an event
  older than the one already applied to a subscription never overwrites it. A failed write answers 500 so
  the sender retries.
- The limit follows the plan: `create_item` allows 2 on Free and any number on Plus and Family.
  **Downgrading never deletes anything.** Past the limit the oldest items stay editable and the rest become
  read-only (`guard_item`, `guard_tag`): they can be read, printed and deleted, but not changed, marked
  lost or given a new tag. Finders can still scan their tags and write, and the owner can still reply.
  Upgrading, or deleting an item, makes the next oldest editable again.
- A membership counts until its period end (a cancelled one) or 2 days past it (an active one, for a late
  renewal webhook). The daily job marks lapsed ones expired.
- An account whose membership still renews cannot be deleted (the screen says to cancel first).

**Family** (`db/family.sql`): the owner invites up to 4 people from the Membership page. The invite is a
link (`/join/<token>`); the database keeps only the token's SHA-256. It works once, for the invited email
address only, and lasts 7 days. If email is not set up, the page shows the link to copy. A member joins the
owner's household, so the existing rules ("rows of a household I belong to") share items, tags, scans and
the inbox, and the finder's note email goes to everyone in the family. A member keeps their own account and
household, which the family never sees. The owner can remove members and a member can leave. When the plan
is no longer Family, members are paused (nothing is deleted) and return if it comes back.

**Settings** (Vercel, project `qurtag`, Production; none is set yet, and until they are the pricing page and
the Membership screen say "Coming soon"):

| Setting | What |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | the webhook endpoint's signing secret (`whsec_...`) |
| `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_FAMILY_MONTHLY`, `STRIPE_PRICE_FAMILY_YEARLY` | the four recurring prices (`price_...`) |
| `REVENUECAT_WEBHOOK_AUTH` | a long random string, also pasted into RevenueCat's webhook as the Authorization value |
| `VITE_REVENUECAT_IOS_API_KEY` | RevenueCat's public iOS SDK key (`appl_...`). Public. A build setting for the iPhone app (`.env.local` on the building Mac), not a Vercel one |

Optional: `QURTAG_BILLING_RATE_PER_ACCOUNT` (default 12 a minute) and `QURTAG_BILLING_RATE_PER_IP` (60).
`.env.example` lists them all.

**Stripe setup.** Make one product "QuR Tag Plus" with a monthly price of $2.99 and a yearly price of $19,
and one "QuR Tag Family" with $4.99 and $39 (all recurring, USD). Put the four price ids in the settings
above. Add a webhook endpoint `https://www.qurtag.com/api/fn/stripe-webhook` for the four events listed
above and put its signing secret in `STRIPE_WEBHOOK_SECRET`. In the customer portal settings allow
cancelling, changing the payment method and switching between the four prices.

**iPhone setup.** The four auto-renewable subscriptions are in the group "QuR Tag Membership" in App Store
Connect: `app.impactconsultingai.qurtag.plus.monthly`, `.plus.yearly`, `.family.monthly`, `.family.yearly`
(Family Sharing off). In RevenueCat: a project with the iOS app (bundle id `app.impactconsultingai.qurtag`,
connected to App Store Connect with an In-App Purchase key), the four products, one offering holding them,
and a webhook to `https://www.qurtag.com/api/fn/revenuecat-webhook` with the Authorization value from
`REVENUECAT_WEBHOOK_AUTH`. Then build the app with the public key (`VITE_REVENUECAT_IOS_API_KEY`) and
`npm run cap:sync`. The app signs RevenueCat in with the QuR Tag account id (`src/lib/iap.ts`). It shows
Apple's own prices, a Restore purchases button, and no way to pay outside Apple.

Database changes are the rollout files 5 (memberships) and 6 (family) in
`~/Claude/Rollouts/QurTag-rollout-schema` (copies of `db/membership.sql` and `db/family.sql`, each with an
undo). The schema comments in those two files explain every rule.

## Contact us (support)

A Contact us form in Help, and "Question about a charge?" on the Membership screen. It posts to
`/api/fn/support` (`server/routes/billing.ts`), which stores the message in `qurtag.support_requests`
(topic billing, account, finder or other; open or closed; `db/support.sql`, rollout step 7). Signed in, the
account, household and plan are attached by the database and the reply email is the account's; signed out, a
reply email is required. The form has no place for card details and says not to send them. Limits: 5
messages an hour per network address (`QURTAG_SUPPORT_RATE_PER_IP`), 5 an hour per account or email address
and 100 an hour in all (in the database), and a hidden honeypot field a robot fills. No table is reachable
by any request; only `server_support_create` writes and only the Super Admin functions read.

- Super Admin area (`/app/admin`): "Contact requests" lists open ones, oldest first, with Close; both are
  written to the admin log.
- `qurtag.factory_metrics` also returns `support_open`, `support_30d` and `support_oldest_open_days`, the
  names the Company OS support queue reads.
- With `RESEND_API_KEY` set, a notice goes to info@impactconsulting.ai with reply-to set to the sender.
  Without it the message is only stored.

## Features that are switched off

`src/lib/features.ts` hides code built for a bigger plan that cannot work yet: cash rewards,
courier labels, trips, partner drop-off points, insurance packets, wallet passes, location
sharing, web push, and block or report tools. Their tables are not in
schema `qurtag`. `VITE_QURTAG_LABS=1` shows them for local work only. The old Supabase
migrations and Edge Functions for them are kept in `supabase/` for reference; they are not
deployed.

## Working on it

```bash
npm install
npm run typecheck     # app, Vite config and server code
npm run test:unit     # the finder routes and the payment code, with stand-in databases and Stripe
npm run test:e2e      # the whole loop, memberships, webhooks and Family, on a throwaway local Postgres (needs Docker)
npm run build
```

To try the app by hand: `npm run dev:local` (a local database with the schema, plus the
server functions on 127.0.0.1:56861), then in another Terminal
`QURTAG_API_PROXY=http://127.0.0.1:56861 npm run dev` and open http://localhost:5173.

The logo (the "QuR" mark, the lockup with the tagline "Stick it on. Get it back.") is drawn once
in `scripts/brand/build-brand.mjs`; `npm run brand` writes the iPhone app icon and splash, the
favicons, the web app icons, `public/brand/*.svg`, the share image `public/og.png` and the paths the
`Wordmark` component draws (`src/components/brand/logoPaths.ts`).

Stack: React 18, TypeScript, Vite, Tailwind, React Router 7, Better Auth 1.7.7, pg,
postgrest-js. QR codes are drawn in the browser (`qrcode.react`); the tag page prints from
the browser, or saves as PDF from the print dialog. Colours are CSS variables (`src/index.css`)
with a dark set under `.dark`, so every page follows the theme without per-page dark rules.

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
- The item photo picker offers Take Photo and the photo library, so `Info.plist` carries
  `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`; iOS asks the first time either is
  used. The app requests no location or NFC permission. "Print tag" draws the tag
  (label and QR code) on the phone as a one-page PDF (`src/lib/tagPdf.ts`) and opens the iOS share
  sheet through `@capacitor/share` and `@capacitor/filesystem`, which offers Print, Save to Files and
  AirDrop. On the web it opens the browser's print dialog.
- Terms, Privacy and Help, opened inside the app, show a plain header with a Back button instead of
  the website's menu (`src/components/layout/MarketingLayout.tsx`).
- On a phone (the app, and the website under 768px wide) the signed-in screens use a bottom tab bar
  (Items, Inbox, Settings); wider screens use a sidebar (`src/components/layout/AppLayout.tsx`). Each
  screen has a title, and nested screens a Back button (`src/components/layout/AppPage.tsx`).
- The app follows the phone's light or dark setting, and Settings lets the owner pick Light, Auto or Dark.
- Version and build number are `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
  `ios/App/App.xcodeproj/project.pbxproj`.
