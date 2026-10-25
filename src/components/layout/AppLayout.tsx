import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePoll } from '@/lib/realtime';
import { FEATURES } from '@/lib/features';
import {
  Home,
  Package,
  Tag,
  Inbox,
  Plane,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { useAuth } from '@/lib/auth';
import { useIsSuperAdmin } from '@/lib/admin';
import { countUnreadForHousehold, fetchPrimaryHouseholdId } from '@/lib/queries';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/app', label: 'Home', icon: Home, end: true, key: 'home' },
  { to: '/app/inbox', label: 'Inbox', icon: Inbox, end: false, key: 'inbox' },
  { to: '/app/items', label: 'Items', icon: Package, end: false, key: 'items' },
  { to: '/app/tags', label: 'Tags', icon: Tag, end: false, key: 'tags' },
  ...(FEATURES.trips ? [{ to: '/app/trips', label: 'Trips', icon: Plane, end: false, key: 'trips' }] : []),
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false, key: 'settings' },
];

export function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/start', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void fetchPrimaryHouseholdId().then(setHouseholdId);
  }, [user]);

  const refreshUnread = useCallback(async () => {
    if (!householdId) return;
    const n = await countUnreadForHousehold(householdId);
    setUnread(n);
  }, [householdId]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, location.pathname]);

  // Close drawer on every route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Body scroll lock when the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Keep the inbox count fresh while the app is open.
  usePoll(refreshUnread, !!householdId);

  async function handleSignOut() {
    await signOut();
    navigate('/start', { replace: true });
  }

  const navItems = (
    <nav className="flex flex-col gap-0.5 px-qurtag-3 py-qurtag-3">
      {[...nav, ...(isSuperAdmin ? [{ to: '/app/admin', label: 'Admin', icon: ShieldCheck, end: false, key: 'admin' }] : [])].map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 h-11 rounded-card text-body md:text-caption font-medium',
              'transition-colors duration-qurtag',
              isActive
                ? 'bg-ink-50 text-ink-900'
                : 'text-muted hover:text-ink-900 hover:bg-ink-50',
            )
          }
        >
          <item.icon size={16} strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{item.label}</span>
          {item.key === 'inbox' && unread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill bg-signal-500 text-canvas text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const railFooter = (
    <div className="px-qurtag-3 py-qurtag-3 border-t border-hairline flex flex-col gap-2">
      <div className="rounded-card bg-paper px-3 py-3 flex flex-col gap-1.5">
        <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Free</span>
        <p className="text-caption text-ink-700 text-pretty">
          QuR Tag is free for up to two items.
        </p>
        <Link
          to="/help"
          className="text-caption font-medium text-ink-900 hover:opacity-70 transition-opacity self-start min-h-11 inline-flex items-center"
        >
          Help →
        </Link>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-3 px-3 h-11 rounded-card text-caption font-medium text-muted hover:text-ink-900 hover:bg-ink-50 transition-colors"
      >
        <LogOut size={16} strokeWidth={1.75} />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink-900 antialiased">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-hairline px-qurtag-3 h-14 flex items-center justify-between gap-3">
        <Link to="/app" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="size-10 grid place-items-center rounded-pill text-ink-900 hover:bg-ink-50 transition-colors duration-qurtag relative"
        >
          <Menu size={20} strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-signal-500" />
          )}
        </button>
      </header>

      <div className="flex">
        {/* Desktop left rail */}
        <aside className="hidden md:flex w-60 lg:w-64 flex-col border-r border-hairline min-h-screen sticky top-0">
          <div className="px-qurtag-3 pt-qurtag-5 pb-qurtag-3 border-b border-hairline">
            <Link to="/" className="flex items-center gap-2 px-2">
              <Wordmark />
            </Link>
          </div>
          {navItems}
          <div className="mt-auto">
            {railFooter}
          </div>
        </aside>

        <main id="main-content" className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-ink-950/40 animate-qurtag-fade-up"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="relative w-72 max-w-[85vw] bg-canvas border-r border-hairline shadow-modal flex flex-col animate-qurtag-fade-up">
            <div className="flex items-center justify-between px-qurtag-3 h-14 border-b border-hairline">
              <Link to="/" className="flex items-center gap-2 px-2">
                <Wordmark />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="size-9 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-qurtag"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            {navItems}
            <div className="mt-auto">{railFooter}</div>
          </aside>
        </div>
      )}
    </div>
  );
}
