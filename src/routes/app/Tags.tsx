import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Printer, Tag as TagIcon } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { buttonClasses } from '@/components/ui/Button';
import { ThreadRowSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { fetchItems, fetchPrimaryHouseholdId, fetchTags } from '@/lib/queries';
import type { Item, Tag } from '@/lib/database.types';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/tagLayout';

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
  // Switching a tag off is asked first: a finder holding the item could no longer write.
  const [confirmOff, setConfirmOff] = useState<Tag | null>(null);
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
    <AppPage title="Tags" back={{ to: '/app', label: 'Items' }}>
      <p className="mb-4 px-1 text-base text-muted text-pretty">
        Each item gets a tag with its own code. Print it as often as you like, or switch it off if you
        no longer want it to work.
      </p>
      {tags.filter((t) => t.status === 'active').length > 1 && (
        <Link to="/app/tags/sheet" className={buttonClasses({ variant: 'secondary', className: 'mb-4' })}>
          <Layers size={16} strokeWidth={1.75} aria-hidden />
          Print several items on one page
        </Link>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline" aria-busy="true" aria-label="Loading your tags">
          <ThreadRowSkeleton />
          <ThreadRowSkeleton />
        </div>
      ) : tags.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-ink-900">No tags yet</h2>
          <p className="max-w-sm text-base text-muted">Add an item and its tag is made for you.</p>
          <Link to="/start/setup" className={buttonClasses({ variant: 'primary', className: 'mt-2' })}>
            Add an item
          </Link>
        </section>
      ) : (
        <ul className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline">
          {tags.map((tag) => {
            const item = tag.current_item_id ? itemById.get(tag.current_item_id) : null;
            return (
              <li key={tag.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-[44px] shrink-0 place-items-center rounded-card bg-ink-100 ax:hidden">
                    <TagIcon size={20} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-base font-medium text-ink-900">{item?.name ?? 'No item'}</p>
                    <p className="text-sm text-muted">
                      {tag.short_code ? <><span className="font-mono">{shortAddress(tag.short_code)}</span> ·{' '}</> : null}
                      <span className={cn(tag.status === 'active' ? 'text-verdigris-700' : 'text-muted')}>{STATUS[tag.status]}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tag.status === 'active' && (
                    <Link to={`/app/tags/${tag.id}/print`} className={buttonClasses({ variant: 'primary', className: 'flex-1 sm:flex-none' })}>
                      <Printer size={16} strokeWidth={1.75} aria-hidden />
                      Print
                    </Link>
                  )}
                  {tag.status === 'active' && (
                    <Link to={`/find/${tag.public_id}#test=1`} className={buttonClasses({ variant: 'secondary', className: 'flex-1 sm:flex-none' })}>
                      Test
                    </Link>
                  )}
                  {tag.status !== 'replaced' && (
                    <button
                      type="button"
                      disabled={busy === tag.id}
                      onClick={() => (tag.status === 'active' ? setConfirmOff(tag) : void setStatus(tag, 'active'))}
                      className={buttonClasses({ variant: 'secondary', className: 'flex-1 sm:flex-none' })}
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

      <Modal
        open={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        eyebrow="Switch off"
        title={`Switch off the tag on ${(confirmOff?.current_item_id && itemById.get(confirmOff.current_item_id)?.name) || 'this item'}?`}
        description="Anyone who scans it will see that the tag is not working and will not be able to send you a note, even if they are holding your thing. Existing conversations stay in your inbox. You can switch it back on at any time."
        primaryAction={{
          label: 'Switch it off',
          tone: 'destructive',
          pending: !!confirmOff && busy === confirmOff.id,
          onClick: async () => {
            const t = confirmOff;
            setConfirmOff(null);
            if (t) await setStatus(t, 'inactive');
          },
        }}
        secondaryAction={{ label: 'Keep it working', onClick: () => setConfirmOff(null) }}
      />
    </AppPage>
  );
}
