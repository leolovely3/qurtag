import { supabase } from './supabase';

/**
 * Call a Supabase Edge Function that returns a Stripe Checkout URL.
 * On success we redirect the browser. No @stripe/stripe-js needed -
 * Checkout is a hosted page.
 */
export async function startStripeCheckout(
  functionName: 'create-reward-hold' | 'create-checkout-courier',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    functionName,
    { body },
  );
  if (error) {
    console.error('[QurTag] startStripeCheckout', error);
    return { ok: false, error: error.message };
  }
  if (data?.error) return { ok: false, error: data.error };
  if (data?.url) {
    window.location.href = data.url;
    return { ok: true };
  }
  return { ok: false, error: 'Stripe Checkout URL missing in response.' };
}

export async function startFinderPayoutOnboarding(input: {
  finderSessionId: string;
  email?: string;
  returnTag?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'create-finder-payout-link',
    { body: input },
  );
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  if (data?.url) {
    window.location.href = data.url;
    return { ok: true };
  }
  return { ok: false, error: 'Connect onboarding URL missing in response.' };
}

export async function issueAppleWalletPass(itemId: string): Promise<{ ok: boolean; preview?: unknown; error?: string }> {
  const { data, error } = await supabase.functions.invoke<any>('issue-apple-pass', { body: { itemId } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, preview: data?.pass };
}

export async function issueGoogleWalletPass(itemId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'issue-google-pass',
    { body: { itemId } },
  );
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  if (data?.url) return { ok: true, url: data.url };
  return { ok: false, error: 'No Wallet URL returned.' };
}

export async function releaseReward(rewardId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'release-reward',
    { body: { rewardId } },
  );
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: !!data?.ok };
}
