import { useEffect, useState } from 'react';
import { db } from './db';
import { useAuth } from './auth';

/**
 * The Super Admin screens' calls to the data API (db/admin.sql). Every function checks in
 * the database, for every call, that the live session belongs to a super admin and writes
 * the action to the admin log; this file only asks. Being an admin cannot be set from the
 * app: it is set by a rollout file run on the founder's Mac.
 *
 * Nothing here returns a finder's conversation token, sign-in data or an item's private notes.
 */

export interface AdminOverview {
  accounts: number;
  accounts_7d: number;
  accounts_30d: number;
  items: number;
  tags: number;
  tags_active: number;
  scans_7d: number;
  scans_30d: number;
  messages_7d: number;
  messages_30d: number;
}

export interface AdminAccountRow {
  id: string;
  email: string;
  joined: string;
  item_count: number;
  is_admin: boolean;
}

export interface AdminItem {
  id: string;
  name: string;
  brand: string | null;
  color: string | null;
  lost: boolean;
  reward_text: string | null;
  created_at: string;
}

export interface AdminTag {
  id: string;
  public_id: string;
  item_id: string | null;
  status: 'active' | 'inactive' | 'replaced';
  disabled_by_admin: boolean;
  created_at: string;
  scans_30d: number;
}

export interface AdminMessage {
  id: string;
  sender_kind: 'finder' | 'owner' | 'system';
  body: string;
  created_at: string;
  hidden: boolean;
}

export interface AdminThread {
  id: string;
  item_id: string;
  item_name: string;
  status: string;
  created_at: string;
  last_message_at: string;
  messages: AdminMessage[];
}

export interface AdminAccountDetail {
  account: { id: string; email: string; joined: string; is_admin: boolean };
  items: AdminItem[];
  tags: AdminTag[];
  threads: AdminThread[];
}

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** The database's short reasons, in words. */
function words(error: { message?: string } | null | undefined): string {
  switch (error?.message) {
    case 'not_authorized':
      return 'You do not have access to this.';
    case 'not_found':
      return 'That could not be found. It may have been deleted already.';
    case 'tag_replaced':
      return 'That tag was replaced by the owner and cannot be switched.';
    case 'not_disabled_by_admin':
      return 'That tag was switched off by its owner, not by an admin.';
    case 'cannot_delete_admin':
      return 'A super admin account cannot be deleted here.';
    case 'confirmation_mismatch':
      return 'The email you typed does not match this account.';
    default:
      return 'Something went wrong. Try again.';
  }
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<Outcome<T>> {
  const { data, error } = await db.rpc(name, args);
  if (error) return { ok: false, error: words(error) };
  return { ok: true, data: data as T };
}

/** Whether the signed-in person is a super admin. Only decides what to show. */
export async function fetchIsSuperAdmin(): Promise<boolean> {
  const r = await call<boolean>('is_super_admin');
  return r.ok && r.data === true;
}

export const adminOverview = () => call<AdminOverview>('admin_overview');

export const adminListAccounts = (search: string, offset: number, limit = 25) =>
  call<{ total: number; accounts: AdminAccountRow[] }>('admin_list_accounts', {
    p_search: search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });

export const adminAccount = (userId: string) => call<AdminAccountDetail>('admin_account', { p_user: userId });

export const adminSetTag = (tagId: string, active: boolean) =>
  call<{ id: string; status: string }>('admin_set_tag', { p_tag: tagId, p_active: active });

export const adminSetMessageHidden = (messageId: string, hidden: boolean) =>
  call<{ id: string; hidden: boolean }>('admin_set_message_hidden', { p_message: messageId, p_hidden: hidden });

export interface SupportRequestRow {
  id: string;
  created_at: string;
  topic: 'billing' | 'account' | 'finder' | 'other';
  status: 'open' | 'closed';
  plan: string | null;
  message: string;
  reply_email: string | null;
  user_id: string | null;
  account_email: string | null;
  closed_at: string | null;
}

export const adminSupportList = (status: 'open' | 'closed' = 'open') =>
  call<{ open: number; requests: SupportRequestRow[] }>('admin_support_list', { p_status: status });

export const adminSupportClose = (id: string) => call<{ id: string; status: string }>('admin_support_close', { p_id: id });

export const adminDeleteAccount = (userId: string, confirmEmail: string) =>
  call<{ deleted: boolean }>('admin_delete_account', { p_user: userId, p_confirm_email: confirmEmail });

/** null while it is being asked. */
export function useIsSuperAdmin(): boolean | null {
  const { user } = useAuth();
  const [is, setIs] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) {
      setIs(null);
      return;
    }
    let cancelled = false;
    void fetchIsSuperAdmin().then((v) => {
      if (!cancelled) setIs(v);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return is;
}
