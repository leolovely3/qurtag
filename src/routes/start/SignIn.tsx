import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { setPendingItem } from '@/lib/pendingItem';

export function StartSignIn() {
  const { user, loading, signInWithEmail } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemBrand, setItemBrand] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate('/start/setup', { replace: true });
  }, [loading, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Persist the first-item details so the magic-link round-trip lands the
    // user on /start/setup with the form pre-filled.
    if (itemName.trim() || itemBrand.trim()) {
      setPendingItem({ name: itemName.trim() || undefined, brand: itemBrand.trim() || undefined });
    }

    const result = await signInWithEmail(email);
    setSubmitting(false);
    if (result.ok) {
      setSent(true);
    } else {
      setError(result.error ?? 'Could not send the link. Try again.');
    }
  }

  return (
    <Container size="md">
      <div className="min-h-[70vh] py-qurtag-12 grid lg:grid-cols-12 gap-qurtag-12 items-center">
        <div className="lg:col-span-6 flex flex-col gap-5">
          <Eyebrow>Start free</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 lg:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
            Thirty seconds between you and never losing a bag again.
          </h1>
          <p className="text-lede text-muted text-pretty max-w-lg">
            Tell us your email. We'll send a single link to sign in. No password, no app store,
            no payment. Two items are on us, forever.
          </p>
          <ul className="flex flex-col gap-2 mt-4 text-caption text-muted">
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-ink-900" /> Free forever for two items
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-ink-900" /> Printable tag included
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-ink-900" /> Cancel any plan, anytime
            </li>
          </ul>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 shadow-card flex flex-col gap-5 max-w-md">
            {sent ? (
              <>
                <div className="size-10 rounded-pill bg-ink-900 grid place-items-center">
                  <Mail size={18} strokeWidth={1.75} className="text-canvas" />
                </div>
                <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
                  Check your inbox.
                </h2>
                <p className="text-body text-muted">
                  We sent a sign-in link to <strong className="text-ink-900">{email}</strong>. Click
                  it to come back here. We'll have your first item ready to print.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setEmail('');
                  }}
                  className="text-caption text-muted hover:text-ink-900 transition-colors text-left self-start"
                >
                  Use a different email →
                </button>
              </>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-5">
                <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
                  Sign in with a single link.
                </h2>
                <Input
                  type="email"
                  name="email"
                  label="Email"
                  placeholder="you@home.com"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={error ?? undefined}
                />

                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center justify-between text-caption font-medium text-ink-900 hover:opacity-70 transition-opacity">
                    <span>Add your first item now (optional)</span>
                    <span className="text-muted transition-transform duration-qurtag group-open:rotate-45">+</span>
                  </summary>
                  <div className="flex flex-col gap-3 mt-3">
                    <Input
                      name="itemName"
                      label="What is it?"
                      placeholder="Rimowa Original Cabin"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                    />
                    <Input
                      name="itemBrand"
                      label="Brand"
                      placeholder="Rimowa, Tumi, Away…"
                      value={itemBrand}
                      onChange={(e) => setItemBrand(e.target.value)}
                    />
                    <p className="text-caption text-muted">
                      We'll save these so they're waiting when you click your link.
                    </p>
                  </div>
                </details>

                <button
                  type="submit"
                  disabled={submitting || !email}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
                >
                  {submitting ? 'Sending…' : 'Send my link'}
                  <ArrowRight size={16} strokeWidth={1.75} />
                </button>
                <p className="text-caption text-muted">
                  By continuing you agree to our{' '}
                  <Link to="/terms" className="underline-offset-4 hover:underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="underline-offset-4 hover:underline">
                    Privacy
                  </Link>
                  .
                </p>
              </form>
            )}
            {!isSupabaseConfigured && (
              <p className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
                Supabase isn't configured yet. See docs/SETUP.md before this will actually send a
                link.
              </p>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
