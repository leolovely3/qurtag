import { Link, Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Wordmark';
import { isNative } from '@/lib/platform';
import { usePathTitle } from '@/lib/pageTitle';

/**
 * For focused flows (sign in, callback, onboarding). Quiet shell.
 */
export function MinimalLayout() {
  usePathTitle();
  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 antialiased">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link to={isNative() ? '/app' : '/'} className="flex min-h-11 items-center rounded-card">
            <Wordmark />
          </Link>
          <Link
            to="/help"
            className="inline-flex h-11 items-center rounded-pill px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            Help
          </Link>
        </div>
      </header>
      <main id="main-content" className="flex flex-1">
        <Outlet />
      </main>
    </div>
  );
}
