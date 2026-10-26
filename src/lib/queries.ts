import { db as supabase } from './db';
import { shrinkPhoto } from './photo';
import { membershipsAvailableInApp } from './iap';
import type {
  CourierOrder,
  Household,
  Item,
  Message,
  Partner,
  PartnerDropoff,
  PartnerDropoffStatus,
  Reward,
  Scan,
  Tag,
  Thread,
  Trip,
} from './database.types';

/**
 * Every query the owner's screens make, through QuR Tag's data API (src/lib/db.ts; the
 * client is named `supabase` here only because these helpers were written for it).
 * The client is untyped at the boundary, so each helper asserts its row shape at the
 * return type. Keep these helpers as the single seam between raw queries and the rest
 * of the app.
 *
 * Finders never come through here: their page uses src/lib/finder.ts. The helpers
 * marked "hidden feature" serve screens switched off in src/lib/features.ts; their
 * tables are not in schema qurtag yet, so they answer nothing until they are built.
 */

export async function fetchPrimaryHouseholdId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchPrimaryHouseholdId', error);
    return null;
  }
  return (data?.household_id as string | undefined) ?? null;
}

/**
 * Items, tags and conversations come from EVERY household the person can reach: their own
 * and the Family household they joined. Row security decides which those are (nobody else's
 * ever), so these queries do not name a household; the argument is kept so callers read the
 * same as before.
 */
export async function fetchItems(_householdId?: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[QuR Tag] fetchItems', error);
    return [];
  }
  return (data ?? []) as Item[];
}

export async function fetchTags(_householdId?: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[QuR Tag] fetchTags', error);
    return [];
  }
  return (data ?? []) as Tag[];
}

export async function fetchTagById(id: string): Promise<Tag | null> {
  const { data, error } = await supabase.from('tags').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchTagById', error);
    return null;
  }
  return (data as Tag | null) ?? null;
}

export async function fetchItemById(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchItemById', error);
    return null;
  }
  return (data as Item | null) ?? null;
}

export async function fetchScansForItem(itemId: string, limit = 500): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('item_id', itemId)
    .order('scanned_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[QuR Tag] fetchScansForItem', error);
    return [];
  }
  return (data ?? []) as Scan[];
}

export async function deleteItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) {
    console.error('[QuR Tag] deleteItem', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateItem(
  itemId: string,
  patch: Partial<
    Pick<
      Item,
      'name' | 'brand' | 'color' | 'hero_photo_url' | 'lost_mode' | 'reward_text' | 'notes'
    >
  >,
): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single();
  if (error) {
    console.error('[QuR Tag] updateItem', error);
    return null;
  }
  return (data as Item) ?? null;
}

/**
 * Turns a picked photo into the small picture QuR Tag keeps with the item (a data:
 * address, at most about 110 KB; see src/lib/photo.ts). Nothing is uploaded until the
 * item is saved.
 */
export async function uploadItemPhoto(input: { householdId: string | null; file: File }): Promise<{ url: string } | { error: string }> {
  try {
    return { url: await shrinkPhoto(input.file) };
  } catch {
    return { error: "That photo couldn't be read. Try a JPG or PNG." };
  }
}

/* ─────────────── messaging ─────────────── */

export interface ThreadWithItem extends Thread {
  item: Pick<Item, 'id' | 'name' | 'brand' | 'hero_photo_url' | 'lost_mode'> | null;
  last_message: Pick<Message, 'body' | 'sender_kind' | 'created_at' | 'sender_user_id'> | null;
  unread_count: number;
  /** Notes the filter held that the owner has not chosen to show (no text). */
  held_count: number;
}

/** The owner's reply in one of their conversations. */
export async function sendOwnerReply(input: { threadId: string; body: string }): Promise<boolean> {
  const trimmed = input.body.trim();
  if (!trimmed) return false;
  const { error } = await supabase.rpc('owner_reply', { p_thread_id: input.threadId, p_body: trimmed.slice(0, 2000) });
  if (error) {
    console.error('[QuR Tag] sendOwnerReply', error);
    return false;
  }
  return true;
}

/**
 * One conversation, or null when it is not in the owner's inbox. With throwOnError a failed
 * request (no signal, server busy) throws instead, so the screen can say "could not load"
 * rather than "not in your inbox".
 */
export async function fetchThreadById(threadId: string, opts: { throwOnError?: boolean } = {}): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchThreadById', error);
    if (opts.throwOnError) throw new Error('could not load the conversation');
    return null;
  }
  return (data as Thread | null) ?? null;
}

export async function fetchMessagesForThread(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[QuR Tag] fetchMessagesForThread', error);
    return [];
  }
  return (data ?? []) as Message[];
}

export async function fetchThreadsForHousehold(_householdId?: string): Promise<ThreadWithItem[]> {
  const { data: threads, error } = await supabase
    .from('threads')
    .select('*')
    .order('last_message_at', { ascending: false });
  if (error) {
    console.error('[QuR Tag] fetchThreadsForHousehold', error);
    return [];
  }
  if (!threads || threads.length === 0) return [];

  const threadRows = threads as Thread[];
  const itemIds = Array.from(new Set(threadRows.map((t) => t.item_id)));

  const { data: items } = await supabase
    .from('items')
    .select('id, name, brand, hero_photo_url, lost_mode')
    .in('id', itemIds);
  const itemMap = new Map<string, ThreadWithItem['item']>();
  for (const i of (items ?? []) as ThreadWithItem['item'][]) {
    if (i) itemMap.set(i.id, i);
  }

  const threadIds = threadRows.map((t) => t.id);
  const held = await fetchHeldNotes();
  const { data: msgs } = await supabase
    .from('messages')
    .select('thread_id, body, sender_kind, created_at, read_by_owner_at, sender_user_id')
    .in('thread_id', threadIds);

  const lastByThread = new Map<string, ThreadWithItem['last_message']>();
  const unreadByThread = new Map<string, number>();
  for (const m of (msgs ?? []) as Array<
    Pick<Message, 'thread_id' | 'body' | 'sender_kind' | 'created_at' | 'read_by_owner_at' | 'sender_user_id'>
  >) {
    const prev = lastByThread.get(m.thread_id);
    if (!prev || prev.created_at < m.created_at) {
      lastByThread.set(m.thread_id, {
        body: m.body,
        sender_kind: m.sender_kind,
        created_at: m.created_at,
        sender_user_id: m.sender_user_id ?? null,
      });
    }
    if (m.sender_kind === 'finder' && !m.read_by_owner_at) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
    }
  }

  // A held note has no text here; it still counts as waiting until it is read.
  for (const h of held) if (!h.read) unreadByThread.set(h.thread_id, (unreadByThread.get(h.thread_id) ?? 0) + 1);

  return threadRows.map((t) => ({
    ...t,
    item: itemMap.get(t.item_id) ?? null,
    last_message: lastByThread.get(t.id) ?? null,
    unread_count: unreadByThread.get(t.id) ?? 0,
    held_count: held.filter((h) => h.thread_id === t.id).length,
  }));
}

export async function countUnreadForHousehold(_householdId?: string): Promise<number> {
  const { data: threads } = await supabase
    .from('threads')
    .select('id');
  const ids = (threads ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', ids)
    .eq('sender_kind', 'finder')
    .is('read_by_owner_at', null);
  if (error) {
    console.error('[QuR Tag] countUnreadForHousehold', error);
    return 0;
  }
  const held = (await fetchHeldNotes()).filter((h) => !h.read).length;
  return (count ?? 0) + held;
}

export async function fetchCourierOrderForThread(threadId: string): Promise<CourierOrder | null> {
  const { data, error } = await supabase
    .from('courier_orders')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchCourierOrderForThread', error);
    return null;
  }
  return (data as CourierOrder | null) ?? null;
}

export async function createCourierOrder(input: {
  threadId: string;
  itemId: string;
  householdId: string;
  addressLine: string;
  city: string;
  pickupWindow: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('courier_orders')
    .insert({
      thread_id: input.threadId,
      item_id: input.itemId,
      household_id: input.householdId,
      address_line: input.addressLine,
      city: input.city || null,
      pickup_window: input.pickupWindow,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[QuR Tag] createCourierOrder', error);
    return null;
  }
  return (data as { id: string }) ?? null;
}

/* ─────────────── households + address ─────────────── */

export async function fetchHousehold(householdId: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchHousehold', error);
    return null;
  }
  return (data as Household | null) ?? null;
}

export async function updateHousehold(
  householdId: string,
  patch: Partial<
    Pick<
      Household,
      'name' | 'return_address_line' | 'return_city' | 'return_state' | 'return_postal_code' | 'return_country'
    >
  >,
): Promise<Household | null> {
  const { data, error } = await supabase
    .from('households')
    .update(patch)
    .eq('id', householdId)
    .select()
    .single();
  if (error) {
    console.error('[QuR Tag] updateHousehold', error);
    return null;
  }
  return (data as Household) ?? null;
}

/* ─────────────── rewards ─────────────── */

export async function fetchActiveRewardForItem(itemId: string): Promise<Reward | null> {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('item_id', itemId)
    .in('state', ['pending', 'held'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchActiveRewardForItem', error);
    return null;
  }
  return (data as Reward | null) ?? null;
}

export async function createPendingReward(input: {
  itemId: string;
  householdId: string;
  amountCents: number;
}): Promise<Reward | null> {
  const { data, error } = await supabase
    .from('rewards')
    .insert({
      item_id: input.itemId,
      household_id: input.householdId,
      amount_cents: input.amountCents,
      state: 'pending',
    })
    .select()
    .single();
  if (error) {
    console.error('[QuR Tag] createPendingReward', error);
    return null;
  }
  return (data as Reward) ?? null;
}

export async function fetchActiveRewardForThread(threadId: string): Promise<Reward | null> {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('thread_id', threadId)
    .in('state', ['pending', 'held', 'released'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[QuR Tag] fetchActiveRewardForThread', error);
    return null;
  }
  return (data as Reward | null) ?? null;
}

export async function setRewardThread(rewardId: string, threadId: string): Promise<void> {
  const { error } = await supabase.from('rewards').update({ thread_id: threadId }).eq('id', rewardId);
  if (error) console.error('[QuR Tag] setRewardThread', error);
}

/* ─────────────── trips ─────────────── */

export async function fetchTripsForHousehold(householdId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('household_id', householdId)
    .order('active_from', { ascending: false });
  if (error) {
    console.error('[QuR Tag] fetchTripsForHousehold', error);
    return [];
  }
  return (data ?? []) as Trip[];
}

export async function createTrip(input: {
  householdId: string;
  name: string;
  flightNumber?: string;
  originIata?: string;
  destinationIata?: string;
  scheduledArrival?: string;
}): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      household_id: input.householdId,
      name: input.name,
      flight_number: input.flightNumber ?? null,
      origin_iata: input.originIata ?? null,
      destination_iata: input.destinationIata ?? null,
      scheduled_arrival: input.scheduledArrival ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error('[QuR Tag] createTrip', error);
    return null;
  }
  return (data as Trip) ?? null;
}

export async function fetchActiveTripForItem(itemId: string): Promise<Trip | null> {
  const { data: tripItems, error } = await supabase
    .from('trip_items')
    .select('trip_id')
    .eq('item_id', itemId);
  if (error) {
    console.error('[QuR Tag] fetchActiveTripForItem', error);
    return null;
  }
  const ids = (tripItems ?? []).map((r) => (r as { trip_id: string }).trip_id);
  if (ids.length === 0) return null;
  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .in('id', ids)
    .gt('active_from', new Date(Date.now() - 30 * 86400_000).toISOString())
    .order('active_from', { ascending: false })
    .limit(1);
  return ((trips ?? [])[0] as Trip | undefined) ?? null;
}

export async function addItemsToTrip(tripId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .from('trip_items')
    .upsert(itemIds.map((id) => ({ trip_id: tripId, item_id: id })));
  if (error) console.error('[QuR Tag] addItemsToTrip', error);
}

/* ─────────────── partners ─────────────── */

export async function fetchMyPartner(): Promise<Partner | null> {
  const { data, error } = await supabase
    .from('partner_members')
    .select('partner_id, partners(*)')
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { partners?: Partner } | null)?.partners ?? null;
}

export async function fetchPartnerDropoffs(partnerId: string): Promise<PartnerDropoff[]> {
  const { data, error } = await supabase
    .from('partner_dropoffs')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[QuR Tag] fetchPartnerDropoffs', error);
    return [];
  }
  return (data ?? []) as PartnerDropoff[];
}

export async function logPartnerDropoff(input: {
  partnerId: string;
  staffUserId: string;
  tagPublicId: string;
  notes?: string;
}): Promise<PartnerDropoff | null> {
  const { data: tagRows } = await supabase.from('tags').select('*').eq('public_id', input.tagPublicId).limit(1);
  const tag = ((tagRows ?? [])[0] as Tag | undefined) ?? null;
  if (!tag) return null;
  const { data, error } = await supabase
    .from('partner_dropoffs')
    .insert({
      partner_id: input.partnerId,
      staff_user_id: input.staffUserId,
      tag_id: tag.id,
      item_id: tag.current_item_id,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error('[QuR Tag] logPartnerDropoff', error);
    return null;
  }
  return (data as PartnerDropoff) ?? null;
}

export async function updatePartnerDropoffStatus(
  dropoffId: string,
  status: PartnerDropoffStatus,
): Promise<void> {
  const { error } = await supabase
    .from('partner_dropoffs')
    .update({ status })
    .eq('id', dropoffId);
  if (error) console.error('[QuR Tag] updatePartnerDropoffStatus', error);
}

/* ─────────────── inbox actions ─────────────── */

export async function markThreadStatus(
  threadId: string,
  status: 'open' | 'closed' | 'reunited',
): Promise<void> {
  const { error } = await supabase.from('threads').update({ status }).eq('id', threadId);
  if (error) console.error('[QuR Tag] markThreadStatus', error);
}

/** Archives a conversation (the owner's own tidying), or brings it back. A finder's new note brings it back too. */
export async function setThreadArchived(threadId: string, archived: boolean): Promise<boolean> {
  const { error } = await supabase.from('threads').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', threadId);
  if (error) console.error('[QuR Tag] setThreadArchived', error);
  return !error;
}

/** Pauses new notes on an item's tag, or takes the pause off. Existing conversations go on. */
export async function setItemNotesPaused(itemId: string, paused: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_item_notes_paused', { p_item: itemId, p_paused: paused });
  if (error) console.error('[QuR Tag] setItemNotesPaused', error);
  return !error;
}

/* ─────────────── moderation of finders' notes (db/moderation.sql) ─────────────── */

export type ReportReason = 'harassment' | 'spam' | 'threats' | 'inappropriate' | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'harassment', label: 'Harassment', hint: 'Insults, bullying or unwanted contact' },
  { id: 'spam', label: 'Spam', hint: 'Ads, links or the same note again and again' },
  { id: 'threats', label: 'Threats', hint: 'Talk of hurting you or someone else' },
  { id: 'inappropriate', label: 'Inappropriate', hint: 'Sexual, hateful or otherwise not okay' },
  { id: 'other', label: 'Something else', hint: 'Tell us in the comment' },
];

/** Reports a finder's note. It is hidden from the owner at once. */
export async function reportMessage(input: {
  messageId: string;
  reason: ReportReason;
  comment?: string;
}): Promise<{ ok: true; threadId: string } | { ok: false }> {
  const { data, error } = await supabase.rpc('report_message', {
    p_message: input.messageId,
    p_reason: input.reason,
    p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 1000) : null,
  });
  if (error) {
    console.error('[QuR Tag] reportMessage', error);
    return { ok: false };
  }
  return { ok: true, threadId: (data as { thread_id: string }).thread_id };
}

/** Blocks the finder of a conversation: no more notes, and the conversation leaves the inbox. */
export async function blockFinder(threadId: string): Promise<boolean> {
  const { error } = await supabase.rpc('block_finder', { p_thread: threadId });
  if (error) console.error('[QuR Tag] blockFinder', error);
  return !error;
}

export async function unblockFinder(threadId: string): Promise<{ ok: true } | { ok: false; byAdmin: boolean }> {
  const { error } = await supabase.rpc('unblock_finder', { p_thread: threadId });
  if (error) {
    console.error('[QuR Tag] unblockFinder', error);
    return { ok: false, byAdmin: error.message === 'blocked_by_admin' };
  }
  return { ok: true };
}

export interface BlockedFinder {
  thread_id: string;
  item_name: string;
  started_at: string;
  blocked_at: string;
  by_admin: boolean;
  notes: number;
}

export async function fetchBlockedFinders(): Promise<BlockedFinder[]> {
  const { data, error } = await supabase.rpc('my_blocked_finders');
  if (error) {
    console.error('[QuR Tag] fetchBlockedFinders', error);
    return [];
  }
  return (data ?? []) as BlockedFinder[];
}

/** A note the filter held. The text is not sent until the owner chooses to show it. */
export interface HeldNote {
  id: string;
  thread_id: string;
  created_at: string;
  read: boolean;
  /** Why the filter held it: offensive words, or a threat (which shows safety advice). */
  reason?: 'language' | 'threat' | null;
}

/** The held notes of one conversation, or of every conversation when no id is given. */
export async function fetchHeldNotes(threadId?: string): Promise<HeldNote[]> {
  const { data, error } = await supabase.rpc('my_held_notes', threadId ? { p_thread: threadId } : {});
  if (error) {
    console.error('[QuR Tag] fetchHeldNotes', error);
    return [];
  }
  return (data ?? []) as HeldNote[];
}

export async function showHeldNote(messageId: string): Promise<boolean> {
  const { error } = await supabase.rpc('release_held_note', { p_message: messageId });
  if (error) console.error('[QuR Tag] showHeldNote', error);
  return !error;
}

/** Fired on window when the owner's unread count may have changed. */
export const UNREAD_CHANGED = 'qurtag:unread-changed';

export async function markThreadReadByOwner(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_thread_read', { p_thread_id: threadId });
  if (error) console.error('[QuR Tag] markThreadReadByOwner', error);
  // The Inbox badge counts again now, not at its next poll.
  else if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNREAD_CHANGED));
}

/* ─────────────── items + tags ─────────────── */


export async function createItemWithPrintableTag(input: {
  name: string;
  brand?: string;
  color?: string;
  heroPhotoUrl?: string;
  rewardText?: string;
  notes?: string;
}): Promise<{ itemId: string; tagId: string; publicId: string } | { error: string }> {
  const { data, error } = await supabase.rpc('create_item', {
    p_name: input.name,
    p_brand: input.brand ?? null,
    p_color: input.color ?? null,
    p_photo: input.heroPhotoUrl ?? null,
    p_reward_text: input.rewardText ?? null,
    p_notes: input.notes ?? null,
  });
  if (error || !data) {
    if (error?.message === 'item_limit') {
      return {
        error: membershipsAvailableInApp()
          ? 'Your plan holds no more items. See the plans in Membership, or delete an item you no longer need.'
          : 'You have three items, the most for now. Delete an item you no longer need to tag something else.',
      };
    }
    console.error('[QuR Tag] createItemWithPrintableTag', error);
    return { error: 'Could not save the item. Check the details and try again.' };
  }
  const r = data as { item_id: string; tag_id: string; public_id: string };
  return { itemId: r.item_id, tagId: r.tag_id, publicId: r.public_id };
}

/** A fresh tag for an item; its old tags stop working. */
export async function replaceTag(itemId: string): Promise<{ tagId: string; publicId: string } | null> {
  const { data, error } = await supabase.rpc('replace_tag', { p_item_id: itemId });
  if (error || !data) {
    console.error('[QuR Tag] replaceTag', error);
    return null;
  }
  const r = data as { tag_id: string; public_id: string };
  return { tagId: r.tag_id, publicId: r.public_id };
}

export async function fetchActiveTagForItem(itemId: string): Promise<Tag | null> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('current_item_id', itemId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[QuR Tag] fetchActiveTagForItem', error);
    return null;
  }
  return ((data ?? [])[0] as Tag | undefined) ?? null;
}

/** Everything QuR Tag holds for the signed-in owner, for "Download my data". */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const read = async (table: string) => {
    const { data } = await supabase.from(table).select('*');
    return data ?? [];
  };
  return {
    exported_at: new Date().toISOString(),
    households: await read('households'),
    items: await read('items'),
    tags: await read('tags'),
    scans: await read('scans'),
    conversations: await read('threads'),
    messages: await read('messages'),
  };
}
