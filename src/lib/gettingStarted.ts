/**
 * The "Getting started" checklist on Items, and where the person is in the first-tag
 * walkthrough. Progress is kept per account in this browser or phone (localStorage), because
 * the database has no table for small preferences and none was added for this: the same person
 * on a second device sees the checklist again, with the steps the account already proves done
 * (an item exists, alerts are on). Each step can be dismissed by itself, and the whole card can
 * be closed.
 *
 * Which steps are done:
 *   add     the account has an item (derived, never stored)
 *   print   the person printed or shared a tag (stored)
 *   stick   the person said they stuck it on (stored, self-confirmed)
 *   test    the person said a camera scan of the printed tag opened the item's page (stored,
 *           self-confirmed); opening the test view of the finder page does not count, because
 *           it does not check the paper tag
 *   alerts  the iPhone's alerts are allowed (derived); iPhone app only
 */

/**
 * Set by the finder page's test view (src/routes/finder/FinderView.tsx, /find/<code>#test=1) to
 * the code of the tag the owner opened, so the walkthrough can say what the view showed.
 */
export const OWNER_TEST_KEY = 'qurtag.owner-test';

/** Set (in this tab's session) when the person chooses Skip for now, so Items does not send them straight back to the walkthrough. */
export const SKIP_KEY = 'qurtag.first-tag.skipped';

export type StepId = 'add' | 'print' | 'stick' | 'test' | 'alerts';

export const STEP_ORDER: StepId[] = ['add', 'print', 'stick', 'test', 'alerts'];

export interface Progress {
  /** Steps the person did or confirmed. */
  done: StepId[];
  /** Steps the person dismissed without doing. */
  skipped: StepId[];
  /** The whole card was closed. */
  closed: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const key = (userId: string) => `qurtag.start.${userId}`;

export function emptyProgress(): Progress {
  return { done: [], skipped: [], closed: false };
}

export function loadProgress(storage: StorageLike | null, userId: string): Progress {
  try {
    const raw = storage?.getItem(key(userId));
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Partial<Progress>;
    const ok = (v: unknown): StepId[] => (Array.isArray(v) ? v.filter((s): s is StepId => STEP_ORDER.includes(s as StepId)) : []);
    return { done: ok(p.done), skipped: ok(p.skipped), closed: p.closed === true };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(storage: StorageLike | null, userId: string, progress: Progress): void {
  try {
    storage?.setItem(key(userId), JSON.stringify(progress));
  } catch {
    /* storage off: the checklist simply starts again next time */
  }
}

export function markDone(p: Progress, step: StepId): Progress {
  if (p.done.includes(step)) return p;
  return { ...p, done: [...p.done, step], skipped: p.skipped.filter((s) => s !== step) };
}

export function markSkipped(p: Progress, step: StepId): Progress {
  if (p.skipped.includes(step) || p.done.includes(step)) return p;
  return { ...p, skipped: [...p.skipped, step] };
}

export function closeCard(p: Progress): Progress {
  return { ...p, closed: true };
}

export interface Facts {
  /** How many items the account has. */
  itemCount: number;
  /** True in the iPhone app, where alerts exist. */
  native: boolean;
  /** True when the phone allows alerts. */
  alertsOn: boolean;
}

export interface StepState {
  id: StepId;
  done: boolean;
  skipped: boolean;
}

/** The steps to show, in order, each with whether it is done or dismissed. Alerts only on the iPhone. */
export function stepStates(p: Progress, facts: Facts): StepState[] {
  return STEP_ORDER.filter((id) => id !== 'alerts' || facts.native).map((id) => {
    const derived = id === 'add' ? facts.itemCount > 0 : id === 'alerts' ? facts.alertsOn : false;
    return { id, done: derived || p.done.includes(id), skipped: !derived && p.skipped.includes(id) };
  });
}

/** True when every step is done or dismissed, or the card was closed, or there is nothing to start with. */
export function isFinished(p: Progress, facts: Facts): boolean {
  if (p.closed) return true;
  return stepStates(p, facts).every((s) => s.done || s.skipped);
}

/** The first step still open, which the card highlights. */
export function nextStep(p: Progress, facts: Facts): StepId | null {
  return stepStates(p, facts).find((s) => !s.done && !s.skipped)?.id ?? null;
}
