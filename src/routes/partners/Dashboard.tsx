import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ScanLine } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { fetchMyPartner, fetchPartnerDropoffs } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Partner, PartnerDropoff } from '@/lib/database.types';

export function PartnerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [dropoffs, setDropoffs] = useState<PartnerDropoff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const p = await fetchMyPartner();
      if (cancelled) return;
      setPartner(p);
      if (p) {
        const d = await fetchPartnerDropoffs(p.id);
        if (!cancelled) setDropoffs(d);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const received = useMemo(() => dropoffs.filter((d) => d.status === 'received').length, [dropoffs]);
  const awaiting = useMemo(() => dropoffs.filter((d) => d.status === 'awaiting_pickup').length, [dropoffs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-3xl flex flex-col gap-5">
        <Eyebrow>Partners</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
          You aren't a QurTag partner yet.
        </h1>
        <p className="text-body text-muted text-pretty">
          Partner accounts (hotels, airlines, coworking spaces, gyms) are invite-only while we
          onboard our first cohort. Write to{' '}
          <a href="mailto:partners@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
            partners@qurtag.com
          </a>{' '}
          if you handle lost-and-found at a property.
        </p>
      </div>
    );
  }

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-4xl">
      <div className="flex items-end justify-between mb-cairn-8 gap-3 flex-wrap">
        <div className="flex flex-col gap-2">
          <Eyebrow>{partner.kind[0].toUpperCase() + partner.kind.slice(1)}</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
            {partner.name}
          </h1>
          {partner.city && <p className="text-caption text-muted">{partner.city}</p>}
        </div>
        <Link
          to="/partners/scan"
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
        >
          <ScanLine size={14} strokeWidth={1.75} />
          Log a drop-off
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-cairn-5">
        <Stat label="Total drop-offs" value={dropoffs.length} />
        <Stat label="Received today" value={received} />
        <Stat label="Awaiting pickup" value={awaiting} tone="signal" />
      </div>

      {dropoffs.length === 0 ? (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-8 flex flex-col items-start gap-3">
          <div className="size-12 rounded-pill bg-canvas grid place-items-center shadow-card">
            <Package size={20} strokeWidth={1.5} className="text-ink-900" />
          </div>
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
            Nothing in the queue.
          </h2>
          <p className="text-body text-muted max-w-md text-pretty">
            Scan a QurTag tag on a found item to log a drop-off. The owner is notified instantly.
          </p>
        </div>
      ) : (
        <ul className="rounded-modal border border-hairline bg-canvas divide-y divide-hairline overflow-hidden">
          {dropoffs.map((d) => (
            <li key={d.id} className="p-cairn-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
                  <Package size={16} strokeWidth={1.75} className="text-ink-900" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-body font-medium text-ink-900 truncate">
                    Drop-off {d.id.slice(0, 8)}
                  </span>
                  <span className="text-caption text-muted">
                    {new Date(d.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {d.notes && ` · ${d.notes}`}
                  </span>
                </div>
              </div>
              <span className="text-caption text-muted">{d.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'signal' }) {
  return (
    <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <span
        className={`font-display font-semibold text-h2 tracking-[-0.028em] ${
          tone === 'signal' && value > 0 ? 'text-signal-600' : 'text-ink-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
