import { forwardRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MessageComposerProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: (body: string) => Promise<void> | void;
  /** Maximum char length. Matches the DB constraint. */
  maxLength?: number;
  /** Variant for visual context. */
  tone?: 'light' | 'dark';
  /** Show a quiet header above the textarea. */
  label?: string;
}

const DEFAULT_MAX = 1200;

export const MessageComposer = forwardRef<HTMLTextAreaElement, MessageComposerProps>(
  function MessageComposer(
    { placeholder, onSend, disabled, maxLength = DEFAULT_MAX, tone = 'light', label },
    ref,
  ) {
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const trimmed = body.trim();
    const canSend = !!trimmed && !sending && !disabled;

    async function submit(e?: FormEvent) {
      if (e) e.preventDefault();
      if (!canSend) return;
      setSending(true);
      try {
        await onSend(trimmed);
        setBody('');
      } finally {
        setSending(false);
      }
    }

    function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        void submit();
      }
    }

    return (
      <form onSubmit={submit} className="flex flex-col gap-2">
        {label && (
          <span
            className={cn(
              'text-eyebrow uppercase tracking-[0.14em] font-medium',
              tone === 'dark' ? 'text-ink-200' : 'text-muted',
            )}
          >
            {label}
          </span>
        )}
        <div
          className={cn(
            'rounded-modal border flex flex-col gap-2 px-qurtag-3 py-3 transition-colors duration-qurtag',
            tone === 'dark'
              ? 'bg-ink-900 border-hairline-dark focus-within:border-ink-50/30'
              : 'bg-canvas border-hairline-strong focus-within:border-ink-900',
          )}
        >
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, maxLength))}
            onKeyDown={onKey}
            placeholder={placeholder ?? "I have your bag. Where should I leave it?"}
            rows={3}
            disabled={disabled}
            className={cn(
              'w-full bg-transparent resize-none border-0 outline-none text-body placeholder:text-muted',
              tone === 'dark' ? 'text-ink-50 placeholder:text-ink-400' : 'text-ink-900',
            )}
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                'text-caption',
                tone === 'dark' ? 'text-ink-300' : 'text-muted',
                trimmed.length > maxLength * 0.9 && 'text-signal-600',
              )}
            >
              {trimmed.length} / {maxLength} · ⌘+Enter
            </span>
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-pill px-5 text-caption font-medium',
                'transition-colors duration-qurtag ease-qurtag',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                tone === 'dark'
                  ? 'bg-canvas text-ink-900 hover:bg-ink-50'
                  : 'bg-ink-900 text-canvas hover:bg-ink-700',
              )}
            >
              {sending ? 'Sending…' : 'Send'}
              {!sending && <Send size={14} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </form>
    );
  },
);
