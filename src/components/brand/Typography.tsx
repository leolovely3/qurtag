import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TextProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: 'p' | 'span' | 'div';
}

interface DisplayProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
}

export function Eyebrow({ children, className, ...rest }: TextProps) {
  return (
    <span
      className={cn(
        'inline-block text-eyebrow font-sans font-medium uppercase tracking-[0.14em] text-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export function Display({ children, level = 1, className, ...rest }: DisplayProps) {
  const Tag = (`h${level}` as const) as 'h1' | 'h2' | 'h3' | 'h4';
  const sizes = {
    1: 'text-h2 sm:text-h1 lg:text-display',
    2: 'text-h3 sm:text-h2 lg:text-h1',
    3: 'text-h4 sm:text-h3 lg:text-h2',
    4: 'text-h5 sm:text-h4',
  } as const;
  return (
    <Tag
      className={cn(
        'font-display text-ink-900 dark:text-ink-50 font-semibold text-balance',
        sizes[level],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Lede({ children, className, as = 'p', ...rest }: TextProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'text-lede font-sans text-ink-500 dark:text-ink-200 text-pretty',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Body({ children, className, as = 'p', ...rest }: TextProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'text-body font-sans text-ink-700 dark:text-ink-100',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Caption({ children, className, as = 'p', ...rest }: TextProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'text-caption font-sans text-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
