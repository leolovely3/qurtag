import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
  /** Render this many copies stacked with the given gap (Tailwind class). */
  count?: number;
  gap?: string;
}

/**
 * Calm pulse placeholder for loading states. Used in place of spinners on
 * content surfaces so the layout doesn't jump when data arrives.
 */
export function Skeleton({ className, count = 1, gap = 'gap-3' }: SkeletonProps) {
  if (count > 1) {
    return (
      <div className={cn('flex flex-col', gap)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn('animate-qurtag-pulse rounded-card bg-ink-50', className)}
          />
        ))}
      </div>
    );
  }
  return <div className={cn('animate-qurtag-pulse rounded-card bg-ink-50', className)} />;
}

/**
 * A skeleton sized like an item card on /app and /app/items.
 */
export function ItemCardSkeleton() {
  return (
    <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex gap-qurtag-3">
      <Skeleton className="size-16 rounded-card" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-14 rounded-pill" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2 mt-auto" />
      </div>
    </div>
  );
}

/**
 * A skeleton sized like an inbox thread row.
 */
export function ThreadRowSkeleton() {
  return (
    <div className="flex items-start gap-qurtag-3 p-qurtag-3 border-b border-hairline last:border-b-0">
      <Skeleton className="size-12 rounded-card" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}
