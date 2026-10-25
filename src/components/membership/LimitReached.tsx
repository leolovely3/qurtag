import { Link } from 'react-router-dom';
import { buttonClasses } from '@/components/ui/Button';
import { limitCopy } from '@/lib/itemLimit';
import type { Membership } from '@/lib/membership';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';

/** The plan holds no more items: what that means and the way on (rules in src/lib/itemLimit.ts). */
export function LimitReached({ membership, className }: { membership: Membership; className?: string }) {
  const shown = useMembershipsAvailable();
  const c = limitCopy({ membershipsShown: shown, itemLimit: membership.item_limit, itemsUsed: membership.items_used });
  return (
    <section role="status" className={className ?? 'flex flex-col items-start gap-3 rounded-modal border border-hairline bg-paper p-4'}>
      <h2 className="text-base font-semibold text-ink-900 text-balance">{c.title}</h2>
      <p className="text-sm text-ink-700 text-pretty">{c.body}</p>
      <div className="flex flex-wrap gap-2">
        {c.action === 'plans' && (
          <Link to="/app/membership" className={buttonClasses({ variant: 'primary' })}>
            See plans
          </Link>
        )}
        <Link to="/app" className={buttonClasses({ variant: c.action === 'plans' ? 'secondary' : 'primary' })}>
          Your items
        </Link>
      </div>
    </section>
  );
}
