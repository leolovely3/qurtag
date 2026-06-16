# QurTag — Stripe test-mode demo script

Walk this end-to-end the first time you turn Stripe on. Twenty minutes, no
charges, two working flows demonstrable to anyone after.

## 0. Prereqs

You should already have:

- A Supabase project, migrations applied through `20260614050000_addresses_rewards_trips_actions.sql`.
- The Supabase CLI installed and linked: `supabase link --project-ref <ref>`.
- A Stripe account (free; flip into Test Mode in the Dashboard).
- The local app working — you can sign in, create an item, see your inbox.

## 1. Get Stripe keys

Stripe Dashboard → **Developers → API keys**. In **Test Mode**, copy:

```
Publishable key   pk_test_xxx       (we don't use this in v1, but keep it)
Secret key        sk_test_xxx       (this is what the Edge Functions need)
```

## 2. Set Edge Function secrets

Supabase Dashboard → **Project → Edge Functions → Manage secrets**, add:

```
STRIPE_SECRET_KEY=sk_test_xxx
CAIRN_APP_URL=http://localhost:5180          # local for now; flip later
STRIPE_WEBHOOK_SECRET=                       # leave blank for now — step 4 fills it
```

Or via CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set CAIRN_APP_URL=http://localhost:5180
```

## 3. Deploy the four functions

```bash
supabase functions deploy create-reward-hold
supabase functions deploy release-reward
supabase functions deploy create-checkout-courier
supabase functions deploy stripe-webhook --no-verify-jwt
```

The `--no-verify-jwt` flag on `stripe-webhook` is required because Stripe
calls the function without a Supabase JWT.

## 4. Wire the Stripe webhook

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- Endpoint URL:
  `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
- Events to listen for:
  - `payment_intent.requires_capture`
  - `payment_intent.succeeded`

After saving, copy the endpoint's **Signing secret** (`whsec_...`) and run:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase functions deploy stripe-webhook --no-verify-jwt   # picks up the new secret
```

## 5. Test card numbers

Use these any time Stripe Checkout asks for a card:

| Card                   | Number              | Outcome                                |
|------------------------|---------------------|----------------------------------------|
| Succeeds immediately   | 4242 4242 4242 4242 | Normal success                          |
| Requires authentication| 4000 0025 0000 3155 | 3D Secure modal — confirm to succeed    |
| Declined               | 4000 0000 0000 0002 | Stripe rejects                          |
| Insufficient funds     | 4000 0000 0000 9995 | Authorization fails                     |

For all of them: any future expiry (`12/34`), any 3-digit CVC, any postal code.

## 6. Demo path A — Reward escrow

1. Sign in to your QurTag app.
2. Add an item (Rimowa Original Cabin, declared value $1200).
3. Open the item → toggle **Lost mode** on.
4. Pick a reward: $50.
5. Click **"Place $50 in escrow"**. You'll bounce to a Stripe Checkout page.
6. Pay with `4242 4242 4242 4242`.
7. You'll land back on `/app/items/<id>?reward=held`.
8. Confirm:
   - The reward badge reads **In escrow**.
   - In Stripe Dashboard → **Payments**: a $50 PaymentIntent with status
     **Uncaptured** (the manual capture worked).
   - In Supabase → **Table editor → rewards**: row state is `held` and
     `stripe_payment_intent_id` is filled in.

9. Now release it. Open the related thread in `/app/inbox` and click
   **Mark as reunited**. When prompted, release the reward.
10. Confirm:
    - The reward badge flips to **Released**.
    - Stripe Dashboard payment status flips to **Succeeded** ($50 captured).
    - In your test balance you see the funds.

## 7. Demo path B — Courier label payment

1. From your incognito window, open the printed tag URL (`/find/<public_id>`).
2. Send a quick note and request a courier (any pickup address, any window).
3. Back in your main window, open the thread at `/app/inbox/<thread>`.
4. You'll see the **Courier pickup** card with state "The finder is ready
   for pickup."
5. Click **Pay $14.99 & generate label**. Stripe Checkout opens.
6. Pay with `4242 4242 4242 4242`.
7. You'll land back on `/app/inbox/<thread>?courier=paid`.
8. Confirm:
   - The courier card state changes (via webhook) to "Paid — generating label…"
   - In Supabase → `courier_orders`: state is `paid`.
   - If you've also wired Shippo + the `courier-fulfill` function, the label
     URL and tracking number appear. If not (the v1 default), the function
     errors silently in the logs — that's fine for the demo.

## 8. What "Pass" looks like

After both flows complete, you should be able to:

- Pull up Stripe Dashboard → **Payments** and show two successful $50 +
  $14.99 captures.
- Pull up Supabase → `rewards` and `courier_orders` rows in their final
  states (`released`, `paid`).
- Walk through the UI showing both checkout flows feel native.

## 9. When you flip to live mode

1. Stripe Dashboard → top-left → toggle off Test Mode.
2. Re-copy the **live** API keys.
3. Re-run step 2 with the live `sk_live_...` key.
4. Re-create the webhook against the same Supabase endpoint, using a new
   signing secret.
5. Update `STRIPE_WEBHOOK_SECRET` and redeploy `stripe-webhook`.

## 10. Common gotchas

- **"create-reward-hold returns 400."** `STRIPE_SECRET_KEY` not set on the
  Edge Function. Set it via `supabase secrets set` and redeploy.
- **Webhook never fires.** Stripe Dashboard → Webhooks → your endpoint →
  "Recent deliveries". You'll see the failed attempts and the error body.
- **Webhook fires but DB unchanged.** Check function logs: Supabase
  Dashboard → Edge Functions → `stripe-webhook` → Logs. Usually it's a
  metadata key mismatch.
- **Reward state stuck on `pending`.** The webhook didn't fire (Stripe never
  saw a `requires_capture`) — usually means Checkout was cancelled. Click
  escrow again to retry.
- **Released reward stays in your account, not the finder's.** Expected for
  v1. Finder payout via Stripe Connect Express is documented in
  [SETUP.md §9e](SETUP.md).

## What this demo proves

When you walk someone through this in twenty minutes, they see:

- A premium owner UI for arming a lost item and putting real money behind it.
- A premium finder UI for reporting + requesting a courier.
- Real money moving via Stripe, with real Stripe Dashboard receipts.
- A privacy-preserving thread between two strangers.

That's the whole differentiator in one demo.
