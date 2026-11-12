/**
 * What to say when the plan holds no more items. Said when the Add item form opens (so nobody
 * fills it in for nothing), on Items, and if a save is refused. On the web the way on is the plans;
 * in the phone apps, while memberships are hidden there (src/lib/iap.ts), it is deleting an item
 * the person no longer needs, and the screen says plainly that more items are coming to the app.
 */
export interface LimitCopy {
  title: string;
  body: string;
  /** The main way on: the plans (web) or the items list (to delete one). */
  action: 'plans' | 'items';
}

export function limitCopy(input: {
  membershipsShown: boolean;
  itemLimit: number | null;
  itemsUsed?: number;
  /**
   * The store that sells memberships in this app ("Google Play", "the App Store") when this build
   * can sell but the store did not answer (no store account on the phone, or no network): the
   * words then say so, instead of "coming".
   */
  unavailableStore?: string;
}): LimitCopy {
  const n = input.itemLimit ?? input.itemsUsed ?? 0;
  const words = n === 3 ? 'three' : String(n);
  if (!input.membershipsShown && input.unavailableStore) {
    return {
      title: `You have ${words} items, the most on Free`,
      body: `To tag something else, delete an item you no longer need. Plus and Family are sold in the app through ${input.unavailableStore}, which is not available on this phone right now. Check your connection and that you are signed in to ${input.unavailableStore}, then open the app again.`,
      action: 'items',
    };
  }
  if (!input.membershipsShown) {
    return {
      title: `You have ${words} items, the most for now`,
      body: 'To tag something else, delete an item you no longer need. More items are coming to the app.',
      action: 'items',
    };
  }
  if (input.itemLimit === 3) {
    return {
      title: 'You have three items, the most on Free',
      body: 'To tag something else, see the plans, or delete an item you no longer need.',
      action: 'plans',
    };
  }
  return {
    title: `Your plan covers ${words} items, and you have ${words}`,
    body: 'To tag something else, delete an item you no longer need first.',
    action: 'items',
  };
}
