import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Tag as TagIcon } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import type { Item, Tag } from '@/lib/database.types';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const STATUS: Record<Tag['status'], string> = {
  active: 'Working',
  inactive: 'Switched off',
  replaced: 'Replaced by a new code',
};

/**
 * Every tag the owner has made. A working tag can be printed again or switched off (its
 * page then says "This tag isn't registered"); a switched-off tag can be switched back
 * on. A replaced tag stays off: making a new code is on the item's page.
 */
export function Tags() {
  const { user, loading: authLoading } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const hh = await fetchPrimaryHouseholdId();
    if (!hh) {
      setLoading(false);
      return;
    }
    const [tgs, its] = await Promise.all([fetchTags(hh), fetchItems(hh)]);
    setTags(tgs);
    setItems(its);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  async function setStatus(tag: Tag, status: 'active' | 'inactive') {
    setBusy(tag.id);
    const { error } = await db.from('tags').update({ status }).eq('id', tag.id);
    setBusy(null);
    if (error) {
      toast.show({ kind: 'error', title: "Couldn't change the tag", body: 'Try again in a moment.' });
      return;
    }
    toast.show({ kind: 'success', title: status === 'active' ? 'Tag switched on' : 'Tag switched off' });
    await load();
  }

  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-4xl">
      <div className="flex flex-col gap-2 mb-qurtag-5">
        <Eyebrow>Tags</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04]">
          Your tags
        </h1>
        <p className="text-body text-muted text-pretty max-w-xl">
          Each item gets a tag with its own code. Print it as often as you like. Switch a tag off if you
          no longer want it to work.
        </p>
      </div>

      {loading ? (
        <p className="text-caption text-muted">Loading…</p>
      ) : tags.length === 0 ? (
        <div className="rounded-modal border border-hairline bg-paper p-qurtag-5 flex flex-col gap-3 items-start">
          <p className="text-body text-ink-900">No tags yet. Add an item to make its tag.</p>
          <Link to="/start/setup" className="inline-flex h-11 items-center rounded-pill bg-ink-900 px-5 text-caption font-medium text-canvas">
            Add an item
          </Link>
        </div>
      ) : (
        <ul className="rounded-modal border border-hairline bg-canvas divide-y divide-hairline overflow-hidden">
          {tags.map((tag) => {
            const item = tag.current_item_id ? itemById.get(tag.current_item_id) : null;
            return (
              <li key={tag.id} className="p-qurtag-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
                    <TagIcon size={16} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink-900 truncate">{item?.name ?? 'No item'}</p>
                    <p className="text-caption text-muted">
                      <span className="font-mono">{tag.public_id}</span> ·{' '}
                      <span className={cn(tag.status === 'active' ? 'text-verdigris-700' : 'text-muted')}>{STATUS[tag.status]}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {tag.status === 'active' && (
                    <Link
                      to={`/app/tags/${tag.id}/print`}
                      className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-ink-900 px-4 text-caption font-medium text-canvas"
                    >
                      <Printer size={14} strokeWidth={1.75} aria-hidden />
                      Print
                    </Link>
                  )}
                  {tag.status !== 'replaced' && (
                    <button
                      type="button"
                      disabled={busy === tag.id}
                      onClick={() => setStatus(tag, tag.status === 'active' ? 'inactive' : 'active')}
                      className="inline-flex h-11 items-center rounded-pill border border-hairline-strong px-4 text-caption font-medium text-ink-900 disabled:opacity-50"
                    >
                      {tag.status === 'active' ? 'Switch off' : 'Switch on'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
