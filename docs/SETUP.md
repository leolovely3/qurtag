# QurTag — local setup

The site renders without any backend, but real auth, items, tags, messaging,
realtime, push, location maps, transactional email, and courier labels each
have a small wiring step. Here's the shortest path.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), create a project (any region).
2. Project Dashboard → copy the **Project URL** and **anon public** key.

## 2. Wire local env

```bash
cp .env.local.example .env.local
```

Required:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Optional (each unlocks one capability — gracefully degraded when missing):

```
VITE_MAPBOX_ACCESS_TOKEN=        # maps in finder threads + address autocomplete
VITE_VAPID_PUBLIC_KEY=           # Web Push opt-in in /app/settings
```

Restart `npm run dev` after editing.

## 3. Run the schema migrations

Run **all migrations** in [`supabase/migrations/`](../supabase/migrations/) in
filename order.

**Easiest (Supabase Dashboard):**
- Project → SQL Editor → New query → paste each migration → Run.

**Or via Supabase CLI:**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## 4. Configure auth

- **Authentication → Providers** → keep Email enabled.
- **Authentication → URL Configuration**:
  - Site URL: `http://localhost:5180`
  - Additional redirect URLs: `http://localhost:5180/auth/callback`
- (Optional) **Authentication → Email Templates** → tighten Magic Link template.

## 5. Mapbox (optional, recommended)

- Sign up at [mapbox.com](https://mapbox.com) → Account → Tokens.
- Copy your default public token into `VITE_MAPBOX_ACCESS_TOKEN`.
- Restricts: scope the token to `styles:read`, `fonts:read`, `geocoding:read`.

What it unlocks:
- Inline map previews in finder/owner threads when a location is shared.
- Reverse geocoding so "42.36, -71.06" becomes "Boston Logan, Terminal B."
- Address autocomplete in the courier flow (v2).

Without this token, location messages still send — the thread just shows the
coordinates as text instead of a map preview.

## 6. Web Push (optional, recommended)

### 6a. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Two strings; use:

- **Public** → `VITE_VAPID_PUBLIC_KEY` in `.env.local`.
- **Private** → Supabase Dashboard → Edge Functions → Secrets, as
  `VAPID_PRIVATE_KEY`. Also add `VAPID_PUBLIC_KEY` (same as the public above)
  and `VAPID_SUBJECT=mailto:you@example.com`.

### 6b. Deploy the send-push function

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is required because Database Webhooks fire without a JWT.

### 6c. Wire a Database Webhook

Supabase Dashboard → **Database → Webhooks → Create webhook**:

- Name: `messages-push`
- Table: `messages`
- Events: `INSERT`
- Type: Supabase Edge Functions
- Function: `send-push`

### 6d. Turn it on

In the app: **Sign in → /app/settings → Push notifications → Turn on**.

## 7. Transactional email — Resend (recommended)

So owners get an email when a finder writes (with a deep link to the thread).

### 7a. Resend account + verified domain

- Sign up at [resend.com](https://resend.com).
- Add and verify a sending domain (e.g. `qurtag.com`).
- Copy your API key.

### 7b. Edge Function secrets

Supabase Dashboard → Edge Functions → Secrets:

```
RESEND_API_KEY=re_xxx
QURTAG_APP_URL=https://app.qurtag.com     # used for deep links in emails
```

### 7c. Deploy and wire

```bash
supabase functions deploy send-email --no-verify-jwt
```

Add a second Database Webhook on `messages.insert` pointing at the
`send-email` function. (You can run both `send-push` and `send-email` off the
same INSERT — both filter for `sender_kind = 'finder'` server-side.)

## 8. Courier labels — Shippo (optional, Phase 2)

Skip unless you want real prepaid pickup labels generated.

### 8a. Shippo account

- Sign up at [goshippo.com](https://goshippo.com).
- Enable USPS / FedEx / UPS / DHL as needed.
- Test with a sandbox token first; flip to live when ready.

### 8b. Edge Function secrets

Supabase Dashboard → Edge Functions → Secrets:

```
SHIPPO_API_KEY=shippo_live_xxx
RESEND_API_KEY=re_xxx                   # for emailing the label to the finder
```

### 8c. Deploy

```bash
supabase functions deploy courier-fulfill
```

This function is owner-triggered (called from `/app/inbox/:threadId` when
the owner clicks "Pay & generate label"). It looks up the courier_orders
row, calls Shippo to generate a label, stores the URL + tracking number, and
emails the finder the label.

> The current Edge Function is a sketch — production wiring needs:
> - Owner's return address (from `households` — add a column)
> - Parcel dimensions and weight (from the item's declared category)
> - Stripe payment flow before label generation (separate webhook)
> - Insurance options based on declared value
>
> Treat this as the recovery path's "Phase 2" surface.

## 9. Stripe — payments + reward escrow (recommended)

Reward escrow and the prepaid courier label flow both ride on Stripe.

### 9a. Stripe account

- Sign up at [stripe.com](https://stripe.com).
- Toggle test mode for now; flip to live before launch.
- Copy your **Secret key** (sk_test_…).

### 9b. Edge Function secrets

Supabase Dashboard → Edge Functions → Secrets:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx           # filled in after step 9d
QURTAG_APP_URL=https://app.qurtag.com        # used for Checkout success/cancel URLs
```

### 9c. Deploy the four Stripe functions

```bash
supabase functions deploy create-reward-hold
supabase functions deploy release-reward
supabase functions deploy create-checkout-courier
supabase functions deploy stripe-webhook --no-verify-jwt
```

### 9d. Wire the Stripe webhook

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- URL: `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
- Events:
  - `payment_intent.requires_capture` (reward authorized but not yet captured)
  - `payment_intent.succeeded` (courier label paid)

Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET` and
redeploy the function.

### 9e. Finder payouts (Phase 2)

For v1 the released reward captures into your own Stripe account. To dispatch
to the finder's bank, layer in **Stripe Connect Express** — the finder gets a
Connect onboarding link, you create a Transfer to their connected account
when releasing.

## 10. AeroAPI — live trip status (optional)

Lights up the trip card on finder pages with live flight status.

### 10a. AeroAPI key

- Sign up at [flightaware.com/aeroapi](https://flightaware.com/aeroapi).
- Personal tier is enough to start.

### 10b. Secret + deploy

```
AEROAPI_KEY=aeroapi_xxx
```

```bash
supabase functions deploy aero-trip-status
```

### 10c. Schedule it

Supabase Dashboard → **Database → Cron** (pg_cron):

```sql
select cron.schedule(
  'qurtag-aero-trip-status',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/aero-trip-status',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
     ) $$
);
```

Every 10 minutes, every active trip's status updates.

## 11. Wallet passes (optional)

### 11a. Google Wallet

- Sign up at [pay.google.com/business/console](https://pay.google.com/business/console).
- Create a Generic class for QurTag items.
- Create a service account, download the JSON, copy:
  - Service account email → `GOOGLE_WALLET_SA_EMAIL`
  - Private key (the `private_key` field) → `GOOGLE_WALLET_SA_PRIVATE_KEY`
  - Issuer ID → `GOOGLE_WALLET_ISSUER_ID`

```bash
supabase functions deploy issue-google-pass
```

### 11b. Apple Wallet

- Apple Developer Program enrollment ($99/yr).
- Apple Developer Portal → Certificates, Identifiers & Profiles → Pass Type IDs
  → register `pass.co.qurtag.item`.
- Generate a Pass Type ID Certificate, download the .cer.
- Convert to PEM, extract the private key, base64-encode both.
- Download the Apple WWDR intermediate certificate, base64-encode it.

Add to Edge Function secrets:

```
APPLE_PASS_TYPE_ID=pass.co.qurtag.item
APPLE_TEAM_ID=ABC1234567
APPLE_PASS_CERTIFICATE_BASE64=...
APPLE_PASS_KEY_BASE64=...
APPLE_WWDR_CERT_BASE64=...
```

```bash
supabase functions deploy issue-apple-pass
```

> The current Apple skeleton generates the correct `pass.json` content but
> doesn't sign and zip into `.pkpass`. To complete: integrate one of the
> Deno-compatible pkpass libraries listed in the function's header comment.

## 12. Partner portal (invite-only)

The partner portal at `/partners` is gated by the `partner_members` table.
To onboard a hotel or airline:

1. Insert a row in `partners`:
   ```sql
   insert into partners (name, kind, contact_email, city)
   values ('Memmo Alfama', 'hotel', 'frontdesk@memmoalfama.com', 'Lisbon')
   returning id;
   ```
2. Invite their staff users via Supabase Authentication (or have them sign
   up at `/start`), then add them to `partner_members`:
   ```sql
   insert into partner_members (partner_id, user_id, role)
   values ('<partner_id>', '<user_id>', 'admin');
   ```
3. They log in and land at `/partners`.

## 13. Mobile app (optional, Phase 1+)

See [MOBILE.md](MOBILE.md) for the full strategy. The Expo wrapper lives at
[`/mobile`](../mobile/).

## 14. Verify

```bash
npm run dev
```

The shortest end-to-end check:

1. `/start` → enter email + (optional) first item details → request magic link.
2. Click the link → land at `/start/setup` with your item pre-filled → submit
   → printable tag at `/app/tags/<id>/print`.
3. Open the tag's URL in a private window (you're now "the finder") → send a
   note + share location.
4. Back in your first window: the inbox badge bumps **in real time**, the
   note appears in `/app/inbox`, the location renders as a map preview.
5. If push is wired, your phone buzzed. If email is wired, you got a Resend
   email.

## Common gotchas

- **Magic link goes to localhost:3000.** Update Site URL and redirect URLs.
- **"Failed to fetch" on submit.** Env vars not loaded — restart `npm run dev`.
- **RLS violation.** Confirm all migrations ran cleanly.
- **Realtime not firing.** Check `supabase_realtime` publication includes
  `messages` and `threads` (added by migration 3).
- **Push opt-in shows "VAPID public key missing."** Add `VITE_VAPID_PUBLIC_KEY`.
- **Push opt-in shows "Not supported in this browser."** iOS Safari requires
  installing QurTag to the home screen first.
- **Location share shows coords only, no map.** Mapbox token missing.
- **Resend email never lands.** Check the Edge Function logs, then your
  sending domain's DNS in Resend.
- **Clean slate.** In SQL Editor:
  `truncate scans, tags, items, household_members, households, threads, messages, push_subscriptions, courier_orders, finder_sessions cascade;`
