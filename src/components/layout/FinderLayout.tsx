import { Link, Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * Finder layout. Used for the post-scan page.
 * Deliberately minimal: no nav, no signin CTA, no marketing noise.
 * Calm under stress.
 */
export function FinderLayout() {
  return (
    <div className="min-h-screen bg-canvas text-ink-900 antialiased flex flex-col">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex min-h-11 items-center rounded-card">
            <Wordmark />
          </Link>
          <span className="text-sm text-muted">No app needed</span>
        </div>
      </header>
      <main id="main-content" className="flex-1 flex">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 text-sm text-muted sm:px-6">
          <span>
            Questions? <a href="mailto:info@impactconsulting.ai" className="text-ink-700 underline underline-offset-4">info@impactconsulting.ai</a>
          </span>
          <Link to="/help" className="inline-flex min-h-11 items-center font-medium text-ink-700 transition-colors hover:text-ink-900">
            Help
          </Link>
        </div>
      </footer>
    </div>
  );
}
