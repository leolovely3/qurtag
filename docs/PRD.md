# Product Requirements Document
## QurTag — Premium Recovery Network for Things That Matter

---

## 1. Vision

> **Your things find their way home.**

A premium recovery network built around physical tags (luggage, leather goods, pet collars, electronics, sports gear) and a beautifully designed app that turns the moment-of-loss into the shortest, calmest path to reunion. Privacy is the quiet substrate. Recovery is the headline.

We are not a tracker. We are not a Shopify gimmick. We are the calm, expensive-feeling default for travelers and owners of objects worth recovering.

---

## 2. Strategic Goals & Non-Goals

### Goals (12 months)
- 90%+ recovery rate on tags scanned at least once with lost-mode active (industry baseline: ~50–60% for QR tags without reward incentives).
- Median time from scan-to-acknowledged-recovery under 18 hours.
- App Store rating ≥ 4.7 with ≥ 5,000 reviews.
- NPS ≥ 60.
- Conversion from finder-scan to finder-message ≥ 65% (industry: low double digits).
- ≥ 25% of paid plans on annual; ≤ 3% monthly churn.
- 3 anchor B2B partners (one airline, one hotel group, one insurer).

### Non-Goals (v1)
- Real-time GPS tracking as the headline product. (Optional hybrid hardware tier later.)
- Social features, public lost-found feed, gamification of finders.
- Generic asset-management software for warehouses/IT (until B2B v2).
- Acting as a payment processor — we use Stripe Connect for escrow.

---

## 3. Personas

1. **The Quiet Premium Traveler** ("Helena", 38, marketing exec, Away + Tumi, 25+ flights/yr). Wants peace of mind, hates clutter, will not put cheap plastic on a $900 carry-on. Values: design, privacy, no monthly fees on small things.
2. **The Road Warrior** ("Marcus", 45, consultant, Rimowa, 80+ flights/yr). Has lost luggage twice. Wants insurance-grade documentation, fast reunion, trip mode that just works.
3. **The Gift Buyer** ("Priya", 52, buying her son a graduation gift). Needs the product to feel like a Mark Cross or Bellroy purchase — packaging, materials, monogram.
4. **The Anxious Parent** ("Dana", 41, two kids in school sports). Iron-on labels, instrument cases, retainer cases. Needs simple language, family sharing, kid-safe finder messaging.
5. **The Caregiver** ("James", 60, mother has early Alzheimer's). Needs tags on wallet, keys, jacket; alerts routed to him and her aide.
6. **The Hotel GM (B2B)** ("Léa", 36, runs lost-and-found at a 240-room property). Needs a partner inbox to process found-item drops, scan-and-log workflow, owner notification handoff.
7. **The Insurance Adjuster (B2B)** ("Robert", 49, travel insurer claims team). Wants a verifiable chain-of-custody packet to reduce fraud and accelerate claims.

---

## 4. Competitive Landscape

| Player | Privacy bridge | Reward escrow | Translation | Trip context | Premium materials | Native app | B2B |
|---|---|---|---|---|---|---|---|
| SEQR Contact | yes | no | no | no | no | no | no |
| Dynotag | no (exposes contact) | no | no | no | partial | no | no |
| Okoban | yes | no | partial | no | no | no | yes (airlines) |
| ReturnMe | no (phone visible) | no (reward only at delivery) | no | no | no | no | yes (corp) |
| LostIt Tag | yes | no | no | no | no | no | no |
| AirTag / Tile | tracker only | n/a | n/a | n/a | n/a | yes | no |

**Our wedge:** premium hardware + escrowed reward + translation-by-default + trip context + insurance-grade chain of custody + a brand that looks at home next to Rimowa.

---

## 5. Marquee Differentiators (what nobody else is even considering)

These are the features that should make first-time customers tell a friend.

1. **Reward Escrow** — owner pre-authorizes via Stripe; finder enters payout email; funds release on confirmed reunion. Auto-refund if owner self-finds. *No competitor does this.*
2. **Translation by default** — finder UI auto-detects language; both sides of every message are machine-translated (DeepL) inline with the original. Voice messages auto-translated.
3. **Trip Mode** — paste a PNR/flight number, message auto-updates with live flight status ("On UA901 LHR→SFO, scheduled 14:20 PDT June 14"). Pulls AeroAPI. Updates in real time.
4. **Chain-of-Custody Receipt** — every handoff is timestamped and signed (finder → drop-off partner → courier → owner). Generates an insurance-grade PDF packet on demand.
5. **Smart Drop-Off Network** — partner hotels, airlines, coworking spaces, gyms. Finder picks "leave at any participating Marriott front desk"; we generate the courier pickup. Addresses never exchanged.
6. **Okoban + airline registry sync** — when lost mode engages on a luggage tag, we push to the global Okoban registry so airport baggage systems can match independently.
7. **Cross-tag Trip Timeline** — if your luggage tag, laptop tag, and passport sleeve are all on the same trip, scans appear on one timeline with map. Lets you reconstruct where things were.
8. **Emergency Contact Cascade** — if owner doesn't respond to a scan within X hours, message escalates to a designated travel companion or family member.
9. **Identity Challenge** — owner pre-sets a private detail ("lining color: emerald"). For high-value claims at airports/hotels, partner staff can verify the rightful owner without exposing the answer to anyone but the claimant.
10. **One-Time Hand-off Code** — at in-person meetups, the app generates a one-time code shown on owner's phone; finder scans it to confirm they're handing it to the right person. Prevents impostor pickups.
11. **AI Lost-Item Report** — "I left my black North Face backpack at SFO Terminal 2 around 4pm" → structured report auto-filed to airport L&F, airline systems, partner drop-offs, and Okoban.
12. **Smart Lost Mode (geofenced)** — when your phone leaves a configured "home" radius, certain tags auto-arm with travel context. No manual toggling.
13. **Found-By-Owner Auto-Cancel** — if the owner scans their own tag in lost mode, alert auto-cancels and escrow refunds.
14. **iOS Live Activity / Dynamic Island** — in lost mode, a real-time activity shows scan count, last location, finder messages without unlocking the phone.
15. **Apple Wallet / Google Wallet Item Pass** — every item gets a pass: hero photo, declared value, serial, scan code on the back. Useful at customs, insurance reviews, baggage claims.
16. **Custody-Bonded Insurance Claim** — partnered with one or two insurers (v2) for in-app one-tap claim submission with our chain-of-custody packet attached.
17. **Voice & Video Messages, Translated** — finders who are stressed or non-native speakers can voice-message; auto-transcribed and translated.
18. **Carbon-Neutral Returns** — every prepaid label is carbon-offset by default, badged in the UI. Cohort that buys Rimowa cares.
19. **Hand-engraved Monogram on Demand** — for Signature tier; ships in 5 days; gifting-grade.
20. **Pay-It-Forward Rewards** — finder can donate the reward to a vetted charity; we match 10%. Quiet PR win.
21. **Hardware "Ping"** for Pro/Track tier — BLE beacon in tag rings with haptic + light when nearby.
22. **Public API + Zapier/Make** — power users automate; B2B integrates without bespoke work.
23. **Architecture Transparency Report** — published quarterly, plus a security.txt and bug bounty. Privacy as evidence, not slogan.
24. **Vision Pro / Spatial Map** (v3) — view your scan timeline as a 3D map on visionOS. Press-worthy.

---

## 6. Product Pillars

1. **Calm under stress.** Every flow assumes the user is panicking. Defaults, brevity, big tappable targets.
2. **Privacy by structure, not by promise.** Bridge architecture, proxy comms, zero-PII finder UI.
3. **Recovery, not just contact.** Escrow, drop-off network, courier handoff, chain of custody.
4. **Quietly luxurious.** Materials, motion, type, photography. Owner feels good using it.
5. **Global by default.** Translation, regional data residency, payment in local currency.
6. **Honest pricing.** Hardware is one-time. Software is free for the basics. Paid only where we pay vendors.

---

## 7. Information Architecture

```
Marketing site (qurtag.com)
  ├─ Home
  ├─ How it works (story-driven)
  ├─ Tags (configurator)
  ├─ For travelers / For families / For business
  ├─ Security & Privacy
  ├─ Press & stories (recovery stories)
  └─ Help

App (app.qurtag.com + iOS/Android)
  ├─ Home (trip mode card, lost items, recent scans)
  ├─ Items
  │   ├─ Item detail (photos, profile, scan log, lost toggle, reward)
  │   └─ Collections (Trip, Household, Kids, Work)
  ├─ Tags (physical inventory, activate/replace)
  ├─ Inbox (finder threads, translated)
  ├─ Trips (active and past, flight context)
  ├─ Wallet (Apple/Google pass library)
  ├─ Family / Org (members, roles)
  └─ Settings (privacy, notifications, billing, data)

Finder page (find.qurtag.com/[tag-id])
  ├─ Hero state (Lost / Normal / Reward visible)
  ├─ One-tap "I have this"
  ├─ Message / voice (translated)
  ├─ Drop-off network picker
  ├─ Courier label flow
  └─ Reward acceptance

Partner portal (partners.qurtag.com)
  ├─ Scan to log incoming finds
  ├─ Item queue / pickup scheduling
  └─ Reporting
```

---

## 8. Feature Specification

### 8.1 Activation & Onboarding

- **Scan to activate**: new owner scans any unactivated tag with phone camera or NFC. App opens (or web fallback) and walks through 30-second activation.
- **Bulk activation**: scan a pack-barcode on packaging to register all tags in pack at once.
- **Guided item profile**: optional — photo, brand, model, declared value, serial. Skippable; can fill later.
- **Default-on Lost Mode geofence**: prompts to set "home" location; arms automatically away from it.
- **Family invite**: optional — invite up to 5 members during onboarding with role (admin / viewer).
- **Apple/Google sign-in**, passwordless email magic link as fallback. No password fields anywhere.

### 8.2 Item Profile

- Hero photo + gallery (up to 6).
- Brand, model, color, declared value (used for insurance packet + courier insurance).
- Serial number / IMEI (encrypted at rest).
- Receipt and warranty PDFs (encrypted, owner-only).
- Identity challenge ("a detail only you would know").
- Lost mode toggle with explicit ON state. Reward amount field. Drop-off preferences.
- Scan history (count, locations as coarse-grained pins, timestamps).
- "Replace tag" workflow when a tag is destroyed.
- Notes (private to owner).

### 8.3 Tags

- Physical tag inventory tied to your account.
- Each tag has a unique ID, current item assignment, status (Active / Inactive / Lost / Replaced).
- Re-pair a tag to a new item without losing scan history continuity (history stays with item, not tag).
- Bulk operations for power users / B2B.

### 8.4 Collections & Trip Mode

- **Collections**: Trip / Household / Kids / Work / Custom. Bulk lost-mode, bulk message edits.
- **Trip Mode**: enter flight number or paste airline confirmation email; we auto-extract via parser. Trip context appears on finder page for all tagged items in that collection. Updates with live flight status. Auto-disengages 24 hours after scheduled arrival.

### 8.5 Lost Mode & Finder Experience

**Owner side:**
- Big toggle, color-coded (calm slate when off, warm coral when on — never alarmist red).
- Reward picker ($0 / $20 / $50 / $100 / custom). Stripe pre-auth.
- Drop-off preference: "Anywhere in network" / "Hotel only" / "Direct shipping" / "In-person meetup."
- Identity challenge presented to high-trust partners only.
- Snooze and schedule (e.g., auto-arm on flight day).

**Finder page (no account, no app):**
- Hero state communicates urgency without panic. Single primary CTA: "I have this — let the owner know."
- Reward shown upfront when offered.
- Tap CTA → choose mode: send a message, share location, drop off at partner, request courier pickup.
- Auto-detected language. Toggle to switch.
- Voice/video message option (1-tap, 60 sec cap).
- Photo attachment of item-in-place (optional, recommended).
- Verified finder badge available (Sign in with Apple/Google, 2 taps).
- Drop-off network: map of nearby participating locations with open hours.
- Courier flow: enter address (autocompleted), choose pickup window, owner pays in background, label sent to finder's email and a tracking number created.
- Reward payout: enter Venmo/PayPal/Stripe Express email; funds release on owner-confirmed reunion (or auto-release after 7 days from courier confirmed-delivered).

### 8.6 Reward Escrow

- Stripe Connect (Express) for finder payouts.
- Pre-auth at lost-mode activation; capture on payout.
- Auto-cancel + refund if owner self-finds (own-tag scan triggers prompt).
- Dispute window of 48 hours after owner marks reunion before payout settles. In-app dispute flow with evidence review by QurTag team for high-value disputes.
- Anti-abuse: per-tag and per-account rate limits; velocity rules; payout KYC at threshold ($600/yr per US tax rules).

### 8.7 Courier Handoff & Drop-Off Network

- **Carrier APIs**: Shippo aggregator → USPS / FedEx / UPS / DHL / Royal Mail / Canada Post / Australia Post / Japan Post.
- **Drop-off partners** (v2): hotel groups, coworking chains, gyms, airline lost-and-found desks. Each partner has a portal account; scans a "drop-off code" generated by finder; receives pickup label automatically.
- **Carbon-neutral default**: all labels purchased with offset via the carrier's program or Cloverly.
- **Insurance options** on shipment up to declared value of item.

### 8.8 Chain of Custody

- Every state transition is signed (server-side Ed25519 signature, owner-visible).
- States: Scanned → Finder Acknowledged → In Transit → At Partner → Out for Delivery → Received → Confirmed.
- Each event has actor, timestamp, coarse geolocation (city-level for privacy), and optional photo.
- One-click export as PDF packet for insurance claims, including all photos, scan log, courier tracking, reward record, and item profile data.

### 8.9 Notifications

- **Channels**: push (iOS/Android), web push, email, SMS, optional Slack / Discord / Telegram bot, optional webhook.
- **Rules engine**: "Notify me if scanned outside [home zip]," "Always notify by SMS in lost mode," "Quiet hours 10pm–7am except lost mode."
- **iOS Live Activity & Dynamic Island** when lost mode is engaged and a scan happens.
- **Apple Watch / Wear OS** glance.
- **Emergency cascade**: configurable timeout (default 6 hr) before escalating to designated companion contacts.

### 8.10 Mobile Apps

- React Native + Expo, but native-feeling: Hermes JS engine, native gesture handlers, native map view.
- NFC read/write for activation and pairing.
- Camera-based QR scanning.
- BLE pairing for hardware Ping (Pro/Track tiers).
- Apple Wallet / Google Wallet pass generation.
- Background location only when explicitly enabled for geofence auto-arm.
- Local-only Lost Mode keychain: lost-mode preferences cached on device so a lost phone doesn't break recovery.

### 8.11 Wallet Passes

- Apple Wallet pkpass + Google Wallet pass.
- Hero photo of item, declared value, serial number (visible to owner only), QR/NFC code on the back.
- Pass auto-updates when item profile changes.
- Useful at customs ("here's proof I own this Rimowa") and insurance reviews.

### 8.12 Family / Household Plans

- Up to 5 members (Plus) or 10 (Family).
- Roles: Admin (full), Member (manage own items + view family), Child (limited, parent-approved).
- Shared collections.
- Kid Mode: finder message thread is mediated — finder never directly messages a child; everything routes to parent. Item profiles hide child's name from finder page by default.

### 8.13 Caregiver Mode

- Designate up to 3 caregivers for a "supported person."
- Caregivers receive all notifications. Supported person's items can be tagged on wallet, keys, jacket, walker, etc.
- Finder page reads "If this person seems lost or confused, please call this number" with a Twilio proxy line.

### 8.14 Business / Organization Plans

- SSO (SAML, OIDC).
- Bulk tag provisioning via CSV.
- Role-based access (Admin, Manager, Member, Read-only).
- Custom branding on finder page (logo, brand color within constraints).
- API access with scoped tokens.
- SLA, dedicated support, optional regional data residency.
- Partner portal mode for hotels/airlines.

### 8.15 Public API & Integrations

- REST + Webhooks. OpenAPI 3.1 published.
- OAuth2 for third-party apps.
- Zapier and Make.com integrations.
- TripIt, Google Travel, Hopper triggers to auto-set Trip Mode.
- HomeKit / Matter (v3): "I'm home" routine auto-disarms lost mode.

### 8.16 Help & Recovery Support

- In-app live chat with humans during business hours, AI agent overnight.
- "Help me recover this" concierge for paid tiers — a person actively works the case.
- Recovery playbooks per scenario (airline, hotel, taxi, transit) — clear step-by-step.

---

## 9. Design System

### 9.1 Brand position
Premium, calm, confident. Closer to **Aesop, Bellroy, Rimowa, Linear, Arc, Roam Research** than to **Tile, Apple, or generic DTC**. Editorial, not flashy.

### 9.2 Visual language
- **Type**: GT America or Söhne (body), Editorial New or Tiempos Headline (display). Both pair well and feel distinctly premium without being trendy.
- **Color**: a restrained two-tone system.
  - **Ink** (`#0E1014`) — primary text and surfaces in dark mode.
  - **Bone** (`#F5F1EA`) — primary surface in light mode.
  - **Verdigris** (`#3F5A52`) — quiet accent, used sparingly.
  - **Coral** (`#E2735B`) — reserved for lost-mode signal; used nowhere else.
  - **Slate** (`#8C8F95`) — secondary text.
- **Spacing**: generous. 8/16/24/40/64 scale. Whitespace is the luxury.
- **Corners**: 8px on cards, 12px on modal, fully-rounded on pill buttons.
- **Motion**: slow, gentle. 220ms standard, easeInOutQuad. Page transitions cross-fade with subtle scale. Lost mode UI uses a slow pulse — never a frantic blink.
- **Photography**: editorial. Lifestyle shots of objects at rest — a leather tag on a Rimowa handle on a hotel bed, a tag clipped to a pet collar at golden hour. Avoid floating-on-white product hero shots. Hire one good photographer.
- **Illustration**: hand-drawn line art for empty states. No clip art, no 3D blobs, no isometric tech illustrations.
- **Iconography**: Lucide React, 1.5px stroke. Consistent stroke width across the product.

### 9.3 Voice
- Calm, declarative, grown-up. Never "Oops!" Never exclamation marks except in the finder page's confirmation states.
- Use plain English. Reading age 9.
- "Lost" not "lost!" — "Tell the owner you found it" not "Help reunite this item!"

### 9.4 Component library
shadcn/ui as a starting base, restyled with the type system above. Build:
- Item card (compact, expanded)
- Tag badge / status pill
- Scan event row
- Drop-off picker
- Reward picker
- Translation toggle
- Trip context strip
- Live Activity component
- Empty states

### 9.5 Web marketing site
- Static, fast (sub-1.0s LCP), minimal JS.
- Hero: a slow, calm video of someone finding a Rimowa on a hotel bed, tagged. Sound off. Caption: *Your things find their way home.*
- Sections: How it works (story), Materials, The recovery network, Privacy by structure, Stories of return, Configurator, Reviews, Press.
- Configurator: pick tier (Core / Pro / Signature / Track), color, material, monogram. Real-time 3D preview via react-three-fiber on a high-poly model.
- Photography-first. Type-second. Buttons-third.

---

## 10. Technical Architecture

### 10.1 Stack (chosen)
- **Frontend framework**: React 18.3 + TypeScript 5.5
- **Build / dev**: Vite 5.4
- **Routing**: React Router DOM 7.10 (data router)
- **Styling**: Tailwind CSS 3.4 + shadcn/ui primitives
- **Icons**: Lucide React
- **Backend / DB / Auth / Storage / Realtime**: Supabase
- **Pre-rendering**: vite-react-ssg for marketing + finder routes (premium TTFB)
- **Mobile** (Phase 1): React Native + Expo

### 10.2 Vendor / integration layer
- **Email**: Resend (transactional) + Postmark (deliverability fallback).
- **SMS / Voice**: Twilio with proxy numbers for the bridge.
- **Push**: APNs + FCM via OneSignal or direct.
- **Payments / Escrow**: Stripe + Stripe Connect Express.
- **Translation**: DeepL primary, Google Translate fallback. Whisper for voice transcription.
- **Maps**: Mapbox.
- **Address autocomplete**: Mapbox Search + Google Places fallback.
- **Shipping**: Shippo aggregator.
- **Flight data**: AeroAPI (FlightAware).
- **Lost & found federation**: Okoban API integration.
- **Observability**: Sentry, PostHog (privacy-preserving config), Grafana Cloud.

### 10.3 Architecture principles
- **Privacy by structure**: finder-side requests never receive owner PII. Owner contact channels are abstracted by proxy IDs server-side.
- **No PII in URLs**, no PII in logs, structured logging with redaction at the SDK layer.
- **Edge-first reads** for the finder page (sub-100ms TTFB anywhere in the world).
- **Region pinning** available for EU customers (Supabase EU project + Stripe EU + DeepL EU).
- **Backward-compatible API** with versioning from day one.
- **Idempotency keys** on all mutation endpoints.

### 10.4 Data model (key tables)

```
users (id, email, name, locale, country, created_at, ...)
households (id, name, plan_tier, owner_user_id)
household_members (household_id, user_id, role)
items (id, owner_household_id, name, brand, model, color, declared_value_cents,
       serial_encrypted, hero_photo_url, lost_mode, reward_amount_cents,
       drop_off_preference, identity_challenge_encrypted, created_at)
item_photos (item_id, url, ord, taken_at)
item_documents (item_id, kind, url_encrypted)
tags (id, public_id, hardware_model, status, current_item_id, activated_at)
collections (id, owner_household_id, kind, name, trip_metadata jsonb)
collection_items (collection_id, item_id)
scans (id, tag_id, item_id, scanned_at, coarse_geo_pt, ip_country,
       user_agent_class, finder_session_id)
finder_sessions (id, locale_detected, verified_finder_uid nullable,
                 anonymous_uid, created_at)
threads (id, item_id, scan_id, finder_session_id, status)
messages (id, thread_id, sender_kind, body, body_translated jsonb,
          attachments, created_at)
handoffs (id, thread_id, partner_id, courier_shipment_id,
          state, signed_payload, created_at)
custody_events (id, handoff_id, state, actor, signed_at, signature)
rewards (id, thread_id, amount_cents, stripe_payment_intent_id,
         finder_payout_account, status, dispute_state)
notifications (id, user_id, kind, channel, payload, sent_at, read_at)
notification_rules (user_id, rule_jsonb)
partners (id, kind, name, address, hours, brand_props jsonb)
api_keys (id, household_id, scope, created_at, last_used_at)
audit_log (actor, action, target, before_jsonb, after_jsonb, at)
```

### 10.5 API surfaces

- **Public REST**: `/v1/items`, `/v1/tags`, `/v1/threads`, `/v1/scans`, `/v1/rewards`, `/v1/collections`, `/v1/webhooks`, `/v1/partners` (B2B).
- **Finder REST** (separate origin, scoped): `/find/v1/scan`, `/find/v1/message`, `/find/v1/handoff`, `/find/v1/reward`.
- **Webhook events**: `scan.created`, `thread.message_created`, `handoff.state_changed`, `reward.released`, `lost_mode.changed`.

---

## 11. Privacy, Security, Compliance

- **Bridge by design**: finder UI cannot reach owner PII via any code path.
- **At rest**: AES-256-GCM for PII fields (serial, identity challenge, documents).
- **In transit**: TLS 1.3 only.
- **Auth**: Sign in with Apple, Google, email magic link, optional WebAuthn passkeys.
- **Logs**: SDK-level redaction; per-environment log retention (30 / 90 / 365 days by tier).
- **Backups**: daily encrypted snapshots; point-in-time recovery for 7 days.
- **GDPR**: data export endpoint (`/v1/me/export`), data deletion endpoint, DPA available, EU region pinning.
- **CCPA**: same primitives.
- **COPPA**: Kid Mode flow does not collect direct child PII; parent-mediated.
- **SOC 2 Type II**: target within 18 months.
- **Bug bounty**: launch on HackerOne or Intigriti at GA.
- **security.txt** + responsible-disclosure email from day one.
- **Quarterly transparency report**: scans, recoveries, law-enforcement requests, vulnerabilities patched.

---

## 12. Internationalization & Accessibility

### i18n
- Finder UI localized to top 20 languages on day one (English, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Turkish, Arabic, Hebrew, Russian, Hindi, Bengali, Mandarin, Cantonese, Japanese, Korean, Thai, Indonesian).
- Owner app localized to top 10 at GA, top 20 within 6 months.
- All currency, date, time, number formatting via ICU.
- Right-to-left layouts properly mirrored.

### a11y
- WCAG 2.2 AA across web and mobile.
- All interactive elements ≥ 44pt tap target.
- Color contrast ≥ 4.5:1 minimum; lost-mode coral verified against bone and ink.
- Full screen-reader labels and semantic landmarks.
- Reduce-motion respected.
- Captions on voice messages auto-generated.

---

## 13. Telemetry & Analytics

- **Product analytics**: PostHog. Track key funnels (activation, lost-mode toggle, finder scan → message, message → handoff → recovery).
- **Recovery KPIs**: time-to-first-message, time-to-handoff, time-to-recovery, recovery rate by tier and country.
- **No third-party trackers** on the finder page (it's a privacy product — don't undermine the promise).
- **Marketing site**: privacy-preserving analytics (Plausible or Fathom). No Google Analytics. No Meta pixel by default; rebuildable via Conversions API server-side if needed.

---

## 14. Pricing & Monetization

### Hardware (one-time)
| Tier | Price/tag | Materials | Tech |
|---|---|---|---|
| Core | $14 | Premium silicone, matte | QR |
| Pro | $28 | Anodized aluminum, etched | QR + NFC |
| Signature | $58 | Full-grain leather + brass, monogrammed | QR + NFC |
| Track | $72 | Aluminum + BLE | QR + NFC + Find My / Find Hub beacon |

### Software (recurring)
| Plan | Price | Includes |
|---|---|---|
| Free | $0 forever | **2 items**, basic messaging, scan log 30 days, English only. Reward escrow + courier available with a **7% QurTag fee** on funds flowing through Stripe. |
| Plus | **$2.99/mo or $19/yr** | Unlimited items, **0% transaction fees** on rewards + labels, translation, trip mode, scan log forever, custody PDFs |
| Family | **$4.99/mo or $39/yr** | Plus + 5 members + Kid Mode + Caregiver Mode |
| Business | $79/mo per workspace + $4/seat | SSO, API, custom branding, partner portal, SLA |

Free tier is a real product; no dark patterns. Annual gets two months free.

### Revenue mix targets (year 2)
- 60% hardware
- 30% subscriptions
- 10% B2B / partner

---

## 15. Go-To-Market

1. **Hero hardware launch**: Signature monogrammed tag in 3 colorways, limited press list.
2. **Editorial partnerships**: Monocle, Hodinkee, Bloomberg Pursuits, Wirecutter, Condé Nast Traveler. The product is good-looking enough to earn unpaid editorial.
3. **Designer collabs**: 1–2 per year. Leather house, travel brand, illustrator.
4. **Affiliate**: travel bloggers, frequent-flyer communities.
5. **Real recovery stories** on the marketing site, named, with permission. Best content marketing in this category.
6. **Airline / hotel B2B pilots**: 2 lighthouse partners (one each) by month 9. Co-marketing benefits both sides.
7. **Gifting**: Q4 push, custom packaging, monogramming.
8. **Direct from Rimowa/Tumi/Away accessory walls** (long-term).

---

## 16. Phased Roadmap

### Phase 0 — Foundations (0–2 months)
- Brand identity, photography, marketing site live.
- Auth, account, item profile, tag activation.
- Finder page with messaging bridge.
- Push / email notifications.
- Stripe + storefront (Shopify Hydrogen front-end).
- Core hardware in production.

### Phase 1 — Launch (2–5 months)
- iOS + Android apps.
- Reward escrow.
- Translation by default (finder + threads).
- Trip Mode (flight integration).
- Apple Wallet / Google Wallet passes.
- Pro hardware tier.
- Live Activity / Dynamic Island.
- Recovery concierge.
- Public launch.

### Phase 2 — Network (5–10 months)
- Drop-off network v1 (10 lighthouse partners).
- Courier handoff with carbon-neutral default.
- Chain-of-custody packets.
- Family / Caregiver modes.
- Voice messages with auto-translation.
- Okoban / airline registry sync.
- Signature monogrammed tier.
- Public API + Zapier.

### Phase 3 — B2B & Edge (10–18 months)
- Business workspace + SSO + API GA.
- Partner portal for hotels / airlines.
- Insurance claim partnerships.
- Track tier (BLE hybrid hardware).
- HomeKit / Matter integration.
- SOC 2 Type II.
- Spatial / Vision Pro companion (skunkworks).

---

## 17. Success Metrics & KPIs

| Metric | 6-mo target | 12-mo target |
|---|---|---|
| Activated tags | 25,000 | 120,000 |
| Recovery rate (lost-mode scans) | 75% | 92% |
| Median time-to-recovery | 36 hr | 18 hr |
| Finder scan → message conversion | 50% | 70% |
| App Store rating | 4.6 | 4.8 |
| Paid plan attach | 12% | 22% |
| Monthly churn (paid) | 4% | 2.5% |
| NPS | 50 | 65 |
| Drop-off network partners | 25 | 250 |
| B2B workspaces | 5 | 40 |

---

## 18. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hardware quality complaint (premium price) | 1-year unconditional warranty; replacement-by-mail; QA per batch with photo log |
| Fraud on reward escrow | KYC threshold + dispute window + ML velocity rules + hold-and-review |
| Trolls / spam through finder bridge | Per-tag rate limits, CAPTCHA on suspicious sessions, reputation scoring |
| Translation misfires (medical/legal contexts) | Always show original alongside translation; disclaim |
| Privacy claim audit | Publish architecture transparency reports; bug bounty; SOC 2 |
| Battery on Track tier | Use coin cell + Apple Find My / Google Find Hub network — no proprietary mesh |
| B2B integrations slip | Don't gate consumer launch on partners; treat Phase 2 onward |
| Stripe Connect KYC friction for international finders | Document supported countries clearly; offer manual gift-card payout fallback |
| Legal — acting as a "lost & found service" in regulated jurisdictions | Local counsel review before launch in EU, UK, Japan |

---

## 19. Open Questions

1. Single brand for consumer + B2B, or two? (Bet: single brand, two product surfaces.)
2. Build proprietary courier rails or always aggregator? (Bet: aggregator forever.)
3. Acquire a small leather goods studio for Signature production, or partner? (Decision by month 6.)
4. Native iPad app or responsive web only? (Bet: responsive web v1, native iPad if signal.)
5. Public profile pages for items (à la lost-pet posters) — privacy concerns or marketing wins? (Bet: opt-in only, never default.)
6. Should reward escrow allow crypto payouts? (Bet: not until clear demand and regulatory clarity.)
7. Position Track tier as "Find My-compatible tracker" or hide it under recovery story? (Bet: hide under recovery, lead with reunion not surveillance.)

---

## 20. What "Done" Looks Like at GA

A traveler with a Rimowa Original Cabin, an Away Bigger Carry-On, and a Bellroy passport sleeve has a Signature leather tag on the suitcase, a Pro aluminum tag on the carry-on, and an iron-on Core label inside the sleeve. They tap their phone to any tag and the QurTag app opens to an item that already knows they're on UA901 LHR→SFO. If they lose any of them, the next person who scans sees a calm page in their own language with a real reward, a list of nearby hotels happy to take the item, and one tap to send it home. The bag arrives carbon-neutral two days later with a signed custody record they can attach to their insurance claim if anything was damaged. They never exchanged a phone number, an email, or an address with the finder.

That's the product. Everything in this PRD ladders to that paragraph.
