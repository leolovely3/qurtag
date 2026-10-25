import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { acceptInvite, previewInvite } from '@/lib/membership';

type Preview = NonNullable<Awaited<ReturnType<typeof previewInvite>>>;

const WORDS: Record<string, string> = {
  invalid: 'This invite link is not valid. Check that you copied all of it, or ask for a new one.',
  revoked: 'This invite was canceled. Ask the person who sent it for a new one.',
  used: 'This invite was already used. Each invite works once.',
  expired: 'This invite has expired. Invites last 7 days. Ask for a new one.',
};

const button =
  'inline-flex min-h-12 items-center justify-center rounded-pill px-6 text-body font-medium transition-colors duration-qurtag disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * /join/<token>: the page an invite link opens. Signed out, it asks the person to sign in or
 * make an account first (and brings them back here). Signed in, it says who invited them
 * and lets them accept. The invite works only for the email address it was sent to; the
 * database checks that, this page only explains it.
 */
export function JoinFamily() {
  const { token = '' } = useParams();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const here = `/join/${token}`;

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    void previewInvite(token).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, token]);

  async function accept() {
    setBusy(true);
    setError(null);
    const r = await acceptInvite(token);
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.error);
  }

  let body;
  if (loading) {
    body = <p className="text-body text-muted">One moment...</p>;
  } else if (done) {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">You are in the family.</h1>
        <p className="text-lede text-muted text-pretty">You now see the family's items and inbox. Items you add will be shared too.</p>
        <button type="button" className={`${button} bg-ink-900 text-canvas hover:bg-ink-700 self-start`} onClick={() => navigate('/app', { replace: true })}>
          Open QuR Tag
        </button>
      </>
    );
  } else if (!user) {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">You were invited to share a QuR Tag family.</h1>
        <p className="text-lede text-muted text-pretty">
          Sign in, or make an account, using the email address the invite was sent to. Then you can accept.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to={`/start?mode=signin&next=${encodeURIComponent(here)}`} className={`${button} bg-ink-900 text-canvas hover:bg-ink-700`}>
            Sign in
          </Link>
          <Link to={`/start?mode=create&next=${encodeURIComponent(here)}`} className={`${button} border border-hairline-strong text-ink-900`}>
            Make an account
          </Link>
        </div>
      </>
    );
  } else if (preview === undefined) {
    body = <p className="text-body text-muted">Checking the invite...</p>;
  } else if (!preview || !preview.valid) {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">This invite cannot be used.</h1>
        <p className="text-lede text-muted text-pretty">{WORDS[preview?.reason ?? 'invalid']}</p>
        <Link to="/app" className={`${button} bg-ink-900 text-canvas hover:bg-ink-700 self-start`}>
          Open QuR Tag
        </Link>
      </>
    );
  } else if (!preview.email_matches) {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">This invite is for another email address.</h1>
        <p className="text-lede text-muted text-pretty">
          It was sent to {preview.invited_email_hint}. You are signed in as {user.email}. Sign out, then sign in with the address it was sent to.
        </p>
        <button
          type="button"
          className={`${button} bg-ink-900 text-canvas hover:bg-ink-700 self-start`}
          onClick={async () => {
            await signOut();
            navigate(`/start?mode=signin&next=${encodeURIComponent(here)}`, { replace: true });
          }}
        >
          Sign out
        </button>
      </>
    );
  } else if (!preview.family_active) {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">This family is not active right now.</h1>
        <p className="text-lede text-muted text-pretty">{preview.inviter ?? 'The person who invited you'} needs an active Family plan for you to join. Ask them to check their membership.</p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-display font-semibold text-ink-900 text-h3 tracking-[-0.028em] text-balance">
          {preview.inviter ?? 'Someone'} invited you to share their QuR Tag.
        </h1>
        <p className="text-lede text-muted text-pretty">
          If you join, you see the family's items and inbox, and anything you add to QuR Tag from now on is shared with them. You can leave at
          any time. Your own account and anything you already made stay yours and private.
        </p>
        {error && (
          <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-body text-signal-700 text-pretty">
            {error}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" className={`${button} bg-ink-900 text-canvas hover:bg-ink-700`} onClick={accept} disabled={busy}>
            {busy ? 'Joining...' : 'Join the family'}
          </button>
          <Link to="/app" className={`${button} border border-hairline-strong text-ink-900`}>
            Not now
          </Link>
        </div>
      </>
    );
  }

  return (
    <Container size="sm">
      <div className="min-h-[60vh] py-qurtag-12 flex flex-col gap-5 justify-center">
        <Eyebrow>Family invite</Eyebrow>
        {body}
      </div>
    </Container>
  );
}
