import { WifiOff } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Shown by the phone apps when they cannot reach QuR Tag to check who is signed in (no network
 * at start). Without it a signed-in person would see the sign-in screen, as if signed out.
 */
export function ConnectionProblem({ onRetry, busy }: { onRetry: () => void; busy?: boolean }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-canvas px-8 text-center text-ink-900">
      <WifiOff className="h-10 w-10 text-signal-600" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-balance">Can't reach QuR Tag</h1>
      <p className="text-base text-muted text-pretty">Check your connection and try again.</p>
      <button type="button" onClick={onRetry} disabled={busy} className={`${buttonClasses({ variant: 'primary' })} mt-3`}>
        {busy ? 'Trying...' : 'Try again'}
      </button>
    </main>
  );
}
