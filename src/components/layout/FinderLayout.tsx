import { Link, Outlet } from 'react-router-dom';
import { Languages } from 'lucide-react';
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
        <div className="mx-auto max-w-2xl w-full px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Wordmark />
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-caption text-muted hover:text-ink-900 transition-colors duration-qurtag"
          >
            <Languages size={14} strokeWidth={1.75} />
            English
          </button>
        </div>
      </header>
      <main id="main-content" className="flex-1 flex">
        <div className="mx-auto max-w-2xl w-full px-6 py-qurtag-8">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-2xl w-full px-6 py-3 flex items-center justify-between text-caption text-muted">
          <span>Need help? We're here.</span>
          <Link to="/help" className="text-ink-700 hover:text-ink-900 transition-colors">
            Talk to a human
          </Link>
        </div>
      </footer>
    </div>
  );
}
