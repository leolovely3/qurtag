// QurTag — stripe-webhook
//
// Receives Stripe events and routes them. For rewards, marks 'held' when the
// PaymentIntent is authorized (capture pending). For courier payments, marks
// 'paid' and invokes courier-fulfill. For Connect Express accounts, marks
// finder_sessions.payouts_enabled_at when onboarding completes.
//
// Wire it up:
//   Stripe Dashboard → Developers → Webhooks → Add endpoint:
//     URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//     Events:
//       payment_intent.requires_capture
//       payment_intent.succeeded
//       account.updated
//
// Required env:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET        — Stripe Dashboard → Endpoint → Signing secret
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

const stripe = stripeKey
  ? new Stripe(stripeKey, {
      apiVersion: '2024-06-20',
      // Required for Deno: tell Stripe to use the Fetch-based HTTP client and
      // a SubtleCrypto provider compatible with the runtime.
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!stripe || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  // Read the raw body — required for signature verification. Do not pre-parse.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('[QurTag stripe-webhook] signature verification failed', err);
    return new Response('invalid signature', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  switch (event.type) {
    case 'payment_intent.requires_capture': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const rewardId = intent.metadata?.qurtag_reward_id;
      if (rewardId) {
        await supabase
          .from('rewards')
          .update({ state: 'held', held_at: new Date().toISOString() })
          .eq('id', rewardId);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const courierOrderId = intent.metadata?.qurtag_courier_order_id;
      if (courierOrderId) {
        await supabase.from('courier_orders').update({ state: 'paid' }).eq('id', courierOrderId);

        // Best-effort dispatch to courier-fulfill.
        const fulfillUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/courier-fulfill`;
        void fetch(fulfillUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            courierOrderId,
            finderEmail: intent.receipt_email ?? '',
          }),
        });
      }
      break;
    }

    case 'account.updated': {
      // Connect Express onboarding completion — mark the finder as payout-enabled.
      const account = event.data.object as Stripe.Account;
      const finderSessionId = account.metadata?.qurtag_finder_session_id;
      if (finderSessionId && account.payouts_enabled && account.charges_enabled) {
        await supabase
          .from('finder_sessions')
          .update({ payouts_enabled_at: new Date().toISOString() })
          .eq('id', finderSessionId);
      }
      break;
    }

    default:
      // Other events are intentionally ignored.
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
