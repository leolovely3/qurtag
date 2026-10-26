import { forwardRef, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';

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
  /** One-tap openings shown under the box; a tap puts the words in the box to finish. */
  starters?: readonly string[];
}

const DEFAULT_MAX = 1200;

/**
 * The send shortcut is shown only where there is a hardware keyboard and a precise pointer
 * (a Mac or PC), never on a phone, where it means nothing. Inside the iPhone app it is hidden
 * even with an iPad keyboard attached, to keep the box simple.
 */
function keyboardHint(): string | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (document.documentElement.classList.contains('native-app')) return null;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? '⌘ Return to send' : 'Ctrl Enter to send';
}

export const MessageComposer = forwardRef<HTMLTextAreaElement, MessageComposerProps>(
  function MessageComposer(
    { placeholder, onSend, disabled, maxLength = DEFAULT_MAX, tone = 'light', label, starters },
    ref,
  ) {
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [hint] = useState(keyboardHint);
    const fieldId = useId();
    const boxRef = useRef<HTMLTextAreaElement | null>(null);
    const trimmed = body.trim();
    const canSend = !!trimmed && !sending && !disabled;

    async function submit(e?: FormEvent) {
      if (e) e.preventDefault();
      if (!canSend) return;
      setSending(true);
      try {
        await onSend(trimmed);
        setBody('');
      } catch {
        // The sender shows its own error; the note stays in the box to try again.
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
          <label
            htmlFor={fieldId}
            className={cn('px-1 text-sm font-semibold', tone === 'dark' ? 'text-ink-200' : 'text-ink-700')}
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'flex flex-col gap-2 rounded-modal border px-4 pb-3 pt-3 transition-colors duration-150',
            tone === 'dark'
              ? 'bg-ink-900 border-hairline-dark focus-within:border-ink-50/30'
              : 'bg-canvas border-hairline-strong focus-within:border-ink-900',
          )}
        >
          <textarea
            ref={(el) => {
              boxRef.current = el;
              if (typeof ref === 'function') ref(el);
              else if (ref) ref.current = el;
            }}
            id={fieldId}
            aria-label={label ? undefined : "Message"}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, maxLength))}
            onKeyDown={onKey}
            placeholder={placeholder ?? "I have your bag. Where should I leave it?"}
            rows={3}
            disabled={disabled}
            className={cn(
              'w-full resize-none border-0 bg-transparent text-base outline-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0',
              tone === 'dark' ? 'text-ink-50 placeholder:text-ink-400' : 'text-ink-900',
            )}
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                'min-w-0 truncate text-xs',
                tone === 'dark' ? 'text-ink-300' : 'text-muted',
                trimmed.length > maxLength * 0.9 && 'text-signal-700',
              )}
            >
              {trimmed.length > maxLength * 0.8 ? `${trimmed.length} of ${maxLength}` : hint ?? ''}
            </span>
            <button
              type="submit"
              disabled={!canSend}
              className={buttonClasses({
                variant: 'primary',
                className: cn('px-5', tone === 'dark' && 'bg-canvas text-ink-900 hover:bg-ink-50'),
              })}
            >
              {!sending && <Send size={16} strokeWidth={1.75} aria-hidden />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
        {starters && starters.length > 0 && !trimmed && !disabled && (
          <div className="flex flex-wrap gap-2 px-1" role="group" aria-label="Start your note with">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setBody(s);
                  const el = boxRef.current;
                  if (el) {
                    el.focus();
                    requestAnimationFrame(() => el.setSelectionRange(s.length, s.length));
                  }
                }}
                className="inline-flex min-h-11 items-center rounded-pill border border-hairline-strong bg-canvas px-4 text-sm font-medium text-ink-900 transition-colors hover:border-ink-900"
              >
                {s.trim()}...
              </button>
            ))}
          </div>
        )}
      </form>
    );
  },
);
