import { Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

interface LostModeToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  pending?: boolean;
  className?: string;
}

/**
 * Big, calm toggle for lost mode. Slate when off, signal coral when on.
 * Never alarmist red. The component owns its visual gravity. It's the
 * single most consequential control on an item page.
 */
export function LostModeToggle({ value, onChange, pending, className }: LostModeToggleProps) {
  return (
    <div
      className={cn(
        'rounded-modal border p-qurtag-5 transition-colors duration-qurtag ease-qurtag',
        value
          ? 'border-signal-200 bg-signal-50'
          : 'border-hairline bg-canvas',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-qurtag-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'size-10 rounded-pill grid place-items-center shrink-0 transition-colors duration-qurtag',
              value ? 'bg-signal-500 text-canvas' : 'bg-ink-50 text-ink-900',
            )}
          >
            <ShieldCheck size={18} strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Lost mode</span>
            <h3
              className={cn(
                'font-display font-semibold text-h5 tracking-[-0.018em] text-balance',
                value ? 'text-signal-900' : 'text-ink-900',
              )}
            >
              {value ? "This is missing. QurTag is paying attention." : 'This is at rest.'}
            </h3>
            <p className="text-caption text-muted text-pretty max-w-md">
              {value
                ? 'Anyone who scans the tag sees an urgent prompt. You\'ll be notified the moment they do, anywhere in the world.'
                : 'Turn this on the moment you notice something is gone. You can also schedule it for trips.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-busy={pending}
          onClick={() => !pending && onChange(!value)}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors duration-qurtag ease-qurtag',
            value ? 'bg-signal-500' : 'bg-ink-200',
            pending && 'opacity-60 cursor-progress',
          )}
        >
          <span className="sr-only">Toggle lost mode</span>
          <span
            className={cn(
              'inline-block size-5 rounded-full bg-canvas shadow-card transition-transform duration-qurtag ease-qurtag',
              value ? 'translate-x-6' : 'translate-x-1',
            )}
          >
            {pending && (
              <Loader2
                size={12}
                strokeWidth={2}
                className="absolute inset-0 m-auto text-ink-500 animate-spin"
              />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
