import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, FileText, Lock } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Wordmark } from '@/components/brand/Wordmark';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import {
  fetchActiveRewardForItem,
  fetchHousehold,
  fetchItemById,
  fetchMessagesForThread,
  fetchPrimaryHouseholdId,
  fetchScansForItem,
  fetchTags,
  fetchThreadsForHousehold,
} from '@/lib/queries';
import { parseSystemPayload } from '@/lib/systemMessages';
import type {
  Household,
  Item,
  Message,
  Reward,
  Scan,
  Tag,
  Thread,
} from '@/lib/database.types';

function centsToUSD(cents: number | null | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function senderLabelLong(kind: Message['sender_kind']): string {
  if (kind === 'owner') return 'Owner';
  if (kind === 'finder') return 'Finder (anon.)';
  return 'QurTag (system)';
}

export function InsurancePacket() {
  const { itemId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [household, setHousehold] = useState<Household | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    if (!itemId) return;

    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled || !hh) {
        setLoading(false);
        return;
      }
      const [householdRow, itemRow, scansRows, tags, rewardRow, threadsRows] =
        await Promise.all([
          fetchHousehold(hh),
          fetchItemById(itemId),
          fetchScansForItem(itemId),
          fetchTags(hh),
          fetchActiveRewardForItem(itemId),
          fetchThreadsForHousehold(hh),
        ]);
      if (cancelled) return;
      setHousehold(householdRow);
      setItem(itemRow);
      setScans(scansRows);
      setReward(rewardRow);
      setTag(tags.find((t) => t.current_item_id === itemId) ?? null);
      const threadForItem = threadsRows.find((t) => t.item_id === itemId);
      if (threadForItem) {
        setThread(threadForItem);
        const msgs = await fetchMessagesForThread(threadForItem.id);
        if (!cancelled) setMessages(msgs);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, itemId, navigate]);

  const declaredValue = useMemo(() => centsToUSD(item?.declared_value_cents), [item]);
  const rewardValue = useMemo(() => centsToUSD(reward?.amount_cents), [reward]);
  const packetId = useMemo(
    () => (item ? `${item.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}` : ''),
    [item],
  );

  if (loading) {
    return (
      <Container size="md">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
        </div>
      </Container>
    );
  }

  if (!item) {
    return (
      <Container size="md">
        <div className="min-h-[60vh] flex flex-col items-start gap-3 py-qurtag-8">
          <Eyebrow>Item not found</Eyebrow>
          <h1 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.022em]">
            We couldn't find that item.
          </h1>
          <Link to="/app" className="link-arrow text-body">
            Back to your items →
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="md">
      {/* Toolbar. Hidden in print */}
      <div className="no-print py-qurtag-3 flex items-center justify-between gap-3 border-b border-hairline">
        <Link
          to={`/app/items/${itemId}`}
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Back to item
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-caption text-muted hidden sm:inline">
            Press print, then "Save as PDF" to keep a copy.
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-qurtag"
          >
            <Printer size={14} strokeWidth={1.75} />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* The packet. Printable */}
      <article className="bg-canvas border border-hairline rounded-modal p-qurtag-8 my-qurtag-8 print:border-0 print:rounded-none print:shadow-none print:my-0 print:p-0 shadow-card flex flex-col gap-qurtag-5">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-hairline pb-qurtag-3">
          <div className="flex flex-col gap-1">
            <Wordmark />
            <Eyebrow>Loss + recovery packet</Eyebrow>
          </div>
          <div className="text-right flex flex-col gap-0.5">
            <p className="text-caption text-muted">Packet ID</p>
            <p className="font-mono text-caption text-ink-900">{packetId}</p>
            <p className="text-caption text-muted mt-1">Generated</p>
            <p className="text-caption text-ink-900">{formatDateTime(new Date().toISOString())}</p>
          </div>
        </header>

        {/* Title */}
        <div className="flex flex-col gap-2">
          <h1 className="font-display font-semibold text-h2 text-ink-900 tracking-[-0.028em] leading-[1.05] text-balance">
            {item.name}
          </h1>
          {item.brand && (
            <p className="text-body text-muted">
              {item.brand}
              {item.model ? ` · ${item.model}` : ''}
            </p>
          )}
        </div>

        {/* Key facts grid */}
        <Section title="Item details">
          <Grid>
            <Field label="Declared value" value={declaredValue ?? '-'} />
            <Field label="Color" value={item.color ?? '-'} />
            <Field
              label="Serial / IMEI"
              value="Encrypted at rest (provide to insurer if required)"
            />
            <Field
              label="Item id"
              value={<span className="font-mono">{item.id}</span>}
            />
            <Field label="Added on" value={formatDateTime(item.created_at)} />
            <Field
              label="Last updated"
              value={formatDateTime(item.updated_at)}
            />
          </Grid>
        </Section>

        {/* Tag */}
        {tag && (
          <Section title="QurTag tag">
            <Grid>
              <Field label="Tag public id" value={<span className="font-mono">{tag.public_id}</span>} />
              <Field label="Tier" value={tag.hardware_tier} />
              <Field label="Status" value={tag.status} />
              <Field label="Activated" value={formatDateTime(tag.activated_at)} />
            </Grid>
          </Section>
        )}

        {/* Owner */}
        {household && (
          <Section title="Registered owner">
            <Grid>
              <Field label="Account email" value={user?.email ?? '-'} />
              {household.return_address_line && (
                <Field
                  label="Return address"
                  value={
                    <span>
                      {household.return_address_line}
                      {household.return_city ? `, ${household.return_city}` : ''}
                      {household.return_state ? `, ${household.return_state}` : ''}
                      {household.return_postal_code ? ` ${household.return_postal_code}` : ''}
                      {household.return_country ? ` · ${household.return_country}` : ''}
                    </span>
                  }
                />
              )}
            </Grid>
          </Section>
        )}

        {/* Reward */}
        {reward && (
          <Section title="Reward in escrow">
            <Grid>
              <Field label="Amount" value={rewardValue ?? '-'} />
              <Field label="State" value={reward.state} />
              {reward.held_at && (
                <Field label="Held" value={formatDateTime(reward.held_at)} />
              )}
              {reward.released_at && (
                <Field label="Released" value={formatDateTime(reward.released_at)} />
              )}
              {reward.stripe_payment_intent_id && (
                <Field
                  label="Stripe PaymentIntent"
                  value={<span className="font-mono">{reward.stripe_payment_intent_id}</span>}
                />
              )}
            </Grid>
          </Section>
        )}

        {/* Scan history */}
        <Section title={`Scan history (${scans.length})`}>
          {scans.length === 0 ? (
            <p className="text-body text-muted italic">No scans recorded.</p>
          ) : (
            <table className="w-full text-caption">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left py-2 font-medium text-muted">When</th>
                  <th className="text-left py-2 font-medium text-muted">From</th>
                  <th className="text-left py-2 font-medium text-muted">User-agent class</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} className="border-b border-hairline">
                    <td className="py-2 text-ink-900">{formatDateTime(scan.scanned_at)}</td>
                    <td className="py-2 text-ink-900">{scan.ip_country ?? '-'}</td>
                    <td className="py-2 text-muted font-mono truncate max-w-[260px]">
                      {scan.user_agent_class ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Chain of custody. Thread + messages */}
        {thread && (
          <Section title="Chain of custody">
            <p className="text-caption text-muted mb-qurtag-2">
              Thread {thread.id} · status {thread.status} · opened{' '}
              {formatDateTime(thread.created_at)} · last activity{' '}
              {formatDateTime(thread.last_message_at)}
            </p>
            <table className="w-full text-caption">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left py-2 font-medium text-muted">When</th>
                  <th className="text-left py-2 font-medium text-muted">From</th>
                  <th className="text-left py-2 font-medium text-muted">Message</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => {
                  const sys = m.sender_kind === 'system' ? parseSystemPayload(m.body) : null;
                  return (
                    <tr key={m.id} className="border-b border-hairline align-top">
                      <td className="py-2 text-ink-900 whitespace-nowrap pr-3">
                        {formatDateTime(m.created_at)}
                      </td>
                      <td className="py-2 text-ink-900 whitespace-nowrap pr-3">
                        {senderLabelLong(m.sender_kind)}
                      </td>
                      <td className="py-2 text-ink-700">
                        {sys ? renderSystemPayload(sys) : m.body}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}

        {/* Attestation */}
        <Section title="Owner attestation">
          <p className="text-body text-ink-700 text-pretty">
            I, the undersigned, certify that the above record accurately reflects the loss and
            recovery activity associated with the item identified in this packet. This document is
            generated by QurTag from immutable timestamps and signed event records at the time of
            generation.
          </p>
          <div className="grid grid-cols-2 gap-qurtag-5 mt-qurtag-5">
            <div className="flex flex-col">
              <div className="h-12 border-b border-ink-900" />
              <p className="text-caption text-muted mt-1">Owner signature</p>
              <p className="text-caption text-ink-900">{user?.email ?? ''}</p>
            </div>
            <div className="flex flex-col">
              <div className="h-12 border-b border-ink-900" />
              <p className="text-caption text-muted mt-1">Date</p>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <footer className="flex items-start gap-2 text-caption text-muted border-t border-hairline pt-qurtag-3">
          <Lock size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            QurTag never exchanged personal details between owner and finder. All identifying
            information stayed on QurTag's servers; the finder saw only what the owner chose to
            display. Generated by QurTag. QurTag.co.
          </span>
        </footer>
      </article>

      <div className="no-print pb-qurtag-8 max-w-2xl mx-auto flex items-start gap-2 text-caption text-muted">
        <FileText size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>
          This packet is generated server-side every time you open this page from immutable
          Postgres timestamps. Print or "Save as PDF" from the browser. The document is intended
          to be filed with travel insurance, homeowner's insurance, or airline claim forms.
        </span>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          @page { size: Letter; margin: 0.5in; }
        }
      `}</style>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-qurtag-3 first:border-t-0 first:pt-0">
      <h2 className="text-eyebrow uppercase tracking-[0.14em] font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid sm:grid-cols-2 gap-x-qurtag-5 gap-y-qurtag-2">{children}</dl>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body text-ink-900 text-pretty">{value}</dd>
    </div>
  );
}

function renderSystemPayload(
  payload: ReturnType<typeof parseSystemPayload>,
): string {
  if (!payload) return '';
  switch (payload.type) {
    case 'location':
      return `📍 Location shared: ${payload.label ?? `${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}`}`;
    case 'courier_request':
      return `🚚 Courier pickup requested · ${payload.city ?? 'address withheld'} · window: ${payload.pickupWindow}`;
    case 'reward_offered': {
      const amount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(payload.amount_cents / 100);
      return `🛡 Reward of ${amount} placed in escrow`;
    }
    case 'reunited':
      return `🎉 Reunited at ${new Date(payload.at).toLocaleString()}`;
  }
}
