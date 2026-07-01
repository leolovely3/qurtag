// QurTag — create-checkout-courier Edge Function
//
// Owner-side Stripe Checkout to pay for a prepaid courier label. On success
// webhook, the stripe-webhook function flips courier_orders.state to 'paid'
// and triggers courier-fulfill to generate the actual label via Shippo.
//
// Required Edge Function env:
//   STRIPE_SECRET_KEY
//   QURTAG_APP_URL
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { courierOrderId, amountCents } = (await req.json()) as {
    courierOrderId: string;
    amountCents: number;
  };
  if (!courierOrderId || !amountCents) return new Response('missing fields', { status: 400 });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const appUrl = Deno.env.get('QURTAG_APP_URL') ?? 'https://app.qurtag.com';
  if (!stripeKey) return new Response('STRIPE_SECRET_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: order } = await supabase
    .from('courier_orders')
    .select('id, thread_id')
    .eq('id', courierOrderId)
    .maybeSingle();
  if (!order) return new Response('not found', { status: 404 });

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('payment_intent_data[metadata][qurtag_courier_order_id]', courierOrderId);
  form.set('line_items[0][price_data][currency]', 'usd');
  form.set('line_items[0][price_data][unit_amount]', String(amountCents));
  form.set('line_items[0][price_data][product_data][name]', 'QurTag courier label (prepaid)');
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', `${appUrl}/app/inbox/${order.thread_id}?courier=paid`);
  form.set('cancel_url', `${appUrl}/app/inbox/${order.thread_id}?courier=cancelled`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) return new Response(`stripe error: ${await res.text()}`, { status: 502 });
  const session = (await res.json()) as { id: string; url: string };

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
