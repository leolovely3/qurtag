import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Lock, Package } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { ItemCardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Item, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';

function centsToUSD(cents: number | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export function AppHome() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [fetching, setFetching] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !isSupabaseConfigured) {
      setFetching(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled || !hh) {
        setFetching(false);
        return;
      }
      setHouseholdId(hh);
      const [its, tgs] = await Promise.all([fetchItems(hh), fetchTags(hh)]);
      if (cancelled) return;
      setItems(its);
      setTags(tgs);
      setFetching(false);
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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Late night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const loading = authLoading || fetching;

  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-5xl">
      <div className="flex flex-col gap-2 mb-qurtag-8">
        <Eyebrow>{greeting}</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
          {items.length === 0 ? "Let's protect your first thing." : 'Everything is where it should be.'}
        </h1>
      </div>

      {/* Setup state (no items yet) */}
      {!loading && items.length === 0 && (
        <section className="rounded-modal border border-hairline bg-paper p-qurtag-8 flex flex-col md:flex-row md:items-center gap-qurtag-5">
          <div className="flex-1 flex flex-col gap-2">
            <Eyebrow>Two minutes</Eyebrow>
            <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
              Name an item. Print a tag. Done.
            </h2>
            <p className="text-body text-muted max-w-md text-pretty">
              QurTag is most useful the moment you put a tag on something. Even a printable one,
              cut and slipped into your luggage sleeve, is enough.
            </p>
          </div>
          <Link
            to="/start/setup"
            className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium px-6 hover:bg-ink-700 transition-colors duration-qurtag self-start"
          >
            <Plus size={16} strokeWidth={1.75} />
            Add your first item
          </Link>
        </section>
      )}

      {/* Items grid */}
      {!loading && items.length > 0 && (
        <>
          <div className="flex items-end justify-between mb-qurtag-3">
            <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em]">
              Your items
            </h2>
            <Link
              to="/start/setup"
              className="text-caption text-muted hover:text-ink-900 transition-colors duration-qurtag inline-flex items-center gap-1"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add item
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map((item) => {
              const tag = tagByItemId.get(item.id);
              const value = centsToUSD(item.declared_value_cents);
              return (
                <Link
                  key={item.id}
                  to={`/app/items/${item.id}`}
                  className={cn(
                    'rounded-modal border border-hairline bg-canvas p-qurtag-5 flex gap-qurtag-3',
                    'hover:border-hairline-strong hover:shadow-card transition-all duration-qurtag',
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
                          <span className="size-1.5 rounded-full bg-signal-500 animate-qurtag-pulse" />
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
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} strokeWidth={1.75} /> Home
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {loading && (
        <div className="grid sm:grid-cols-2 gap-3">
          <ItemCardSkeleton />
          <ItemCardSkeleton />
          <ItemCardSkeleton />
          <ItemCardSkeleton />
        </div>
      )}

      {!isSupabaseConfigured && (
        <div className="mt-qurtag-5 rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
          Supabase isn't configured. See docs/SETUP.md to wire it up. The dashboard will populate
          as soon as you do.
        </div>
      )}

      {householdId && import.meta.env.DEV && (
        <p className="mt-qurtag-5 text-caption text-muted">
          Household: <span className="font-mono">{householdId}</span>
        </p>
      )}
    </div>
  );
}
