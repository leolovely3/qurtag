/**
 * Finder-side pieces of features that are not built yet: a cash reward payout and a
 * courier pickup. Hidden (src/lib/features.ts: rewards, courier) and kept for when
 * each gets its own backend. Nothing renders them unless those flags are on.
 */
import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { Input } from '@/components/ui/Input';
import { startFinderPayoutOnboarding } from '@/lib/stripe';

/* ─────────────── Finder payout setup ─────────────── */


interface FinderPayoutSetupProps {
  threadId: string;
  publicId: string;
}

export function FinderPayoutSetup({ threadId: _threadId, publicId }: FinderPayoutSetupProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await startFinderPayoutOnboarding({
        finderSessionId: _threadId,
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
    <div className="rounded-modal border border-hairline bg-paper p-qurtag-3 flex flex-col gap-2">
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
          className="flex-1 h-10 rounded-pill border border-hairline-strong bg-canvas px-4 text-caption text-ink-900 placeholder:text-muted focus:outline-none focus:border-ink-900 transition-colors duration-qurtag"
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 disabled:opacity-50 transition-colors duration-qurtag"
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

export function CourierForm({ onClose, onSubmit, disabled }: CourierFormProps) {
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [pickupWindow, setPickupWindow] = useState('Today, after 5pm');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Request a courier</Eyebrow>
          <p className="text-body text-ink-900 font-medium mt-1">
            We'll generate a prepaid label and email it to you.
          </p>
          <p className="text-caption text-muted mt-0.5 text-pretty">
            The owner pays for shipping. Your address stays private from them. QuR Tag handles the
            handoff.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-qurtag"
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
            className="h-12 rounded-card border border-hairline-strong bg-canvas px-4 text-body text-ink-900 focus:outline-none focus:border-ink-900 transition-colors duration-qurtag"
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
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-qurtag"
          >
            {submitting ? 'Requesting…' : 'Request pickup'}
          </button>
        </div>
      </form>
    </div>
  );
}
