import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/tags', label: 'Tags' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/security', label: 'Security' },
];

export function MarketingLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 antialiased">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header
        className={cn(
          'sticky top-0 z-40 transition-all duration-cairn ease-cairn',
          scrolled
            ? 'bg-canvas/85 backdrop-blur-xl border-b border-hairline'
            : 'bg-transparent border-b border-transparent',
        )}
      >
        <Container size="xl">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <Wordmark />
            </Link>
            <nav className="hidden md:flex items-center gap-7">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'text-caption font-sans font-medium transition-opacity duration-cairn',
                      isActive ? 'text-ink-900 opacity-100' : 'text-ink-700 hover:opacity-70',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-3 md:gap-5">
              <Link
                to="/app"
                className="hidden md:inline-flex text-caption font-medium text-ink-700 hover:opacity-70 transition-opacity duration-cairn"
              >
                Sign in
              </Link>
              <Link
                to="/start"
                className="inline-flex h-9 items-center rounded-pill bg-ink-900 px-4 text-caption font-medium text-canvas hover:bg-ink-700 transition-colors duration-cairn"
              >
                Start free
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="md:hidden size-9 grid place-items-center rounded-pill text-ink-900 hover:bg-ink-50 transition-colors duration-cairn"
              >
                <Menu size={20} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </Container>
      </header>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-ink-950/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="relative ml-auto w-72 max-w-[85vw] bg-canvas border-l border-hairline shadow-modal flex flex-col">
            <div className="flex items-center justify-between px-cairn-3 h-16 border-b border-hairline">
              <Link to="/" className="flex items-center gap-2 px-2">
                <Wordmark />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="size-9 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-cairn"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-cairn-3 py-cairn-3">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'px-3 h-11 flex items-center rounded-card text-body font-medium transition-colors duration-cairn',
                      isActive
                        ? 'bg-ink-50 text-ink-900'
                        : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="border-t border-hairline my-cairn-2" />
              <Link
                to="/app"
                className="px-3 h-11 flex items-center rounded-card text-body font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-cairn"
              >
                Sign in
              </Link>
              <Link
                to="/help"
                className="px-3 h-11 flex items-center rounded-card text-body font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-cairn"
              >
                Help
              </Link>
            </nav>
          </aside>
        </div>
      )}

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-hairline bg-canvas">
        <Container size="xl">
          <div className="py-cairn-12 grid gap-cairn-8 md:grid-cols-4">
            <div className="flex flex-col gap-3 max-w-xs">
              <Wordmark />
              <p className="text-caption text-muted text-pretty">
                Calm software for the things you'd rather not lose.
              </p>
            </div>
            <div className="flex flex-col gap-3 text-caption">
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Product</span>
              <Link to="/how-it-works" className="text-ink-700 hover:opacity-70 transition-opacity">How it works</Link>
              <Link to="/tags" className="text-ink-700 hover:opacity-70 transition-opacity">Tags</Link>
              <Link to="/pricing" className="text-ink-700 hover:opacity-70 transition-opacity">Pricing</Link>
              <Link to="/business" className="text-ink-700 hover:opacity-70 transition-opacity">For business</Link>
            </div>
            <div className="flex flex-col gap-3 text-caption">
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Company</span>
              <Link to="/security" className="text-ink-700 hover:opacity-70 transition-opacity">Security</Link>
              <Link to="/stories" className="text-ink-700 hover:opacity-70 transition-opacity">Stories</Link>
              <Link to="/help" className="text-ink-700 hover:opacity-70 transition-opacity">Help</Link>
            </div>
            <div className="flex flex-col gap-3 text-caption">
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Legal</span>
              <Link to="/privacy" className="text-ink-700 hover:opacity-70 transition-opacity">Privacy</Link>
              <Link to="/terms" className="text-ink-700 hover:opacity-70 transition-opacity">Terms</Link>
              <Link to="/security-txt" className="text-ink-700 hover:opacity-70 transition-opacity">security.txt</Link>
            </div>
          </div>
          <div className="py-5 border-t border-hairline flex items-center justify-between text-caption text-muted">
            <span>© {new Date().getFullYear()} QurTag</span>
            <span>Made for the people who travel light.</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
