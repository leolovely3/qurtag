import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-caption font-medium text-ink-900 dark:text-ink-50">{label}</span>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-12 w-full rounded-card border border-hairline-strong bg-canvas px-4',
          'text-body text-ink-900 placeholder:text-ink-300',
          'transition-colors duration-cairn ease-cairn',
          'focus:outline-none focus:border-ink-900 focus:ring-0',
          'dark:bg-ink-900 dark:text-ink-50 dark:border-hairline-dark dark:placeholder:text-ink-500 dark:focus:border-ink-50',
          error && 'border-signal-500 focus:border-signal-500',
          className,
        )}
        {...rest}
      />
      {(hint || error) && (
        <span
          className={cn(
            'text-caption',
            error ? 'text-signal-600 dark:text-signal-400' : 'text-muted',
          )}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
});
