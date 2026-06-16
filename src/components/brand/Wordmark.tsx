import { cn } from '@/lib/cn';

interface WordmarkProps {
  className?: string;
  variant?: 'full' | 'mark';
}

/**
 * QurTag wordmark. Inter Display semibold, very tight tracking.
 * Two visual words: QUR (with the U in signal-coral — the QR-with-U-at-the-center hook)
 * and Tag (in verdigris) — so the reader parses them as two distinct units like AirTag.
 */
export function Wordmark({ className, variant = 'full' }: WordmarkProps) {
  if (variant === 'mark') {
    return (
      <span
        className={cn(
          'font-display font-semibold text-h5 tracking-[-0.035em] text-ink-900 dark:text-ink-50',
          className,
        )}
        aria-label="QurTag"
      >
        Q<span className="text-signal-500">U</span>R
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-display font-semibold text-h6 tracking-[-0.035em] text-ink-900 dark:text-ink-50',
        className,
      )}
      aria-label="QurTag"
    >
      Q<span className="text-signal-500">U</span>R<span className="text-verdigris-700 dark:text-verdigris-500">Tag</span>
    </span>
  );
}
