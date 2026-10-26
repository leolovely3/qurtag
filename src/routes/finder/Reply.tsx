import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { rememberCode, rememberToken, resumeConversation, tidyCode } from '@/lib/finder';

/**
 * qurtag.com/reply: a finder types the conversation code they saved (K7M2-P9XQ-4TRB) on any phone or
 * browser and is taken back to their conversation. The code can also come after # in the address
 * (qurtag.com/reply#K7M2P9XQ4TRB), which a browser never sends to a server. The server answers the
 * tag and this conversation's token, which this browser then keeps (src/lib/finder.ts).
 */
export function Reply() {
  const navigate = useNavigate();
  const fieldId = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(typed: string) {
    setError(null);
    setBusy(true);
    const r = await resumeConversation(typed);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    rememberToken(r.data.tag, r.data.token);
    rememberCode(r.data.tag, tidyCode(typed));
    navigate(`/find/${r.data.tag}`, { replace: true });
  }

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, '');
    if (fromHash) {
      window.history.replaceState(null, '', window.location.pathname);
      const tidy = tidyCode(fromHash);
      setCode(tidy);
      if (tidy.length === 14) void open(tidy);
    }
    // Runs once, for a code in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.replace(/-/g, '').length !== 12 || busy) {
      setError('A conversation code has 12 letters and numbers, like K7M2-P9XQ-4TRB.');
      return;
    }
    void open(code);
  }

  return (
    <div className="flex flex-col gap-5">
      <span className="grid size-12 place-items-center rounded-modal bg-ink-100">
        <KeyRound size={24} strokeWidth={1.75} className="text-ink-900" aria-hidden />
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 text-pretty sm:text-3xl">
          Open your conversation
        </h1>
        <p className="text-base text-ink-700 text-pretty">
          Found something with a QuR Tag and sent the owner a note? Type the conversation code you saved to read
          their reply and write back. You do not need an account.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink-700">
          Conversation code
        </label>
        <input
          id={fieldId}
          value={code}
          onChange={(e) => setCode(tidyCode(e.target.value))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="K7M2-P9XQ-4TRB"
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className="min-h-12 w-full rounded-card border border-hairline-strong bg-canvas px-4 font-mono text-xl tracking-[0.08em] text-ink-900 focus:border-ink-900 focus:outline-none"
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonClasses({ variant: 'primary', block: true })}>
          {busy ? 'Opening…' : 'Open my conversation'}
        </button>
      </form>
      <p className="text-sm text-muted text-pretty">
        No code? If you are using the same phone and browser, scan the tag again and your conversation opens. Or{' '}
        <Link to="/help" className="underline underline-offset-4">
          see Help
        </Link>
        .
      </p>
    </div>
  );
}
