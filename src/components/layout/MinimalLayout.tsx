import { Link, Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * For focused flows (sign in, callback, onboarding). Quiet shell.
 */
export function MinimalLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 antialiased">
      <header className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Wordmark />
          </Link>
          <Link
            to="/help"
            className="text-caption text-muted hover:text-ink-900 transition-colors duration-cairn"
          >
            Help
          </Link>
        </div>
      </header>
      <main className="flex-1 flex">
        <Outlet />
      </main>
    </div>
  );
}
