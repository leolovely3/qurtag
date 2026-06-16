import { supabase } from './supabase';
import { generateTagPublicId } from './publicId';
import type {
  AbuseKind,
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

export const ITEM_PHOTOS_BUCKET = 'item-photos';

/**
 * The Supabase client is untyped at the boundary (see supabase.ts), so each
 * helper asserts its row shape at the return type. Keep these helpers as the
 * single seam between raw queries and the rest of the app.
 */

export async function fetchPrimaryHouseholdId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[QurTag] fetchPrimaryHouseholdId', error);
    return null;
  }
  return (data?.household_id as string | undefined) ?? null;
}

export async function fetchItems(householdId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[QurTag] fetchItems', error);
    return [];
  }
  return (data ?? []) as Item[];
}

export async function fetchTags(householdId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[QurTag] fetchTags', error);
    return [];
  }
  return (data ?? []) as Tag[];
}

export async function fetchTagById(id: string): Promise<Tag | null> {
  const { data, error } = await supabase.from('tags').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[QurTag] fetchTagById', error);
    return null;
  }
  return (data as Tag | null) ?? null;
}

/**
 * Anon-readable. Used by the finder page where the URL carries the
 * short public_id, not the internal UUID.
 */
export async function fetchTagByPublicId(publicId: string): Promise<Tag | null> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('public_id', publicId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    console.error('[QurTag] fetchTagByPublicId', error);
    return null;
  }
  return (data as Tag | null) ?? null;
}

/**
 * Anon-insertable. Best-effort. Failures are logged, never thrown,
 * because the finder shouldn't see plumbing errors.
 */
export async function recordScan(input: {
  tagId: string;
  itemId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('scans').insert({
    tag_id: input.tagId,
    item_id: input.itemId ?? null,
    user_agent_class: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
  });
  if (error) console.error('[QurTag] recordScan', error);
}

export async function fetchItemById(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[QurTag] fetchItemById', error);
    return null;
  }
  return (data as Item | null) ?? null;
}

export async function fetchScansForItem(itemId: string, limit = 50): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('item_id', itemId)
    .order('scanned_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[QurTag] fetchScansForItem', error);
    return [];
  }
  return (data ?? []) as Scan[];
}

export async function deleteItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) {
    console.error('[QurTag] deleteItem', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateItem(
  itemId: string,
  patch: Partial<
    Pick<
      Item,
      | 'name'
      | 'brand'
      | 'model'
      | 'color'
      | 'declared_value_cents'
      | 'hero_photo_url'
      | 'lost_mode'
      | 'reward_amount_cents'
      | 'drop_off_preference'
      | 'notes'
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
    console.error('[QurTag] updateItem', error);
    return null;
  }
  return (data as Item) ?? null;
}

/**
 * Upload an image to the item-photos bucket under the household's prefix.
 * Returns the public URL on success.
 */
export async function uploadItemPhoto(input: {
  householdId: string;
  file: File;
}): Promise<{ url: string } | { error: string }> {
  const { householdId, file } = input;
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
  // Path: <household_id>/<random>.<ext>
  const filename = `${crypto.randomUUID()}.${safeExt}`;
  const path = `${householdId}/${filename}`;

  const { error: upErr } = await supabase.storage.from(ITEM_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type || `image/${safeExt}`,
    upsert: false,
  });
  if (upErr) {
    console.error('[QurTag] uploadItemPhoto', upErr);
    return { error: upErr.message };
  }

  const { data } = supabase.storage.from(ITEM_PHOTOS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/* ─────────────── messaging ─────────────── */

export interface ThreadWithItem extends Thread {
  item: Pick<Item, 'id' | 'name' | 'brand' | 'hero_photo_url' | 'lost_mode'> | null;
  last_message: Pick<Message, 'body' | 'sender_kind' | 'created_at'> | null;
  unread_count: number;
}

export async function createThread(input: {
  itemId: string;
  householdId: string;
  tagId: string | null;
  finderSessionId: string;
}): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .insert({
      item_id: input.itemId,
      household_id: input.householdId,
      tag_id: input.tagId,
      finder_session_id: input.finderSessionId,
      status: 'open',
    })
    .select()
    .single();
  if (error) {
    console.error('[QurTag] createThread', error);
    return null;
  }
  return (data as Thread) ?? null;
}

export async function sendMessage(input: {
  threadId: string;
  senderKind: 'finder' | 'owner' | 'system';
  body: string;
}): Promise<Message | null> {
  const trimmed = input.body.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: input.threadId,
      sender_kind: input.senderKind,
      body: trimmed.slice(0, 4000),
    })
    .select()
    .single();
  if (error) {
    console.error('[QurTag] sendMessage', error);
    return null;
  }
  return (data as Message) ?? null;
}

export async function fetchThreadById(threadId: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (error) {
    console.error('[QurTag] fetchThreadById', error);
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
    console.error('[QurTag] fetchMessagesForThread', error);
    return [];
  }
  return (data ?? []) as Message[];
}

export async function fetchThreadsForHousehold(householdId: string): Promise<ThreadWithItem[]> {
  const { data: threads, error } = await supabase
    .from('threads')
    .select('*')
    .eq('household_id', householdId)
    .order('last_message_at', { ascending: false });
  if (error) {
    console.error('[QurTag] fetchThreadsForHousehold', error);
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
  const { data: msgs } = await supabase
    .from('messages')
    .select('thread_id, body, sender_kind, created_at, read_by_owner_at')
    .in('thread_id', threadIds);

  const lastByThread = new Map<string, ThreadWithItem['last_message']>();
  const unreadByThread = new Map<string, number>();
  for (const m of (msgs ?? []) as Array<
    Pick<Message, 'thread_id' | 'body' | 'sender_kind' | 'created_at' | 'read_by_owner_at'>
  >) {
    const prev = lastByThread.get(m.thread_id);
    if (!prev || prev.created_at < m.created_at) {
      lastByThread.set(m.thread_id, {
        body: m.body,
        sender_kind: m.sender_kind,
        created_at: m.created_at,
      });
    }
    if (m.sender_kind === 'finder' && !m.read_by_owner_at) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
    }
  }

  return threadRows.map((t) => ({
    ...t,
    item: itemMap.get(t.item_id) ?? null,
    last_message: lastByThread.get(t.id) ?? null,
    unread_count: unreadByThread.get(t.id) ?? 0,
  }));
}

export async function countUnreadForHousehold(householdId: string): Promise<number> {
  const { data: threads } = await supabase
    .from('threads')
    .select('id')
    .eq('household_id', householdId);
  const ids = (threads ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', ids)
    .eq('sender_kind', 'finder')
    .is('read_by_owner_at', null);
  if (error) {
    console.error('[QurTag] countUnreadForHousehold', error);
    return 0;
  }
  return count ?? 0;
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
    console.error('[QurTag] fetchCourierOrderForThread', error);
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
    console.error('[QurTag] createCourierOrder', error);
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
    console.error('[QurTag] fetchHousehold', error);
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
    console.error('[QurTag] updateHousehold', error);
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
    console.error('[QurTag] fetchActiveRewardForItem', error);
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
    console.error('[QurTag] createPendingReward', error);
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
    console.error('[QurTag] fetchActiveRewardForThread', error);
    return null;
  }
  return (data as Reward | null) ?? null;
}

export async function setRewardThread(rewardId: string, threadId: string): Promise<void> {
  const { error } = await supabase.from('rewards').update({ thread_id: threadId }).eq('id', rewardId);
  if (error) console.error('[QurTag] setRewardThread', error);
}

/* ─────────────── trips ─────────────── */

export async function fetchTripsForHousehold(householdId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('household_id', householdId)
    .order('active_from', { ascending: false });
  if (error) {
    console.error('[QurTag] fetchTripsForHousehold', error);
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
    console.error('[QurTag] createTrip', error);
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
    console.error('[QurTag] fetchActiveTripForItem', error);
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
  if (error) console.error('[QurTag] addItemsToTrip', error);
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
    console.error('[QurTag] fetchPartnerDropoffs', error);
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
  const tag = await fetchTagByPublicId(input.tagPublicId);
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
    console.error('[QurTag] logPartnerDropoff', error);
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
  if (error) console.error('[QurTag] updatePartnerDropoffStatus', error);
}

/* ─────────────── inbox actions ─────────────── */

export async function markThreadStatus(
  threadId: string,
  status: 'open' | 'closed' | 'reunited',
): Promise<void> {
  const { error } = await supabase.from('threads').update({ status }).eq('id', threadId);
  if (error) console.error('[QurTag] markThreadStatus', error);
}

export async function blockFinderSession(input: {
  householdId: string;
  finderSessionId: string;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from('blocked_finder_sessions').insert({
    household_id: input.householdId,
    finder_session_id: input.finderSessionId,
    reason: input.reason ?? null,
  });
  if (error) console.error('[QurTag] blockFinderSession', error);
}

export async function reportAbuse(input: {
  householdId: string;
  threadId: string;
  kind: AbuseKind;
  body?: string;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('abuse_reports').insert({
    household_id: input.householdId,
    thread_id: input.threadId,
    reporter_user_id: u.user?.id ?? null,
    kind: input.kind,
    body: input.body ?? null,
  });
  if (error) console.error('[QurTag] reportAbuse', error);
}

export async function markThreadReadByOwner(threadId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_by_owner_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_kind', 'finder')
    .is('read_by_owner_at', null);
  if (error) console.error('[QurTag] markThreadReadByOwner', error);
}

/* ─────────────── items + tags ─────────────── */

export async function createItemWithPrintableTag(input: {
  householdId: string;
  name: string;
  brand?: string;
  declaredValueCents?: number;
  heroPhotoUrl?: string;
}): Promise<{ item: Item; tag: Tag } | { error: string }> {
  const { data: itemRow, error: itemErr } = await supabase
    .from('items')
    .insert({
      household_id: input.householdId,
      name: input.name,
      brand: input.brand ?? null,
      declared_value_cents: input.declaredValueCents ?? null,
      hero_photo_url: input.heroPhotoUrl ?? null,
    })
    .select()
    .single();

  if (itemErr || !itemRow) {
    return { error: itemErr?.message ?? 'Could not create item.' };
  }
  const item = itemRow as Item;

  const { data: tagRow, error: tagErr } = await supabase
    .from('tags')
    .insert({
      household_id: input.householdId,
      public_id: generateTagPublicId(),
      hardware_tier: 'printable',
      status: 'active',
      current_item_id: item.id,
    })
    .select()
    .single();

  if (tagErr || !tagRow) {
    // Roll back the orphan item.
    await supabase.from('items').delete().eq('id', item.id);
    return { error: tagErr?.message ?? 'Could not mint tag.' };
  }

  return { item, tag: tagRow as Tag };
}
