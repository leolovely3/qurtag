import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { sendSupport, TOPICS, type SupportTopic } from '@/lib/support';
import { cn } from '@/lib/cn';

/**
 * Contact us. Signed in, it needs only the message: the account and plan are attached by the
 * server. Signed out, it asks for an email to reply to. It has no place for card details and
 * says not to send them. The "website" field is a trap for robots: hidden from people.
 */
export function ContactForm({ initialTopic = 'other', onDone }: { initialTopic?: SupportTopic; onDone?: () => void }) {
  const { user } = useAuth();
  const memberships = useMembershipsAvailable();
  const [topic, setTopic] = useState<SupportTopic>(initialTopic);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) return setError('Write your message first.');
    setBusy(true);
    const r = await sendSupport({ topic, message, email, website, signedIn: !!user });
    setBusy(false);
    if (r.ok) {
      setSent(true);
      onDone?.();
    } else setError(r.error);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-card bg-ink-50 px-4 py-3 text-body text-ink-900 text-pretty">
        Thank you. We got your message and will reply by email{user ? ` to ${user.email}` : email ? ` to ${email}` : ''}.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 max-w-xl">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-ink-900">What is it about?</span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as SupportTopic)}
          className="h-12 w-full min-w-0 overflow-hidden text-ellipsis rounded-card border border-hairline-strong bg-canvas px-4 text-body text-ink-900 ax:h-auto ax:min-h-12"
        >
          {TOPICS.filter((t) => memberships || t.id !== 'billing').map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {!user && (
        <Input name="contact-email" type="email" label="Your email, so we can reply" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-ink-900">Your message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={4000}
          required
          className={cn('w-full rounded-card border border-hairline-strong bg-canvas p-3 text-body text-ink-900 focus:outline-none focus:border-ink-900 resize-y')}
        />
        <span className="text-caption text-muted text-pretty">
          Please do not write a card number or a password here. We never need them.
          {user ? ' We will see your account and plan with your message.' : ''}
        </span>
      </label>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="self-start inline-flex h-11 items-center rounded-pill bg-ink-900 px-5 text-caption font-medium text-canvas hover:bg-ink-700 disabled:opacity-50"
      >
        {busy ? 'Sending...' : 'Send message'}
      </button>
    </form>
  );
}
