import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/cn';
import { isNative } from '@/lib/platform';

const nav = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/tags', label: 'Your tag' },
  { to: '/pricing', label: 'Free' },
  { to: '/help', label: 'Help' },
];

/** The pages the iPhone app shows on their own, without the marketing menu. */
const APP_LEGAL_PATHS = ['/terms', '/privacy'];

/**
 * In the iPhone app, Terms and Privacy open from the sign-in screen. They get a plain
 * header with a Back button to where the user came from, not the website's menu.
 */
function AppLegalShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const title = location.pathname.startsWith('/privacy') ? 'Privacy' : 'Terms';

  // Each page opens at its top, not where the sign-in page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  function goBack() {
    // react-router keeps the position in its history entry; at the first entry there is nowhere to go back to.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/app', { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 antialiased">
      <header className="sticky top-0 z-40 bg-canvas border-b border-hairline">
        <div className="mx-auto max-w-3xl px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-11 items-center gap-1.5 -ml-2 px-2 text-body font-medium text-ink-900 justify-self-start"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
            Back
          </button>
          <span className="text-body font-semibold">{title}</span>
          <span />
        </div>
      </header>
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export function MarketingLayout() {
  const { pathname } = useLocation();
  if (isNative() && APP_LEGAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <AppLegalShell />;
  }
  return <MarketingSite />;
}

function MarketingSite() {
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
          'sticky top-0 z-40 transition-all duration-qurtag ease-qurtag',
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
                      'text-caption font-sans font-medium transition-opacity duration-qurtag',
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
                to="/start"
                className="hidden md:inline-flex min-h-11 items-center text-caption font-medium text-ink-700 hover:opacity-70 transition-opacity duration-qurtag"
              >
                Sign in
              </Link>
              <Link
                to="/start"
                className="inline-flex h-11 items-center rounded-pill bg-ink-900 px-4 text-caption font-medium text-canvas hover:bg-ink-700 transition-colors duration-qurtag"
              >
                Make a free tag
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="md:hidden size-11 grid place-items-center rounded-pill text-ink-900 hover:bg-ink-50 transition-colors duration-qurtag"
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
            <div className="flex items-center justify-between px-qurtag-3 h-16 border-b border-hairline">
              <Link to="/" className="flex items-center gap-2 px-2">
                <Wordmark />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="size-11 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-qurtag"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-qurtag-3 py-qurtag-3">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'px-3 h-11 flex items-center rounded-card text-body font-medium transition-colors duration-qurtag',
                      isActive
                        ? 'bg-ink-50 text-ink-900'
                        : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="border-t border-hairline my-qurtag-2" />
              <Link
                to="/start"
                className="px-3 h-11 flex items-center rounded-card text-body font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-qurtag"
              >
                Sign in
              </Link>
              <Link
                to="/security"
                className="px-3 h-11 flex items-center rounded-card text-body font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-qurtag"
              >
                Privacy and safety
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
          <div className="py-qurtag-12 grid gap-qurtag-8 md:grid-cols-3">
            <div className="flex flex-col gap-3 max-w-xs">
              <Wordmark />
              <p className="text-caption text-muted text-pretty">
                A free QR tag, so a kind stranger can message you.
              </p>
            </div>
            <div className="flex flex-col text-caption">
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted mb-1">Product</span>
              <Link to="/how-it-works" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">How it works</Link>
              <Link to="/tags" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Your tag</Link>
              <Link to="/pricing" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Free</Link>
              <Link to="/help" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Help</Link>
            </div>
            <div className="flex flex-col text-caption">
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted mb-1">Legal</span>
              <Link to="/privacy" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Privacy</Link>
              <Link to="/terms" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Terms</Link>
              <Link to="/security" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Security</Link>
              <a href="mailto:info@impactconsulting.ai" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity break-all">info@impactconsulting.ai</a>
            </div>
          </div>
          <div className="py-5 border-t border-hairline text-caption text-muted">
            <span>© 2026 Impact Consulting AI LLC</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
