import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  arrow?: boolean;
}

const variants = {
  // Solid pill. Reserved for hero CTA and final-step actions.
  primary:
    'bg-ink-900 text-canvas hover:bg-ink-700 dark:bg-canvas dark:text-ink-900 dark:hover:bg-ink-50',
  // Quiet pill with hairline border.
  secondary:
    'bg-transparent text-ink-900 border border-hairline-strong hover:border-ink-900 dark:text-ink-50 dark:border-hairline-dark dark:hover:border-ink-50',
  // No chrome, just hover background.
  ghost:
    'bg-transparent text-ink-700 hover:text-ink-900 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800 dark:hover:text-canvas',
  // Editorial text-link. No chrome at all. Used everywhere except hero CTAs.
  link:
    'bg-transparent text-ink-900 dark:text-ink-50 hover:opacity-70 transition-opacity',
} as const;

const sizes = {
  sm: 'h-9 px-4 text-caption rounded-pill',
  md: 'h-11 px-5 text-caption rounded-pill',
  lg: 'h-12 px-6 text-body rounded-pill',
} as const;

const linkSizes = {
  sm: 'text-caption',
  md: 'text-body',
  lg: 'text-lede',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', arrow, children, ...rest },
  ref,
) {
  const isLink = variant === 'link';
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-sans font-medium',
        'transition-all duration-cairn ease-cairn',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        isLink ? linkSizes[size] : sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
      {arrow && <ArrowUpRight size={16} strokeWidth={1.75} />}
    </button>
  );
});
