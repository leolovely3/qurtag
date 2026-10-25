import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { buttonClasses } from '@/components/ui/Button';
import { isNative } from '@/lib/platform';
import { Input } from '@/components/ui/Input';
import { PhotoUploader } from '@/components/ui/PhotoUploader';
import { useAuth } from '@/lib/auth';
import { createItemWithPrintableTag, fetchPrimaryHouseholdId } from '@/lib/queries';
import { Link } from 'react-router-dom';
import { clearPendingItem, getPendingItem } from '@/lib/pendingItem';
import { useToast } from '@/components/ui/Toast';
import { PushPrimer } from '@/components/push/PushPrimer';
import { shouldExplainPush } from '@/lib/nativePush';

export function StartSetup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [rewardText, setRewardText] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // After the first item is saved, the iPhone app explains alerts before asking (components/push/PushPrimer.tsx).
  const [primerFor, setPrimerFor] = useState<{ item: string; next: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    fetchPrimaryHouseholdId().then(setHouseholdId);

    // Pre-fill from what they typed at /start, then drop the pending record.
    const pending = getPendingItem();
    if (pending) {
      if (pending.name) setName(pending.name);
      if (pending.brand) setBrand(pending.brand);
      clearPendingItem();
    }
  }, [loading, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // The account is looked up when the screen opens; a quick tap can beat it, so look again.
    const hh = householdId ?? (await fetchPrimaryHouseholdId());
    if (!hh) {
      setSubmitting(false);
      setError("We couldn't find your account. Check your connection and try again.");
      return;
    }
    if (!householdId) setHouseholdId(hh);
    const result = await createItemWithPrintableTag({
      name: name.trim(),
      brand: brand.trim() || undefined,
      heroPhotoUrl: photoUrl ?? undefined,
      rewardText: rewardText.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    toast.show({
      kind: 'success',
      title: 'Item saved',
      body: `Tag ${result.publicId} is ready. Print it next.`,
    });
    const next = `/app/tags/${result.tagId}/print`;
    if (await shouldExplainPush()) setPrimerFor({ item: name.trim(), next });
    else navigate(next);
  }

  return (
    <AppPage title="Add item" back={{ to: '/app', label: 'Items' }} width="narrow">
      <PushPrimer
        open={primerFor !== null}
        itemName={primerFor?.item ?? ''}
        onDone={() => {
          const next = primerFor?.next;
          setPrimerFor(null);
          if (next) navigate(next);
        }}
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <p className="px-1 text-base text-muted text-pretty">
          Name the thing you would hate to lose. Its tag is ready to print on the next screen.
        </p>

        <div className="flex flex-col gap-5 rounded-modal border border-hairline bg-canvas p-4 sm:p-6">
          <Input
            name="name"
            label="What is it?"
            placeholder="Blue water bottle"
            autoFocus={!isNative()}
            maxLength={80}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint="The finder sees this. You can change it later."
          />
          <PhotoUploader householdId={householdId} value={photoUrl} onChange={setPhotoUrl} />
          <Input
            name="rewardText"
            label="A word for the finder (optional)"
            placeholder="A small thank-you if you get it back to me"
            maxLength={140}
            value={rewardText}
            onChange={(e) => setRewardText(e.target.value)}
            hint="The finder sees this too. Do not put your phone number or address here."
          />
        </div>

        <div className="flex flex-col gap-5 rounded-modal border border-hairline bg-canvas p-4 sm:p-6">
          <Input
            name="brand"
            label="Description (optional)"
            placeholder="Blue, with stickers on the side"
            maxLength={60}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            hint="Private to you."
          />
          <Input
            name="notes"
            label="Private note (optional)"
            placeholder="A detail only you would know"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            hint="Private to you. Never shown to a finder."
          />
        </div>

        <div className="flex items-start gap-3 px-1">
          <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <p className="text-sm text-muted text-pretty">
            Someone who scans the tag sees the item's name, its photo and your word for the finder.
            Never your name, email, phone number or address.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/app" className={buttonClasses({ variant: 'ghost', size: 'lg' })}>
            Not now
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full sm:w-auto' })}
          >
            {submitting ? 'Saving…' : 'Make my tag'}
          </button>
        </div>
      </form>
    </AppPage>
  );
}
