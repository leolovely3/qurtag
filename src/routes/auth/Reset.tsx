import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { authClient } from '@/lib/authClient';

/**
 * /forgot-password and /reset-password. The first asks for an email address and always
 * answers the same way, so it never says whether an account exists. The link in the email
 * passes through /api/auth/reset-password/<token>, which sends the browser to
 * /reset-password?token=... (or ?error=INVALID_TOKEN when the link is spent or expired).
 * The server side is server/auth/qurtagAuth.ts.
 */
const UNAVAILABLE = "We couldn't send the email right now, please try again later.";
const BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container size="md">
      <div className="min-h-[70vh] py-qurtag-8 sm:py-qurtag-12 flex items-center">
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 shadow-card flex flex-col gap-5 w-full max-w-md">
          <h1 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">{title}</h1>
          {children}
        </div>
      </div>
    </Container>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: '/reset-password' });
      if (err?.status === 429) setError('Too many tries. Please wait a few minutes and try again.');
      else if (err) setError(UNAVAILABLE);
      else setSent(true);
    } catch {
      setError(UNAVAILABLE);
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <Card title="Check your email.">
        <div className="size-10 rounded-pill bg-ink-900 grid place-items-center">
          <Mail size={18} strokeWidth={1.75} className="text-canvas" aria-hidden />
        </div>
        <p role="status" className="text-body text-muted">If an account exists, we've sent a link. It works once and expires in 1 hour.</p>
        <Link to="/start?mode=signin" className="underline underline-offset-4 text-caption">Back to sign in</Link>
      </Card>
    );
  }
  return (
    <Card title="Forgot your password?">
      <p className="text-body text-muted">Enter the email you signed up with and we will send you a link to choose a new password.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input type="email" name="email" label="Email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">{error}</p>}
        <button type="submit" disabled={busy || !email} className={BUTTON}>
          {busy ? 'One moment…' : 'Send me a link'}
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <Link to="/start?mode=signin" className="underline underline-offset-4 text-caption">Back to sign in</Link>
      </form>
    </Card>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token || params.get('error')) return <Expired />;
  if (done) {
    return (
      <Card title="Password changed.">
        <p role="status" className="text-body text-muted">Your password is changed and you are signed out everywhere. Sign in with the new one.</p>
        <Link to="/start?mode=signin" className={BUTTON}>Sign in</Link>
      </Card>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
      if (!err) setDone(true);
      else if (err.code === 'INVALID_TOKEN' || err.status === 400) {
        if (/short|long/i.test(`${err.code} ${err.message}`)) setError('Use at least 8 characters.');
        else setError('EXPIRED');
      } else setError('Could not change the password. Please try again.');
    } catch {
      setError('Could not change the password. Please try again.');
    }
    setBusy(false);
  }
  if (error === 'EXPIRED') return <Expired />;

  return (
    <Card title="Choose a new password.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Input type={show ? 'text' : 'password'} name="password" label="New password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
          <label className="inline-flex items-center gap-2 text-caption text-ink-700 min-h-11">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4" />
            Show password
          </label>
        </div>
        {error && <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">{error}</p>}
        <button type="submit" disabled={busy || !password} className={BUTTON}>
          {busy ? 'One moment…' : 'Change my password'}
        </button>
      </form>
    </Card>
  );
}

function Expired() {
  return (
    <Card title="This link has expired or was already used.">
      <p className="text-body text-muted">Reset links work once and last 1 hour. Ask for a new one and use the newest email.</p>
      <Link to="/forgot-password" className={BUTTON}>Send me a new link</Link>
    </Card>
  );
}
