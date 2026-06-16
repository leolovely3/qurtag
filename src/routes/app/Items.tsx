import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Package, Plus, Search, SortAsc } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { ItemCardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { HardwareTier, Item, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';

type StatusFilter = 'all' | 'armed' | 'idle';
type SortMode = 'recent' | 'name' | 'value';
type TierFilter = 'all' | HardwareTier;

function centsToUSD(cents: number | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function Items() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tier, setTier] = useState<TierFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  useEffect(() => {
    if (authLoading || !user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled || !hh) {
        setLoading(false);
        return;
      }
      const [its, tgs] = await Promise.all([fetchItems(hh), fetchTags(hh)]);
      if (cancelled) return;
      setItems(its);
      setTags(tgs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const tagByItemId = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) if (t.current_item_id) m.set(t.current_item_id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items;
    if (status === 'armed') out = out.filter((i) => i.lost_mode);
    if (status === 'idle') out = out.filter((i) => !i.lost_mode);
    if (tier !== 'all') out = out.filter((i) => tagByItemId.get(i.id)?.hardware_tier === tier);
    if (q) {
      out = out.filter((i) =>
        [i.name, i.brand, i.model, i.color].some((f) => f?.toLowerCase().includes(q)),
      );
    }
    const sorted = out.slice();
    if (sortMode === 'recent') {
      sorted.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } else if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'value') {
      sorted.sort((a, b) => (b.declared_value_cents ?? 0) - (a.declared_value_cents ?? 0));
    }
    return sorted;
  }, [items, tagByItemId, query, status, tier, sortMode]);

  const armedCount = items.filter((i) => i.lost_mode).length;

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-5xl">
      <div className="flex items-end justify-between mb-cairn-5 gap-cairn-3 flex-wrap">
        <div className="flex flex-col gap-2">
          <Eyebrow>Items</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
            {items.length} item{items.length === 1 ? '' : 's'}
            {armedCount > 0 && (
              <span className="text-signal-600">, {armedCount} armed</span>
            )}
            .
          </h1>
        </div>
        <Link
          to="/start/setup"
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
        >
          <Plus size={14} strokeWidth={1.75} />
          Add item
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-cairn-3">
        <Search
          size={16}
          strokeWidth={1.75}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="search"
          placeholder="Search by name, brand, model…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-pill border border-hairline-strong bg-canvas pl-11 pr-4 text-body text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-cairn"
        />
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-cairn-5 flex-wrap">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>
          All
        </Chip>
        <Chip active={status === 'armed'} onClick={() => setStatus('armed')} tone="signal">
          Armed
        </Chip>
        <Chip active={status === 'idle'} onClick={() => setStatus('idle')}>
          Idle
        </Chip>
        <span className="w-px h-5 bg-hairline mx-1" />
        <Chip active={tier === 'all'} onClick={() => setTier('all')}>
          Any tier
        </Chip>
        {(['printable', 'sticker', 'core', 'pro', 'signature', 'track'] as const).map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </Chip>
        ))}
        <span className="ml-auto inline-flex items-center gap-2 text-caption text-muted">
          <SortAsc size={14} strokeWidth={1.75} />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-transparent text-caption text-ink-900 focus:outline-none cursor-pointer"
          >
            <option value="recent">Recently added</option>
            <option value="name">Name</option>
            <option value="value">Declared value</option>
          </select>
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ItemCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-8 flex flex-col items-start gap-3">
          <div className="size-12 rounded-pill bg-canvas grid place-items-center shadow-card">
            <Package size={20} strokeWidth={1.5} className="text-ink-900" />
          </div>
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
            {items.length === 0 ? 'Nothing here yet.' : 'No items match.'}
          </h2>
          <p className="text-body text-muted max-w-md text-pretty">
            {items.length === 0
              ? "Add your first item to get a printable tag in two minutes."
              : "Try a different search or filter."}
          </p>
          {items.length === 0 && (
            <Link
              to="/start/setup"
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 transition-colors duration-cairn"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add an item
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => {
            const tag = tagByItemId.get(item.id);
            const value = centsToUSD(item.declared_value_cents);
            return (
              <Link
                key={item.id}
                to={`/app/items/${item.id}`}
                className={cn(
                  'rounded-modal border border-hairline bg-canvas p-cairn-5 flex gap-cairn-3',
                  'hover:border-hairline-strong hover:shadow-card transition-all duration-cairn',
                )}
              >
                {item.hero_photo_url ? (
                  <img
                    src={item.hero_photo_url}
                    alt=""
                    className="size-16 rounded-card object-cover bg-ink-50 shrink-0"
                  />
                ) : (
                  <div className="size-16 rounded-card bg-ink-50 grid place-items-center shrink-0">
                    <Package size={20} strokeWidth={1.5} className="text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Eyebrow>{tag?.hardware_tier ?? 'No tag'}</Eyebrow>
                    {item.lost_mode ? (
                      <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-pill bg-signal-50 text-signal-700 shrink-0">
                        <span className="size-1.5 rounded-full bg-signal-500 animate-cairn-pulse" />
                        Armed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-pill bg-ink-50 text-muted shrink-0">
                        <span className="size-1.5 rounded-full bg-ink-300" />
                        Idle
                      </span>
                    )}
                  </div>
                  <h3 className="font-display font-semibold text-h6 text-ink-900 tracking-[-0.014em] text-balance truncate">
                    {item.name}
                  </h3>
                  <div className="flex items-center gap-3 text-caption text-muted mt-auto">
                    {value && (
                      <span className="inline-flex items-center gap-1">
                        <Lock size={12} strokeWidth={1.75} /> {value}
                      </span>
                    )}
                    {item.brand && <span className="truncate">{item.brand}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'signal';
  children: React.ReactNode;
}

function Chip({ active, onClick, tone = 'default', children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-pill border px-3 text-caption font-medium',
        'transition-colors duration-cairn ease-cairn',
        active
          ? tone === 'signal'
            ? 'bg-signal-500 text-canvas border-signal-500'
            : 'bg-ink-900 text-canvas border-ink-900'
          : 'bg-canvas text-ink-700 border-hairline-strong hover:border-ink-900',
      )}
    >
      {children}
    </button>
  );
}
