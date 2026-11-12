/**
 * The words and addresses of the phone stores, kept apart from src/lib/iap.ts (which loads
 * RevenueCat) and with no imports, so they can be tested on their own.
 */

/**
 * What to say when the store did not complete a purchase. RevenueCat's error codes are the same
 * on both platforms; the store is named for the phone.
 */
export function purchaseFailedText(e: unknown, store: string): string {
  const code = String((e as { code?: unknown })?.code ?? '');
  const Store = store.charAt(0).toUpperCase() + store.slice(1);
  // PURCHASE_NOT_ALLOWED_ERROR, STORE_PROBLEM_ERROR (the store is missing, signed out or not reachable).
  if (code === '3' || code === '2') {
    return `${Store} is not available on this phone right now. Check that you are signed in to ${store}, then try again. You were not charged.`;
  }
  // PAYMENT_PENDING_ERROR: some Google Play payment methods take time to confirm.
  if (code === '20') return 'Your payment is waiting to be confirmed. Your membership starts as soon as it goes through.';
  // PRODUCT_ALREADY_PURCHASED_ERROR
  if (code === '6') return `You already have this membership with ${store}. Use Restore purchases below.`;
  return `${Store} could not complete the purchase. You were not charged. Please try again.`;
}

/**
 * Where a person changes or cancels a membership bought in a phone app: Apple's subscriptions
 * page, or Google Play's subscription centre (for one product when it is known).
 */
export function storeSubscriptionsUrl(provider: 'apple' | 'google', productId?: string | null): string {
  if (provider === 'apple') return 'https://apps.apple.com/account/subscriptions';
  const base = 'https://play.google.com/store/account/subscriptions';
  return productId ? `${base}?sku=${encodeURIComponent(productId)}&package=app.impactconsultingai.qurtag` : base;
}
