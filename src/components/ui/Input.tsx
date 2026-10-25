import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** A control inside the field's right edge, for example Show on a password. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, trailing, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-sm font-medium text-ink-900">{label}</span>
      )}
      <span className="relative flex w-full items-center">
      <input
        ref={ref}
        id={inputId}
        aria-describedby={hint || error ? `${inputId}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          trailing && 'pr-20',
          'h-12 w-full rounded-card border border-ink-400 bg-canvas px-4',
          'text-base text-ink-900 placeholder:text-muted',
          'transition-[border-color,box-shadow] duration-150 ease-out',
          'focus:border-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900/15 focus-visible:ring-offset-0',
          error && 'border-signal-700 focus:border-signal-700',
          className,
        )}
        {...rest}
      />
        {trailing && <span className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</span>}
      </span>
      {(hint || error) && (
        <span
          id={`${inputId}-hint`}
          className={cn('text-sm text-pretty', error ? 'text-signal-700' : 'text-muted')}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
});

/** Show or hide a password, inside the field (44px target). */
export function ShowToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="inline-flex h-11 min-w-[4.5rem] items-center justify-center rounded-card px-3 text-sm font-medium text-ink-700 hover:text-ink-900"
    >
      {shown ? 'Hide' : 'Show'}
    </button>
  );
}
