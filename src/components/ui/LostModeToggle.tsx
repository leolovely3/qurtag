import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface LostModeToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  pending?: boolean;
  className?: string;
}

/**
 * Lost mode, as a settings row with an iOS-sized switch. Calm when off, the brand orange when
 * on. Never an alarm: it changes what the tag's page says to a finder, nothing more.
 */
export function LostModeToggle({ value, onChange, pending, className }: LostModeToggleProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-modal border px-4 py-4 transition-colors duration-150',
        value ? 'border-signal-200 bg-signal-50' : 'border-hairline bg-canvas',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-base font-semibold text-ink-900">
          {value ? 'Marked lost' : 'Lost mode'}
        </span>
        <span id={descId} className="text-sm text-muted text-pretty">
          {value
            ? "The tag's page tells the finder you are looking for it. Check your inbox for notes."
            : 'Switch this on when you notice it is gone. The tag works either way.'}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-busy={pending}
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={() => !pending && onChange(!value)}
        className="relative grid h-11 w-[3.75rem] shrink-0 place-items-center rounded-pill"
      >
        <span
          className={cn(
            'relative inline-flex h-[1.9375rem] w-[3.1875rem] items-center rounded-pill transition-colors duration-200',
            value ? 'bg-signal-700' : 'bg-ink-300',
            pending && 'opacity-60',
          )}
        >
          <span
            className={cn(
              'grid size-[1.6875rem] place-items-center rounded-full bg-white shadow-card transition-transform duration-200',
              value ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
            )}
          >
            {pending && <Loader2 size={14} strokeWidth={2} className="animate-spin text-ink-500" aria-hidden />}
          </span>
        </span>
      </button>
    </div>
  );
}
