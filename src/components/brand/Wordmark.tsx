import { cn } from '@/lib/cn';

interface WordmarkProps {
  className?: string;
  variant?: 'full' | 'mark';
}

/**
 * The QuR Tag wordmark: a QR tag with U (you) in the middle. Inter Display semibold,
 * tight tracking. Two words: QuR (the u in signal coral) and Tag (in verdigris).
 */
export function Wordmark({ className, variant = 'full' }: WordmarkProps) {
  if (variant === 'mark') {
    return (
      <span
        className={cn(
          'font-display font-semibold text-h5 tracking-[-0.035em] text-ink-900 dark:text-ink-50',
          className,
        )}
        aria-label="QuR Tag"
      >
        Q<span className="text-signal-500">u</span>R
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-display font-semibold text-h6 tracking-[-0.035em] text-ink-900 dark:text-ink-50',
        className,
      )}
      aria-label="QuR Tag"
    >
      Q<span className="text-signal-500">u</span>R{' '}
      <span className="text-verdigris-700 dark:text-verdigris-500">Tag</span>
    </span>
  );
}
