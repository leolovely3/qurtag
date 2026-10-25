import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { PLAN_INFO, priceLabel, productFor, yearlySavingPercent, type PaidPlan, type Plan } from '../../../server/billing/catalog';
import { cn } from '@/lib/cn';

/**
 * One plan as a card: its name, what it costs, what it includes. The price lines come from
 * the shared catalog (server/billing/catalog.ts) so the pricing page, the Membership screen
 * and the server always agree. `prices` replaces the web prices with the ones the App Store
 * reports on the iPhone. `children` holds the buttons.
 */
export function PlanCard({
  plan,
  current,
  prices,
  children,
}: {
  plan: Plan;
  current?: boolean;
  /** The price Apple shows per product id, on the iPhone. */
  prices?: Map<string, string>;
  children?: ReactNode;
}) {
  const info = PLAN_INFO[plan];
  return (
    <section
      aria-label={`${info.name} plan`}
      className={cn(
        'rounded-modal border bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3',
        current ? 'border-ink-900' : 'border-hairline',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.02em]">{info.name}</h3>
        {current && (
          <span className="text-caption px-2 py-0.5 rounded-pill bg-ink-900 text-canvas">Your plan</span>
        )}
      </div>
      <p className="text-caption text-muted text-pretty">{info.summary}</p>
      <PriceLines plan={plan} prices={prices} />
      <ul className="flex flex-col gap-2">
        {info.includes.map((line) => (
          <li key={line} className="flex gap-2 text-body text-ink-700 text-pretty">
            <Check size={16} strokeWidth={2} className="mt-1 shrink-0 text-ink-900" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {children && <div className="mt-auto pt-qurtag-3 flex flex-col gap-2">{children}</div>}
    </section>
  );
}

function PriceLines({ plan, prices }: { plan: Plan; prices?: Map<string, string> }) {
  if (plan === 'free') {
    return <p className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.02em]">$0</p>;
  }
  const paid = plan as PaidPlan;
  const monthly = productFor(paid, 'month');
  const yearly = productFor(paid, 'year');
  const month = prices?.get(monthly.appleId) ?? priceLabel(monthly.cents);
  const year = prices?.get(yearly.appleId) ?? priceLabel(yearly.cents);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.02em]">
        {month}
        <span className="text-body font-normal text-muted"> a month</span>
      </p>
      <p className="text-body text-ink-700">
        or {year} a year{!prices && <span className="text-muted"> (save {yearlySavingPercent(paid)}%)</span>}
      </p>
    </div>
  );
}
