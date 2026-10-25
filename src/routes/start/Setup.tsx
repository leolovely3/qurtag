import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { PhotoUploader } from '@/components/ui/PhotoUploader';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { createItemWithPrintableTag, fetchPrimaryHouseholdId } from '@/lib/queries';
import { Link } from 'react-router-dom';
import { clearPendingItem, getPendingItem } from '@/lib/pendingItem';
import { useToast } from '@/components/ui/Toast';

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
    if (!householdId) {
      setError("We couldn't find your account yet. Give it a second and try again.");
      return;
    }
    setSubmitting(true);
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
    navigate(`/app/tags/${result.tagId}/print`);
  }

  return (
    <Container size="md">
      <div className="min-h-[70vh] py-qurtag-12 grid lg:grid-cols-12 gap-qurtag-12 items-start">
        <div className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-28">
          <Eyebrow>Add a thing</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
            Tell us what you'd hate to lose.
          </h1>
          <p className="text-lede text-muted text-pretty">
            You get its tag on the next screen. Print it at home, stick or tie it on, and you are
            done. Free for up to two items.
          </p>
          <div className="rounded-card bg-paper border border-hairline p-qurtag-3 flex items-start gap-3 mt-2">
            <Lock size={16} strokeWidth={1.75} className="mt-0.5 text-ink-900 shrink-0" />
            <p className="text-caption text-ink-700 text-pretty">
              Someone who scans the tag sees the item's name, its photo and your note for the
              finder. Never your name, email, phone number or address.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="lg:col-span-7 flex flex-col gap-5">
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-5">
            <Input
              name="name"
              label="What is it?"
              placeholder="Blue water bottle"
              autoFocus
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="The finder sees this. You can change it later."
            />
            <Input
              name="rewardText"
              label="A word for the finder (optional)"
              placeholder="A small thank-you if you get it back to me"
              maxLength={140}
              value={rewardText}
              onChange={(e) => setRewardText(e.target.value)}
              hint="The finder sees this too. Do not put your phone number or address here."
            />
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
            <PhotoUploader
              householdId={householdId}
              value={photoUrl}
              onChange={setPhotoUrl}
            />
          </div>

          {error && (
            <p className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-muted max-w-sm">
              Next: a one-page tag you can print at home.{' '}
              <Link to="/app" className="underline underline-offset-4">Skip for now</Link>
            </p>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium px-6 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
            >
              {submitting ? 'Saving…' : 'Make my tag'}
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}
