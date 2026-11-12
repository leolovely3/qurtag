import { useId, useState, type FormEvent } from 'react';
import { Check, Copy, Mail, Share2 } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { conversationLink, setReplyEmail } from '@/lib/finder';

/**
 * The finder's two ways back to a conversation, shown after their first note (src/routes/finder/FinderView.tsx):
 * the private link and the conversation code (typed at qurtag.com/reply on any browser), and an optional
 * email that tells them when the owner replies (server/routes/finderLoop.ts).
 */
export function SaveConversation({ tag, token, code }: { tag: string; token: string; code: string | null }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const link = conversationLink(window.location.origin, tag, token);

  async function copy(what: 'link' | 'code') {
    const text = what === 'link' ? link : code ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt(what === 'link' ? 'Copy this link to come back to this conversation:' : 'Your conversation code:', text);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: 'My QuR Tag conversation',
        text: code ? `Open this to read the owner's reply. Conversation code: ${code}` : "Open this to read the owner's reply.",
        url: link,
      });
    } catch {
      /* closed the sheet */
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-modal border border-hairline bg-paper p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink-900">Save this conversation</h2>
        <p className="text-sm text-ink-700 text-pretty">
          This browser remembers it. To read the reply on another phone or computer, or if you clear this browser,
          {code ? ' keep your conversation code or this private link.' : ' keep this private link.'} Anyone who has
          them can read and write here, so keep them to yourself.
        </p>
      </div>
      {code && (
        <div className="flex flex-col gap-1 rounded-card border border-hairline bg-canvas px-4 py-3">
          <span className="text-sm text-muted">Your conversation code</span>
          <span className="break-words font-mono text-2xl font-semibold tracking-[0.08em] text-ink-900">{code}</span>
          <span className="text-sm text-ink-700 text-pretty">On any phone or computer, go to qurtag.com/reply and type it.</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button type="button" onClick={share} className={buttonClasses({ variant: 'primary', className: 'flex-1 basis-[10rem]' })}>
            <Share2 size={16} aria-hidden />
            Send it to myself
          </button>
        )}
        {code && (
          <button type="button" onClick={() => copy('code')} className={buttonClasses({ variant: 'secondary', className: 'flex-1 basis-[10rem]' })}>
            {copied === 'code' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied === 'code' ? 'Code copied' : 'Copy the code'}
          </button>
        )}
        <button type="button" onClick={() => copy('link')} className={buttonClasses({ variant: 'secondary', className: 'flex-1 basis-[10rem]' })}>
          {copied === 'link' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied === 'link' ? 'Link copied' : 'Copy the link'}
        </button>
      </div>
    </div>
  );
}

/** The words next to the email box. Plain and in full, not small print. */
export const EMAIL_PROMISE =
  'Your email is never shown to the owner or anyone else. We use it only to tell you when the owner replies, and delete it when the conversation closes.';

export function ReplyEmail({ tag, token, on, onChange }: { tag: string; token: string; on: boolean; onChange: (on: boolean) => void }) {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSet, setJustSet] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError('Type your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await setReplyEmail(tag, token, value);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setEmail('');
    setJustSet(true);
    onChange(true);
  }

  async function stop() {
    setBusy(true);
    setError(null);
    const r = await setReplyEmail(tag, token, null);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setJustSet(false);
    onChange(false);
  }

  if (on) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-modal border border-hairline bg-paper p-4">
        <p className="flex items-start gap-2 text-base font-semibold text-ink-900">
          <Mail size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          {justSet ? 'Done. We will email you when the owner replies.' : 'We will email you when the owner replies.'}
        </p>
        <p className="text-sm text-ink-700 text-pretty">
          Check your inbox, and your spam or junk folder. Our emails come from no-reply@qurtag.com. {EMAIL_PROMISE}
        </p>
        <button type="button" onClick={stop} disabled={busy} className={buttonClasses({ variant: 'secondary', className: 'self-start' })}>
          Stop the emails
        </button>
        {error && (
          <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-modal border border-hairline bg-paper p-4" noValidate>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink-900">Get an email when the owner replies (optional)</h2>
        <p id={`${fieldId}-promise`} className="text-sm text-ink-900 text-pretty">
          {EMAIL_PROMISE}
        </p>
      </div>
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink-700">
        Your email
      </label>
      <input
        id={fieldId}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value.slice(0, 254))}
        aria-describedby={`${fieldId}-promise`}
        placeholder="you@example.com"
        className="min-h-11 w-full rounded-card border border-hairline-strong bg-canvas px-3 text-base text-ink-900 focus:border-ink-900 focus:outline-none"
      />
      <button type="submit" disabled={busy} className={buttonClasses({ variant: 'secondary', block: true })}>
        {busy ? 'Saving…' : 'Email me when they reply'}
      </button>
      {error && (
        <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
          {error}
        </p>
      )}
    </form>
  );
}
