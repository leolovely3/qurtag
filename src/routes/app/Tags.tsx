import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Printer, Tag as TagIcon, Search, Package, ExternalLink } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { HardwareTier, Item, Tag, TagStatus } from '@/lib/database.types';
import { cn } from '@/lib/cn';

type StatusFilter = 'all' | TagStatus;
type TierFilter = 'all' | HardwareTier;

export function Tags() {
  const { user, loading: authLoading } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tier, setTier] = useState<TierFilter>('all');

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
      const [tgs, its] = await Promise.all([fetchTags(hh), fetchItems(hh)]);
      if (cancelled) return;
      setTags(tgs);
      setItems(its);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const itemById = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = tags;
    if (status !== 'all') out = out.filter((t) => t.status === status);
    if (tier !== 'all') out = out.filter((t) => t.hardware_tier === tier);
    if (q) {
      out = out.filter((t) => {
        if (t.public_id.toLowerCase().includes(q)) return true;
        const item = t.current_item_id ? itemById.get(t.current_item_id) : null;
        return item?.name.toLowerCase().includes(q);
      });
    }
    return out;
  }, [tags, query, status, tier, itemById]);

  const active = tags.filter((t) => t.status === 'active').length;
  const unassigned = tags.filter((t) => !t.current_item_id).length;

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-5xl">
      <div className="flex items-end justify-between mb-cairn-5 gap-cairn-3 flex-wrap">
        <div className="flex flex-col gap-2">
          <Eyebrow>Tags</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
            {tags.length} tag{tags.length === 1 ? '' : 's'}
            {active > 0 && <span className="text-muted">, {active} active</span>}
            {unassigned > 0 && (
              <span className="text-muted">, {unassigned} unassigned</span>
            )}
            .
          </h1>
        </div>
        <Link
          to="/start/setup"
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
        >
          <Plus size={14} strokeWidth={1.75} />
          New tag
        </Link>
      </div>

      <div className="relative mb-cairn-3">
        <Search
          size={16}
          strokeWidth={1.75}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="search"
          placeholder="Search by tag code or item name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-pill border border-hairline-strong bg-canvas pl-11 pr-4 text-body text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-cairn"
        />
      </div>

      <div className="flex items-center gap-2 mb-cairn-5 flex-wrap">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>
          All status
        </Chip>
        <Chip active={status === 'active'} onClick={() => setStatus('active')}>
          Active
        </Chip>
        <Chip active={status === 'inactive'} onClick={() => setStatus('inactive')}>
          Inactive
        </Chip>
        <Chip active={status === 'replaced'} onClick={() => setStatus('replaced')}>
          Replaced
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
      </div>

      {loading ? (
        <div className="rounded-modal border border-hairline bg-canvas p-cairn-8 flex items-center justify-center">
          <div className="size-6 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-8 flex flex-col items-start gap-3">
          <div className="size-12 rounded-pill bg-canvas grid place-items-center shadow-card">
            <TagIcon size={20} strokeWidth={1.5} className="text-ink-900" />
          </div>
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
            {tags.length === 0 ? 'No tags yet.' : 'No tags match.'}
          </h2>
          <p className="text-body text-muted max-w-md text-pretty">
            {tags.length === 0
              ? 'Tags are minted when you add your first item. The printable tier is free; premium tiers ship from us.'
              : 'Try a different search or filter.'}
          </p>
          {tags.length === 0 && (
            <Link
              to="/start/setup"
              className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 transition-colors duration-cairn"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add an item to mint a tag
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
          {filtered.map((tag) => {
            const item = tag.current_item_id ? itemById.get(tag.current_item_id) : null;
            return (
              <div
                key={tag.id}
                className="flex items-center gap-cairn-3 p-cairn-3 hover:bg-paper transition-colors duration-cairn"
              >
                <div className="size-10 rounded-card bg-ink-50 grid place-items-center shrink-0">
                  <TagIcon size={16} strokeWidth={1.75} className="text-ink-900" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-caption text-ink-900">{tag.public_id}</span>
                    <Eyebrow>{tag.hardware_tier}</Eyebrow>
                  </div>
                  {item ? (
                    <Link
                      to={`/app/items/${item.id}`}
                      className="text-caption text-muted hover:text-ink-900 transition-colors inline-flex items-center gap-1.5 truncate"
                    >
                      <Package size={11} strokeWidth={1.75} />
                      <span className="truncate">{item.name}</span>
                      <ExternalLink size={10} strokeWidth={1.75} className="shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-caption text-muted italic">Not assigned to an item.</span>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-cairn-3 shrink-0">
                  <StatusBadge status={tag.status} />
                  <Link
                    to={`/app/tags/${tag.id}/print`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline-strong text-ink-900 text-caption font-medium px-3 hover:border-ink-900 transition-colors duration-cairn"
                  >
                    <Printer size={12} strokeWidth={1.75} />
                    Reprint
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TagStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-pill',
        status === 'active' && 'bg-verdigris-100 text-verdigris-700',
        status === 'inactive' && 'bg-ink-50 text-muted',
        status === 'replaced' && 'bg-signal-50 text-signal-700',
      )}
    >
      {status}
    </span>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-pill border px-3 text-caption font-medium',
        'transition-colors duration-cairn ease-cairn',
        active
          ? 'bg-ink-900 text-canvas border-ink-900'
          : 'bg-canvas text-ink-700 border-hairline-strong hover:border-ink-900',
      )}
    >
      {children}
    </button>
  );
}
