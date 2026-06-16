// QurTag — create-reward-hold Edge Function
//
// Creates a Stripe Checkout session (manual capture) that the owner pays into.
// On success, the session amount is HELD (PaymentIntent capture_method=manual)
// until we call release-reward, which captures it and dispatches to the
// finder via Stripe Connect Express.
//
// Deploy with:
//   supabase functions deploy create-reward-hold
//
// Required Edge Function env (Supabase Dashboard → Functions → Secrets):
//   STRIPE_SECRET_KEY            — sk_live_... (or sk_test_... for testing)
//   CAIRN_APP_URL                — https://app.qurtag.com
//   SUPABASE_URL                 — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY    — provided automatically

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { rewardId, itemId, amountCents } = (await req.json()) as {
    rewardId: string;
    itemId: string;
    amountCents: number;
  };
  if (!rewardId || !itemId || !amountCents) return new Response('missing fields', { status: 400 });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const appUrl = Deno.env.get('CAIRN_APP_URL') ?? 'https://app.qurtag.com';
  if (!stripeKey) return new Response('STRIPE_SECRET_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Create Checkout session with capture_method=manual on the payment intent.
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('payment_intent_data[capture_method]', 'manual');
  form.set('payment_intent_data[metadata][cairn_reward_id]', rewardId);
  form.set('line_items[0][price_data][currency]', 'usd');
  form.set('line_items[0][price_data][unit_amount]', String(amountCents));
  form.set('line_items[0][price_data][product_data][name]', 'QurTag reward — held in escrow');
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', `${appUrl}/app/items/${itemId}?reward=held`);
  form.set('cancel_url', `${appUrl}/app/items/${itemId}?reward=cancelled`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    return new Response(`stripe error: ${await res.text()}`, { status: 502 });
  }
  const session = (await res.json()) as { id: string; url: string; payment_intent: string };

  // Persist the PaymentIntent id on the reward row so the webhook can find it.
  await supabase
    .from('rewards')
    .update({ stripe_payment_intent_id: session.payment_intent })
    .eq('id', rewardId);

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
