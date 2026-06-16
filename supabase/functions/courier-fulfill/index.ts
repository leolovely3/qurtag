// QurTag — courier-fulfill Edge Function (skeleton)
//
// Triggered manually (from the owner clicking "Pay & generate label") or
// from a Stripe webhook after the owner's payment captures. Generates a
// prepaid pickup label via Shippo, persists the URL + tracking number on
// courier_orders, and emails the finder the label.
//
// Deploy with:
//   supabase functions deploy courier-fulfill
//
// Required Edge Function env (Supabase Dashboard → Functions → Secrets):
//   SHIPPO_API_KEY           — production live key, with USPS/FedEx/UPS enabled
//   RESEND_API_KEY           — for emailing the label to the finder
//   SUPABASE_URL             — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY — provided automatically
//
// Inputs: { courierOrderId, finderEmail }

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { courierOrderId, finderEmail } = (await req.json()) as {
    courierOrderId: string;
    finderEmail: string;
  };

  if (!courierOrderId || !finderEmail) {
    return new Response('missing fields', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: order } = await supabase
    .from('courier_orders')
    .select('*, items(name, declared_value_cents)')
    .eq('id', courierOrderId)
    .maybeSingle();
  if (!order) return new Response('not found', { status: 404 });

  const shippoKey = Deno.env.get('SHIPPO_API_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!shippoKey || !resendKey) {
    return new Response('integration keys missing', { status: 500 });
  }

  // 1. Shippo: create shipment + buy label.
  //    This is a sketch. Real wiring requires the owner's return address,
  //    insurance, customs forms for international, etc. — fill in after
  //    your Shippo account is configured.
  const shippoRes = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${shippoKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // address_from: <owner's return address>,
      address_to: {
        street1: (order as any).address_line,
        city: (order as any).city ?? '',
        // state, zip, country — capture in v2
      },
      parcels: [
        { length: '10', width: '8', height: '4', distance_unit: 'in', weight: '3', mass_unit: 'lb' },
      ],
      async: false,
    }),
  });
  if (!shippoRes.ok) {
    return new Response(`shippo error: ${await shippoRes.text()}`, { status: 502 });
  }

  // 2. Persist label + tracking back to courier_orders.
  //    Skipped here — see the Shippo response → rates → transaction flow.

  // 3. Resend: email the finder the label.
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'QurTag <hello@qurtag.com>',
      to: finderEmail,
      subject: 'Your prepaid QurTag label is ready',
      html: `
        <h1>Thanks for sending it home.</h1>
        <p>The owner has paid for shipping. Print the attached label, stick it on the box, and
        drop it at any carrier location during your pickup window.</p>
        <p>The owner is notified automatically as the package moves.</p>
      `,
    }),
  });

  await supabase
    .from('courier_orders')
    .update({ state: 'label_generated' })
    .eq('id', courierOrderId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
