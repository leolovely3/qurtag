import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ChevronRight, Inbox as InboxIcon, Mail, Package, Plus, Tag as TagIcon } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { GettingStarted } from '@/components/GettingStarted';
import { LimitReached } from '@/components/membership/LimitReached';
import { browserStorage, loadEmailCheck, showEmailReminder } from '@/lib/emailCheck';
import { fetchEmailConfig } from '@/lib/membership';
import { isNative } from '@/lib/platform';
import { deviceStorage, itemStatus, tagProgress } from '@/lib/tagProgress';
import { SKIP_KEY } from '@/lib/gettingStarted';
import { buttonClasses } from '@/components/ui/Button';
import { ItemRowSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { countUnreadForHousehold, fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import { fetchMembership, type Membership } from '@/lib/membership';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import type { Item, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';
import { axIcon, axRow, axRowEnd, axRowText } from '@/components/ui/largeText';

/** The owner's items with their tag and lost state; used by /app and /app/items. */
export function useOwnerItems() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [unread, setUnread] = useState(0);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [fetching, setFetching] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      setFetching(false);
      return;
    }
    let cancelled = false;
    // Until the first answer, the screen is loading, not empty (an empty list sends a new owner to the walkthrough).
    setFetching(true);
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled) return;
      if (!hh) {
        setFailed(true);
        setFetching(false);
        return;
      }
      const [its, tgs, n, m] = await Promise.all([fetchItems(hh), fetchTags(hh), countUnreadForHousehold(hh), fetchMembership()]);
      if (cancelled) return;
      setMembership(m);
      setItems(its);
      setTags(tgs);
      setUnread(n);
      setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const tagByItemId = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) if (t.current_item_id && t.status === 'active') m.set(t.current_item_id, t);
    return m;
  }, [tags]);

  const readOnly = useMemo(() => new Set(membership?.read_only_item_ids ?? []), [membership]);

  return { items, tagByItemId, unread, membership, readOnly, loading: authLoading || fetching, failed };
}

/** A square photo of the item, or a quiet placeholder when it has none. */
export function ItemThumb({ src, size = 'md' }: { src?: string | null; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-[44px]' : 'size-[56px]';
  return src ? (
    <img src={src} alt="" className={cn(box, 'shrink-0 rounded-card bg-ink-50 object-cover')} />
  ) : (
    <div className={cn(box, 'grid shrink-0 place-items-center rounded-card bg-ink-100')}>
      <Package size={size === 'sm' ? 18 : 22} strokeWidth={1.5} className="text-muted" aria-hidden />
    </div>
  );
}

/** "Lost" status chip; nothing when the item is not marked lost. */
export function LostChip({ lost }: { lost: boolean }) {
  if (!lost) return null;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-signal-50 px-2 text-xs font-semibold text-signal-700">
      <span className="size-1.5 rounded-full bg-signal-500" aria-hidden />
      Marked lost
    </span>
  );
}

export function ItemList({ items, tagByItemId, readOnly }: { items: Item[]; tagByItemId: Map<string, Tag>; readOnly?: Set<string> }) {
  return (
    <ul className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline">
      {items.map((item) => {
        const tag = tagByItemId.get(item.id);
        const locked = readOnly?.has(item.id) ?? false;
        return (
          <li key={item.id}>
            <Link
              to={`/app/items/${item.id}`}
              className={cn('flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50', axRow)}
            >
              <ItemThumb src={item.hero_photo_url} />
              <div className={cn('flex min-w-0 flex-1 flex-col gap-1', axRowText)}>
                <span className="line-clamp-2 break-words text-base font-semibold leading-snug text-ink-900">{item.name}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <LostChip lost={item.lost_mode} />
                  <span>{itemStatus({ locked, hasTag: !!tag, progress: tag ? tagProgress(deviceStorage(), tag.id) : {} })}</span>
                </span>
              </div>
              <ChevronRight size={20} strokeWidth={1.75} className={cn('shrink-0 text-ink-300', axRowEnd)} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The add button: a "+" in the phone's top bar, "Add item" beside the heading on wider screens.
 * With no items yet it starts the first-tag walkthrough instead of the plain form.
 */
export function AddItemButton({ membership, first = false }: { membership?: Membership | null; first?: boolean }) {
  // Until the plan is known, trust the database to refuse (it does, with a plain message).
  if (membership && !membership.can_add_items) return null;
  const to = first ? '/app/first-tag' : '/start/setup';
  return (
    <>
      <Link to={to} aria-label={first ? 'Make your first tag' : 'Add item'} className="grid size-[44px] place-items-center rounded-pill text-ink-900 hover:bg-ink-50 active:bg-ink-50 md:hidden">
        <Plus size={24} strokeWidth={2} aria-hidden />
      </Link>
      <Link to={to} className={buttonClasses({ variant: 'primary', className: 'hidden px-4 md:inline-flex' })}>
        <Plus size={18} strokeWidth={2} aria-hidden />
        Add item
      </Link>
    </>
  );
}

/** Under the list when the plan is full: what to do about it. */
export function AddItemCard({ membership }: { count?: number; membership?: Membership | null }) {
  if (!membership || membership.can_add_items) return null;
  return <LimitReached membership={membership} className="mt-3 flex flex-col items-start gap-3 rounded-modal border border-hairline bg-paper p-4" />;
}

/**
 * On the web a finder's note arrives by email; until the owner has sent themselves a test and said
 * it arrived (src/lib/emailCheck.ts), Items reminds them, so the first real note is not lost in spam.
 */
function EmailReminder({ itemCount }: { itemCount: number }) {
  const { user } = useAuth();
  const [emailOn, setEmailOn] = useState(false);
  useEffect(() => {
    if (!isNative()) void fetchEmailConfig().then((c) => setEmailOn(c?.email === true));
  }, []);
  if (!user) return null;
  const check = loadEmailCheck(browserStorage(), user.id);
  if (!showEmailReminder({ native: isNative(), emailOn, itemCount, check })) return null;
  return (
    <Link
      to="/app/settings#email-check"
      className="mb-4 flex min-h-14 items-center gap-3 rounded-modal border border-hairline bg-paper px-4 py-3 transition-colors hover:border-hairline-strong"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-ink-100 text-ink-900">
        <Mail size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-medium text-ink-900">Make sure our emails reach you</span>
        <span className="text-sm text-muted text-pretty">A finder's note comes by email. Send yourself a test so it does not land in spam.</span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-hidden />
    </Link>
  );
}

function EmptyItems() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
      <div className="grid size-[56px] place-items-center rounded-modal bg-canvas shadow-card">
        <TagIcon size={24} strokeWidth={1.75} className="text-ink-900" aria-hidden />
      </div>
      <h2 className="text-xl font-semibold text-ink-900">Tag your first thing</h2>
      <p className="max-w-sm text-base text-muted text-pretty">
        A water bottle, a violin case, a gym bag, your keys. If someone finds it, they scan the tag and
        send you a note here.
      </p>
      <Link to="/app/first-tag" className={buttonClasses({ variant: 'primary', size: 'lg', className: 'mt-2' })}>
        <Plus size={18} strokeWidth={2} aria-hidden />
        Make your first tag
      </Link>
      <Link to="/app/help#getting-started" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-900 underline underline-offset-4">
        Need help?
      </Link>
    </section>
  );
}

function MoreLinks() {
  return (
    <ul className="mt-6 overflow-hidden rounded-modal border border-hairline bg-canvas md:hidden">
      <li>
        <Link to="/app/tags" className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50">
          <span className={cn('grid size-[36px] shrink-0 place-items-center rounded-card bg-ink-100', axIcon)}>
            <TagIcon size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-medium text-ink-900">Tags</span>
            <span className="text-sm text-muted">Print again or switch a tag off</span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-hidden />
        </Link>
      </li>
    </ul>
  );
}

export function ItemsScreen() {
  const memberships = useMembershipsAvailable();
  const { items, tagByItemId, unread, membership, readOnly, loading, failed } = useOwnerItems();
  // Bumped when a tag is marked stuck on, so the item's status line is read again.
  const [, setTagEvents] = useState(0);
  // With no items, the walkthrough opens by itself; Skip for now leaves the empty screen for this visit.
  let skipped = false;
  try {
    skipped = window.sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    /* storage off: the walkthrough opens each time */
  }
  const subtitle =
    loading || !membership
      ? '\u00a0'
      : membership.item_limit === null
        ? `${items.length} ${items.length === 1 ? 'item' : 'items'}`
        : `${items.length} of ${membership.item_limit} items`;

  if (!loading && !failed && items.length === 0 && !skipped) return <Navigate to="/app/first-tag" replace />;

  return (
    <AppPage
      title="Items"
      subtitle={subtitle}
      help="getting-started"
      action={!loading ? <AddItemButton membership={membership} first={items.length === 0} /> : undefined}
    >
      {!loading && unread > 0 && (
        <Link
          to="/app/inbox"
          className="mb-4 flex min-h-14 items-center gap-3 rounded-modal border border-signal-200 bg-signal-50 px-4 py-3 transition-colors hover:border-signal-300"
        >
          <span className={cn('grid size-[36px] shrink-0 place-items-center rounded-pill bg-signal-700 text-canvas', axIcon)}>
            <InboxIcon size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-base font-medium text-ink-900">
            {unread === 1 ? 'Someone sent you a note' : `You have ${unread} new notes`}
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-signal-700" aria-hidden />
        </Link>
      )}

      {!loading && items.length > 0 && <GettingStarted
          itemCount={items.length}
          firstTag={tagByItemId.get(items[items.length - 1].id) ?? null}
          joinedFamily={!!membership && membership.household_id !== null && membership.household_id !== membership.own_household_id}
          onTagChange={() => setTagEvents((n) => n + 1)}
        />}

      {!loading && items.length > 0 && <EmailReminder itemCount={items.length} />}

      {failed && (
        <p role="alert" className="mb-4 rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
          We could not load your things. Pull down or reopen this screen to try again.
        </p>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline" aria-busy="true" aria-label="Loading your items">
          <ItemRowSkeleton />
          <ItemRowSkeleton />
        </div>
      ) : items.length === 0 && !failed ? (
        <EmptyItems />
      ) : (
        <>
          {readOnly.size > 0 && (
            <p className="mb-4 rounded-card bg-ink-100 px-4 py-3 text-sm text-ink-700 text-pretty">
              {readOnly.size === 1 ? '1 item is' : `${readOnly.size} items are`} over your plan's limit, so{' '}
              {readOnly.size === 1 ? 'it' : 'they'} can be read but not changed. Nothing was deleted.
              {memberships && (
                <>
                  {' '}
                  <Link to="/app/membership" className="font-medium text-ink-900 underline underline-offset-4">See plans</Link>
                </>
              )}
            </p>
          )}
          <ItemList items={items} tagByItemId={tagByItemId} readOnly={readOnly} />
          <AddItemCard membership={membership} />
          <MoreLinks />
        </>
      )}
    </AppPage>
  );
}

export const AppHome = ItemsScreen;
