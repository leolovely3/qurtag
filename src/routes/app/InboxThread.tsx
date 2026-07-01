import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Flag, Package, Lock, ShieldOff, Truck } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { MessageComposer } from '@/components/ui/MessageComposer';
import { Modal } from '@/components/ui/Modal';
import { ThreadView } from '@/components/ui/ThreadView';
import { useAuth } from '@/lib/auth';
import {
  blockFinderSession,
  fetchActiveRewardForItem,
  fetchCourierOrderForThread,
  fetchItemById,
  fetchMessagesForThread,
  fetchThreadById,
  markThreadReadByOwner,
  markThreadStatus,
  reportAbuse,
  sendMessage,
} from '@/lib/queries';
import { releaseReward, startStripeCheckout } from '@/lib/stripe';
import { encodeSystemPayload } from '@/lib/systemMessages';
import { useToast } from '@/components/ui/Toast';
import type { CourierOrder } from '@/lib/database.types';
import { useThreadRealtime, useThreadStatusRealtime } from '@/lib/realtime';
import type { Item, Message, Thread } from '@/lib/database.types';

function labelForCourierState(state: CourierOrder['state']): string {
  switch (state) {
    case 'requested':
      return 'The finder is ready for pickup.';
    case 'paid':
      return 'Paid. Generating label…';
    case 'label_generated':
      return 'Label sent to finder.';
    case 'picked_up':
      return 'Picked up. On its way.';
    case 'delivered':
      return 'Delivered. Reunited.';
    case 'cancelled':
      return 'Cancelled.';
  }
}

function centsToUSD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

interface ReportFormProps {
  onClose: () => void;
  onSubmit: (kind: 'spam' | 'harassment' | 'fraud' | 'other', body: string) => Promise<void>;
}

function ReportForm({ onClose, onSubmit }: ReportFormProps) {
  const [kind, setKind] = useState<'spam' | 'harassment' | 'fraud' | 'other'>('spam');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 mb-qurtag-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em]">Report this conversation</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-caption text-muted hover:text-ink-900 transition-colors"
        >
          Close
        </button>
      </div>
      <p className="text-caption text-muted text-pretty">
        A real person at QurTag reviews every report. We'll come back to you within 24 hours.
      </p>
      <div className="flex gap-2 flex-wrap">
        {(['spam', 'harassment', 'fraud', 'other'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`inline-flex h-9 items-center rounded-pill px-3 text-caption font-medium border transition-colors duration-qurtag ${
              kind === k
                ? 'bg-ink-900 text-canvas border-ink-900'
                : 'bg-canvas text-ink-900 border-hairline-strong hover:border-ink-900'
            }`}
          >
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anything we should know."
        rows={4}
        className="w-full rounded-card border border-hairline-strong bg-canvas p-3 text-body text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-qurtag resize-none"
      />
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-caption text-muted hover:text-ink-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            setSubmitting(true);
            try {
              await onSubmit(kind, body.trim());
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 transition-colors duration-qurtag"
        >
          {submitting ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function InboxThread() {
  const { threadId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [thread, setThread] = useState<Thread | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reunitedOpen, setReunitedOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [releaseRewardOpen, setReleaseRewardOpen] = useState<null | { amountCents: number; rewardId: string }>(null);
  const [courier, setCourier] = useState<CourierOrder | null>(null);
  const [labelPending, setLabelPending] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const toast = useToast();

  const refetchMessages = useCallback(async (tid: string) => {
    const msgs = await fetchMessagesForThread(tid);
    setMessages(msgs);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    if (!threadId) return;

    let cancelled = false;
    (async () => {
      const t = await fetchThreadById(threadId);
      if (cancelled) return;
      if (!t) {
        setError('That conversation isn\'t in your inbox.');
        setLoading(false);
        return;
      }
      setThread(t);
      const [it, msgs, co] = await Promise.all([
        fetchItemById(t.item_id),
        fetchMessagesForThread(t.id),
        fetchCourierOrderForThread(t.id),
      ]);
      if (cancelled) return;
      setItem(it);
      setMessages(msgs);
      setCourier(co);
      setLoading(false);
      // Mark as read on view.
      void markThreadReadByOwner(t.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, threadId, navigate]);

  // Live updates. Finder replies land instantly.
  useThreadRealtime(
    threadId ?? null,
    useCallback((incoming: Message) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === incoming.id);
        if (idx >= 0) {
          const copy = prev.slice();
          copy[idx] = incoming;
          return copy;
        }
        return [...prev, incoming];
      });
      // If a finder message arrived while we're viewing, mark it read.
      if (incoming.sender_kind === 'finder' && threadId) {
        void markThreadReadByOwner(threadId);
      }
    }, [threadId]),
  );

  // Status flips propagate live (e.g. if a co-owner marks reunited).
  useThreadStatusRealtime(
    threadId ?? null,
    useCallback((updated) => {
      setThread(updated);
    }, []),
  );

  const handleSend = useCallback(
    async (body: string) => {
      if (!thread) return;
      const sent = await sendMessage({
        threadId: thread.id,
        senderKind: 'owner',
        body,
      });
      if (!sent) return;
      await refetchMessages(thread.id);
    },
    [thread, refetchMessages],
  );

  async function confirmReunited() {
    if (!thread) return;
    setReunitedOpen(false);
    setActionPending('reunited');
    try {
      await markThreadStatus(thread.id, 'reunited');
      await sendMessage({
        threadId: thread.id,
        senderKind: 'system',
        body: encodeSystemPayload({ type: 'reunited', at: new Date().toISOString() }),
      });
      await refetchMessages(thread.id);
      toast.show({ kind: 'success', title: 'Marked reunited', body: 'A celebration card was added to the thread.' });
      const reward = await fetchActiveRewardForItem(thread.item_id);
      if (reward && reward.state === 'held') {
        setReleaseRewardOpen({ amountCents: reward.amount_cents, rewardId: reward.id });
      }
    } finally {
      setActionPending(null);
    }
  }

  async function confirmReleaseReward() {
    if (!releaseRewardOpen) return;
    const { rewardId, amountCents } = releaseRewardOpen;
    setReleaseRewardOpen(null);
    setActionPending('release');
    try {
      const r = await releaseReward(rewardId);
      if (r.ok) {
        toast.show({
          kind: 'success',
          title: 'Reward released',
          body: `${centsToUSD(amountCents)} captured and en route to the finder.`,
        });
      } else {
        toast.show({
          kind: 'error',
          title: "Couldn't release the reward",
          body: r.error ?? 'Try again, or contact support if it persists.',
        });
      }
    } finally {
      setActionPending(null);
    }
  }

  async function confirmBlockFinder() {
    if (!thread || !thread.finder_session_id) return;
    setBlockOpen(false);
    setActionPending('block');
    try {
      await blockFinderSession({
        householdId: thread.household_id,
        finderSessionId: thread.finder_session_id,
        reason: 'Manually blocked from inbox',
      });
      await markThreadStatus(thread.id, 'closed');
      toast.show({ kind: 'info', title: 'Finder blocked', body: "They can't open new threads on any of your tags." });
      navigate('/app/inbox');
    } finally {
      setActionPending(null);
    }
  }

  async function handleCourierPay() {
    if (!courier) return;
    setLabelError(null);
    setLabelPending(true);
    // Flat label price for v1; real pricing comes from Shippo rates.
    const amountCents = 1499;
    const result = await startStripeCheckout('create-checkout-courier', {
      courierOrderId: courier.id,
      amountCents,
    });
    setLabelPending(false);
    if (!result.ok) {
      setLabelError(
        result.error ??
          "Couldn't start Stripe Checkout. Deploy create-checkout-courier. See docs/SETUP.md.",
      );
    }
  }

  async function handleReport(kind: 'spam' | 'harassment' | 'fraud' | 'other', body: string) {
    if (!thread) return;
    setActionPending('report');
    try {
      await reportAbuse({
        householdId: thread.household_id,
        threadId: thread.id,
        kind,
        body,
      });
      toast.show({ kind: 'success', title: 'Report submitted', body: 'A real person reviews every report. We respond within 24 hours.' });
      setReportOpen(false);
    } finally {
      setActionPending(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-3xl flex flex-col gap-5">
        <Link
          to="/app/inbox"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Back to inbox
        </Link>
        <Eyebrow>Not available</Eyebrow>
        <h1 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.022em]">
          {error ?? 'This conversation isn\'t available.'}
        </h1>
      </div>
    );
  }

  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-4xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-qurtag-3">
        <Link
          to="/app/inbox"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Inbox
        </Link>
        <span className="text-caption text-muted">
          Started {relativeTime(thread.created_at)}
          {thread.status !== 'open' && ` · ${thread.status}`}
        </span>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mb-qurtag-5 flex-wrap">
        <button
          type="button"
          onClick={() => setReunitedOpen(true)}
          disabled={!!actionPending || thread.status === 'reunited'}
          className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-verdigris-500 text-canvas text-caption font-medium px-4 hover:bg-verdigris-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
        >
          <CheckCircle2 size={14} strokeWidth={1.75} />
          {actionPending === 'reunited' ? 'Closing…' : 'Mark as reunited'}
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          disabled={!!actionPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline-strong text-ink-900 text-caption font-medium px-4 hover:border-ink-900 disabled:opacity-50 transition-colors duration-qurtag"
        >
          <Flag size={14} strokeWidth={1.75} />
          Report
        </button>
        <button
          type="button"
          onClick={() => thread.finder_session_id && setBlockOpen(true)}
          disabled={!!actionPending || !thread.finder_session_id}
          className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline-strong text-muted text-caption font-medium px-4 hover:border-signal-500 hover:text-signal-700 disabled:opacity-50 transition-colors duration-qurtag"
        >
          <ShieldOff size={14} strokeWidth={1.75} />
          Block this finder
        </button>
      </div>

      {reportOpen && (
        <ReportForm onClose={() => setReportOpen(false)} onSubmit={handleReport} />
      )}

      <Modal
        open={reunitedOpen}
        onClose={() => setReunitedOpen(false)}
        eyebrow="Mark as reunited"
        title="Is the item back where it should be?"
        description="This closes the conversation, posts a celebration message in the thread, and (if you held a reward) prompts to release it."
        primaryAction={{
          label: 'Yes, it’s home',
          onClick: confirmReunited,
          pending: actionPending === 'reunited',
        }}
        secondaryAction={{ label: 'Not yet', onClick: () => setReunitedOpen(false) }}
      />

      <Modal
        open={!!releaseRewardOpen}
        onClose={() => setReleaseRewardOpen(null)}
        eyebrow="Reward"
        title={
          releaseRewardOpen
            ? `Release ${centsToUSD(releaseRewardOpen.amountCents)} to the finder?`
            : 'Release the reward?'
        }
        description="If the finder set up a Stripe Connect payout, the funds land in their bank within a couple of days. Otherwise they settle into your Stripe account and you can pay them directly."
        primaryAction={{
          label: 'Release reward',
          onClick: confirmReleaseReward,
          pending: actionPending === 'release',
        }}
        secondaryAction={{
          label: 'Not yet',
          onClick: () => setReleaseRewardOpen(null),
        }}
      />

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        eyebrow="Block this finder"
        title="Block this finder from contacting you again?"
        description="The conversation closes and the same browser session can't open new threads on any of your tags. You can unblock from /app/settings later."
        primaryAction={{
          label: 'Block them',
          tone: 'destructive',
          onClick: confirmBlockFinder,
          pending: actionPending === 'block',
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setBlockOpen(false) }}
      />

      {/* Courier order card */}
      {courier && (
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 mb-qurtag-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-pill bg-verdigris-100 grid place-items-center shrink-0">
              <Truck size={18} strokeWidth={1.75} className="text-verdigris-700" />
            </div>
            <div className="flex-1 min-w-0">
              <Eyebrow>Courier pickup</Eyebrow>
              <p className="text-body text-ink-900 font-medium mt-0.5">
                {labelForCourierState(courier.state)}
              </p>
              <p className="text-caption text-muted">
                {courier.city ? `${courier.city} · ` : ''}Pickup window: {courier.pickup_window}
              </p>
              {courier.tracking_number && (
                <p className="text-caption text-muted mt-1">
                  Tracking: <span className="font-mono">{courier.tracking_number}</span>
                </p>
              )}
            </div>
            {courier.state === 'requested' && (
              <button
                type="button"
                onClick={handleCourierPay}
                disabled={labelPending}
                className="shrink-0 inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 disabled:opacity-50 transition-colors duration-qurtag"
              >
                {labelPending ? 'Opening Stripe…' : 'Pay $14.99 & generate label'}
              </button>
            )}
            {courier.label_url && (
              <a
                href={courier.label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex h-10 items-center gap-2 rounded-pill border border-hairline-strong text-ink-900 text-caption font-medium px-4 hover:border-ink-900 transition-colors duration-qurtag"
              >
                Open label
                <ExternalLink size={12} strokeWidth={1.75} />
              </a>
            )}
          </div>
          {labelError && (
            <p className="text-caption text-signal-700 text-pretty">{labelError}</p>
          )}
        </div>
      )}

      {/* Item context */}
      {item && (
        <div className="rounded-modal border border-hairline bg-paper p-qurtag-5 mb-qurtag-5 flex items-center gap-qurtag-3">
          {item.hero_photo_url ? (
            <img
              src={item.hero_photo_url}
              alt=""
              className="size-14 rounded-card object-cover bg-ink-50 shrink-0"
            />
          ) : (
            <div className="size-14 rounded-card bg-ink-50 grid place-items-center shrink-0">
              <Package size={18} strokeWidth={1.5} className="text-muted" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Eyebrow>Conversation about</Eyebrow>
            <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] mt-0.5 truncate">
              {item.name}
            </h2>
            {item.brand && (
              <p className="text-caption text-muted">{item.brand}</p>
            )}
          </div>
          <Link
            to={`/app/items/${item.id}`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-ink-900 hover:opacity-70 transition-opacity shrink-0"
          >
            Open item
            <ExternalLink size={12} strokeWidth={1.75} />
          </Link>
        </div>
      )}

      {/* Thread */}
      <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 mb-qurtag-3 max-h-[60vh] overflow-y-auto">
        <ThreadView messages={messages} viewerKind="owner" />
      </div>

      {/* Composer */}
      <MessageComposer
        label="Reply"
        placeholder="A short note. Direct and human."
        onSend={handleSend}
      />

      {/* Privacy strip */}
      <div className="mt-qurtag-3 rounded-card bg-paper border border-hairline p-qurtag-3 flex items-start gap-3">
        <Lock size={16} strokeWidth={1.75} className="mt-0.5 text-ink-900 shrink-0" />
        <p className="text-caption text-ink-700 text-pretty">
          The finder doesn't see your email, phone, or any account detail. QurTag relays your reply
          and keeps the bridge private from both sides.
        </p>
      </div>
    </div>
  );
}
