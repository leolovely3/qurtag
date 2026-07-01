import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Input } from '@/components/ui/Input';
import { PhotoUploader } from '@/components/ui/PhotoUploader';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { createItemWithPrintableTag, fetchPrimaryHouseholdId } from '@/lib/queries';
import { clearPendingItem, getPendingItem } from '@/lib/pendingItem';
import { useToast } from '@/components/ui/Toast';

export function StartSetup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
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
      householdId,
      name: name.trim(),
      brand: brand.trim() || undefined,
      declaredValueCents:
        declaredValue && !Number.isNaN(Number(declaredValue))
          ? Math.round(Number(declaredValue) * 100)
          : undefined,
      heroPhotoUrl: photoUrl ?? undefined,
    });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    toast.show({
      kind: 'success',
      title: 'Item created',
      body: `Tag ${result.tag.public_id} minted. Print it next.`,
    });
    navigate(`/app/tags/${result.tag.id}/print`);
  }

  return (
    <Container size="md">
      <div className="min-h-[70vh] py-qurtag-12 grid lg:grid-cols-12 gap-qurtag-12 items-start">
        <div className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-28">
          <Eyebrow>Add your first thing</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
            Tell us what you'd hate to lose.
          </h1>
          <p className="text-lede text-muted text-pretty">
            We'll mint a tag for you on the next screen. Print it on plain paper, slip it into a
            luggage sleeve, and you're done.
          </p>
          <div className="rounded-card bg-paper border border-hairline p-qurtag-3 flex items-start gap-3 mt-2">
            <Lock size={16} strokeWidth={1.75} className="mt-0.5 text-ink-900 shrink-0" />
            <p className="text-caption text-ink-700 text-pretty">
              Anyone who scans the tag sees only what you choose to show. Never your name, number,
              email, or address. Privacy by structure, not by promise.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="lg:col-span-7 flex flex-col gap-5">
          <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-5">
            <Input
              name="name"
              label="What is it?"
              placeholder="Rimowa Original Cabin"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="A short, descriptive name. You can change it later."
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
              hint="Used for insurance packets and courier coverage."
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
              Next: a one-page tag you can print at home. You'll be done in about a minute.
            </p>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-body font-medium px-6 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
            >
              {submitting ? 'Saving…' : 'Mint my tag'}
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}
