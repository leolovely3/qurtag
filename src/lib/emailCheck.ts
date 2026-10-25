/**
 * Whether a web owner has confirmed that QuR Tag's emails reach them (the "Send me a test email"
 * check in Settings and at the end of the first-tag walkthrough). On the web the finder's note
 * arrives by email, and a first note lost in spam is a lost item, so Items shows a reminder until
 * the owner says the test arrived.
 *
 * Kept per account in this browser (localStorage), like the Getting started checklist: the
 * database has no table for small preferences. Another browser asks again, which is harmless.
 */
import type { StorageLike } from './gettingStarted';

const key = (userId: string) => `qurtag.email-ok.${userId}`;

export type EmailCheck = 'unknown' | 'sent' | 'confirmed';

export function loadEmailCheck(storage: StorageLike | null, userId: string): EmailCheck {
  try {
    const v = storage?.getItem(key(userId));
    return v === 'confirmed' || v === 'sent' ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function saveEmailCheck(storage: StorageLike | null, userId: string, value: EmailCheck): void {
  try {
    storage?.setItem(key(userId), value);
  } catch {
    /* storage off: the reminder may show again */
  }
}

/** Items shows the reminder on the web, when email is on, the owner has a thing to lose and has not confirmed. */
export function showEmailReminder(facts: { native: boolean; emailOn: boolean; itemCount: number; check: EmailCheck }): boolean {
  return !facts.native && facts.emailOn && facts.itemCount > 0 && facts.check !== 'confirmed';
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
