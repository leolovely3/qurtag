import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, Lock, ShieldOff, Truck } from 'lucide-react';
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
  blockFinder,
  fetchActiveRewardForItem,
  fetchHeldNotes,
  fetchCourierOrderForThread,
  fetchItemById,
  fetchMessagesForThread,
  fetchThreadById,
  markThreadReadByOwner,
  markThreadStatus,
  REPORT_REASONS,
  reportMessage,
  sendOwnerReply,
  showHeldNote,
  type HeldNote,
  type ReportReason,
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

/** Why a note is being reported: one reason and an optional comment. */
function ReportForm({ onSubmit, pending }: { onSubmit: (reason: ReportReason, comment: string) => void; pending: boolean }) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [comment, setComment] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Reason</legend>
        {REPORT_REASONS.map((r) => (
          <label
            key={r.id}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-card border px-3 py-2 ${
              reason === r.id ? 'border-ink-900 bg-ink-50' : 'border-hairline-strong'
            }`}
          >
            <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="mt-1" />
            <span className="flex flex-col">
              <span className="text-base font-medium text-ink-900">{r.label}</span>
              <span className="text-sm text-muted">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink-900">Anything we should know? (optional)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full resize-none rounded-card border border-hairline-strong bg-canvas p-3 text-base text-ink-900 focus:border-ink-900 focus:outline-none"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => onSubmit(reason, comment)}
        className={buttonClasses({ variant: 'primary', className: 'w-full' })}
      >
        {pending ? 'Sending...' : 'Send report'}
      </button>
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
  // The conversation could not be loaded (no signal, server busy): not the same as missing.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [thanks, setThanks] = useState('');
  const [reportedThreat, setReportedThreat] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [offerBlock, setOfferBlock] = useState(false);
  const [held, setHeld] = useState<HeldNote[]>([]);
  const [reunitedOpen, setReunitedOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [releaseRewardOpen, setReleaseRewardOpen] = useState<null | { amountCents: number; rewardId: string }>(null);
  const [courier, setCourier] = useState<CourierOrder | null>(null);
  const [labelPending, setLabelPending] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const toast = useToast();

  const refetchMessages = useCallback(async (tid: string) => {
    const [msgs, heldNotes] = await Promise.all([fetchMessagesForThread(tid), fetchHeldNotes(tid)]);
    setMessages(msgs);
    setHeld(heldNotes);
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
      let t: Thread | null;
      try {
        t = await fetchThreadById(threadId, { throwOnError: true });
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      if (cancelled) return;
      if (!t) {
        setError('That conversation isn\'t in your inbox.');
        setLoading(false);
        return;
      }
      setThread(t);
      const [it, msgs, heldNotes, co] = await Promise.all([
        fetchItemById(t.item_id),
        fetchMessagesForThread(t.id),
        fetchHeldNotes(t.id),
        FEATURES.courier ? fetchCourierOrderForThread(t.id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setItem(it);
      setMessages(msgs);
      setHeld(heldNotes);
      setCourier(co);
      setLoading(false);
      // Mark as read on view.
      void markThreadReadByOwner(t.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, threadId, navigate, attempt]);

  // New notes from the finder: ask again every few seconds while the page is open.
  usePoll(async () => {
    if (!threadId) return;
    const [t, msgs, heldNotes] = await Promise.all([fetchThreadById(threadId), fetchMessagesForThread(threadId), fetchHeldNotes(threadId)]);
    if (t) setThread(t);
    setHeld(heldNotes);
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
      const note = thanks.trim();
      if (note && thread.status === 'open') {
        const sent = await sendOwnerReply({ threadId: thread.id, body: note });
        if (!sent) {
          toast.show({ kind: 'error', title: "Couldn't send your thank-you", body: 'Check your connection and try again.' });
          return;
        }
        setThanks('');
        await refetchMessages(thread.id);
      }
      await markThreadStatus(thread.id, 'reunited');
      setThread({ ...thread, status: 'reunited' });
      toast.show({ kind: 'success', title: 'Marked as back with you', body: 'The finder sees that you have it back. You can still write to them here.' });
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
      toast.show({ kind: 'info', title: 'Conversation closed', body: 'The finder sees that it has ended and can no longer write in it.' });
    } finally {
      setActionPending(null);
    }
  }

  async function confirmBlockFinder() {
    if (!thread) return;
    setBlockOpen(false);
    setOfferBlock(false);
    setActionPending('block');
    try {
      const ok = await blockFinder(thread.id);
      if (!ok) {
        toast.show({ kind: 'error', title: "Couldn't block this finder", body: 'Check your connection and try again.' });
        return;
      }
      toast.show({
        kind: 'info',
        title: 'Finder blocked',
        body: 'This conversation is closed to them. To stop all new notes, switch the tag off in Tags. You can unblock them in Settings.',
      });
      navigate('/app/inbox');
    } finally {
      setActionPending(null);
    }
  }

  async function handleShowHeld(messageId: string) {
    if (!thread) return;
    if (await showHeldNote(messageId)) await refetchMessages(thread.id);
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

  async function handleReport(reason: ReportReason, comment: string) {
    if (!thread || !reportFor) return;
    setActionPending('report');
    try {
      const r = await reportMessage({ messageId: reportFor, reason, comment });
      if (!r.ok) {
        toast.show({ kind: 'error', title: "Couldn't send your report", body: 'Check your connection and try again.' });
        return;
      }
      setReportFor(null);
      if (reason === 'threats') setReportedThreat(true);
      await refetchMessages(thread.id);
      toast.show({ kind: 'success', title: 'Reported and hidden', body: 'We review every report within 24 hours.' });
      setOfferBlock(true);
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

  if (loadFailed) {
    return (
      <AppPage title="Conversation" back={back}>
        <section role="alert" className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-ink-900">We could not load this conversation</h2>
          <p className="max-w-sm text-base text-muted">Check your connection and try again. Nothing has been deleted.</p>
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
            className={buttonClasses({ variant: 'primary', className: 'mt-2' })}
          >
            Try again
          </button>
        </section>

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
  const ownerReplied = messages.some((m) => m.sender_kind === 'owner');

  return (
    <AppPage title="Conversation" back={back}>
      {/* What it is about, and what the owner can do with it */}
      <section className="mb-4 overflow-hidden rounded-modal border border-hairline bg-canvas">
        {item ? (
          <Link
            to={`/app/items/${item.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50 ax:flex-wrap"
          >
            <ItemThumb src={item.hero_photo_url} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 ax:order-last ax:basis-full">
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
            <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300 ax:ml-auto" aria-label="Open item" />
          </Link>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">Started {relativeTime(thread.created_at)}</p>
        )}
      </section>

      {(held.length > 0 || reportedThreat) && (
        <aside role="note" className="mb-4 flex flex-col gap-1 rounded-modal border border-signal-300 bg-signal-50 p-4">
          <h2 className="text-base font-semibold text-ink-900">If a note threatens you or a child</h2>
          <p className="text-sm text-ink-900 text-pretty">
            Do not meet alone and do not share your address. If you feel unsafe, contact your local police
            (call 911 in an emergency). Report the note so we can review it within 24 hours, and block the
            finder below.
          </p>
        </aside>
      )}

      {/* Thread */}
      <div className="mb-4 rounded-modal border border-hairline bg-canvas p-4">
        <ThreadView
          messages={messages}
          viewerKind="owner"
          held={held}
          onShowHeld={(id) => void handleShowHeld(id)}
          onReport={(id) => setReportFor(id)}
        />
      </div>

      {/* Composer */}
      <MessageComposer
        label="Reply"
        placeholder="Thank you! Could you leave it at the front desk?"
        maxLength={2000}
        disabled={thread.status === 'closed'}
        onSend={handleSend}
      />

      {thread.status === 'open' && ownerReplied && (
        <button
          type="button"
          onClick={() => setReunitedOpen(true)}
          disabled={!!actionPending}
          className={buttonClasses({ variant: 'success', block: true, className: 'mt-4' })}
        >
          {actionPending === 'reunited' ? 'Saving…' : 'I have it back'}
        </button>
      )}

      <Modal
        open={reportFor !== null}
        onClose={() => setReportFor(null)}
        title="Report this note"
        description="The note is hidden from you right away. We review every report within 24 hours, and you can also block this finder."
      >
        <ReportForm onSubmit={handleReport} pending={actionPending === 'report'} />
      </Modal>

      <Modal
        open={offerBlock}
        onClose={() => setOfferBlock(false)}
        title="Block this finder too?"
        description="That conversation will be closed to them, and their notes leave your inbox. You can unblock them in Settings."
        primaryAction={{ label: 'Block this finder', tone: 'destructive', onClick: confirmBlockFinder, pending: actionPending === 'block' }}
        secondaryAction={{ label: 'Not now', onClick: () => setOfferBlock(false) }}
      />

      <Modal
        open={reunitedOpen}
        onClose={() => setReunitedOpen(false)}
        eyebrow="Back with you"
        title="Do you have it back?"
        description="The finder's page will say that you have it back and thank them. You can both still write here."
        primaryAction={{
          label: 'Yes, I have it',
          onClick: confirmReunited,
          pending: actionPending === 'reunited',
        }}
        secondaryAction={{ label: 'Not yet', onClick: () => setReunitedOpen(false) }}
      >
        {thread.status === 'open' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink-900">Add a thank-you for the finder (optional)</span>
            <input
              type="text"
              value={thanks}
              onChange={(e) => setThanks(e.target.value.slice(0, 280))}
              maxLength={280}
              placeholder="Thank you so much for your help!"
              className="min-h-11 w-full rounded-card border border-hairline-strong bg-canvas px-3 text-base text-ink-900 focus:border-ink-900 focus:outline-none"
            />
          </label>
        )}
      </Modal>

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
        eyebrow="Close to this finder"
        title="Close this conversation to the finder?"
        description="The finder sees that the conversation has ended and can no longer write in it. Use this if the notes are not helpful or not kind. If you have your thing back, choose I have it back instead."
        primaryAction={{ label: 'Close it', tone: 'destructive', onClick: confirmCloseConversation, pending: actionPending === 'close' }}
        secondaryAction={{ label: 'Cancel', onClick: () => setCloseOpen(false) }}
      />

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        eyebrow="Block this finder"
        title="Block this finder from contacting you again?"
        description="This conversation is closed to them and their notes leave your inbox. They are only told that the conversation is closed. If they scan the tag again from another phone or browser, they could start a new conversation; to stop all new notes, switch the tag off in Tags. You can unblock them in Settings."
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

      {/* Less common actions, at the end so the note and the reply come first */}
      <section aria-labelledby="thread-more" className="mt-6 flex flex-col gap-2 rounded-modal border border-hairline bg-paper p-4">
        <h2 id="thread-more" className="text-sm font-semibold text-ink-700">More</h2>
        {thread.status === 'open' && !ownerReplied && (
          <button
            type="button"
            onClick={() => setReunitedOpen(true)}
            disabled={!!actionPending}
            className={buttonClasses({ variant: 'secondary', block: true })}
          >
            I have it back
          </button>
        )}
        {thread.status === 'open' && (
          <button
            type="button"
            onClick={() => setCloseOpen(true)}
            disabled={!!actionPending}
            className={buttonClasses({ variant: 'secondary', block: true })}
          >
            Close to this finder
          </button>
        )}
        <button
          type="button"
          onClick={() => setBlockOpen(true)}
          disabled={!!actionPending}
          className={buttonClasses({ variant: 'secondary', block: true, className: 'text-signal-700' })}
        >
          <ShieldOff size={16} strokeWidth={1.75} aria-hidden />
          Block this finder
        </button>
      </section>

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
