// QurTag — release-reward Edge Function
//
// 1. Captures the previously-held PaymentIntent on the owner's behalf.
// 2. If the finder has completed Stripe Connect Express onboarding,
//    immediately transfers the captured amount to their connected account.
//    Otherwise the funds stay in the owner's balance and we mark the
//    reward 'released' anyway — the owner can settle directly.
//
// Required Edge Function env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL                 — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY    — provided automatically

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { rewardId } = (await req.json()) as { rewardId: string };
  if (!rewardId) return new Response('missing rewardId', { status: 400 });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return new Response('STRIPE_SECRET_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: reward } = await supabase
    .from('rewards')
    .select('*, threads(finder_session_id)')
    .eq('id', rewardId)
    .maybeSingle();
  if (!reward) return new Response('not found', { status: 404 });
  if (reward.state !== 'held') {
    return new Response(`reward is ${reward.state}; expected held`, { status: 400 });
  }
  if (!reward.stripe_payment_intent_id) {
    return new Response('no payment intent on reward', { status: 400 });
  }

  // 1. Capture.
  const captureRes = await fetch(
    `https://api.stripe.com/v1/payment_intents/${reward.stripe_payment_intent_id}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!captureRes.ok) return new Response(`capture: ${await captureRes.text()}`, { status: 502 });

  // 2. Transfer to finder if Connect onboarded.
  let transferred = false;
  const finderSessionId = (reward as any).threads?.finder_session_id;
  if (finderSessionId) {
    const { data: finder } = await supabase
      .from('finder_sessions')
      .select('stripe_account_id, payouts_enabled_at')
      .eq('id', finderSessionId)
      .maybeSingle();
    if (finder?.stripe_account_id) {
      const tf = new URLSearchParams();
      tf.set('amount', String(reward.amount_cents));
      tf.set('currency', reward.currency ?? 'usd');
      tf.set('destination', finder.stripe_account_id);
      tf.set('metadata[cairn_reward_id]', rewardId);
      const tfRes = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tf.toString(),
      });
      transferred = tfRes.ok;
      if (!tfRes.ok) console.error('[QurTag release-reward] transfer', await tfRes.text());
    }
  }

  await supabase
    .from('rewards')
    .update({ state: 'released', released_at: new Date().toISOString() })
    .eq('id', rewardId);

  return new Response(JSON.stringify({ ok: true, transferred }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
