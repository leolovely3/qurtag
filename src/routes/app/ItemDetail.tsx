import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Printer,
  MapPin,
  Tag as TagIcon,
} from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
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
  updateItem,
} from '@/lib/queries';
import { Modal } from '@/components/ui/Modal';
import { issueGoogleWalletPass, startStripeCheckout } from '@/lib/stripe';
import { useToast } from '@/components/ui/Toast';
import type { Item, Reward, Scan, Tag } from '@/lib/database.types';
import { cn } from '@/lib/cn';

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
  const { itemId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [item, setItem] = useState<Item | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
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
  const [notes, setNotes] = useState('');

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
        setLostMode(it.lost_mode);
      }
      if (hh) {
        const tags = await fetchTags(hh);
        if (cancelled) return;
        setTag(tags.find((t) => t.current_item_id === itemId) ?? null);
      }
      const [sc, rw] = await Promise.all([
        fetchScansForItem(itemId),
        fetchActiveRewardForItem(itemId),
      ]);
      if (cancelled) return;
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
    if (!item) return;
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
    const updated = await updateItem(itemId, { reward_amount_cents: cents });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-3xl flex flex-col gap-5">
        <Link
          to="/app"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Your items
        </Link>
        <Eyebrow>Not found</Eyebrow>
        <h1 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.022em]">
          We couldn't find that item.
        </h1>
        <p className="text-body text-muted">
          It may have been deleted, or you don't have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-5xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-cairn-5">
        <Link
          to="/app"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Your items
        </Link>
        <SaveBadge state={saveState} />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 mb-cairn-8">
        <Eyebrow>{tag?.hardware_tier ?? 'No tag'}</Eyebrow>
        <input
          aria-label="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] bg-transparent border-0 outline-none w-full text-balance focus:outline-none focus-visible:bg-ink-50 rounded-card px-1 -mx-1 transition-colors duration-cairn"
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-cairn-5">
        {/* Left column */}
        <div className="lg:col-span-7 flex flex-col gap-cairn-5">
          {/* Lost mode + reward */}
          <LostModeToggle
            value={lostMode}
            pending={lostPending}
            onChange={onToggleLostMode}
          />

          {lostMode && (
            <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <Eyebrow>Reward (optional)</Eyebrow>
                {reward && (
                  <RewardStateBadge state={reward.state} />
                )}
              </div>
              <RewardPicker
                valueCents={item.reward_amount_cents}
                onChange={onChangeReward}
                disabled={!!reward && reward.state === 'held'}
              />
              {item.reward_amount_cents && item.reward_amount_cents > 0 && !reward && (
                <button
                  type="button"
                  onClick={onActivateEscrow}
                  disabled={escrowPending}
                  className="self-start inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-cairn"
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
                  Funds held by QurTag. Released to the finder when you confirm reunion.
                </p>
              )}
              {escrowError && (
                <p className="text-caption text-signal-700 text-pretty">{escrowError}</p>
              )}
            </div>
          )}

          {/* Tag card */}
          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex items-start gap-cairn-3">
            <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
              <TagIcon size={18} strokeWidth={1.75} className="text-ink-900" />
            </div>
            <div className="flex-1 min-w-0">
              <Eyebrow>Tag</Eyebrow>
              <p className="font-display font-semibold text-h6 text-ink-900 tracking-[-0.011em] mt-0.5">
                {tag ? `QurTag · ${tag.public_id}` : 'No tag attached'}
              </p>
              <p className="text-caption text-muted mt-1">
                {tag
                  ? `${tag.hardware_tier === 'printable' ? 'Printable tag' : tag.hardware_tier} · activated ${relativeTime(tag.activated_at)}`
                  : 'Add a tag to make this item recoverable.'}
              </p>
            </div>
            {tag && (
              <Link
                to={`/app/tags/${tag.id}/print`}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-ink-900 text-canvas text-caption font-medium hover:bg-ink-700 transition-colors duration-cairn shrink-0"
              >
                <Printer size={14} strokeWidth={1.75} />
                Print
              </Link>
            )}
          </div>

          {/* Scan history */}
          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Eyebrow>Recent scans</Eyebrow>
              <span className="text-caption text-muted">{scans.length} total</span>
            </div>
            {scans.length === 0 ? (
              <div className="flex items-center gap-3 py-cairn-3 text-caption text-muted">
                <Clock size={14} strokeWidth={1.75} />
                Nobody's scanned this yet. That's good. Quiet means nothing's wandered.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline">
                {scans.slice(0, 10).map((scan) => (
                  <li
                    key={scan.id}
                    className="flex items-center justify-between gap-3 py-3 text-caption"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-8 rounded-pill bg-ink-50 grid place-items-center shrink-0">
                        <MapPin size={12} strokeWidth={1.75} className="text-ink-900" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-ink-900 font-medium truncate">
                          {scan.ip_country ?? 'Somewhere'}
                        </span>
                        <span className="text-muted truncate">
                          {scan.user_agent_class
                            ? scan.user_agent_class.slice(0, 60)
                            : 'Anonymous finder'}
                        </span>
                      </div>
                    </div>
                    <span className="text-muted shrink-0">{relativeTime(scan.scanned_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-5 flex flex-col gap-cairn-5">
          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-4">
            <PhotoUploader
              householdId={householdId}
              value={item.hero_photo_url}
              onChange={onChangePhoto}
            />
            <Input
              name="brand"
              label="Brand"
              placeholder="Rimowa, Tumi, Away…"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
            <Input
              name="declaredValue"
              label="Declared value"
              placeholder="$1200"
              inputMode="decimal"
              value={declaredValue}
              onChange={(e) => setDeclaredValue(e.target.value.replace(/[^0-9.]/g, ''))}
              hint={value ? `Currently ${value}.` : 'Used for insurance packets and courier coverage.'}
            />
          </div>

          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
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
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
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
                className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline-strong text-ink-900 text-caption font-medium px-4 hover:border-ink-900 transition-colors duration-cairn"
              >
                Add to Apple Wallet
              </button>
            </div>
          </div>

          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
            <Eyebrow>Insurance packet</Eyebrow>
            <p className="text-caption text-muted text-pretty">
              A signed, timestamped PDF with the item profile, scan history, recovery thread, and
              reward record. Built for travel and homeowner's insurance claims.
            </p>
            <Link
              to={`/app/items/${itemId}/insurance-packet`}
              className="self-start inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
            >
              Generate packet
            </Link>
          </div>

          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3">
            <Eyebrow>Danger</Eyebrow>
            <p className="text-caption text-muted text-pretty">
              Deleting this item frees any tag assigned to it and removes all scan history, notes,
              and recovery threads. You can't undo this from the app.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="self-start inline-flex h-10 items-center gap-2 rounded-pill border border-hairline-strong text-signal-700 text-caption font-medium px-4 hover:border-signal-500 transition-colors duration-cairn"
            >
              Delete item
            </button>
          </div>

          <div className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-2">
            <Eyebrow>Notes</Eyebrow>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="A detail only you would know, useful for proving you're the owner."
              className="w-full rounded-card border border-hairline-strong bg-canvas p-3 text-body text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-ink-900 transition-colors duration-cairn resize-none"
            />
            <p className="text-caption text-muted">
              Private to you. Never shown to a finder.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        eyebrow="Delete item"
        title={`Permanently delete ${item.name}?`}
        description="This removes the item, frees the tag, and deletes all scans, notes, and conversations associated with it. We can't bring it back."
        primaryAction={{
          label: 'Delete forever',
          tone: 'destructive',
          onClick: confirmDelete,
          pending: deletePending,
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setDeleteOpen(false) }}
      />
    </div>
  );
}

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
        'inline-flex items-center gap-1.5 text-caption text-muted transition-opacity duration-cairn',
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
