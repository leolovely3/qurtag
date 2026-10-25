import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Clock, MapPin, Printer, RefreshCw, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { AppPage, AppSection } from '@/components/layout/AppPage';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { PhotoUploader } from '@/components/ui/PhotoUploader';
import { LostModeToggle } from '@/components/ui/LostModeToggle';
import { RewardPicker } from '@/components/ui/RewardPicker';
import { useAuth } from '@/lib/auth';
import {
  createPendingReward,
  deleteItem,
  fetchActiveRewardForItem,
  fetchItemById,
  fetchPrimaryHouseholdId,
  fetchScansForItem,
  fetchTags,
  replaceTag,
  updateItem,
} from '@/lib/queries';
import { FEATURES } from '@/lib/features';
import { fetchMembership } from '@/lib/membership';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { Modal } from '@/components/ui/Modal';
import { issueGoogleWalletPass, startStripeCheckout } from '@/lib/stripe';
import { useToast } from '@/components/ui/Toast';
import type { Item, Reward, Scan, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/tagLayout';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function centsToUSD(cents: number | null | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function centsToUSDDisplay(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function RewardStateBadge({ state }: { state: Reward['state'] }) {
  const map: Record<Reward['state'], { label: string; cls: string }> = {
    pending: { label: 'Awaiting payment', cls: 'bg-ink-50 text-muted' },
    held: { label: 'In escrow', cls: 'bg-verdigris-100 text-verdigris-700' },
    released: { label: 'Released', cls: 'bg-verdigris-500 text-canvas' },
    refunded: { label: 'Refunded', cls: 'bg-ink-50 text-muted' },
    failed: { label: 'Failed', cls: 'bg-signal-50 text-signal-700' },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-caption font-medium ${cls}`}>
      {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function ItemDetail() {
  const memberships = useMembershipsAvailable();
  const { itemId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [item, setItem] = useState<Item | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [limitedHistory, setLimitedHistory] = useState(false);
  const [showAllScans, setShowAllScans] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [escrowPending, setEscrowPending] = useState(false);
  const [escrowError, setEscrowError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const toast = useToast();

  async function confirmDelete() {
    if (!itemId) return;
    setDeletePending(true);
    const result = await deleteItem(itemId);
    setDeletePending(false);
    if (result.ok) {
      toast.show({ kind: 'success', title: 'Item deleted', body: 'Tags assigned to this item were freed.' });
      navigate('/app/items', { replace: true });
    } else {
      toast.show({ kind: 'error', title: "Couldn't delete the item", body: result.error });
      setDeleteOpen(false);
    }
  }

  // Editable fields
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [rewardText, setRewardText] = useState('');
  const [notes, setNotes] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lostMode, setLostMode] = useState(false);
  const [lostPending, setLostPending] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    if (!itemId) return;

    let cancelled = false;
    (async () => {
      const [hh, it] = await Promise.all([fetchPrimaryHouseholdId(), fetchItemById(itemId)]);
      if (cancelled) return;
      setHouseholdId(hh);
      setItem(it);
      if (it) {
        setName(it.name);
        setBrand(it.brand ?? '');
        setDeclaredValue(it.declared_value_cents != null ? String(it.declared_value_cents / 100) : '');
        setNotes(it.notes ?? '');
        setRewardText(it.reward_text ?? '');
        setLostMode(it.lost_mode);
      }
      if (hh) {
        const tags = await fetchTags(hh);
        if (cancelled) return;
        setTag(tags.find((t) => t.current_item_id === itemId && t.status === 'active') ?? null);
      }
      const [sc, rw, ms] = await Promise.all([
        fetchScansForItem(itemId),
        FEATURES.rewards ? fetchActiveRewardForItem(itemId) : Promise.resolve(null),
        fetchMembership(),
      ]);
      if (cancelled) return;
      setReadOnly(!!ms?.read_only_item_ids.includes(itemId));
      setLimitedHistory(!!it && ms?.items_plan === 'free');
      setScans(sc);
      setReward(rw);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, itemId, navigate]);

  // Debounced auto-save for the editable text fields
  const queueSave = useCallback(
    (patch: Partial<Item>) => {
      if (!itemId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        const updated = await updateItem(itemId, patch);
        if (updated) {
          setItem(updated);
          setSaveState('saved');
          setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1400);
        } else {
          setSaveState('error');
        }
      }, 600);
    },
    [itemId],
  );

  useEffect(() => {
    if (!item) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === item.name) return;
    queueSave({ name: trimmed });
  }, [name, item, queueSave]);

  useEffect(() => {
    if (!item) return;
    const value = brand.trim() || null;
    if (value === item.brand) return;
    queueSave({ brand: value });
  }, [brand, item, queueSave]);

  useEffect(() => {
    if (!item || !FEATURES.insurancePacket) return;
    const cents = declaredValue && !Number.isNaN(Number(declaredValue))
      ? Math.round(Number(declaredValue) * 100)
      : null;
    if (cents === item.declared_value_cents) return;
    queueSave({ declared_value_cents: cents });
  }, [declaredValue, item, queueSave]);

  useEffect(() => {
    if (!item) return;
    const value = notes.trim() || null;
    if (value === item.notes) return;
    queueSave({ notes: value });
  }, [notes, item, queueSave]);

  useEffect(() => {
    if (!item) return;
    const value = rewardText.trim() || null;
    if (value === item.reward_text) return;
    queueSave({ reward_text: value });
  }, [rewardText, item, queueSave]);

  async function onReplaceTag() {
    if (!itemId) return;
    setReplacing(true);
    const next = await replaceTag(itemId);
    setReplacing(false);
    setReplaceOpen(false);
    if (!next) {
      toast.show({ kind: 'error', title: "Couldn't make a new tag", body: 'Try again in a moment.' });
      return;
    }
    navigate(`/app/tags/${next.tagId}/print`);
  }

  async function onToggleLostMode(next: boolean) {
    if (!itemId) return;
    setLostMode(next); // optimistic
    setLostPending(true);
    const updated = await updateItem(itemId, { lost_mode: next });
    setLostPending(false);
    if (updated) {
      setItem(updated);
    } else {
      // Roll back on failure.
      setLostMode(!next);
    }
  }

  async function onChangeReward(cents: number | null) {
    if (!itemId) return;
    const updated = await updateItem(itemId, { reward_amount_cents: cents } as Partial<Item>);
    if (updated) setItem(updated);
  }

  async function onActivateEscrow() {
    setEscrowError(null);
    if (!item || !householdId) return;
    if (!item.reward_amount_cents || item.reward_amount_cents <= 0) {
      setEscrowError('Pick a reward amount first.');
      return;
    }
    setEscrowPending(true);
    const created = await createPendingReward({
      itemId: item.id,
      householdId,
      amountCents: item.reward_amount_cents,
    });
    if (!created) {
      setEscrowPending(false);
      setEscrowError("Couldn't create the reward. Try again.");
      return;
    }
    setReward(created);
    const checkout = await startStripeCheckout('create-reward-hold', {
      rewardId: created.id,
      itemId: item.id,
      amountCents: item.reward_amount_cents,
    });
    setEscrowPending(false);
    if (!checkout.ok) {
      setEscrowError(
        checkout.error ??
          "Couldn't start Stripe Checkout. Deploy the create-reward-hold Edge Function. See docs/SETUP.md.",
      );
    }
  }

  async function onChangePhoto(url: string | null) {
    if (!itemId) return;
    const updated = await updateItem(itemId, { hero_photo_url: url });
    if (updated) setItem(updated);
  }

  const value = useMemo(() => centsToUSD(item?.declared_value_cents), [item]);

  const back = { to: '/app', label: 'Items' };

  if (loading) {
    return (
      <AppPage title="Item" back={back}>
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the item">
          <Skeleton className="h-20 w-full rounded-modal" />
          <Skeleton className="h-36 w-full rounded-modal" />
          <Skeleton className="h-56 w-full rounded-modal" />
        </div>
      </AppPage>
    );
  }

  if (!item) {
    return (
      <AppPage title="Item" back={back}>
        <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-ink-900">We couldn't find that item</h2>
          <p className="max-w-sm text-base text-muted">It may have been deleted, or it isn't in your account.</p>
          <Link to="/app" className={buttonClasses({ variant: 'secondary', className: 'mt-2' })}>
            Back to Items
          </Link>
        </section>
      </AppPage>
    );
  }

  return (
    <AppPage title={name.trim() || 'Item'} back={back} action={<SaveBadge state={saveState} />}>
      <div className="flex flex-col gap-6">
        {readOnly && (
          <p role="status" className="rounded-card bg-ink-100 px-4 py-3 text-sm text-ink-700 text-pretty">
            This item is over your plan's limit, so it is read-only: you can see it, print its tag and delete it,
            but not change it. Finders can still scan its tag and write to you, and you can still reply.
            {memberships && (
              <>
                {' '}
                <Link to="/app/membership" className="font-medium text-ink-900 underline underline-offset-4">See plans</Link>
              </>
            )}
          </p>
        )}
        {/* A read-only item (over the plan's limit) cannot be changed. */}
        <fieldset disabled={readOnly} className="contents">
          <LostModeToggle value={lostMode} pending={lostPending} onChange={onToggleLostMode} />
        </fieldset>

        {/* The tag */}
        <AppSection title="Tag">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-[44px] shrink-0 place-items-center rounded-card bg-ink-100 ax:hidden">
                <TagIcon size={20} strokeWidth={1.75} className="text-ink-900" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-ink-900">
                  {tag ? tag.short_code ? <>Tag <span className="font-mono text-[0.9375rem]">{shortAddress(tag.short_code)}</span></> : 'Your tag' : 'No working tag'}
                </span>
                <span className="text-sm text-muted">
                  {tag ? `Made ${relativeTime(tag.activated_at)}` : 'Make a new tag to print.'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {tag && (
                <Link to={`/app/tags/${tag.id}/print`} className={buttonClasses({ variant: 'primary', className: 'flex-1 basis-[9rem]' })}>
                  <Printer size={16} strokeWidth={1.75} aria-hidden />
                  Print tag
                </Link>
              )}
              <button
                type="button"
                onClick={() => (tag ? setReplaceOpen(true) : void onReplaceTag())}
                disabled={replacing || readOnly}
                className={buttonClasses({ variant: tag ? 'secondary' : 'primary', className: 'flex-1 basis-[9rem]' })}
              >
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
                {tag ? 'New code' : 'Make a tag'}
              </button>
            </div>
          </div>
        </AppSection>

        {/* What a finder sees */}
        <fieldset disabled={readOnly} className="contents">
        <AppSection title="What a finder sees" description="Do not put your phone number or address in these.">
          <div className="flex flex-col gap-5 p-4">
            <Input
              name="name"
              label="Name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <PhotoUploader householdId={householdId} value={item.hero_photo_url} onChange={onChangePhoto} />
            <Input
              id="reward-text"
              name="rewardText"
              label="A word for the finder (optional)"
              placeholder="A small thank-you if you get it back to me"
              maxLength={140}
              value={rewardText}
              onChange={(e) => setRewardText(e.target.value)}
              hint='For example "Coffee on me as a thank-you" or "Please hand in at the school office".'
            />
          </div>
        </AppSection>

          {FEATURES.rewards && lostMode && (
            <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <Eyebrow>Reward (optional)</Eyebrow>
                {reward && (
                  <RewardStateBadge state={reward.state} />
                )}
              </div>
              <RewardPicker
                valueCents={item.reward_amount_cents ?? null}
                onChange={onChangeReward}
                disabled={!!reward && reward.state === 'held'}
              />
              {item.reward_amount_cents && item.reward_amount_cents > 0 && !reward && (
                <button
                  type="button"
                  onClick={onActivateEscrow}
                  disabled={escrowPending}
                  className="self-start inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
                >
                  {escrowPending ? 'Opening Stripe…' : `Place ${centsToUSDDisplay(item.reward_amount_cents)} in escrow`}
                </button>
              )}
              {reward && reward.state === 'pending' && (
                <p className="text-caption text-muted">
                  Awaiting your Stripe Checkout. If you closed the tab, click escrow again.
                </p>
              )}
              {reward && reward.state === 'held' && (
                <p className="text-caption text-verdigris-700">
                  Funds held by QuR Tag. Released to the finder when you confirm reunion.
                </p>
              )}
              {escrowError && (
                <p className="text-caption text-signal-700 text-pretty">{escrowError}</p>
              )}
            </div>
          )}

        </fieldset>

        {/* Private to the owner */}
        <fieldset disabled={readOnly} className="contents">
        <AppSection title="Only you see">
          <div className="flex flex-col gap-5 p-4">
            <Input
              name="brand"
              label="Description"
              placeholder="Blue, with stickers on the side"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              hint="To tell your things apart."
            />
            {FEATURES.insurancePacket && (
            <Input
              name="declaredValue"
              label="Declared value"
              placeholder="$1200"
              inputMode="decimal"
              value={declaredValue}
              onChange={(e) => setDeclaredValue(e.target.value.replace(/[^0-9.]/g, ''))}
              hint={value ? `Currently ${value}.` : 'Used for insurance packets and courier coverage.'}
            />
            )}
            <label htmlFor="item-notes" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-900">Private note</span>
              <textarea
                id="item-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="A detail only you would know, to check it is yours."
                maxLength={1000}
                className="w-full resize-none rounded-card border border-ink-400 bg-canvas px-4 py-3 text-base text-ink-900 placeholder:text-muted transition-colors focus:border-ink-900 focus:outline-none"
              />
            </label>
          </div>
        </AppSection>

        </fieldset>

        {/* Scans */}
        <AppSection
          title={limitedHistory ? 'Scans, last 30 days' : 'Scan history'}
          description={
            limitedHistory ? (
              <>
                {memberships ? (
                  <>
                    The Free plan keeps the last 30 days of scans in view.{' '}
                    <Link to="/app/membership" className="font-medium text-ink-900 underline underline-offset-4">Plus shows them all.</Link>
                  </>
                ) : (
                  'Scans from the last 30 days are shown.'
                )}
              </>
            ) : undefined
          }
        >
          {scans.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-4 text-sm text-muted">
              <Clock size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
              Nobody has scanned this tag yet. Quiet means nothing has wandered off.
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {(showAllScans ? scans : scans.slice(0, 5)).map((scan) => (
                <li key={scan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-[36px] shrink-0 place-items-center ax:hidden rounded-pill bg-ink-100">
                      <MapPin size={16} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-ink-900">Scanned</span>
                      <span className="text-sm text-muted">
                        {scan.user_agent_class ? `On ${DEVICE[scan.user_agent_class] ?? 'a device'}` : 'On a device'}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-muted">{relativeTime(scan.scanned_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {scans.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllScans((v) => !v)}
              className="flex h-12 w-full items-center justify-center border-t border-hairline text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              {showAllScans ? 'Show fewer' : `Show all ${scans.length}`}
            </button>
          )}
        </AppSection>

          {FEATURES.walletPasses && (
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
            <Eyebrow>Wallet</Eyebrow>
            <p className="text-caption text-muted text-pretty">
              Carry this item in Apple Wallet or Google Wallet. Useful at customs and on insurance
              claims.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!itemId) return;
                  const r = await issueGoogleWalletPass(itemId);
                  if (r.url) {
                    toast.show({ kind: 'success', title: 'Pass ready', body: 'Opening Google Wallet…' });
                    window.open(r.url, '_blank');
                  } else {
                    toast.show({
                      kind: 'error',
                      title: "Couldn't generate the Google Wallet pass",
                      body: r.error ?? 'See docs/SETUP.md §11a to configure the Edge Function.',
                    });
                  }
                }}
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-qurtag"
              >
                Add to Google Wallet
              </button>
              <button
                type="button"
                onClick={() =>
                  toast.show({
                    kind: 'info',
                    title: 'Apple Wallet not configured yet',
                    body: 'Requires an Apple Pass Type ID + signing certificate. See docs/SETUP.md §11b.',
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline-strong text-ink-900 text-caption font-medium px-4 hover:border-ink-900 transition-colors duration-qurtag"
              >
                Add to Apple Wallet
              </button>
            </div>
          </div>

          )}
          {FEATURES.insurancePacket && (
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
            <Eyebrow>Insurance packet</Eyebrow>
            <p className="text-caption text-muted text-pretty">
              A signed, timestamped PDF with the item profile, scan history, recovery thread, and
              reward record. Built for travel and homeowner's insurance claims.
            </p>
            <Link
              to={`/app/items/${itemId}/insurance-packet`}
              className="self-start inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-qurtag"
            >
              Generate packet
            </Link>
          </div>
          )}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setDeleteOpen(true)} className={buttonClasses({ variant: 'danger', block: true, className: 'sm:w-auto sm:self-start' })}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden />
            Delete item
          </button>
          <p className="px-1 text-sm text-muted text-pretty">
            Deleting this item switches off its tag and removes its scans, notes and conversations.
          </p>
        </div>
      </div>

      <Modal
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        eyebrow="New code"
        title="Make a new code for this item?"
        description="The tag you printed before stops working at once, and you print the new one. Use this if a tag was lost or you no longer want it to work. Your conversations stay in your inbox."
        primaryAction={{ label: 'Make a new code', onClick: onReplaceTag, pending: replacing }}
        secondaryAction={{ label: 'Cancel', onClick: () => setReplaceOpen(false) }}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        eyebrow="Delete item"
        title={`Permanently delete ${item.name}?`}
        description="This removes the item, switches off its tag, and deletes its scans, notes and conversations. We can't bring it back."
        primaryAction={{
          label: 'Delete forever',
          tone: 'destructive',
          onClick: confirmDelete,
          pending: deletePending,
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setDeleteOpen(false) }}
      />
    </AppPage>
  );
}

const DEVICE: Record<string, string> = {
  iphone: 'an iPhone',
  ipad: 'an iPad',
  android: 'an Android phone',
  mac: 'a Mac',
  windows: 'a Windows computer',
  other: 'a device',
};

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-signal-700">
        Couldn't save.
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-caption text-muted transition-opacity duration-qurtag',
        state === 'saved' ? 'opacity-100' : 'opacity-80',
      )}
    >
      {state === 'saved' ? (
        <Check size={12} strokeWidth={2} className="text-verdigris-500" />
      ) : (
        <div className="size-3 rounded-full border-2 border-ink-100 border-t-ink-500 animate-spin" />
      )}
      {state === 'saved' ? 'Saved' : 'Saving…'}
    </span>
  );
}
