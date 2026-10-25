import { Eyebrow } from '@/components/brand/Typography';
import { ItemCardSkeleton } from '@/components/ui/Skeleton';
import { AddItemCard, ItemList, useOwnerItems } from './Home';

export function Items() {
  const { items, tagByItemId, membership, readOnly, loading } = useOwnerItems();
  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-5xl">
      <div className="flex flex-col gap-2 mb-qurtag-5">
        <Eyebrow>Items</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04]">
          {loading ? 'Your items' : membership?.item_limit ? `${items.length} of ${membership.item_limit} items` : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </h1>
        <p className="text-body text-muted">
          {membership && membership.item_limit === null ? 'Your plan has no limit on items.' : 'QuR Tag is free for up to two items. Plus and Family have no limit.'}
        </p>
      </div>
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <ItemCardSkeleton />
          <ItemCardSkeleton />
        </div>
      ) : (
        <>
          {items.length > 0 && <ItemList items={items} tagByItemId={tagByItemId} readOnly={readOnly} />}
          <AddItemCard count={items.length} membership={membership} />
        </>
      )}
    </div>
  );
}
