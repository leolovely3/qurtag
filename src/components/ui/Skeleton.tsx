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
      <div className={cn('flex flex-col', gap)} aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={cn('animate-qurtag-pulse rounded-card bg-ink-100', className)} />
        ))}
      </div>
    );
  }
  return <div aria-hidden className={cn('animate-qurtag-pulse rounded-card bg-ink-100', className)} />;
}

/** A skeleton sized like a row in the Items list. */
export function ItemRowSkeleton() {
  return (
    <div className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3">
      <Skeleton className="size-14" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Kept for screens that still show item cards. */
export const ItemCardSkeleton = ItemRowSkeleton;

/** A skeleton sized like an inbox thread row. */
export function ThreadRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="size-11" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

/** A full-screen placeholder for a screen that is loading: a title bar and a few blocks. */
export function ScreenSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-6 md:px-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-modal" />
      ))}
    </div>
  );
}
