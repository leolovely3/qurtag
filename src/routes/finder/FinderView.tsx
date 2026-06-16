import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  MapPin,
  Building2,
  Truck,
  Lock,
  Sparkles,
  ShieldCheck,
  Info,
  X,
  Plane,
} from 'lucide-react';
import { Display, Eyebrow, Lede } from '@/components/brand/Typography';
import { Button } from '@/components/ui/Button';
import { MessageComposer } from '@/components/ui/MessageComposer';
import { ThreadView } from '@/components/ui/ThreadView';
import { Input } from '@/components/ui/Input';
import {
  createThread,
  fetchActiveTripForItem,
  fetchItemById,
  fetchMessagesForThread,
  fetchTagByPublicId,
  fetchThreadById,
  recordScan,
  sendMessage,
  createCourierOrder,
} from '@/lib/queries';
import {
  getOrCreateFinderSession,
  recallThreadForTag,
  rememberThreadForTag,
} from '@/lib/finderSession';
import { useThreadRealtime, useThreadStatusRealtime } from '@/lib/realtime';
import { reverseGeocode } from '@/lib/mapbox';
import { encodeSystemPayload } from '@/lib/systemMessages';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Item, Message, Tag, Trip } from '@/lib/database.types';
import { cn } from '@/lib/cn';

type FinderItem = Pick<
  Item,
  | 'id'
  | 'household_id'
  | 'name'
  | 'brand'
  | 'hero_photo_url'
  | 'lost_mode'
  | 'reward_amount_cents'
>;

const DEMO_TAG: Tag = {
  id: 'demo-tag',
  public_id: 'demo',
  household_id: 'demo-household',
  current_item_id: 'demo-item',
  hardware_tier: 'printable',
  status: 'active',
  activated_at: new Date('2026-06-10T09:00:00Z').toISOString(),
  created_at: new Date('2026-06-10T09:00:00Z').toISOString(),
};

const DEMO_ITEM: FinderItem = {
  id: 'demo-item',
  household_id: 'demo-household',
  name: 'Rimowa Original Cabin',
  brand: 'Rimowa',
  hero_photo_url: null,
  lost_mode: true,
  reward_amount_cents: 7500,
};

function centsToUSD(cents: number | null | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function FinderView() {
  const { tagId: publicId } = useParams();
  const [tag, setTag] = useState<Tag | null>(null);
  const [item, setItem] = useState<FinderItem | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sharingLocation, setSharingLocation] = useState(false);
  const [courierOpen, setCourierOpen] = useState(false);

  const refetchMessages = useCallback(async (tid: string) => {
    const msgs = await fetchMessagesForThread(tid);
    setMessages(msgs);
  }, []);

  useEffect(() => {
    if (!publicId) return;
    let cancelled = false;

    if (publicId === 'demo' || !isSupabaseConfigured) {
      setIsDemo(true);
      setTag(DEMO_TAG);
      setItem(DEMO_ITEM);
      setLoading(false);
      return;
    }

    (async () => {
      const t = await fetchTagByPublicId(publicId);
      if (cancelled) return;
      setTag(t);

      if (t?.current_item_id) {
        const i = await fetchItemById(t.current_item_id);
        if (cancelled) return;
        setItem(i);
        void recordScan({ tagId: t.id, itemId: i?.id });
        if (i) {
          const tr = await fetchActiveTripForItem(i.id);
          if (!cancelled) setTrip(tr);
        }
      } else if (t) {
        void recordScan({ tagId: t.id });
      }

      const remembered = recallThreadForTag(publicId);
      if (remembered) {
        const thread = await fetchThreadById(remembered);
        if (cancelled) return;
        if (thread) {
          setThreadId(thread.id);
          const msgs = await fetchMessagesForThread(thread.id);
          if (cancelled) return;
          setMessages(msgs);
        } else {
          rememberThreadForTag(publicId, '');
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  useThreadRealtime(
    threadId,
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
    }, []),
  );

  // Status flips (owner marks reunited / closed) propagate live.
  useThreadStatusRealtime(
    threadId,
    useCallback((updated) => {
      // We don't store the full thread on the finder side, but a status flip
      // is worth refreshing the message list so any new system message
      // (reunited celebration card) lands immediately.
      if (threadId) void refetchMessages(threadId);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      updated;
    }, [threadId, refetchMessages]),
  );

  const reward = useMemo(() => centsToUSD(item?.reward_amount_cents), [item]);
  const lostMode = item?.lost_mode ?? false;

  /**
   * Ensure a thread exists for this tag/item. Stores the id in localStorage
   * so subsequent visits resume the same conversation.
   */
  const ensureThread = useCallback(async (): Promise<string | null> => {
    if (threadId) return threadId;
    if (!tag || !item || !publicId) return null;
    const sessionId = await getOrCreateFinderSession();
    const created = await createThread({
      itemId: item.id,
      householdId: item.household_id,
      tagId: tag.id,
      finderSessionId: sessionId,
    });
    if (!created) return null;
    setThreadId(created.id);
    rememberThreadForTag(publicId, created.id);
    return created.id;
  }, [tag, item, publicId, threadId]);

  const handleSend = useCallback(
    async (body: string) => {
      setError(null);
      if (isDemo) {
        setError("This is a demo tag. Messages aren't delivered.");
        return;
      }
      if (!tag || !item) {
        setError("Hang on. We're still loading.");
        return;
      }
      const tid = await ensureThread();
      if (!tid) {
        setError("Couldn't open the conversation. Try again in a moment.");
        return;
      }
      const sent = await sendMessage({ threadId: tid, senderKind: 'finder', body });
      if (!sent) {
        setError("Couldn't send your note. Try again in a moment.");
        return;
      }
      await refetchMessages(tid);
    },
    [tag, item, isDemo, ensureThread, refetchMessages],
  );

  const handleShareLocation = useCallback(async () => {
    setError(null);
    if (isDemo) {
      setError("Demo tag. Location won't be sent.");
      return;
    }
    if (!('geolocation' in navigator)) {
      setError("Your browser doesn't support location sharing.");
      return;
    }
    setSharingLocation(true);
    try {
      const tid = await ensureThread();
      if (!tid) {
        setError("Couldn't open the conversation. Try again in a moment.");
        return;
      }
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
        );
      });
      const place = await reverseGeocode(coords.latitude, coords.longitude);
      await sendMessage({
        threadId: tid,
        senderKind: 'finder',
        body: encodeSystemPayload({
          type: 'location',
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          label: place?.label ?? undefined,
        }),
      });
      await refetchMessages(tid);
    } catch (e) {
      const err = e as GeolocationPositionError;
      if (err?.code === 1) setError('You denied location access.');
      else if (err?.code === 2) setError("We couldn't get a location fix.");
      else if (err?.code === 3) setError('Location timed out. Try again.');
      else setError("Couldn't share your location.");
    } finally {
      setSharingLocation(false);
    }
  }, [isDemo, ensureThread, refetchMessages]);

  const handleCourierSubmit = useCallback(
    async (input: { addressLine: string; city: string; pickupWindow: string }) => {
      setError(null);
      if (isDemo) {
        setError("Demo tag. Courier requests aren't sent.");
        return;
      }
      if (!tag || !item) return;
      const tid = await ensureThread();
      if (!tid) return;
      await createCourierOrder({
        threadId: tid,
        itemId: item.id,
        householdId: item.household_id,
        addressLine: input.addressLine,
        city: input.city,
        pickupWindow: input.pickupWindow,
      });
      // System message in the thread. The owner's address-blind preview.
      await sendMessage({
        threadId: tid,
        senderKind: 'finder',
        body: encodeSystemPayload({
          type: 'courier_request',
          pickupWindow: input.pickupWindow,
          city: input.city || null,
          label: null, // we don't leak the full address into the owner's view
        }),
      });
      await refetchMessages(tid);
      setCourierOpen(false);
    },
    [tag, item, isDemo, ensureThread, refetchMessages],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
      </div>
    );
  }

  if (!tag) {
    return (
      <div className="flex flex-col gap-cairn-5 py-cairn-8">
        <Eyebrow>Tag not found</Eyebrow>
        <Display level={2}>This tag isn't registered.</Display>
        <Lede>
          If you got here from a printed tag, it may have been replaced or deactivated. Try the URL
          on the tag again, or write to us. We'll help reunite this with its owner.
        </Lede>
        <Link to="/help" className="link-arrow text-body mt-2">
          Talk to a human →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cairn-5">
      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium',
            lostMode ? 'bg-signal-50 text-signal-700' : 'bg-ink-50 text-muted',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              lostMode ? 'bg-signal-500 animate-cairn-pulse' : 'bg-ink-300',
            )}
          />
          {lostMode ? 'This is missing' : `Tag · ${tag.public_id}`}
        </span>
        {isDemo && <span className="text-caption text-muted">· Demo</span>}
      </div>

      {/* Hero */}
      <div className="flex flex-col gap-3">
        <Display level={2} className="text-pretty">
          {messages.length > 0
            ? 'Your conversation with the owner.'
            : lostMode
              ? 'You found something someone is missing.'
              : 'You found a tagged item.'}
        </Display>
        <Lede className="text-pretty">
          {messages.length > 0
            ? "Replies land here in real time. QurTag keeps both sides private. Nobody sees a phone, email, or address."
            : lostMode
              ? "Send a quick note below. The owner is told the moment you do. They never see your phone, email, or address, and you never see theirs."
              : 'Send a quick note below. QurTag passes it to the owner without exposing either of you.'}
        </Lede>
      </div>

      {/* Trip context */}
      {trip && (
        <div className="rounded-modal border border-hairline bg-canvas p-cairn-3 flex items-start gap-3">
          <div className="size-9 rounded-pill bg-ink-50 grid place-items-center shrink-0">
            <Plane size={16} strokeWidth={1.75} className="text-ink-900" />
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow>On a trip</Eyebrow>
            <p className="text-body text-ink-900 font-medium mt-0.5 truncate">
              {trip.flight_number ?? trip.name}
              {trip.origin_iata && trip.destination_iata && (
                <span className="text-muted font-normal">
                  {' '}· {trip.origin_iata} → {trip.destination_iata}
                </span>
              )}
            </p>
            {(trip.live_status || trip.scheduled_arrival) && (
              <p className="text-caption text-muted">
                {trip.live_status ?? 'Scheduled'}
                {trip.scheduled_arrival && ` · arrives ${new Date(trip.scheduled_arrival).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Item card */}
      {(item?.name || item?.brand) && (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-5 flex items-start gap-cairn-3">
          {item.hero_photo_url ? (
            <img
              src={item.hero_photo_url}
              alt=""
              className="size-16 rounded-card object-cover bg-ink-100 shrink-0"
            />
          ) : (
            <div className="size-16 rounded-card bg-ink-100 grid place-items-center shrink-0">
              <Sparkles size={20} strokeWidth={1.5} className="text-muted" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Eyebrow>The item</Eyebrow>
            {item.name ? (
              <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] mt-0.5 text-balance">
                {item.name}
              </h2>
            ) : (
              <p className="text-body text-ink-900 font-medium mt-0.5">{item.brand}</p>
            )}
            {item.brand && item.name && (
              <p className="text-caption text-muted mt-0.5">{item.brand}</p>
            )}
          </div>
        </div>
      )}

      {/* Payout setup. Only when a reward exists and we have a thread */}
      {threadId && reward && (
        <FinderPayoutSetup threadId={threadId} publicId={publicId ?? ''} />
      )}

      {/* Reward */}
      {reward && (
        <aside className="rounded-modal bg-ink-950 text-ink-50 p-cairn-5 flex items-start gap-cairn-3 overflow-hidden relative">
          <div
            className="absolute -top-12 -right-12 size-48 rounded-full opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, #FF5C2E, transparent)' }}
            aria-hidden
          />
          <div className="size-10 rounded-pill bg-signal-500 grid place-items-center shrink-0 relative">
            <ShieldCheck size={18} strokeWidth={1.75} className="text-canvas" />
          </div>
          <div className="flex-1 relative">
            <Eyebrow className="text-ink-200">Reward offered</Eyebrow>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display font-semibold text-h3 tracking-[-0.022em] text-ink-50">
                {reward}
              </span>
              <span className="text-caption text-ink-300">in escrow</span>
            </div>
            <p className="text-caption text-ink-200 mt-1 text-pretty">
              Held by QurTag. Released to you the moment the owner confirms this is back. No payment
              details exchanged.
            </p>
          </div>
        </aside>
      )}

      {/* Thread view */}
      {messages.length > 0 && (
        <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
          <Eyebrow>Conversation</Eyebrow>
          <ThreadView messages={messages} viewerKind="finder" />
        </div>
      )}

      {/* Composer */}
      <div className="flex flex-col gap-2">
        <MessageComposer
          label={messages.length > 0 ? 'Add to the note' : 'Send a quick note'}
          placeholder={
            messages.length > 0
              ? 'A short reply…'
              : 'I have your bag. Where should I leave it?'
          }
          onSend={handleSend}
        />
        {isDemo && (
          <div className="rounded-card bg-paper border border-hairline p-3 flex items-start gap-2">
            <Info size={14} strokeWidth={1.75} className="mt-0.5 text-muted shrink-0" />
            <p className="text-caption text-muted">
              This is a demo tag. Your note won't be delivered. Register an item first.
            </p>
          </div>
        )}
        {error && (
          <p className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">{error}</p>
        )}
      </div>

      {/* Secondary actions */}
      <div className="flex flex-col gap-2">
        <Eyebrow>Other ways to help</Eyebrow>
        <div className="grid sm:grid-cols-3 gap-2">
          <Button
            size="md"
            variant="secondary"
            className="w-full justify-start"
            disabled={sharingLocation}
            onClick={handleShareLocation}
          >
            <MapPin size={16} strokeWidth={1.75} />
            {sharingLocation ? 'Sharing…' : 'Share location'}
          </Button>
          <Button size="md" variant="secondary" className="w-full justify-start" disabled>
            <Building2 size={16} strokeWidth={1.75} />
            Drop at a partner
          </Button>
          <Button
            size="md"
            variant="secondary"
            className="w-full justify-start"
            onClick={() => setCourierOpen(true)}
          >
            <Truck size={16} strokeWidth={1.75} />
            Request a courier
          </Button>
        </div>
      </div>

      {/* Courier inline form */}
      {courierOpen && (
        <CourierForm
          onClose={() => setCourierOpen(false)}
          onSubmit={handleCourierSubmit}
          disabled={isDemo}
        />
      )}

      {/* Privacy strip */}
      <div className="rounded-card bg-paper border border-hairline p-cairn-3 flex items-start gap-3">
        <Lock size={16} strokeWidth={1.75} className="mt-0.5 text-ink-900 shrink-0" />
        <p className="text-caption text-ink-700 text-pretty">
          Your number, email, and address stay private. The owner's stay private too. QurTag passes
          notes between you and closes the channel when this is home.
        </p>
      </div>
    </div>
  );
}

/* ─────────────── Finder payout setup ─────────────── */

import { startFinderPayoutOnboarding } from '@/lib/stripe';

interface FinderPayoutSetupProps {
  threadId: string;
  publicId: string;
}

function FinderPayoutSetup({ threadId: _threadId, publicId }: FinderPayoutSetupProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const sessionId = await getOrCreateFinderSession();
      const result = await startFinderPayoutOnboarding({
        finderSessionId: sessionId,
        email: email.trim() || undefined,
        returnTag: publicId,
      });
      if (!result.ok) {
        setError(
          result.error ??
            "Couldn't start payout onboarding. The Edge Function may not be deployed yet.",
        );
      } else {
        setDone(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return null;

  return (
    <div className="rounded-modal border border-hairline bg-paper p-cairn-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-pill bg-signal-500 grid place-items-center shrink-0">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-canvas" />
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow>Get paid for finding this</Eyebrow>
          <p className="text-caption text-ink-700 text-pretty">
            The owner offered a reward. Set up a Stripe payout (it takes 2 minutes) and the funds
            land in your bank the moment the bag is back.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 mt-1">
        <input
          type="email"
          placeholder="Your email for payout"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 h-10 rounded-pill border border-hairline-strong bg-canvas px-4 text-caption text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-cairn"
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 disabled:opacity-50 transition-colors duration-cairn"
        >
          {submitting ? 'Opening Stripe…' : 'Set up payout'}
        </button>
      </form>
      {error && (
        <p className="text-caption text-signal-700 text-pretty">{error}</p>
      )}
    </div>
  );
}

/* ─────────────── Courier inline form ─────────────── */

interface CourierFormProps {
  onClose: () => void;
  onSubmit: (input: { addressLine: string; city: string; pickupWindow: string }) => Promise<void>;
  disabled?: boolean;
}

function CourierForm({ onClose, onSubmit, disabled }: CourierFormProps) {
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [pickupWindow, setPickupWindow] = useState('Today, after 5pm');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Request a courier</Eyebrow>
          <p className="text-body text-ink-900 font-medium mt-1">
            We'll generate a prepaid label and email it to you.
          </p>
          <p className="text-caption text-muted mt-0.5 text-pretty">
            The owner pays for shipping. Your address stays private from them. QurTag handles the
            handoff.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-cairn"
          aria-label="Close"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({ addressLine: addressLine.trim(), city: city.trim(), pickupWindow });
          } finally {
            setSubmitting(false);
          }
        }}
        className="flex flex-col gap-3"
      >
        <Input
          name="addressLine"
          label="Pickup address"
          placeholder="123 Main St, Apt 4B"
          required
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
        />
        <Input
          name="city"
          label="City"
          placeholder="Boston, MA"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-900">Pickup window</span>
          <select
            value={pickupWindow}
            onChange={(e) => setPickupWindow(e.target.value)}
            className="h-12 rounded-card border border-hairline-strong bg-canvas px-4 text-body text-ink-900 focus:outline-none focus:border-ink-900 transition-colors duration-cairn"
          >
            <option>Today, after 5pm</option>
            <option>Tomorrow morning</option>
            <option>Tomorrow afternoon</option>
            <option>This weekend</option>
            <option>Whenever convenient</option>
          </select>
        </label>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-caption text-muted">
            Live carrier integration is wired in [docs/SETUP.md](docs/SETUP.md).
          </p>
          <button
            type="submit"
            disabled={!addressLine || submitting || disabled}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-cairn"
          >
            {submitting ? 'Requesting…' : 'Request pickup'}
          </button>
        </div>
      </form>
    </div>
  );
}
