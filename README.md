# QuR Tag

A free QR tag, so a kind stranger can message you. Live at https://www.qurtag.com.

An owner makes an account, adds things (a water bottle, a violin case, keys; up to three on the Free
plan) and prints a QR tag for each. Someone who finds the thing scans the tag with their phone camera:
a page opens with no app and no account, shows a finder-safe card for the item, and lets
them send a note. The owner reads it in the inbox at /app and replies; the finder reads the
reply on the same tag page. Neither side sees the other's email or phone number.

The landing page is at `/`, the app at `/app`, a tag's page at `/find/<tag code>`, and a tag's short address at
`/<short code>` (for example qurtag.com/k7m2p), which sends the visitor to the same page.

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
| Outbox and scheduled jobs | `api/jobs`, `server/routes/outbox.ts`, Vercel cron every 5 minutes (outbox) and daily at 05:00 UTC | `qurtag_server` |
| Memberships: checkout, portal, family invites, Stripe and RevenueCat webhooks | `api/fn`, `server/routes/billing.ts`, `server/billing/` | `qurtag_server`: only the `server_*` functions of `db/membership.sql` and `db/family.sql` |
| iPhone alerts: register a phone, reply from a notification, send to Apple | `api/fn` (`push-register`, `push-unregister`, `push-reply`), `server/routes/push.ts`, `server/push/apns.ts`, the outbox | `qurtag_server`: only the `server_*` functions of `db/push.sql` |

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
(counts, reported notes, accounts with search, an account's items and tags, switch a tag off, hide a
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
| Free | 3 | 1 | last 30 days | $0 |
| Plus | unlimited | 1 | all | $19 a year |
| Family | unlimited, shared | up to 5, invited by email | all | $29 a year |

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
  account id. Products other than the two yearly ones below are ignored.
- Idempotent: every delivery id is kept (`qurtag.billing_events`); a repeat changes nothing, and an event
  older than the one already applied to a subscription never overwrites it. A failed write answers 500 so
  the sender retries.
- The limit follows the plan: `create_item` allows 3 on Free and any number on Plus and Family.
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
| `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_FAMILY_YEARLY` | the two yearly recurring prices (`price_...`) |
| `REVENUECAT_WEBHOOK_AUTH` | a long random string, also pasted into RevenueCat's webhook as the Authorization value |
| `VITE_REVENUECAT_IOS_API_KEY` | RevenueCat's public iOS SDK key (`appl_...`). Public. A build setting for the iPhone app (`.env.local` on the building Mac), not a Vercel one |

Optional: `QURTAG_BILLING_RATE_PER_ACCOUNT` (default 12 a minute) and `QURTAG_BILLING_RATE_PER_IP` (60).
`.env.example` lists them all.

**Stripe setup.** Make one product "QuR Tag Plus" with a yearly price of $19,
and one "QuR Tag Family" with a yearly price of $29 (both recurring, USD). Put the two price ids in the settings
above. Add a webhook endpoint `https://www.qurtag.com/api/fn/stripe-webhook` for the four events listed
above and put its signing secret in `STRIPE_WEBHOOK_SECRET`. In the customer portal settings allow
cancelling, changing the payment method and switching between the two prices.

**iPhone setup.** The two auto-renewable subscriptions are in the group "QuR Tag Membership" in App Store
Connect: `app.impactconsultingai.qurtag.plus.yearly` and `.family.yearly`
(Family Sharing off). In RevenueCat: a project with the iOS app (bundle id `app.impactconsultingai.qurtag`,
connected to App Store Connect with an In-App Purchase key), the two products, one offering holding them,
and a webhook to `https://www.qurtag.com/api/fn/revenuecat-webhook` with the Authorization value from
`REVENUECAT_WEBHOOK_AUTH`. Then build the app with the public key (`VITE_REVENUECAT_IOS_API_KEY`) and
`npm run cap:sync`. The app signs RevenueCat in with the QuR Tag account id (`src/lib/iap.ts`). It shows
Apple's own prices, a Restore purchases button, and no way to pay outside Apple.
Until the key is set in the build and RevenueCat returns offerings, the app hides every membership screen, row, prompt and
pricing link (`membershipsAvailableInApp()` in `src/lib/iap.ts`, the rule in `src/lib/membership-flag.ts`); the website is
unchanged, and `/join/<token>` still works.

Database changes are the rollout files 5 (memberships), 6 (family) and 11 (Free allows 3 items; it changes only `household_item_limit`, which `db/membership.sql` already holds with 3) in
`~/Claude/Rollouts/QurTag-rollout-schema` (copies of `db/membership.sql` and `db/family.sql`, each with an
undo). The schema comments in those two files explain every rule.

## iPhone push notifications

The iPhone app can alert the owner the moment a finder writes, and the owner can reply from the alert.
Alerts go straight from the server to Apple's push service (APNs) over HTTP/2, signed with a token made
from the company's `.p8` key. There is no Firebase and no push vendor.

| Alert | When | Default |
| --- | --- | --- |
| "Someone found your <item>" | a finder sends the first note of a conversation | on |
| "New note about your <item>" | each later note | on |
| "Your tag was scanned" | the tag page was opened and no note followed within 2 minutes; at most one an hour for each tag and person | off |

- **Time-sensitive** (breaks through a Focus) for the first two only. The iPhone app has the Push Notifications
  and Time Sensitive Notifications capabilities (`ios/App/App/App.entitlements`).
- **Reply** is a text-input action on the found and new-message categories. It is handled in the app's native
  code (`ios/App/App/QurTagNotifications.swift`), so it works with the app in the background or closed: it reads
  the session token the page kept in the iPhone Keychain (`src/lib/nativeSession.ts`), asks `/api/auth/token`
  for a short-lived pass, and posts to `/api/fn/push-reply`. A reply that cannot be sent is announced in a
  notification, never lost silently.
- **Badge**: the number of unread finder notes (across the households the person can read) is sent with each
  alert, set again whenever the app counts its inbox, and returned by `push-reply`.
- **Family**: every person who can read the household's inbox is alerted, each by their own settings and on
  their own phones. A member who leaves or is removed stops being alerted.
- **Settings** (Settings, then Notifications, in the app): found, new messages, tag scanned, "Hide note text
  on the lock screen" and the email copy. Stored per person in `qurtag.push_settings`. With the text hidden the
  alert says only "You have a new note": no note, no item name.
- **Email copy** (needs `RESEND_API_KEY`): a person with a phone who was sent an alert and has not read the note
  10 minutes later gets one email per conversation, through the existing Resend path. Opening the alert opens
  the conversation, which marks it read. Switch it off in Settings. A person with no phone registered is
  emailed at once, as before; a person whose phone Apple refused is emailed at once too.
- **What a push carries**: the lock screen text, the conversation id (so a tap opens it and Reply knows where
  to post), the badge, and the category. Never a finder's token, name, email or address.
- **Device tokens** are in `qurtag.push_devices` (account, token, sandbox or production, first and last seen).
  No role the app uses can read the table and no route returns a token. A token goes when the person signs out,
  deletes the account, registers it on another account, or Apple answers 410 or 400 BadDeviceToken for it.
- **How it runs**: a finder note queues work in the outbox; the finder route nudges `/api/jobs/outbox` at once,
  and Vercel Cron runs it every 5 minutes (the email copy is due 10 minutes after a note, a scan alert 2 minutes
  after the scan) plus the daily 05:00 UTC run. The finder's request never waits for Apple. A failed try is
  repeated with the outbox's backoff and never alerts anyone twice (`qurtag.note_alerts`, and the note's id as
  Apple's collapse id).

Database changes are rollout step 8 in `~/Claude/Rollouts/QurTag-rollout-schema` (`8-push.sql`, a copy of
`db/push.sql` with a migration record, and `undo-8-push.sql`); it needs steps 5 and 6. Run it before merging the
pull request that adds push.

**Settings** (Vercel, project `qurtag`, Production). With the first three missing, sending is a no-op that logs
once, and everything else works (people are emailed at once, as before):

| Setting | What |
| --- | --- |
| `APNS_KEY_ID` | the key's 10-character id (shown in Apple's key list, and in the file name `AuthKey_<id>.p8`) |
| `APNS_TEAM_ID` | the Apple team id, `CQUVU6BHHA` |
| `APNS_KEY_P8` | the whole contents of the `.p8` file, including the BEGIN and END lines |
| `APNS_BUNDLE_ID` | optional; default `app.impactconsultingai.qurtag` |
| `APNS_ENV` | optional; `production` (default; TestFlight and App Store builds) or `sandbox` (builds run from Xcode). A phone registers for the Apple server its build uses and a deployment sends only to phones of its own kind |

`QURTAG_PUSH_RATE_PER_ACCOUNT` (default 30 a minute) and `QURTAG_PUSH_RATE_PER_IP` (120) limit the push routes.
`QURTAG_APNS_URL` replaces Apple's address and exists for the local tests only.

**Apple setup.** One APNs Auth Key (Apple Developer, Certificates, Identifiers & Profiles, Keys) serves every
app of the team, so the company's existing key can be reused. The App ID `app.impactconsultingai.qurtag` needs
the Push Notifications and Time Sensitive Notifications capabilities (Xcode's automatic signing turns them on
from `App.entitlements`). `aps-environment` in the entitlements file stays `development`; Xcode makes it
`production` when it signs a TestFlight or App Store build.

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

## Moderation of finders' notes (App Store guideline 1.2)

A finder is an anonymous stranger who writes to an owner, so the app has the four things Apple asks for.
Database half: `db/moderation.sql` (rollout step 9, needs steps 3, 7 and 8). Server half: `server/moderation/`.

| Need | What it is | Where |
| --- | --- | --- |
| Filter | Every note is checked in the finder route before it reaches the database. A slur or a threat (a small hand-kept list in `server/moderation/wordlist.ts`, no outside service) is accepted and **held**: the finder sees the normal confirmation, the owner sees "This note may be offensive. Show it?" with Show it and Report, and the text reaches the owner's phone only after Show it (the owner's read policy leaves held notes out; alerts for a held note carry no text). A note that is only links, or has more than 2, is refused with a plain sentence. Limits in the database: 5 notes a minute and 30 an hour per conversation, 60 an hour per tag, 20 new conversations per tag a day, plus the route's 12 notes a minute per network address. An identical note within 10 minutes is accepted but stored once | `server/moderation/filter.ts`, `server/routes/finder.ts`, `qurtag.server_finder_open` and `server_finder_post` |
| Report | Under each finder note in a conversation: Report, with a reason (harassment, spam, threats, inappropriate, other) and an optional comment. The note is hidden from the owner at once and goes to `qurtag.message_reports`. After a report the app offers to block the finder | `src/routes/app/InboxThread.tsx`, `qurtag.report_message` |
| Respond within 24 hours | Super Admin area (`/app/admin`), "Reported notes": open reports oldest first, with the note's text, the reason, the owner's comment and the item. Actions: **Hide for everyone**, **Dismiss**, **Block finder**. Each closes the report and is written to the admin log (`hide_message`, `dismiss_report`, `block_finder`) in the same step | `src/routes/app/Admin.tsx`, `qurtag.admin_reports_list`, `admin_report_resolve` |
| Block | "Block this finder" on a conversation. The finder's conversation token can no longer write (a trigger on `messages` refuses it, whichever function inserts), the conversation and its notes leave the owner's inbox, and the finder gets only "This conversation is closed." Owners see and unblock blocked finders in Settings, under Blocked finders; a finder a Super Admin blocked cannot be unblocked by the owner. A block is per conversation token: a finder who clears their browser can start a new conversation, which the limits above still cover | `src/components/moderation/BlockedFinders.tsx`, `qurtag.block_finder`, `unblock_finder`, `my_blocked_finders` |
| Published contact | /terms section 9 (zero tolerance, how to report and block, reports reviewed within 24 hours), the Help answer "Report or block a finder", and a "Report a problem with this page" link on the finder's page. Contact stays info@impactconsulting.ai | `src/routes/marketing/Terms.tsx`, `Help.tsx`, `src/routes/finder/FinderView.tsx` |

- The Company OS counts: `qurtag.factory_metrics` returns `reports_open`, `reports_30d` and
  `reports_oldest_open_days`, and **also adds open reports to `support_open`, `support_30d` and
  `support_oldest_open_days`**, because those three names are all the Factory's support-ticket reader knows.
  A report is an item that must be answered within 24 hours, so it belongs in that queue.
- Alerts to the founder (`db/admin-alerts.sql`, rollout step 9b, needs step 9): each new report, and each note the filter holds, queues one `admin_alert` outbox row
  (`server/routes/outbox.ts`). Every super admin with "Admin alerts" on (Settings, shown to super admins only,
  on by default; `push_settings.admin_on`) gets an iPhone push, category `QURTAG_ADMIN`, time-sensitive: "New
  report on QuR Tag. Review it in Admin." (or "N new reports on QuR Tag"), never any note text; a tap opens
  `/app/admin#reported-notes`. With `RESEND_API_KEY` set, a plain email with a link to /app/admin goes to
  info@impactconsulting.ai; without it, no email. At most one alert per 10 minutes (`admin_alert_state`):
  rows queued inside the window wait for it to end and the next alert says how many are waiting, so none is
  dropped; a failed send puts the window back and is retried. Tested in `scripts/qurtag/push.test.mjs`.
- A held note counts as unread for the owner and in the app icon badge, but its text is not in the inbox
  preview or any notification.
- Tested in `scripts/qurtag/moderation.test.mjs` (database and routes) and `scripts/qurtag/unit/moderation.test.ts`
  (the filter). To change the word list, edit `server/moderation/wordlist.ts` only.

## Tag styles, short codes and print-ready files

**Styles** (tag page, `src/routes/app/TagPrint.tsx`): six styles, each in three looks (Clean, Bold, Playful), on US
Letter or A4 with several copies a page.

| Style | One piece | Copies on Letter / A4 | Notes |
| --- | --- | --- | --- |
| Small sticker | 1.25 x 1.25 in | 35 / 35 | cut marks; bold "LOST? SCAN ME" line above the code (1 in leaves no room for a line a person can read) |
| Label strip | 2.625 x 1 in | 30 / 18 | on Letter the standard 30 per sheet address label sheet (3 across, 10 down), no marks |
| Key fob insert | 1 x 1.4 in, two sides | 18 / 18 | front "IF FOUND, SCAN ME" and QR, back short code and address; fold line; the back is printed upside down so it reads upright once folded |
| Wallet card | 3.375 x 2.125 in | 8 / 8 | cut marks |
| Bag tag | 2.4 x 3.5 in folded | 3 / 3 | "If found" large; fold line |
| Clothing strip | 2.5 x 1 in | 16 / 18 | "IF FOUND, SCAN ME" in large capitals; iron-on transfer paper; "Print mirrored" flips the whole page |

Every style has a thin orange QuR Tag frame (with a black keyline on the yellow Playful plate). Heavy lines are set in
Helvetica-Bold; the PDF names that face, but `pdftoppm` without a Helvetica Bold substitute draws it regular, so check
weight in the SVG previews or a Quartz/Chrome render.

The sizes, grids and the QR rules are in `src/lib/tagLayout.ts`. The QR code is always error correction level H,
printed at least 0.75 in (`MIN_QR_IN`; `qrSize` throws below it) with a quiet zone of at least 2 modules, black on white
in every look. A tag is a list of shapes (`src/lib/tagScene.ts`) drawn as SVG (the preview and the PNG) and as vector PDF
(`src/lib/tagPdf.ts`, Helvetica base fonts, no font file). `npx tsx scripts/qurtag/render-tags.mjs <folder>` writes every
style and look as PDF and (with poppler) PNG; the unit tests decode the QR code of each at 300 dpi.

**Print-ready file**: one piece at exact size with 0.125 in bleed on every side, as a 600 dpi PNG (resolution stamped in
the file) and a PDF with trim and bleed boxes, for any online sticker printer. No vendor is named or linked.

**Short codes** (`db/shortcodes.sql`, rollout step 10): every tag has `short_code`, 6 characters (5 are allowed) from
`abcdefghjkmnpqrstuvwxyz23456789` (no 0, o, 1, l, i), at least one digit, lower case, unique. A trigger gives each new tag
its code. `/<code>` (any case) is rewritten by `vercel.json` to `/api/fn?go=<code>` (`server/routes/shortcode.ts`) and
answers 302 to `/find/<tag>`; an unknown, replaced or switched-off code answers an honest 404 page. The rewrite matches only
5 or 6 characters that hold a digit, so it never catches a page of the site. Limits: 30 lookups a minute per network address
and instance, and in the database 20 wrong guesses per visitor in 10 minutes and 600 in a minute in all, counted under a
keyed hash of the address. The QR code still holds the full `/find/` address, so a printed tag never depends on the lookup.

**Make it last** (`/make-it-last`, `src/routes/marketing/MakeItLast.tsx`): plain, brand-neutral advice on paper, covers,
holders and clothing. It names no brand and links to no shop; the same page opens inside the iPhone app. The app does not
sell tags.

## Features that are switched off

`src/lib/features.ts` hides code built for a bigger plan that cannot work yet: cash rewards,
courier labels, trips, partner drop-off points, insurance packets, wallet passes, location
sharing and web push (the browser kind; the iPhone app's alerts are described above). Their tables are not in
schema `qurtag`. `VITE_QURTAG_LABS=1` shows them for local work only. The old Supabase
migrations and Edge Functions for them are kept in `supabase/` for reference; they are not
deployed.

## Working on it

```bash
npm install
npm run typecheck     # app, Vite config and server code
npm run test:unit     # the finder routes, the payment code, the push code, the tag layout maths and drawn tags (QR codes decoded back), the short code route, with stand-ins
npm run test:e2e      # the whole loop, memberships, webhooks, Family, push alerts (with a stand-in Apple server) and short codes, on a throwaway local Postgres (needs Docker)
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
postgrest-js. QR codes are made in the browser (`qrcode.react`) and drawn by `src/lib/tagStyles.ts`; the tag page
prints a vector page of tags, or saves it as a PDF. Colours are CSS variables (`src/index.css`)
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
  used. The app requests no location or NFC permission, and asks for notifications once, as described under "iPhone push notifications". The tag page's
  "Print or share" makes the chosen page of tags on the phone as a vector PDF (`src/lib/tagPdf.ts`) and opens the
  iOS share sheet through `@capacitor/share` and `@capacitor/filesystem` (`src/lib/saveFile.ts`), which offers Print,
  Save to Files and AirDrop. On the web it opens the browser's print dialog, or downloads the PDF.
- Terms, Privacy and Help, opened inside the app, show a plain header with a Back button instead of
  the website's menu (`src/components/layout/MarketingLayout.tsx`).
- On a phone (the app, and the website under 768px wide) the signed-in screens use a bottom tab bar
  (Items, Inbox, Settings); wider screens use a sidebar (`src/components/layout/AppLayout.tsx`). Each
  screen has a title, and nested screens a Back button (`src/components/layout/AppPage.tsx`).
  Help, Terms, Privacy and Make it last open inside that frame for signed-in people, at `/app/help`, `/app/terms`,
  `/app/privacy` and `/app/make-it-last` (`InAppDoc` in `src/routes/marketing/parts.tsx`); the public pages stay for visitors.
  A new account, and any account with no items, opens the first-tag walkthrough at `/app/first-tag`
  (`src/routes/app/FirstTag.tsx`; skippable, resumes from Items; style chosen by `src/lib/tagRecommend.ts`). Its test step
  opens the finder page in test mode (`/find/<code>#test=1`): no scan recorded, nothing sent. A scan with the phone camera is a
  real scan, because the finder routes cannot tell an owner from a stranger. Items shows a Getting started card until its steps
  are done or dismissed; progress is kept per account in the browser or phone (`src/lib/gettingStarted.ts`), as the database has
  no preferences table. Help at `/app/help` is grouped by task with search (`src/lib/helpContent.ts`), and each main screen has a
  "?" in its top bar that opens the matching group. Each top-level screen has a phone navigation bar with a large title that
  collapses (`AppPage`); the account card in Settings opens `/app/account` (name, password, data, deleting, signing out).
  The How it works pictures are in `public/how` (tags drawn by `src/lib/tagStyles.ts`, two real screenshots, light and dark).
- The app follows the phone's light or dark setting, and Settings lets the owner pick Light, Auto or Dark.
- The app asks for notification permission once, right after the first item is saved, behind a short
  explanation (`src/components/push/PushPrimer.tsx`), never at launch. See "iPhone push notifications".
- Version and build number are `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
  `ios/App/App.xcodeproj/project.pbxproj`.
