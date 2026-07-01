import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Inbox } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/partners', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/partners/scan', label: 'Scan a tag', icon: ScanLine, end: false },
  { to: '/partners/queue', label: 'Queue', icon: Inbox, end: false },
];

export function PartnerLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/start', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 antialiased">
      <div className="flex">
        <aside className="hidden md:flex w-60 lg:w-64 flex-col border-r border-hairline min-h-screen sticky top-0">
          <div className="px-qurtag-3 pt-qurtag-5 pb-qurtag-3 border-b border-hairline">
            <Link to="/" className="flex items-center gap-2 px-2">
              <Wordmark />
              <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">Partners</span>
            </Link>
          </div>
          <nav className="flex-1 flex flex-col gap-0.5 px-qurtag-3 py-qurtag-3">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 h-9 rounded-card text-caption font-medium',
                    'transition-colors duration-qurtag',
                    isActive
                      ? 'bg-ink-50 text-ink-900'
                      : 'text-muted hover:text-ink-900 hover:bg-ink-50',
                  )
                }
              >
                <item.icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
