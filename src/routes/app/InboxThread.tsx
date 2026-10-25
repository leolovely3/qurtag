import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, Flag, Lock, ShieldOff, Truck } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ItemThumb } from './Home';
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
  sendOwnerReply,
} from '@/lib/queries';
import { FEATURES } from '@/lib/features';
import { releaseReward, startStripeCheckout } from '@/lib/stripe';
import { useToast } from '@/components/ui/Toast';
import type { CourierOrder } from '@/lib/database.types';
import { usePoll } from '@/lib/realtime';
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
        Tell us what happened. We read every report sent to info@impactconsulting.ai.
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
  const [closeOpen, setCloseOpen] = useState(false);
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
        FEATURES.courier ? fetchCourierOrderForThread(t.id) : Promise.resolve(null),
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

  // New notes from the finder: ask again every few seconds while the page is open.
  usePoll(async () => {
    if (!threadId) return;
    const [t, msgs] = await Promise.all([fetchThreadById(threadId), fetchMessagesForThread(threadId)]);
    if (t) setThread(t);
    setMessages((prev) => {
      if (msgs.length > prev.length && msgs.some((m) => m.sender_kind === 'finder' && !m.read_by_owner_at)) {
        void markThreadReadByOwner(threadId);
      }
      return msgs;
    });
  }, !!thread);

  const handleSend = useCallback(
    async (body: string) => {
      if (!thread) return;
      const sent = await sendOwnerReply({ threadId: thread.id, body });
      if (!sent) {
        toast.show({ kind: 'error', title: "Couldn't send your reply", body: 'Check your connection and try again.' });
        throw new Error('not sent');
      }
      await refetchMessages(thread.id);
    },
    [thread, refetchMessages, toast],
  );

  async function confirmReunited() {
    if (!thread) return;
    setReunitedOpen(false);
    setActionPending('reunited');
    try {
      await markThreadStatus(thread.id, 'reunited');
      setThread({ ...thread, status: 'reunited' });
      toast.show({ kind: 'success', title: 'Marked as back with you', body: 'You can still write to the finder here.' });
      const reward = FEATURES.rewards ? await fetchActiveRewardForItem(thread.item_id) : null;
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

  async function confirmCloseConversation() {
    if (!thread) return;
    setCloseOpen(false);
    setActionPending('close');
    try {
      await markThreadStatus(thread.id, 'closed');
      setThread({ ...thread, status: 'closed' });
      toast.show({ kind: 'info', title: 'Conversation closed', body: 'The finder can no longer write in it.' });
    } finally {
      setActionPending(null);
    }
  }

  // Hidden feature (safety tools): conversations no longer carry a finder session id.
  const finderSessionId = (thread as (Thread & { finder_session_id?: string | null }) | null)?.finder_session_id ?? null;

  async function confirmBlockFinder() {
    if (!thread || !finderSessionId) return;
    setBlockOpen(false);
    setActionPending('block');
    try {
      await blockFinderSession({
        householdId: thread.household_id,
        finderSessionId,
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

  const back = { to: '/app/inbox', label: 'Inbox' };

  if (loading) {
    return (
      <AppPage title="Conversation" back={back}>
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the conversation">
          <Skeleton className="h-36 w-full rounded-modal" />
          <Skeleton className="h-48 w-full rounded-modal" />
        </div>
      </AppPage>
    );
  }

  if (error || !thread) {
    return (
      <AppPage title="Conversation" back={back}>
        <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-ink-900">{error ?? "This conversation isn't available"}</h2>
          <p className="max-w-sm text-base text-muted">It may have been deleted with its item.</p>
          <Link to="/app/inbox" className={buttonClasses({ variant: 'secondary', className: 'mt-2' })}>
            Back to Inbox
          </Link>
        </section>
      </AppPage>
    );
  }

  const statusLabel = thread.status === 'reunited' ? 'Back with you' : thread.status === 'closed' ? 'Closed' : null;

  return (
    <AppPage title="Conversation" back={back}>
      {/* What it is about, and what the owner can do with it */}
      <section className="mb-4 overflow-hidden rounded-modal border border-hairline bg-canvas">
        {item ? (
          <Link
            to={`/app/items/${item.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50"
          >
            <ItemThumb src={item.hero_photo_url} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 break-words text-base font-semibold leading-snug text-ink-900">{item.name}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                {statusLabel && (
                  <span className="inline-flex h-6 items-center rounded-pill bg-ink-100 px-2 text-xs font-medium text-ink-700">
                    {statusLabel}
                  </span>
                )}
                Started {relativeTime(thread.created_at)}
              </span>
            </div>
            <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-label="Open item" />
          </Link>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">Started {relativeTime(thread.created_at)}</p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-hairline p-3">
          <button
            type="button"
            onClick={() => setReunitedOpen(true)}
            disabled={!!actionPending || thread.status === 'reunited'}
            className={buttonClasses({ variant: 'success', className: 'flex-1 basis-[8.5rem] px-3' })}
          >
            {actionPending === 'reunited' ? 'Saving…' : thread.status === 'reunited' ? 'Back with you' : 'I have it back'}
          </button>
          <button
            type="button"
            onClick={() => setCloseOpen(true)}
            disabled={!!actionPending || thread.status === 'closed'}
            className={buttonClasses({ variant: 'secondary', className: 'flex-1 basis-[8.5rem] px-3' })}
          >
            {thread.status === 'closed' ? 'Closed' : 'Close conversation'}
          </button>
          {FEATURES.safetyTools && (
            <>
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                disabled={!!actionPending}
                className={buttonClasses({ variant: 'secondary', className: 'flex-1 basis-[8.5rem] px-3' })}
              >
                <Flag size={16} strokeWidth={1.75} aria-hidden />
                Report
              </button>
              <button
                type="button"
                onClick={() => finderSessionId && setBlockOpen(true)}
                disabled={!!actionPending || !finderSessionId}
                className={buttonClasses({ variant: 'danger', className: 'flex-1 basis-[8.5rem] px-3' })}
              >
                <ShieldOff size={16} strokeWidth={1.75} aria-hidden />
                Block this finder
              </button>
            </>
          )}
        </div>
      </section>

      {reportOpen && (
        <ReportForm onClose={() => setReportOpen(false)} onSubmit={handleReport} />
      )}

      <Modal
        open={reunitedOpen}
        onClose={() => setReunitedOpen(false)}
        eyebrow="Back with you"
        title="Do you have it back?"
        description="This marks the conversation as done. You and the finder can still write in it."
        primaryAction={{
          label: 'Yes, I have it',
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
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        eyebrow="Close conversation"
        title="Close this conversation?"
        description="The finder will see that you closed it and can no longer write in it. Use this if the notes are not helpful or not kind."
        primaryAction={{ label: 'Close it', tone: 'destructive', onClick: confirmCloseConversation, pending: actionPending === 'close' }}
        secondaryAction={{ label: 'Cancel', onClick: () => setCloseOpen(false) }}
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

      {/* Thread */}
      <div className="mb-4 rounded-modal border border-hairline bg-canvas p-4">
        <ThreadView messages={messages} viewerKind="owner" />
      </div>

      {/* Composer */}
      <MessageComposer
        label="Reply"
        placeholder="Thank you! Could you leave it at the front desk?"
        maxLength={2000}
        disabled={thread.status === 'closed'}
        onSend={handleSend}
      />

      {/* Privacy strip */}
      <div className="mt-4 flex items-start gap-3 px-1">
        <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <p className="text-sm text-muted text-pretty">
          The finder does not see your name, email or phone number. They read your reply on the
          tag's page. Only share an address or number if you want to.
        </p>
      </div>
    </AppPage>
  );
}
