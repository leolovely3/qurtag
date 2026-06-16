import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plane, Plus, X, Check } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import {
  addItemsToTrip,
  createTrip,
  fetchItems,
  fetchPrimaryHouseholdId,
  fetchTripsForHousehold,
} from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Item, Trip } from '@/lib/database.types';
import { cn } from '@/lib/cn';

function relativeArrival(iso: string | null): string {
  if (!iso) return 'No itinerary yet';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function Trips() {
  const { user, loading: authLoading } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async (hh: string) => {
    const [t, i] = await Promise.all([fetchTripsForHousehold(hh), fetchItems(hh)]);
    setTrips(t);
    setItems(i);
  }, []);

  useEffect(() => {
    if (authLoading || !user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled || !hh) {
        setLoading(false);
        return;
      }
      setHouseholdId(hh);
      await refresh(hh);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, refresh]);

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-4xl">
      <div className="flex items-end justify-between mb-cairn-8 gap-3 flex-wrap">
        <div className="flex flex-col gap-2">
          <Eyebrow>Trips</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
            {trips.length === 0
              ? 'Going somewhere?'
              : `${trips.length} trip${trips.length === 1 ? '' : 's'} on file.`}
          </h1>
        </div>
        {!creating && householdId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add a trip
          </button>
        )}
      </div>

      {creating && householdId && (
        <CreateTripForm
          householdId={householdId}
          items={items}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            if (householdId) await refresh(householdId);
            setCreating(false);
          }}
        />
      )}

      {loading ? (
        <div className="rounded-modal border border-hairline bg-canvas p-cairn-8 flex items-center justify-center">
          <div className="size-6 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-8 flex flex-col items-start gap-3">
          <div className="size-12 rounded-pill bg-canvas grid place-items-center shadow-card">
            <Plane size={20} strokeWidth={1.5} className="text-ink-900" />
          </div>
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
            Add a trip to keep your tags aware.
          </h2>
          <p className="text-body text-muted max-w-md text-pretty">
            Paste a flight number. Items on the trip surface trip context on their finder pages -
            the finder sees your itinerary and knows where to head next.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex items-start gap-cairn-3"
            >
              <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
                <Plane size={16} strokeWidth={1.75} className="text-ink-900" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <Eyebrow>{trip.flight_number ?? 'Trip'}</Eyebrow>
                <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] truncate">
                  {trip.name}
                </h3>
                <p className="text-caption text-muted">
                  {trip.origin_iata && trip.destination_iata
                    ? `${trip.origin_iata} → ${trip.destination_iata} · `
                    : ''}
                  {relativeArrival(trip.scheduled_arrival)}
                  {trip.live_status && ` · ${trip.live_status}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CreateTripFormProps {
  householdId: string;
  items: Item[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

function CreateTripForm({ householdId, items, onClose, onCreated }: CreateTripFormProps) {
  const [name, setName] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [arrival, setArrival] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const selectedCount = useMemo(() => selected.size, [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createTrip({
        householdId,
        name: name.trim() || `${origin.trim() || 'Trip'} → ${destination.trim() || ''}`.trim(),
        flightNumber: flightNumber.trim() || undefined,
        originIata: origin.trim().toUpperCase() || undefined,
        destinationIata: destination.trim().toUpperCase() || undefined,
        scheduledArrival: arrival ? new Date(arrival).toISOString() : undefined,
      });
      if (created && selected.size > 0) {
        await addItemsToTrip(created.id, Array.from(selected));
      }
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-cairn-3 mb-cairn-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>New trip</Eyebrow>
          <p className="text-body text-ink-900 font-medium mt-1">
            Tell us your itinerary. We'll handle the rest.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors"
          aria-label="Close"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          name="flight"
          label="Flight number"
          placeholder="UA901"
          value={flightNumber}
          onChange={(e) => setFlightNumber(e.target.value)}
        />
        <Input
          name="name"
          label="Name (optional)"
          placeholder="Paris, June"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          name="origin"
          label="Origin"
          placeholder="LHR"
          maxLength={3}
          value={origin}
          onChange={(e) => setOrigin(e.target.value.toUpperCase())}
        />
        <Input
          name="destination"
          label="Destination"
          placeholder="SFO"
          maxLength={3}
          value={destination}
          onChange={(e) => setDestination(e.target.value.toUpperCase())}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-ink-900">Scheduled arrival</span>
        <input
          type="datetime-local"
          value={arrival}
          onChange={(e) => setArrival(e.target.value)}
          className="h-12 rounded-card border border-hairline-strong bg-canvas px-4 text-body text-ink-900 focus:outline-none focus:border-ink-900 transition-colors duration-cairn"
        />
      </label>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-ink-900">Items on the trip</span>
          <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
            {items.map((item) => {
              const isOn = selected.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-card border text-left transition-colors duration-cairn',
                    isOn
                      ? 'bg-ink-900 text-canvas border-ink-900'
                      : 'bg-canvas text-ink-900 border-hairline-strong hover:border-ink-900',
                  )}
                >
                  <span
                    className={cn(
                      'size-4 rounded-sm border grid place-items-center shrink-0',
                      isOn ? 'bg-canvas text-ink-900 border-canvas' : 'border-hairline-strong',
                    )}
                  >
                    {isOn && <Check size={12} strokeWidth={2.5} />}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-caption font-medium">{item.name}</span>
                </button>
              );
            })}
          </div>
          <p className="text-caption text-muted">{selectedCount} selected</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-caption text-muted hover:text-ink-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || (!flightNumber.trim() && !name.trim() && !destination.trim())}
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5 hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-cairn"
        >
          {submitting ? 'Saving…' : 'Save trip'}
        </button>
      </div>
    </form>
  );
}
