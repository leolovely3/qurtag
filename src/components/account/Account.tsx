import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleHelp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchMembership, type Membership } from '@/lib/membership';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { PLAN_INFO } from '../../../server/billing/catalog';
import { cn } from '@/lib/cn';

/** The first letter of the name (or, with none, of the email), for the round avatar. */
export function initialOf(name: string | undefined, email: string | undefined): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  return source ? source[0].toUpperCase() : '?';
}

export function Avatar({ size = 36, className }: { size?: number; className?: string }) {
  const { user } = useAuth();
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full bg-ink-900 font-semibold text-canvas', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initialOf(user?.name, user?.email)}
    </span>
  );
}

/** "Free, 1 of 3 items", or null while memberships are hidden (the iPhone app) or the plan is unknown. */
export function usePlanLine(): string | null {
  const { user } = useAuth();
  const memberships = useMembershipsAvailable();
  const [m, setM] = useState<Membership | null>(null);
  useEffect(() => {
    if (!user || !memberships) return;
    let cancelled = false;
    void fetchMembership().then((v) => !cancelled && setM(v));
    return () => {
      cancelled = true;
    };
  }, [user, memberships]);
  if (!memberships || !m) return null;
  const name = PLAN_INFO[m.items_plan].name;
  return m.item_limit === null ? `${name}, ${m.items_used} ${m.items_used === 1 ? 'item' : 'items'}` : `${name}, ${m.items_used} of ${m.item_limit} items`;
}

/** The round avatar at the top left of Items, on a phone: opens the account. 44 points to tap. */
export function AccountButton() {
  return (
    <Link to="/app/account" aria-label="Account" className="grid size-11 place-items-center rounded-pill hover:bg-ink-50 active:bg-ink-50">
      <Avatar size={32} />
    </Link>
  );
}

/** The "?" in the top bar: opens Help at the section for the screen. 44 points to tap. */
export function HelpButton({ section, className }: { section: string; className?: string }) {
  return (
    <Link
      to={`/app/help#${section}`}
      aria-label="Help"
      className={cn('grid size-11 place-items-center rounded-pill text-ink-900 hover:bg-ink-50 active:bg-ink-50', className)}
    >
      <CircleHelp size={22} strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

/** A small "?" beside a heading: what this part does. */
export function HelpLink({ section, label }: { section: string; label: string }) {
  return (
    <Link
      to={`/app/help#${section}`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-pill px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900"
    >
      <CircleHelp size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
}

/** The account card: avatar, name, email and plan. It opens the Account screen. */
export function AccountCard({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const plan = usePlanLine();
  return (
    <Link
      to="/app/account"
      className={cn(
        'flex items-center gap-3 transition-colors hover:bg-ink-50 active:bg-ink-50 focus-visible:outline-offset-[-2px]',
        compact ? 'rounded-card px-3 py-2' : 'rounded-modal border border-hairline bg-canvas p-4',
      )}
    >
      <Avatar size={compact ? 36 : 56} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate font-semibold text-ink-900', compact ? 'text-sm' : 'text-lg')}>{user?.name || user?.email}</span>
        {user?.name && <span className="truncate text-sm text-muted">{user.email}</span>}
        {plan && <span className="truncate text-sm text-muted">{plan}</span>}
      </span>
      {!compact && <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-hidden />}
    </Link>
  );
}
