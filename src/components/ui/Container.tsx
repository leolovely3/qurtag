import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
} as const;

export function Container({ children, className, size = 'lg', ...rest }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-6 md:px-10 lg:px-16', sizes[size], className)} {...rest}>
      {children}
    </div>
  );
}
