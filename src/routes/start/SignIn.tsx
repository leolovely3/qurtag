import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { isNative } from '@/lib/platform';
import { cn } from '@/lib/cn';

type Mode = 'create' | 'signin';

/**
 * /start: create an account or sign in, with email and password. A new account goes on
 * to add its first item (/start/setup); someone signing in goes to /app.
 */
export function StartSignIn() {
  const { user, loading, signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signin' || (isNative() && params.get('mode') !== 'create') ? 'signin' : 'create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!loading && user && !submitting) navigate('/app', { replace: true });
  }, [loading, user, submitting, navigate]);

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
      navigate('/start/setup', { replace: true });
    } else {
      const r = await signIn(email, password);
      if (!r.ok) {
        setSubmitting(false);
        return setError(r.error);
      }
      navigate('/app', { replace: true });
    }
  }

  return (
    <Container size="md">
      <div className="min-h-[70vh] py-qurtag-8 sm:py-qurtag-12 grid lg:grid-cols-12 gap-qurtag-8 lg:gap-qurtag-12 items-center">
        <div className="lg:col-span-6 flex flex-col gap-5">
          <Eyebrow>{mode === 'create' ? 'Make a free tag' : 'Welcome back'}</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 lg:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
            {mode === 'create' ? 'A tag for your things, in about a minute.' : 'Sign in to your QuR Tag.'}
          </h1>
          <p className="text-lede text-muted text-pretty max-w-lg">
            {mode === 'create'
              ? 'Make an account, name a thing, print its tag. Free for up to two items. If someone finds it, they scan the tag and send you a note. No app for them, and your email stays private.'
              : 'Read notes from finders, reply, and print your tags.'}
          </p>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 shadow-card flex flex-col gap-5 max-w-md">
            {checkEmail ? (
              <>
                <div className="size-10 rounded-pill bg-ink-900 grid place-items-center">
                  <Mail size={18} strokeWidth={1.75} className="text-canvas" aria-hidden />
                </div>
                <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">Check your email.</h2>
                <p className="text-body text-muted">
                  We sent a link to <strong className="text-ink-900">{email}</strong>. Open it to confirm your account.
                </p>
              </>
            ) : (
              <>
                <div role="tablist" aria-label="Create an account or sign in" className="grid grid-cols-2 rounded-pill border border-hairline-strong p-1">
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
                        'h-11 rounded-pill text-caption font-medium transition-colors duration-qurtag',
                        mode === m ? 'bg-ink-900 text-canvas' : 'text-ink-700 hover:text-ink-900',
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
                    />
                    <label className="inline-flex items-center gap-2 text-caption text-ink-700 min-h-11">
                      <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="size-4" />
                      Show password
                    </label>
                  </div>
                  {error && (
                    <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !email || !password}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
                  >
                    {submitting ? 'One moment…' : mode === 'create' ? 'Create my account' : 'Sign in'}
                    <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  {mode === 'create' ? (
                    <p className="text-caption text-muted">
                      By creating an account you agree to our{' '}
                      <Link to="/terms" className="underline underline-offset-4">Terms</Link> and{' '}
                      <Link to="/privacy" className="underline underline-offset-4">Privacy notice</Link>. You must be 18 or over.
                    </p>
                  ) : (
                    <p className="text-caption text-muted">
                      <Link to="/forgot-password" className="inline-flex min-h-11 items-center underline underline-offset-4 text-ink-700 hover:text-ink-900">
                        Forgot password?
                      </Link>
                      <br />
                      Read our <Link to="/terms" className="underline underline-offset-4">Terms</Link> and{' '}
                      <Link to="/privacy" className="underline underline-offset-4">Privacy notice</Link>.
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
