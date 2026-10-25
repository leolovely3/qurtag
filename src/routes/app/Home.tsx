import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon, Package, Plus, Printer } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { ItemCardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { countUnreadForHousehold, fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import { fetchMembership, type Membership } from '@/lib/membership';
import type { Item, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';

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

export function ItemList({ items, tagByItemId, readOnly }: { items: Item[]; tagByItemId: Map<string, Tag>; readOnly?: Set<string> }) {
  return (
    <ul className="grid sm:grid-cols-2 gap-3">
      {items.map((item) => {
        const tag = tagByItemId.get(item.id);
        const locked = readOnly?.has(item.id) ?? false;
        return (
          <li key={item.id} className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3">
            <Link to={`/app/items/${item.id}`} className="flex gap-qurtag-3 min-w-0">
              {item.hero_photo_url ? (
                <img src={item.hero_photo_url} alt="" className="size-16 rounded-card object-cover bg-ink-50 shrink-0" />
              ) : (
                <div className="size-16 rounded-card bg-ink-50 grid place-items-center shrink-0">
                  <Package size={20} strokeWidth={1.5} className="text-muted" aria-hidden />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="font-display font-semibold text-h6 text-ink-900 tracking-[-0.014em] truncate">{item.name}</h3>
                <span
                  className={cn(
                    'self-start inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-pill',
                    item.lost_mode ? 'bg-signal-50 text-signal-700' : 'bg-ink-50 text-ink-700',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', item.lost_mode ? 'bg-signal-500' : 'bg-ink-300')} />
                  {item.lost_mode ? 'Marked lost' : 'Not lost'}
                </span>
                <span className="text-caption text-muted">{tag ? `Tag ${tag.public_id}` : 'No working tag'}</span>
                {locked && (
                  <span className="self-start text-caption px-2 py-0.5 rounded-pill bg-ink-50 text-ink-700">Read-only: over your plan's limit</span>
                )}
              </div>
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/app/items/${item.id}`}
                className="inline-flex h-11 items-center rounded-pill border border-hairline-strong px-4 text-caption font-medium text-ink-900"
              >
                {locked ? 'View' : 'Edit'}
              </Link>
              {tag && (
                <Link
                  to={`/app/tags/${tag.id}/print`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-ink-900 px-4 text-caption font-medium text-canvas"
                >
                  <Printer size={14} strokeWidth={1.75} aria-hidden />
                  Print tag
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AddItemCard({ count, membership }: { count: number; membership?: Membership | null }) {
  // Until the plan is known, trust the database to refuse (it does, with a plain message).
  if (membership && !membership.can_add_items) {
    return (
      <div className="mt-qurtag-3 flex flex-col gap-2 items-start">
        <p className="text-caption text-muted text-pretty">
          {membership.item_limit === 2
            ? 'QuR Tag is free for up to two items, and you have two. To tag something else, upgrade your plan or delete one first.'
            : `Your plan covers ${membership.item_limit} items. To tag something else, delete one first.`}
        </p>
        <Link
          to="/app/membership"
          className="inline-flex h-11 items-center rounded-pill bg-ink-900 px-5 text-caption font-medium text-canvas hover:bg-ink-700 transition-colors duration-qurtag"
        >
          See plans
        </Link>
      </div>
    );
  }
  return (
    <Link
      to="/start/setup"
      className="mt-qurtag-3 inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium px-6 hover:bg-ink-700 transition-colors duration-qurtag"
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      {count === 0 ? 'Add your first item' : 'Add another item'}
    </Link>
  );
}

export function AppHome() {
  const { items, tagByItemId, unread, membership, readOnly, loading, failed } = useOwnerItems();

  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-5xl">
      <div className="flex flex-col gap-2 mb-qurtag-5">
        <Eyebrow>Your things</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
          {items.length === 0 ? 'Tag your first thing.' : 'Your tagged things.'}
        </h1>
      </div>

      {!loading && unread > 0 && (
        <Link
          to="/app/inbox"
          className="mb-qurtag-5 rounded-modal border border-signal-500 bg-signal-50 p-qurtag-5 flex items-center gap-3"
        >
          <InboxIcon size={20} strokeWidth={1.75} className="text-signal-700 shrink-0" aria-hidden />
          <span className="text-body text-ink-900 font-medium">
            {unread === 1 ? 'Someone sent you a note. Read it.' : `You have ${unread} new notes. Read them.`}
          </span>
        </Link>
      )}

      {failed && (
        <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
          We could not load your things. Refresh the page to try again.
        </p>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <ItemCardSkeleton />
          <ItemCardSkeleton />
        </div>
      ) : items.length === 0 ? (
        <section className="rounded-modal border border-hairline bg-paper p-qurtag-5 sm:p-qurtag-8 flex flex-col gap-2">
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
            Name a thing. Print its tag. Stick it on.
          </h2>
          <p className="text-body text-muted max-w-md text-pretty">
            A water bottle, a violin case, a gym bag, a set of keys. If someone finds it, they scan the
            tag and send you a note here. Free for up to two items.
          </p>
          <AddItemCard count={0} membership={membership} />
        </section>
      ) : (
        <>
          {readOnly.size > 0 && (
            <p className="mb-qurtag-3 rounded-card bg-ink-50 px-3 py-2 text-caption text-ink-700 text-pretty">
              {readOnly.size === 1 ? '1 item is' : `${readOnly.size} items are`} over your plan's limit, so {readOnly.size === 1 ? 'it' : 'they'} can be read but not changed. Nothing was deleted.{' '}
              <Link to="/app/membership" className="underline underline-offset-4 text-ink-900">See plans</Link>
            </p>
          )}
          <ItemList items={items} tagByItemId={tagByItemId} readOnly={readOnly} />
          <AddItemCard count={items.length} membership={membership} />
        </>
      )}
    </div>
  );
}
