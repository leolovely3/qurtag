/**
 * Memberships from the screens' side: what plan the signed-in person is on, the Family
 * household, and the calls that start a payment on the web.
 *
 * The plan is never decided here. The database computes it (my_membership) from the
 * subscriptions that Stripe's and RevenueCat's webhooks recorded, so a membership bought on
 * the web or on the iPhone reads the same on both. Buying on the iPhone goes through Apple
 * (src/lib/iap.ts); buying on the web goes through Stripe Checkout (below), and the
 * iPhone app never shows a way to pay outside Apple.
 */
import { db } from './db';
import { getDataPass } from './authClient';
import { serverUrl } from './platform';
import type { Interval, PaidPlan, Plan } from '../../server/billing/catalog';

export interface Membership {
  own_household_id: string | null;
  household_id: string | null;
  /** What the person pays for. */
  plan: Plan;
  /** The plan that governs the items they see (a family member gets the family's). */
  items_plan: Plan;
  /** Items allowed in that household; null means no limit. */
  item_limit: number | null;
  items_used: number;
  can_add_items: boolean;
  provider: 'stripe' | 'apple' | null;
  billing_interval: Interval | null;
  status: 'none' | 'active' | 'canceling' | 'billing_issue';
  /** Whether it renews by itself. */
  renews: boolean;
  period_end: string | null;
  read_only_item_ids: string[];
}

export interface FamilyPerson {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joined_at: string;
  is_me: boolean;
}

export interface Family {
  role: 'none' | 'owner' | 'member';
  household_id?: string;
  /** False while the family's plan has lapsed: members are paused, nothing is deleted. */
  active?: boolean;
  seats_total?: number;
  members?: FamilyPerson[];
  /** Only the owner sees pending invites. */
  invites?: { id: string; email: string; expires_at: string }[] | null;
}

/** The database's short reasons, in plain words for the screens. */
const REASON_TEXT: Record<string, string> = {
  item_limit: 'You have reached the limit of your plan. Delete an item, or upgrade, to add another.',
  read_only_item: 'This item is over your plan\'s limit, so it cannot be changed. Delete an item or upgrade to edit it again.',
  membership_active: 'Your membership is still renewing. Cancel it first (Membership, then Manage), then delete your account.',
  invite_invalid: 'This invite is no longer valid. Ask for a new one.',
  invite_wrong_email: 'This invite was sent to a different email address. Sign in with that email to accept it.',
  invite_self: 'You cannot invite yourself.',
  family_inactive: 'This family plan is not active right now.',
  family_full: 'This family already has 5 people.',
  already_in_family: 'You are already in a family. Leave it first to join this one.',
  owner_has_family: 'You have people in your own family. Remove them first to join another.',
  not_a_member: 'You are not in a family.',
  not_found: 'That could not be found.',
};

export function reasonText(message: string | undefined, fallback = 'Something went wrong. Please try again.'): string {
  return (message && REASON_TEXT[message]) || fallback;
}

export async function fetchMembership(): Promise<Membership | null> {
  const { data, error } = await db.rpc('my_membership');
  if (error || !data) {
    console.error('[QuR Tag] fetchMembership', error);
    return null;
  }
  return data as unknown as Membership;
}

export async function fetchFamily(): Promise<Family | null> {
  const { data, error } = await db.rpc('my_family');
  if (error || !data) {
    console.error('[QuR Tag] fetchFamily', error);
    return null;
  }
  return data as unknown as Family;
}

// ------------------------------------------------------------------ the server routes

interface Answer<T> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string | null;
}

async function post<T>(name: string, body: unknown, signedIn: boolean): Promise<Answer<T>> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signedIn) {
      const pass = await getDataPass();
      if (!pass) return { ok: false, status: 401, data: null, message: 'Please sign in again.' };
      headers.authorization = `Bearer ${pass}`;
    }
    const r = await fetch(serverUrl(`/api/fn/${name}`), { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
    const json = (await r.json().catch(() => null)) as (T & { message?: string }) | null;
    return { ok: r.ok, status: r.status, data: r.ok ? json : null, message: r.ok ? null : (json?.message ?? 'Something went wrong. Please try again.') };
  } catch {
    return { ok: false, status: 0, data: null, message: 'Could not reach QuR Tag. Check your connection and try again.' };
  }
}

/** Which of the four plans can be bought on the web right now (a payment setting may be missing). */
export async function fetchBillingConfig(): Promise<Record<string, boolean> | null> {
  const a = await post<{ available: Record<string, boolean> }>('billing-config', {}, false);
  return a.data?.available ?? null;
}

/** Whether the server can send email (RESEND_API_KEY is set). Null when it could not be asked. */
export async function fetchEmailAvailable(): Promise<boolean | null> {
  const a = await post<{ email?: boolean }>('billing-config', {}, false);
  return a.data ? a.data.email === true : null;
}

/** Starts Stripe Checkout; the page then leaves for Stripe's. */
export async function startWebCheckout(plan: PaidPlan, interval: Interval): Promise<{ url: string } | { error: string }> {
  const a = await post<{ url: string }>('billing-checkout', { plan, interval }, true);
  return a.data?.url ? { url: a.data.url } : { error: a.message ?? 'Could not open the payment page.' };
}

/** Stripe's customer portal: change card, switch plan, cancel. */
export async function openWebPortal(): Promise<{ url: string } | { error: string }> {
  const a = await post<{ url: string }>('billing-portal', {}, true);
  return a.data?.url ? { url: a.data.url } : { error: a.message ?? 'Could not open the membership page.' };
}

export interface InviteResult {
  link: string;
  emailed: boolean;
  email: string;
  expires_at: string;
}

export async function inviteToFamily(email: string): Promise<InviteResult | { error: string }> {
  const a = await post<InviteResult>('family-invite', { email }, true);
  return a.data ?? { error: a.message ?? 'Could not make the invite.' };
}

// ------------------------------------------------------------------ the data API

export async function previewInvite(token: string): Promise<{
  valid: boolean;
  reason?: 'invalid' | 'revoked' | 'used' | 'expired';
  inviter?: string;
  email_matches?: boolean;
  invited_email_hint?: string;
  family_active?: boolean;
} | null> {
  const { data, error } = await db.rpc('invite_preview', { p_token: token });
  if (error || !data) return null;
  return data as never;
}

export async function acceptInvite(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc('accept_invite', { p_token: token });
  return error ? { ok: false, error: reasonText(error.message) } : { ok: true };
}

export async function leaveFamily(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc('leave_household');
  return error ? { ok: false, error: reasonText(error.message) } : { ok: true };
}

export async function removeFamilyMember(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc('remove_member', { p_user: userId });
  return error ? { ok: false, error: reasonText(error.message) } : { ok: true };
}

export async function revokeFamilyInvite(inviteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc('revoke_invite', { p_invite: inviteId });
  return error ? { ok: false, error: reasonText(error.message) } : { ok: true };
}

/** Asks for the membership again every 2 seconds for up to 40, until `done` says it changed. */
export async function waitForMembership(done: (m: Membership) => boolean, tries = 20): Promise<Membership | null> {
  let last: Membership | null = null;
  for (let i = 0; i < tries; i++) {
    last = await fetchMembership();
    if (last && done(last)) return last;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}
