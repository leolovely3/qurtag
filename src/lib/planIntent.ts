/**
 * A visitor who pressed "Pay $19 a year" on Pricing while signed out is sent to make an account
 * first. The address they return to (/app/membership?plan=plus) carries the plan, so the sign-up
 * screen can say what happens next instead of "Make your free tag".
 */
import { PLAN_INFO, priceLabel, productFor, type PaidPlan } from '../../server/billing/catalog';

export function planFromNext(next: string | null | undefined): PaidPlan | null {
  const m = /^\/app\/membership\?(?:.*&)?plan=(plus|family)(?:&|$)/.exec(next ?? '');
  return m ? (m[1] as PaidPlan) : null;
}

/** "Create your account, then you will pay $19 a year for Plus." */
export function planIntentLine(plan: PaidPlan): string {
  return `Create your account, then you will pay ${priceLabel(productFor(plan, 'year').cents)} a year for ${PLAN_INFO[plan].name}.`;
}
