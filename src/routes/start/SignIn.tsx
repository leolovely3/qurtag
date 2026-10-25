import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { LogoMark } from '@/components/brand/Wordmark';
import { buttonClasses } from '@/components/ui/Button';
import { Input, ShowToggle } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import { isNative } from '@/lib/platform';
import { cn } from '@/lib/cn';

type Mode = 'create' | 'signin';

/**
 * /start: create an account or sign in, with email and password. A new account goes on
 * to the first-tag walkthrough (/app/first-tag); someone signing in goes to /app.
 */
export function StartSignIn() {
  const { user, loading, signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where to go after signing in: only a path on this site (for example an invite link).
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\') ? rawNext : null;
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signin' || (isNative() && params.get('mode') !== 'create') ? 'signin' : 'create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!loading && user && !submitting) navigate(next ?? '/app', { replace: true });
  }, [loading, user, submitting, navigate, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    if (mode === 'create') {
      // On success `submitting` stays on, so the signed-in redirect above does not race this one.
      const r = await signUp({ email, password, name });
      if (!r.ok) {
        setSubmitting(false);
        return setError(r.error);
      }
      if (r.needsConfirmation) {
        setSubmitting(false);
        return setCheckEmail(true);
      }
      navigate(next ?? '/app/first-tag', { replace: true });
    } else {
      const r = await signIn(email, password);
      if (!r.ok) {
        setSubmitting(false);
        return setError(r.error);
      }
      navigate(next ?? '/app', { replace: true });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-16 pt-8 sm:pt-16">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LogoMark size={56} />
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
          {mode === 'create' ? 'Make your free tag' : 'Welcome back'}
        </h1>
        <p className="max-w-sm text-base text-muted text-pretty">
          {mode === 'create'
            ? 'Make an account, name a thing, print its tag. If someone finds it, they scan the tag and send you a note.'
            : 'Read notes from finders, reply, and print your tags.'}
        </p>
        {mode === 'create' && (
          <p className="max-w-sm text-sm text-muted text-pretty">
            You will need a printer and ordinary paper. Sticker paper or clear tape makes it last.
          </p>
        )}
      </div>
          <div className="flex flex-col gap-5 rounded-modal border border-hairline bg-canvas p-5 shadow-card sm:p-6">
            {checkEmail ? (
              <>
                <div className="grid size-11 place-items-center rounded-pill bg-ink-100">
                  <Mail size={20} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                </div>
                <h2 className="text-xl font-semibold text-ink-900">Check your email</h2>
                <p className="text-body text-muted">
                  We sent a link to <strong className="text-ink-900">{email}</strong>. Open it to confirm your account.
                </p>
              </>
            ) : (
              <>
                <div role="tablist" aria-label="Create an account or sign in" className="grid grid-cols-2 gap-1 rounded-[1.5rem] bg-ink-100 p-1 ax:grid-cols-1">
                  {(['create', 'signin'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className={cn(
                        'min-h-[44px] rounded-[1.25rem] px-3 py-2 text-sm font-medium leading-tight transition-colors duration-150',
                        mode === m ? 'bg-canvas text-ink-900 shadow-card' : 'text-ink-600 hover:text-ink-900',
                      )}
                    >
                      {m === 'create' ? 'Create account' : 'Sign in'}
                    </button>
                  ))}
                </div>
                <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                  {mode === 'create' && (
                    <Input
                      name="name"
                      label="Your first name"
                      autoComplete="given-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      hint="Only you see this. Finders never do."
                    />
                  )}
                  <Input
                    type="email"
                    name="email"
                    label="Email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      label="Password"
                      autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      hint={mode === 'create' ? 'At least 8 characters.' : undefined}
                      trailing={<ShowToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                    />
                  </div>
                  {error && (
                    <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !email || !password}
                    className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}
                  >
                    {submitting ? 'One moment…' : mode === 'create' ? 'Create my account' : 'Sign in'}
                  </button>
                  {mode === 'create' ? (
                    <p className="text-sm text-muted text-pretty">
                      By creating an account you agree to our{' '}
                      <Link to="/terms" className="underline underline-offset-4">Terms</Link> and{' '}
                      <Link to="/privacy" className="underline underline-offset-4">Privacy notice</Link>. You must be 18 or over.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1 text-sm text-muted">
                      <Link to="/forgot-password" className="inline-flex min-h-11 items-center self-center font-medium text-ink-900 underline-offset-4 hover:underline">
                        Forgot password?
                      </Link>
                      <p className="text-center">
                      Read our <Link to="/terms" className="underline underline-offset-4">Terms</Link> and{' '}
                      <Link to="/privacy" className="underline underline-offset-4">Privacy notice</Link>.
                      </p>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
    </div>
  );
}
