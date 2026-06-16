import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import { fetchMyPartner, logPartnerDropoff } from '@/lib/queries';

export function PartnerScan() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [tagPublicId, setTagPublicId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const p = await fetchMyPartner();
      if (p) setPartnerId(p.id);
    })();
  }, [loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partnerId || !user) return;
    setSubmitting(true);
    const dropoff = await logPartnerDropoff({
      partnerId,
      staffUserId: user.id,
      tagPublicId: tagPublicId.trim(),
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (!dropoff) {
      setError("Couldn't find that tag. Double-check the code printed on it.");
      return;
    }
    navigate('/partners');
  }

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-2xl">
      <div className="flex flex-col gap-2 mb-cairn-8">
        <Eyebrow>Log a drop-off</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
          Scan the tag. We'll tell the owner.
        </h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-cairn-3"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
            <ScanLine size={18} strokeWidth={1.75} className="text-ink-900" />
          </div>
          <p className="text-body text-ink-700 text-pretty">
            Use your phone camera to read the QR, or type the 10-character code printed below it.
          </p>
        </div>
        <Input
          name="tag"
          label="Tag code"
          placeholder="e.g. A2B3C4D5E6"
          autoFocus
          required
          value={tagPublicId}
          onChange={(e) => setTagPublicId(e.target.value)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-900">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Where you found it, condition, the shelf you put it on."
            className="w-full rounded-card border border-hairline-strong bg-canvas p-3 text-body text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-cairn resize-none"
          />
        </label>
        {error && (
          <p className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting || !tagPublicId.trim() || !partnerId}
          className="self-start inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 transition-colors duration-cairn"
        >
          {submitting ? 'Logging…' : 'Log drop-off'}
        </button>
      </form>
    </div>
  );
}
