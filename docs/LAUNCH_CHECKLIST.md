# QurTag — Launch Checklist

Tick the boxes as you ship them. Priorities:

- 🔴 **MUST** — you cannot launch without this.
- 🟡 **SHOULD** — you can launch but it'll feel half-baked.
- 🟢 **LATER** — fine for v1.1.

The suggested 30-day sequence is at the bottom if you want a calendar.

---

## 1. Business & legal

- [ ] 🔴 **Trademark search for "QurTag"** with an IP attorney. QurTag Energy, QurTag Capital, QurTag Toy Company already exist. Decide: defensible filing in lost-and-found / consumer-IoT category, or rename now.
- [ ] 🔴 Form business entity (LLC or C-Corp) in your state of choice.
- [ ] 🔴 Get an EIN.
- [ ] 🔴 Open a business bank account.
- [ ] 🔴 Open a business credit card (for hosting + tooling).
- [ ] 🔴 Lawyer-drafted **Privacy Policy** — covers Supabase, Stripe, Resend, Mapbox, AeroAPI; GDPR/CCPA compliant. Replace placeholder at `/privacy`.
- [ ] 🔴 Lawyer-drafted **Terms of Service**, including refund policy and reward-escrow handling. Replace placeholder at `/terms`.
- [ ] 🟡 **DPA template** for any business customers in the EU.
- [ ] 🟡 Bookkeeping (QuickBooks or Xero) + an accountant who knows SaaS.
- [ ] 🟡 Sales-tax registration. Stripe Tax handles digital subs in most US states; hardware needs TaxJar or Avalara.
- [ ] 🟢 D-U-N-S number (needed for Apple Developer Program enrollment as a business).

## 2. Domain + hosting

- [ ] 🔴 Buy the domain. (Confirm `qurtag.com` or pick the final name.)
- [ ] 🔴 Set up DNS (Cloudflare recommended).
- [ ] 🔴 Deploy the web app to **Vercel** (QurTag is a Vite SPA — Vercel auto-detects).
- [ ] 🔴 Configure subdomains: `qurtag.com` (marketing), `app.qurtag.com` (web app — current default), `partners.qurtag.com` (partner portal — optional, route-based works too).
- [ ] 🔴 SSL on all subdomains (auto with Vercel).
- [ ] 🔴 Set production env vars on Vercel:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_MAPBOX_ACCESS_TOKEN`
  - `VITE_VAPID_PUBLIC_KEY`
- [ ] 🟡 Cloudflare in front of Vercel for DDoS + caching.

## 3. Supabase (production project)

- [ ] 🔴 Create production Supabase project (pick a region near your customers).
- [ ] 🔴 Run all migrations from [supabase/migrations/](../supabase/migrations/) in filename order:
  - [ ] `20260614000000_initial_schema.sql`
  - [ ] `20260614010000_storage_item_photos.sql`
  - [ ] `20260614020000_messaging.sql`
  - [ ] `20260614030000_realtime_and_push.sql`
  - [ ] `20260614040000_courier_orders.sql`
  - [ ] `20260614050000_addresses_rewards_trips_actions.sql`
  - [ ] `20260614060000_finder_payouts_and_partners.sql`
- [ ] 🔴 **Authentication → URL Configuration**:
  - Site URL: `https://app.qurtag.com`
  - Additional redirect URLs: `https://app.qurtag.com/auth/callback`
- [ ] 🔴 **Authentication → Email Templates** → tighten the Magic Link email to match QurTag's voice. Default Supabase template looks like a Supabase template.
- [ ] 🔴 Confirm Storage bucket `item-photos` was created by migration 2.
- [ ] 🟡 Enable **Point-in-Time Recovery** on the Supabase project (Pro plan).
- [ ] 🟡 Set up daily encrypted backups + verify a restore to a staging project once.
- [ ] 🟡 Configure log retention.

## 4. Stripe

- [ ] 🔴 Stripe account; test-mode walkthrough using [docs/STRIPE_DEMO.md](STRIPE_DEMO.md).
- [ ] 🔴 Set Edge Function secrets:
  - `STRIPE_SECRET_KEY` (live)
  - `STRIPE_WEBHOOK_SECRET`
  - `CAIRN_APP_URL=https://app.qurtag.com`
- [ ] 🔴 Deploy these Edge Functions:
  - [ ] `supabase functions deploy create-reward-hold`
  - [ ] `supabase functions deploy release-reward`
  - [ ] `supabase functions deploy create-checkout-courier`
  - [ ] `supabase functions deploy create-finder-payout-link --no-verify-jwt`
  - [ ] `supabase functions deploy stripe-webhook --no-verify-jwt`
- [ ] 🔴 Wire Stripe webhook (Stripe Dashboard → Developers → Webhooks):
  - URL: `https://<project>.supabase.co/functions/v1/stripe-webhook`
  - Events: `payment_intent.requires_capture`, `payment_intent.succeeded`, `account.updated` (for Connect onboarding).
- [ ] 🔴 ⚠️ **Fix webhook signature verification** in [supabase/functions/stripe-webhook/index.ts](../supabase/functions/stripe-webhook/index.ts). Replace the raw JSON parse with `stripe.webhooks.constructEvent(rawBody, signature, secret)` using `https://esm.sh/stripe@14?target=deno`. This is a security gap, not a launch convenience.
- [ ] 🔴 Stripe Connect terms acceptance (Dashboard → Connect → Settings) — you become a platform when wiring finder payouts.
- [ ] 🟡 Set up `account.updated` handler in stripe-webhook to mark `finder_sessions.payouts_enabled_at` when a finder completes Connect onboarding.
- [ ] 🟡 Stripe Tax registration (Dashboard → Tax).
- [ ] 🟡 Real $1 payment through reward escrow on your own card before flipping to live, then again after.

## 5. Email (Resend)

- [ ] 🔴 Resend account.
- [ ] 🔴 **Verified sending domain** with DKIM + SPF records added to your DNS.
- [ ] 🔴 Set Edge Function secret `RESEND_API_KEY`.
- [ ] 🔴 Update `from:` in [supabase/functions/send-email/index.ts](../supabase/functions/send-email/index.ts) from `hello@qurtag.com` to your verified address.
- [ ] 🔴 Deploy: `supabase functions deploy send-email --no-verify-jwt`.
- [ ] 🔴 Wire a **second Database Webhook** on `messages` INSERT → `send-email`. (The first one is `send-push`.)
- [ ] 🟡 Design + send yourself a test of the email and walk through it on mobile.
- [ ] 🟡 Set up a Resend dashboard alert for bounce/complaint rate above 1%.

## 6. Web Push (VAPID)

- [ ] 🔴 Generate VAPID keys: `npx web-push generate-vapid-keys`.
- [ ] 🔴 Add to Vercel production env: `VITE_VAPID_PUBLIC_KEY=<public>`.
- [ ] 🔴 Add to Edge Function secrets:
  - `VAPID_PUBLIC_KEY=<public>`
  - `VAPID_PRIVATE_KEY=<private>`
  - `VAPID_SUBJECT=mailto:you@your-domain`
- [ ] 🔴 Deploy: `supabase functions deploy send-push --no-verify-jwt`.
- [ ] 🔴 Wire **first Database Webhook** on `messages` INSERT → `send-push`.
- [ ] 🔴 Test: sign in on production → opt into push in `/app/settings` → send a finder message from a second device → confirm your phone buzzes.

## 7. Mapbox

- [ ] 🔴 Mapbox account.
- [ ] 🔴 Create a public access token scoped to `styles:read`, `fonts:read`, `geocoding:read`.
- [ ] 🔴 Add to Vercel production env: `VITE_MAPBOX_ACCESS_TOKEN=<token>`.
- [ ] 🟡 Set up domain restrictions on the token (Mapbox account → token → URL restrictions: `app.qurtag.com`).

## 8. Marketing site content

The marketing site uses real layout but placeholder copy on most pages. All of these route to `<Placeholder>` components in [src/router.tsx](../src/router.tsx). Write real content for each:

- [ ] 🔴 `/how-it-works` — storyboarded walkthrough of activation → loss → finder UI → handoff → return.
- [ ] 🔴 `/security` — the actual architecture transparency. Talk about bridge architecture, encryption, GDPR, your data retention windows.
- [ ] 🔴 `/help` — FAQ + contact email + recovery playbooks (airline, hotel, taxi, transit).
- [ ] 🔴 `/business` — partner pitch for hotels/airlines/coworking spaces. Pricing model, what they get, how to talk to you.
- [ ] 🔴 `/pricing` — feature comparison table, FAQ, B2B contact CTA.
- [ ] 🔴 `/stories` — replace the three composite stories on the marketing home with at least one or two real, consented recovery stories.
- [ ] 🟡 `/tags` — 3D configurator or at minimum a beautiful four-tier lineup.
- [ ] 🟡 Add a `/press` route with logos, founder bio, hero image, one-pager.

## 9. Photography + visual

Per [docs/PHOTOGRAPHY.md](PHOTOGRAPHY.md):

- [ ] 🔴 **Hero photograph** for the marketing home — at minimum, even if you don't do the full shoot. The CSS phone mockup currently in the hero is the single biggest "this looks templated" tell.
- [ ] 🔴 **OG image** at `/public/og.png` (1200×630). [index.html](../index.html) already references it.
- [ ] 🔴 **Apple touch icon** at `/public/apple-touch-icon.png` (180×180). Already referenced in [index.html](../index.html).
- [ ] 🔴 Generate the full **favicon set** at [realfavicongenerator.net](https://realfavicongenerator.net).
- [ ] 🟡 Full photo shoot — 2 days, ~$4–8k, brief at [docs/PHOTOGRAPHY.md](PHOTOGRAPHY.md). Eight shots, every hero asset for marketing + press + gifting.
- [ ] 🟡 Replace the CSS [PhoneMockup](../src/components/brand/PhoneMockup.tsx) on the marketing hero with a real phone photo.
- [ ] 🟢 Logo files: SVG, PNG @1x/2x/3x, dark/light, square + horizontal.
- [ ] 🟢 Press kit zip: logos, screenshots, founder bio, hero image, one-pager.

## 10. Customer support

- [ ] 🔴 Real support email (`hello@qurtag.com` or similar).
- [ ] 🔴 Decide **who** answers when the first finder writes confused. Ideally you, for the first 100 conversations.
- [ ] 🔴 Write at least 8 FAQ entries for `/help`.
- [ ] 🟡 Ticketing system — Linear, Plain, or Front. QurTag is calm; pick the one whose UI feels calm.
- [ ] 🟡 Set a personal SLA: every inbound from a stressed finder gets a reply within 1 hour during business hours.
- [ ] 🟢 Live chat (Crisp / Intercom) — not for v1.

## 11. Security

- [ ] 🔴 Fix Stripe webhook signature verification (see §4 above).
- [ ] 🔴 Publish `/.well-known/security.txt` with `Contact: mailto:security@qurtag.com`.
- [ ] 🔴 Sentry account + add Sentry SDK to the app for client errors.
- [ ] 🟡 Set up Sentry source map upload in the Vercel build step.
- [ ] 🟡 Backup verification — restore a Supabase backup to a staging project, confirm it works.
- [ ] 🟡 Audit RLS — current `using (true)` on threads/messages anon reads is acceptable v1 (Stripe UUID-as-secret model) but tighten to per-thread tokens before scale.
- [ ] 🟢 Bug bounty (HackerOne or Intigriti).
- [ ] 🟢 Penetration test before B2B push.
- [ ] 🟢 SOC 2 Type II (target month 18 per PRD).
- [ ] 🟢 Encrypt `items.notes` and `courier_orders.address_line` with pgsodium.

## 12. Analytics & telemetry

- [ ] 🔴 PostHog account, privacy-respecting config (no third-party cookies, no session replay on finder pages).
- [ ] 🔴 Track the recovery funnel: activation → lost-mode toggle → finder scan → finder message → handoff → confirmed reunion.
- [ ] 🟡 Plausible or Fathom for the marketing site (no Google Analytics — undermines the privacy promise).
- [ ] 🟡 Grafana Cloud or similar for Edge Function logs.
- [ ] 🟡 Dashboards for the metrics in [docs/PRD.md §17](PRD.md): activated tags, recovery rate, time-to-recovery, finder-to-message conversion.

## 13. Hardware (separate track, parallel to software)

Skip this entire section if you're launching software-only.

- [ ] 🔴 Source manufacturer for printable tag stock (or stick with "print at home" only for v1).
- [ ] 🔴 Decide which tiers launch in v1 — Core silicone is the cheapest entry; Signature leather is the gifting story.
- [ ] 🟡 First batch order — Core silicone (typically 500–1000 unit minimum).
- [ ] 🟡 First batch order — Pro aluminum (laser etching adds 2–4 weeks lead time).
- [ ] 🟡 Source leather studio for Signature tier (small batch first).
- [ ] 🟢 Track tier — BLE chips, Apple Find My / Google Find Hub certification (significant lead time).
- [ ] 🟡 Packaging design + manufacturer. Tumi-tier means Tumi-tier packaging.
- [ ] 🟡 Fulfillment partner (ShipBob, ShipMonk, or your own warehouse for v1 only).
- [ ] 🟡 Customs/duties for international shipping.
- [ ] 🟡 QA process: photograph every batch, verify QR scannability.

## 14. Wallets (Phase 2)

- [ ] 🟢 **Google Wallet** — actually works once you set the three `GOOGLE_WALLET_*` secrets and create a generic class in the [Pay & Wallet Console](https://pay.google.com/business/console). Deploy `supabase functions deploy issue-google-pass`.
- [ ] 🟢 **Apple Wallet** — Apple Developer Program enrollment, Pass Type ID, certs (5 secrets). Then integrate a Deno pkpass library into [issue-apple-pass](../supabase/functions/issue-apple-pass/index.ts) to sign + zip. The pass.json content is correct; only signing is missing.

## 15. Shippo courier labels (Phase 2)

- [ ] 🟢 Shippo account, USPS/FedEx/UPS/DHL enabled.
- [ ] 🟢 `SHIPPO_API_KEY` Edge Function secret.
- [ ] 🟢 Complete the [courier-fulfill](../supabase/functions/courier-fulfill/index.ts) function: pull return address from `households`, real parcel dimensions per item category, rate selection, insurance.
- [ ] 🟢 Deploy: `supabase functions deploy courier-fulfill`.

## 16. AeroAPI live trip status (Phase 2)

- [ ] 🟢 FlightAware AeroAPI key (personal tier is enough to start).
- [ ] 🟢 `AEROAPI_KEY` Edge Function secret.
- [ ] 🟢 Deploy: `supabase functions deploy aero-trip-status`.
- [ ] 🟢 Schedule via pg_cron every 10 minutes (SQL in [SETUP.md §10c](SETUP.md)).

## 17. Partner network (Phase 2)

- [ ] 🟢 Reach out to 1–2 boutique hotels in cities you're in.
- [ ] 🟢 Onboard them via the SQL in [SETUP.md §12](SETUP.md).
- [ ] 🟢 Give each partner a small batch of Signature tags to slip into welcome bags.
- [ ] 🟢 Build out `/partners/queue` as its own page (currently redirects to dashboard).

## 18. Mobile app (Phase 2)

Per [docs/MOBILE.md](MOBILE.md):

- [ ] 🟢 Apple Developer Program enrollment ($99/yr).
- [ ] 🟢 Google Play Console enrollment ($25 one-time).
- [ ] 🟢 `cd mobile && npm install && eas build -p ios --profile preview`.
- [ ] 🟢 TestFlight beta with a small group before App Store submission.
- [ ] 🟢 Privacy nutrition labels.
- [ ] 🟢 Build native modules in order: Push → Wallet → NFC → Live Activities.

## 19. Code gaps before launch

Specific gaps in the codebase that block a smooth v1 experience:

- [ ] 🔴 Stripe webhook signature verification (item in §4).
- [ ] 🟡 The finder's "Drop at a partner" button is `disabled` in [FinderView](../src/routes/finder/FinderView.tsx). Wire it once you have ≥5 partners.
- [ ] 🟡 Add Connect `account.updated` handler in [stripe-webhook](../supabase/functions/stripe-webhook/index.ts) → mark `finder_sessions.payouts_enabled_at`.
- [ ] 🟡 Replace `confirm()` dialogs on inbox actions with proper modal components.
- [ ] 🟡 `useThreadRealtime` should also subscribe to thread status updates so "Reunited" reflects without a refresh.
- [ ] 🟢 Encrypt `items.notes` and `courier_orders.address_line` with pgsodium.
- [ ] 🟢 Build `/app/items/:id/insurance-packet` to generate the chain-of-custody PDF promised in the PRD.

## 20. Final test sweep (last week before launch)

- [ ] 🔴 End-to-end run on production from a brand new browser:
  - [ ] Sign in via magic link (email lands within 30s).
  - [ ] Add first item with photo.
  - [ ] Print tag — PDF saves cleanly.
  - [ ] Open the tag URL in a second device (private window).
  - [ ] Send a finder message.
  - [ ] Confirm: realtime update on owner side, push notification, email.
  - [ ] Owner replies. Confirm finder sees it instantly.
  - [ ] Finder shares location → map preview renders.
  - [ ] Owner marks reunited.
  - [ ] Confirm reward released (in test mode) or in-account capture (live).
- [ ] 🔴 iOS Safari test — including home-screen install + push.
- [ ] 🔴 Android Chrome test.
- [ ] 🔴 Mobile responsive sweep on a real phone (not DevTools).
- [ ] 🟡 Accessibility audit — VoiceOver pass on the hero, finder, inbox.
- [ ] 🟡 Lighthouse score ≥ 95 on all major routes.
- [ ] 🟡 Run with `prefers-reduced-motion` enabled — confirm calm.
- [ ] 🟢 Load test — Supabase free tier maxes around 60 concurrent connections; if launch traffic looks heavy, upgrade pre-emptively.

---

## Suggested 30-day launch sequence

| Days | Focus |
|---|---|
| 1–2 | Trademark check, business entity, domain, decide on final name |
| 3–5 | Lawyer-drafted privacy + terms, customer support email, first marketing content pass |
| 6–10 | Production Supabase, all migrations, all Edge Functions deployed, Stripe wired in test mode, full Stripe demo run |
| 11–14 | Photography shoot, edit, place into marketing site; replace composite stories |
| 15–18 | Flip Stripe to live; run real $1 payment through reward escrow; Resend domain verified; email previews |
| 19–22 | Deploy to Vercel; end-to-end smoke test; iOS Safari; mobile responsive sweep |
| 23–26 | Closed beta — 10–20 real people get tags, use them on a real trip; watch the inbox |
| 27–30 | Fix what beta surfaced; open signup |

Hardware procurement runs in parallel from Day 1 — manufacturing lead times mean premium tags need to start now if you want them at launch.

---

## Acceptance: when can you launch?

You can launch when every 🔴 in §1, §2, §3, §4, §5, §6, §7, §8, §10, §11.1–3, §19.1, and §20.1–4 is checked.

That's roughly **65 items**. It's a lot. But you have the product. The rest is paperwork, plumbing, and the deliberate act of asking someone to use what you've built.
