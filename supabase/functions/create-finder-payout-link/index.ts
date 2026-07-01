// QurTag — create-finder-payout-link Edge Function
//
// Creates (or fetches) a Stripe Connect Express account for a finder and
// returns an Account Link they can use to onboard. After completion, Stripe
// redirects them back, and release-reward can dispatch funds via Transfer.
//
// Deploy:
//   supabase functions deploy create-finder-payout-link --no-verify-jwt
//
// Required env:
//   STRIPE_SECRET_KEY
//   QURTAG_APP_URL
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Inputs: { finderSessionId, email, country }

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { finderSessionId, email, country, returnTag } = (await req.json()) as {
    finderSessionId: string;
    email?: string;
    country?: string;
    returnTag?: string;
  };
  if (!finderSessionId) return new Response('missing finderSessionId', { status: 400 });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const appUrl = Deno.env.get('QURTAG_APP_URL') ?? 'https://app.qurtag.com';
  if (!stripeKey) return new Response('STRIPE_SECRET_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: session } = await supabase
    .from('finder_sessions')
    .select('*')
    .eq('id', finderSessionId)
    .maybeSingle();
  if (!session) return new Response('finder session not found', { status: 404 });

  let accountId: string | null = (session as any).stripe_account_id;

  if (!accountId) {
    const form = new URLSearchParams();
    form.set('type', 'express');
    form.set('country', country ?? (session as any).payout_country ?? 'US');
    if (email) form.set('email', email);
    form.set('capabilities[transfers][requested]', 'true');
    form.set('metadata[qurtag_finder_session_id]', finderSessionId);
    const res = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) return new Response(`stripe error: ${await res.text()}`, { status: 502 });
    const account = (await res.json()) as { id: string };
    accountId = account.id;
    await supabase
      .from('finder_sessions')
      .update({ stripe_account_id: accountId, payout_email: email ?? null })
      .eq('id', finderSessionId);
  }

  // Account Link for onboarding.
  const linkForm = new URLSearchParams();
  linkForm.set('account', accountId);
  linkForm.set('type', 'account_onboarding');
  linkForm.set('refresh_url', `${appUrl}/find/${returnTag ?? ''}`);
  linkForm.set('return_url', `${appUrl}/find/${returnTag ?? ''}?payout=ready`);
  const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: linkForm.toString(),
  });
  if (!linkRes.ok) return new Response(`stripe link: ${await linkRes.text()}`, { status: 502 });
  const link = (await linkRes.json()) as { url: string };

  return new Response(JSON.stringify({ url: link.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
