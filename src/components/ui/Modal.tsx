import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Eyebrow } from '@/components/brand/Typography';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
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
 * Headless modal. Premium-QurTag aesthetic, focus-trapped, escape-to-close,
 * portal-rendered so it survives any layout context.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
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
      aria-labelledby="cairn-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm animate-cairn-fade-up"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full bg-canvas rounded-modal shadow-modal flex flex-col gap-cairn-3 p-cairn-5',
          'animate-cairn-fade-up',
          size === 'sm' ? 'max-w-md' : 'max-w-xl',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-cairn-2 right-cairn-2 size-8 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-cairn"
        >
          <X size={14} strokeWidth={2} />
        </button>

        <div className="flex flex-col gap-2 pr-cairn-5">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2
            id="cairn-modal-title"
            className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance"
          >
            {title}
          </h2>
          {description && (
            <p className="text-body text-ink-700 text-pretty">{description}</p>
          )}
        </div>

        {children && <div className="flex flex-col gap-3">{children}</div>}

        {(primaryAction || secondaryAction) && (
          <div className="flex items-center justify-end gap-3 mt-cairn-2">
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="text-caption font-medium text-muted hover:text-ink-900 transition-colors px-2"
              >
                {secondaryAction.label}
              </button>
            )}
            {primaryAction && (
              <button
                type="button"
                onClick={() => void primaryAction.onClick()}
                disabled={primaryAction.disabled || primaryAction.pending}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-pill px-5 text-caption font-medium',
                  'transition-colors duration-cairn',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  primaryAction.tone === 'destructive'
                    ? 'bg-signal-500 text-canvas hover:bg-signal-600'
                    : 'bg-ink-900 text-canvas hover:bg-ink-700',
                )}
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
