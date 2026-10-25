import { Link } from 'react-router-dom';
import { Bell, Check, Plus, Printer, ScanLine, Tag as TagIcon, X } from 'lucide-react';
import { useGettingStarted } from '@/lib/useGettingStarted';
import { markPushExplained, turnOnPush } from '@/lib/nativePush';
import type { StepId } from '@/lib/gettingStarted';
import type { Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { recordTag } from '@/lib/tagProgress';

const COPY: Record<StepId, { title: string; body: string; icon: typeof Plus; confirm?: string }> = {
  add: { title: 'Add your first item', body: 'A water bottle, keys, a bag.', icon: Plus },
  print: { title: 'Print its tag', body: 'On sticker paper or plain paper.', icon: Printer },
  stick: { title: 'Stick it on', body: 'Put the printed tag on your thing.', icon: TagIcon, confirm: 'I stuck it on' },
  test: { title: 'Scan the printed tag', body: 'Point your phone camera at it. Your item’s page should open.', icon: ScanLine, confirm: 'It opened' },
  alerts: { title: 'Turn on alerts', body: 'Hear the moment a finder writes.', icon: Bell },
};

/**
 * The Getting started card at the top of Items, until every step is done or dismissed.
 * Progress is kept per account on this device (src/lib/gettingStarted.ts).
 */
export function GettingStarted({ itemCount, firstTag, joinedFamily = false, onTagChange }: { itemCount: number; firstTag: Tag | null; joinedFamily?: boolean; onTagChange?: () => void }) {
  const gs = useGettingStarted(itemCount);
  // Someone who joined a family that already has items did not set them up: the steps are not theirs.
  if (gs.finished || joinedFamily) return null;
  const doneCount = gs.steps.filter((s) => s.done).length;

  const target = (id: StepId): { to?: string; onClick?: () => void } => {
    switch (id) {
      case 'add':
        return { to: '/app/first-tag' };
      case 'print':
        return firstTag ? { to: `/app/tags/${firstTag.id}/print` } : { to: '/app/tags' };
      case 'stick':
        return {
          onClick: () => {
            recordTag(firstTag?.id, 'stuck');
            gs.done('stick');
            onTagChange?.();
          },
        };
      case 'test':
        return { onClick: () => gs.done('test') };
      case 'alerts':
        return {
          onClick: async () => {
            markPushExplained();
            await turnOnPush();
            gs.refresh();
          },
        };
    }
  };

  return (
    <section aria-labelledby="gs-h" className="mb-5 overflow-hidden rounded-modal border border-hairline bg-canvas">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 flex-col">
          <h2 id="gs-h" className="text-base font-semibold text-ink-900">Getting started</h2>
          <p className="text-sm text-muted">{doneCount} of {gs.steps.length} done</p>
        </div>
        <button
          type="button"
          onClick={gs.close}
          aria-label="Hide Getting started"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-muted hover:bg-ink-50 hover:text-ink-900"
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="mx-4 mb-1 h-1 overflow-hidden rounded-pill bg-ink-100" aria-hidden>
        <div className="h-full rounded-pill bg-signal-700 transition-all" style={{ width: `${(doneCount / gs.steps.length) * 100}%` }} />
      </div>
      <ul className="divide-y divide-hairline">
        {gs.steps.map((s) => {
          const c = COPY[s.id];
          const t = target(s.id);
          const open = !s.done && !s.skipped;
          const inner = (
            <>
              <span
                className={cn(
                  'grid size-[32px] shrink-0 place-items-center rounded-full border axx:hidden',
                  s.done ? 'border-transparent bg-verdigris-700 text-canvas' : 'border-hairline-strong text-ink-700',
                  s.skipped && 'opacity-50',
                )}
              >
                {s.done ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <c.icon size={16} strokeWidth={1.75} aria-hidden />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className={cn('text-base font-medium', s.done || s.skipped ? 'text-muted' : 'text-ink-900', s.done && 'line-through decoration-ink-300')}>
                  {c.title}
                </span>
                {open && <span className="text-sm text-muted">{c.body}</span>}
                {s.skipped && <span className="text-sm text-muted">Skipped</span>}
              </span>
            </>
          );
          const rowCls = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 transition-colors hover:bg-ink-50 active:bg-ink-50 focus-visible:outline-offset-[-2px]';
          const skip = open && (
            <button
              type="button"
              onClick={() => gs.skip(s.id)}
              aria-label={`Skip: ${c.title}`}
              className="mr-2 inline-flex min-h-11 shrink-0 items-center rounded-pill px-3 text-sm font-medium text-muted underline underline-offset-4 hover:text-ink-900"
            >
              Skip
            </button>
          );
          // A step the person confirms (stuck on, scanned) shows its own button, so the row is not a guess.
          if (c.confirm && open && t.onClick) {
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-1 py-1">
                <div className="flex min-h-14 min-w-0 flex-1 basis-56 items-center gap-3 px-4 py-2">{inner}</div>
                <div className="flex items-center gap-1 pb-2 pl-14 pr-2 sm:pb-0 sm:pl-0">
                  <button type="button" onClick={t.onClick} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                    {c.confirm}
                  </button>
                  {skip}
                </div>
              </li>
            );
          }
          return (
            <li key={s.id} className="flex items-center">
              {t.to ? (
                <Link to={t.to} className={rowCls}>{inner}</Link>
              ) : (
                <button type="button" onClick={t.onClick} className={rowCls}>{inner}</button>
              )}
              {skip}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
