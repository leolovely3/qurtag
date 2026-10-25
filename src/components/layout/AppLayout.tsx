import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePoll } from '@/lib/realtime';
import { FEATURES } from '@/lib/features';
import type { LucideIcon } from 'lucide-react';
import { CircleHelp, CreditCard, Inbox, LogOut, Package, Plane, Settings, ShieldCheck, Tag } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { NativePushBridge } from '@/components/push/NativePushBridge';
import { useAuth } from '@/lib/auth';
import { useIsSuperAdmin } from '@/lib/admin';
import { countUnreadForHousehold, fetchPrimaryHouseholdId } from '@/lib/queries';
import { fetchMembership, type Membership } from '@/lib/membership';
import { PLAN_INFO } from '../../../server/billing/catalog';
import { cn } from '@/lib/cn';

/**
 * The signed-in app's frame.
 *
 * Phone widths (under 768px, which is also the iPhone app) get a bottom tab bar, the standard
 * iPhone pattern (Apple HIG: Tab bars; Material 3: Navigation bar, 3 to 5 destinations), kept
 * clear of the home indicator. Wider screens get a left sidebar, as Things 3 and Linear do.
 * Each screen draws its own title and Back (src/components/layout/AppPage.tsx).
 *
 * `tab: true` puts a destination in the phone's tab bar; every destination is in the sidebar.
 * Tags and Membership are reached from Items and Settings on a phone, so the bar keeps to the
 * places people go daily. Admin joins the bar only for a super admin.
 */
interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  key: string;
  tab: boolean;
  /** Which paths count as this destination (for the selected state). */
  match: (path: string) => boolean;
}

const nav: NavEntry[] = [
  {
    to: '/app',
    label: 'Items',
    icon: Package,
    key: 'items',
    tab: true,
    match: (p) => p === '/app' || p.startsWith('/app/items') || p === '/start/setup' || /^\/app\/tags\/[^/]+\/print/.test(p),
  },
  { to: '/app/inbox', label: 'Inbox', icon: Inbox, key: 'inbox', tab: true, match: (p) => p.startsWith('/app/inbox') },
  { to: '/app/tags', label: 'Tags', icon: Tag, key: 'tags', tab: false, match: (p) => p === '/app/tags' },
  ...(FEATURES.trips
    ? [{ to: '/app/trips', label: 'Trips', icon: Plane, key: 'trips', tab: false, match: (p: string) => p.startsWith('/app/trips') }]
    : []),
  { to: '/app/membership', label: 'Membership', icon: CreditCard, key: 'membership', tab: false, match: (p) => p.startsWith('/app/membership') },
  { to: '/app/settings', label: 'Settings', icon: Settings, key: 'settings', tab: true, match: (p) => p.startsWith('/app/settings') },
];

const adminEntry: NavEntry = { to: '/app/admin', label: 'Admin', icon: ShieldCheck, key: 'admin', tab: true, match: (p) => p.startsWith('/app/admin') };

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-signal-700 px-1.5 text-xs font-semibold leading-none text-canvas',
        className,
      )}
    >
      <span className="sr-only">, </span>
      {count > 9 ? '9+' : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [unread, setUnread] = useState(0);
  const [unreadKnown, setUnreadKnown] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const entries = isSuperAdmin ? [...nav, adminEntry] : nav;

  useEffect(() => {
    // Signed out: sign in, and come back to this page (an invite link, the Membership page).
    if (!loading && !user) navigate(`/start?next=${encodeURIComponent(pathname + search)}`, { replace: true });
  }, [loading, user, navigate, pathname, search]);

  // The plan, for the line at the foot of the sidebar; read again when the person moves between pages.
  useEffect(() => {
    if (!user) return;
    void fetchMembership().then(setMembership);
  }, [user, pathname]);

  useEffect(() => {
    if (!user) return;
    void fetchPrimaryHouseholdId().then(setHouseholdId);
  }, [user]);

  const refreshUnread = useCallback(async () => {
    if (!householdId) return;
    const n = await countUnreadForHousehold(householdId);
    setUnread(n);
    setUnreadKnown(true);
  }, [householdId]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, pathname]);

  // Every screen opens at its top, not where the previous screen (or the sign-in form, with
  // the keyboard up) was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Keep the inbox count fresh while the app is open.
  usePoll(refreshUnread, !!householdId);

  async function handleSignOut() {
    await signOut();
    navigate('/start', { replace: true });
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-900 antialiased md:flex">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <NativePushBridge unread={unreadKnown ? unread : null} />

      {/* Sidebar, from tablet width */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-paper md:flex lg:w-64">
        <div className="flex h-16 items-center px-5">
          <Link to="/app" className="inline-flex min-h-11 items-center rounded-card px-1">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="App" className="flex flex-col gap-1 px-3 py-2">
          {entries.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-card px-3 text-sm font-medium transition-colors duration-150',
                  active ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )}
              >
                <item.icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.key === 'inbox' && <Badge count={unread} />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-hairline px-3 py-3">
          <Link
            to="/app/membership"
            className="mb-1 flex flex-col gap-0.5 rounded-card px-3 py-2 transition-colors hover:bg-ink-50"
          >
            <span className="text-sm font-semibold text-ink-900">{membership ? `${PLAN_INFO[membership.items_plan].name} plan` : 'Plan'}</span>
            <span className="text-sm text-muted">
              {membership
                ? membership.item_limit === null
                  ? `${membership.items_used} items, no limit`
                  : `${membership.items_used} of ${membership.item_limit} items`
                : 'QuR Tag is free for up to two items.'}
            </span>
          </Link>
          <Link
            to="/help"
            className="flex h-11 items-center gap-3 rounded-card px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <CircleHelp size={18} strokeWidth={1.75} aria-hidden />
            Help
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-11 items-center gap-3 rounded-card px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <main id="main-content" className="min-w-0 flex-1 pb-24 md:pb-0 print:pb-0">
        <Outlet />
      </main>

      {/* Tab bar, on phones */}
      <nav
        aria-label="App"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas/90 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/80 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-md">
          {entries
            .filter((item) => item.tab)
            .map((item) => {
              const active = item.match(pathname);
              return (
                <li key={item.key} className="flex-1">
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150',
                      active ? 'text-ink-900' : 'text-muted hover:text-ink-900',
                    )}
                  >
                    <span className="relative">
                      <item.icon size={24} strokeWidth={active ? 2 : 1.6} aria-hidden />
                      {item.key === 'inbox' && <Badge count={unread} className="absolute -right-3 -top-1.5" />}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>
    </div>
  );
}
