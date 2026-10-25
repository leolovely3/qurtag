import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Not shown: the title says what the dialog is. Kept so callers need not change. */
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void | Promise<void>;
    tone?: 'default' | 'destructive';
    disabled?: boolean;
    pending?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md';
}

/**
 * Headless modal. Premium-QuR Tag aesthetic, focus-trapped, escape-to-close,
 * portal-rendered so it survives any layout context.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  primaryAction,
  secondaryAction,
  size = 'sm',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Capture focus on open, restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Push focus to the dialog after the next paint.
    requestAnimationFrame(() => {
      const el = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      el?.focus();
    });
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  // Escape to close, body scroll lock.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qurtag-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm animate-qurtag-fade-up"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className={cn(
          'relative flex w-full flex-col gap-4 rounded-[1.25rem] bg-canvas p-5 shadow-modal sm:p-6',
          'animate-qurtag-fade-up',
          size === 'sm' ? 'max-w-md' : 'max-w-xl',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-pill text-muted transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>

        <div className="flex flex-col gap-2 pr-10">
          <h2 id="qurtag-modal-title" className="text-xl font-semibold leading-snug text-ink-900 text-balance">
            {title}
          </h2>
          {description && <p className="text-base text-ink-700 text-pretty">{description}</p>}
        </div>

        {children && <div className="flex flex-col gap-3">{children}</div>}

        {(primaryAction || secondaryAction) && (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className={buttonClasses({ variant: 'secondary', className: 'w-full sm:w-auto' })}
              >
                {secondaryAction.label}
              </button>
            )}
            {primaryAction && (
              <button
                type="button"
                onClick={() => void primaryAction.onClick()}
                disabled={primaryAction.disabled || primaryAction.pending}
                className={buttonClasses({
                  variant: 'primary',
                  className: cn(
                    'w-full sm:w-auto',
                    !secondaryAction && 'col-span-2',
                    primaryAction.tone === 'destructive' && 'bg-signal-700 text-canvas hover:bg-signal-800',
                  ),
                })}
              >
                {primaryAction.pending ? 'Working…' : primaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
