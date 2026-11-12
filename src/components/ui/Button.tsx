import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * One button system for the whole product, for <button> and for links that look like buttons.
 *
 * Every button is one line (`whitespace-nowrap`), at least 44px tall, with its icon before the
 * label. Labels that might not fit a narrow phone get a shorter label or a full-width layout at
 * the call site, never a second line at standard text sizes. At Accessibility text sizes (the
 * `ax:` variant, src/lib/textSize.ts) a label may wrap onto more lines, whole words only, and the
 * button grows taller rather than run off the screen. `primary` is the one filled action on a screen.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
/** `sm` is kept for older call sites; it is the same 44px height as `md`, with tighter padding. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink-900 text-canvas hover:bg-ink-700 active:bg-ink-700',
  secondary: 'bg-canvas text-ink-900 border border-hairline-strong hover:border-ink-400 hover:bg-ink-50 active:bg-ink-50',
  ghost: 'bg-transparent text-ink-700 hover:text-ink-900 hover:bg-ink-50 active:bg-ink-50',
  danger: 'bg-canvas text-signal-700 border border-hairline-strong hover:border-signal-400 hover:bg-signal-50 active:bg-signal-50',
  success: 'bg-canvas text-verdigris-700 border border-hairline-strong hover:border-verdigris-400 hover:bg-verdigris-50 active:bg-verdigris-50',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill font-sans font-medium',
    'transition-colors duration-150 ease-out select-none',
    'disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed',
    '[&>svg]:shrink-0',
    'ax:h-auto ax:min-h-[44px] ax:max-w-full ax:shrink ax:whitespace-normal ax:rounded-[1.375rem] ax:py-2 ax:text-center ax:leading-tight',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  );
});
