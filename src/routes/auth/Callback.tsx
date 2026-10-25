import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '@/components/ui/Container';
import { useAuth } from '@/lib/auth';

/**
 * Where an email confirmation link may land (when email is set up). The sign-in service
 * has already signed the person in; this page sends them on.
 */
export function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate('/app', { replace: true });
    } else {
      const t = setTimeout(() => navigate('/start', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, user, navigate]);

  return (
    <Container size="sm">
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="size-8 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
        <p className="text-caption text-muted">Signing you in…</p>
      </div>
    </Container>
  );
}
