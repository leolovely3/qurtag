/**
 * The quiet "Unlimited with Plus" link under the item count on Items.
 *
 * It appears only when it is useful and allowed: the person pays for nothing (Free), their items
 * are governed by their own Free household (not a Family they were invited to), they are at the
 * free limit or one below it, and memberships may be shown at all (useMembershipsAvailable: always
 * on the web; in the iPhone app only once Apple's products have loaded, like the Settings
 * Membership row). Below that there is nothing to say yet; above the limit the read-only notice
 * already links to the plans. The limit comes from the plan catalog, never a number written here.
 */
import { FREE_ITEM_LIMIT, type Plan } from '../../server/billing/catalog';

export interface NudgeMembership {
  plan: Plan;
  items_plan: Plan;
  own_household_id: string | null;
  household_id: string | null;
}

export function showPlusNudge(
  membership: NudgeMembership | null,
  itemCount: number,
  membershipsAvailable: boolean,
  freeLimit: number = FREE_ITEM_LIMIT,
): boolean {
  if (!membership || !membershipsAvailable) return false;
  if (membership.plan !== 'free' || membership.items_plan !== 'free') return false;
  // A Family invitee's items live in the family's household.
  if (membership.household_id !== null && membership.household_id !== membership.own_household_id) return false;
  return itemCount >= freeLimit - 1 && itemCount <= freeLimit;
}
