import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Menu, X } from 'lucide-react';
import { Lockup, Wordmark } from '@/components/brand/Wordmark';
import { buttonClasses } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/cn';
import { isNative } from '@/lib/platform';

const nav = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/tags', label: 'Your tag' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/help', label: 'Help' },
];

/** The pages the iPhone app shows on their own, without the marketing menu. */
const APP_LEGAL_PATHS = ['/terms', '/privacy', '/help', '/make-it-last'];

/**
 * In the iPhone app, Terms and Privacy open from the sign-in screen. They get a plain
 * header with a Back button to where the user came from, not the website's menu.
 */
function AppLegalShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const title = location.pathname.startsWith('/privacy')
    ? 'Privacy'
    : location.pathname.startsWith('/help')
      ? 'Help'
      : location.pathname.startsWith('/make-it-last')
        ? 'Make it last'
        : 'Terms';

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
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-12 grid grid-cols-[1fr_auto_1fr] items-center">
          <button
            type="button"
            onClick={goBack}
            className="-ml-2 inline-flex h-11 items-center gap-0.5 justify-self-start rounded-pill pl-1 pr-3 text-base text-ink-900 hover:bg-ink-50"
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
            Back
          </button>
          <span className="text-base font-semibold">{title}</span>
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
            <Link to="/" className="flex min-h-11 items-center rounded-card">
              <Wordmark className="xl:hidden" />
              <Lockup size="sm" className="hidden xl:inline-flex" />
            </Link>
            <nav aria-label="Main" className="hidden md:flex items-center gap-1">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-11 items-center rounded-pill px-3 text-sm font-medium transition-colors duration-150',
                      isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-700 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-3 md:gap-5">
              <Link
                to="/start?mode=signin"
                className="hidden h-11 items-center rounded-pill px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 md:inline-flex"
              >
                Sign in
              </Link>
              <Link to="/start" className={buttonClasses({ variant: 'primary', className: 'px-4' })}>
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
                to="/start?mode=signin"
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
          <div className="grid gap-10 py-12 md:grid-cols-3 md:py-16">
            <div className="flex max-w-xs flex-col gap-4">
              <Lockup />
              <p className="text-sm text-muted text-pretty">
                A free QR tag, so a kind stranger can message you.
              </p>
            </div>
            <div className="flex flex-col text-sm">
              <h2 className="mb-1 text-sm font-semibold text-ink-900">Product</h2>
              <Link to="/how-it-works" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">How it works</Link>
              <Link to="/tags" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Your tag</Link>
              <Link to="/pricing" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Pricing</Link>
              <Link to="/help" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Help</Link>
            </div>
            <div className="flex flex-col text-sm">
              <h2 className="mb-1 text-sm font-semibold text-ink-900">Legal</h2>
              <Link to="/privacy" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Privacy</Link>
              <Link to="/terms" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Terms</Link>
              <Link to="/security" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity">Security</Link>
              <a href="mailto:info@impactconsulting.ai" className="min-h-11 flex items-center text-ink-700 hover:opacity-70 transition-opacity break-all">info@impactconsulting.ai</a>
            </div>
          </div>
          <div className="border-t border-hairline py-5 text-sm text-muted">
            <span>© 2026 Impact Consulting AI LLC</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
