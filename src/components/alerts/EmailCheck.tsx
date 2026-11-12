import { useEffect, useState } from 'react';
import { Check, Mail, Send } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { browserStorage, loadEmailCheck, saveEmailCheck, type EmailCheck as CheckState } from '@/lib/emailCheck';
import { sendTestEmail } from '@/lib/membership';

/**
 * How a web owner hears about a note, and a way to prove it works: "When someone writes, we email
 * <address>", the sending address, "Send me a test email", then "Did it arrive? Check spam and mark
 * it Not spam." The owner's answer is kept (src/lib/emailCheck.ts) so Items stops reminding them.
 * Used in Settings and as the last step of the first-tag walkthrough on the web.
 */
export function EmailCheck({ from, onConfirmed, compact = false }: { from: string; onConfirmed?: () => void; compact?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<CheckState>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (user) setState(loadEmailCheck(browserStorage(), user.id));
  }, [user]);

  async function send() {
    setError('');
    setMissing(false);
    setBusy(true);
    const r = await sendTestEmail();
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    if (user) saveEmailCheck(browserStorage(), user.id, state === 'confirmed' ? 'confirmed' : 'sent');
    if (state !== 'confirmed') setState('sent');
  }

  function confirm() {
    if (user) saveEmailCheck(browserStorage(), user.id, 'confirmed');
    setState('confirmed');
    onConfirmed?.();
  }

  return (
    <div id="email-check" className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-3 px-4 py-4'}>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-card bg-ink-100">
          <Mail size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
        </div>
        <p className="min-w-0 text-base text-ink-900 text-pretty">
          When someone writes, we email <strong className="break-words font-semibold">{user?.email ?? 'you'}</strong>. It
          comes from <span className="break-words font-medium">{from}</span>.
        </p>
      </div>
      {state === 'confirmed' ? (
        <p role="status" className="flex items-center gap-2 rounded-card bg-verdigris-50 px-4 py-3 text-sm font-medium text-ink-900">
          <Check size={16} aria-hidden />
          Our emails reach you.
        </p>
      ) : state === 'sent' ? (
        <div role="status" className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-4">
          <p className="text-base font-semibold text-ink-900">Did it arrive?</p>
          <p className="text-sm text-ink-700 text-pretty">
            Check your inbox, then spam or junk. If it is there, mark it Not spam and add {from} to your contacts, so the
            real one reaches you.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirm} className={buttonClasses({ variant: compact ? 'secondary' : 'primary' })}>
              <Check size={16} aria-hidden />
              It arrived
            </button>
            <button type="button" onClick={() => setMissing(true)} className={buttonClasses({ variant: 'secondary' })}>
              It did not arrive
            </button>
          </div>
          {missing && (
            <p className="text-sm text-ink-700 text-pretty">
              Give it a few minutes and look in spam again. Check that {user?.email ?? 'your address'} is right in Account.
              Still nothing? Send another, or write to info@impactconsulting.ai and we will look into it. Notes always
              wait in your QuR Tag inbox too.
            </p>
          )}
        </div>
      ) : null}
      <div>
        <button type="button" onClick={() => void send()} disabled={busy} className={buttonClasses({ variant: state === 'unknown' ? 'primary' : 'secondary' })}>
          <Send size={16} aria-hidden />
          {busy ? 'Sending…' : state === 'unknown' ? 'Send me a test email' : 'Send another'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-signal-700">{error}</p>}
    </div>
  );
}
