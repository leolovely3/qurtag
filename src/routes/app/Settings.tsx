import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, BellOff, Home, LogOut, Mail, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Eyebrow } from '@/components/brand/Typography';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import { usePushSubscription, isPushSupported } from '@/lib/push';
import { fetchHousehold, fetchPrimaryHouseholdId, updateHousehold } from '@/lib/queries';
import type { Household } from '@/lib/database.types';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { permission, subscribed, pending, subscribe, unsubscribe } = usePushSubscription(
    user?.id ?? null,
  );

  const [household, setHousehold] = useState<Household | null>(null);
  const toast = useToast();
  const theme = useTheme();
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (!hh) return;
      const h = await fetchHousehold(hh);
      if (!h) return;
      setHousehold(h);
      setAddressLine(h.return_address_line ?? '');
      setCity(h.return_city ?? '');
      setState(h.return_state ?? '');
      setPostalCode(h.return_postal_code ?? '');
      setCountry(h.return_country ?? 'US');
    })();
  }, [user]);

  function queueSave(patch: Partial<Household>) {
    if (!household) return;
    if (timer.current) clearTimeout(timer.current);
    setSaveState('saving');
    timer.current = setTimeout(async () => {
      const updated = await updateHousehold(household.id, patch);
      if (updated) {
        setHousehold(updated);
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1200);
      } else {
        setSaveState('error');
      }
    }, 600);
  }

  useEffect(() => {
    if (!household) return;
    const v = addressLine.trim() || null;
    if (v === household.return_address_line) return;
    queueSave({ return_address_line: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressLine]);

  useEffect(() => {
    if (!household) return;
    const v = city.trim() || null;
    if (v === household.return_city) return;
    queueSave({ return_city: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  useEffect(() => {
    if (!household) return;
    const v = state.trim() || null;
    if (v === household.return_state) return;
    queueSave({ return_state: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!household) return;
    const v = postalCode.trim() || null;
    if (v === household.return_postal_code) return;
    queueSave({ return_postal_code: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode]);

  useEffect(() => {
    if (!household) return;
    const v = country.trim() || null;
    if (v === household.return_country) return;
    queueSave({ return_country: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  async function handleSignOut() {
    await signOut();
    navigate('/start', { replace: true });
  }

  return (
    <div className="px-qurtag-5 md:px-qurtag-8 py-qurtag-8 max-w-3xl">
      <div className="flex items-end justify-between mb-qurtag-8 gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow>Settings</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
            How QurTag finds you.
          </h1>
        </div>
        {saveState === 'saving' && (
          <span className="text-caption text-muted">Saving…</span>
        )}
        {saveState === 'saved' && (
          <span className="text-caption text-verdigris-700">Saved</span>
        )}
      </div>

      {/* Return address */}
      <section className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3 mb-qurtag-3">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-pill bg-ink-50 grid place-items-center shrink-0">
            <Home size={16} strokeWidth={1.75} className="text-ink-900" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <Eyebrow>Return address</Eyebrow>
            <p className="text-body text-ink-900 font-medium">Where your stuff should come home to.</p>
            <p className="text-caption text-muted text-pretty">
              Used by the courier flow to generate prepaid pickup labels and by the insurance packet.
              Never shown to a finder.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 mt-2">
          <Input
            name="address_line"
            label="Address"
            placeholder="123 Main St, Apt 4B"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
          />
          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              name="city"
              label="City"
              placeholder="Boston"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              name="state"
              label="State / Region"
              placeholder="MA"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            <Input
              name="postal_code"
              label="Postal code"
              placeholder="02110"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>
          <Input
            name="country"
            label="Country"
            placeholder="US"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            hint="ISO 3166 alpha-2, e.g. US, GB, JP."
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3 mb-qurtag-3">
        <Eyebrow>Notifications</Eyebrow>

        <Row
          icon={subscribed ? Bell : BellOff}
          title={subscribed ? 'Push notifications on' : 'Push notifications'}
          body={pushSubtitle(permission, subscribed)}
        >
          {permission === 'unsupported' || permission === 'unconfigured' ? (
            <span className="text-caption text-muted">
              {permission === 'unsupported'
                ? 'Not supported in this browser.'
                : 'Not configured.'}
            </span>
          ) : permission === 'denied' ? (
            <span className="text-caption text-muted">Allow in browser settings.</span>
          ) : subscribed ? (
            <button
              type="button"
              onClick={async () => {
                await unsubscribe();
                toast.show({ kind: 'info', title: 'Push notifications off' });
              }}
              disabled={pending}
              className="text-caption font-medium text-muted hover:text-ink-900 transition-colors disabled:opacity-60"
            >
              Turn off
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await subscribe();
                toast.show({ kind: 'success', title: 'Push notifications on', body: 'Your device will buzz the moment a finder writes.' });
              }}
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 disabled:opacity-60 transition-colors duration-qurtag"
            >
              {pending ? 'Working…' : 'Turn on'}
            </button>
          )}
        </Row>

        <Row
          icon={Mail}
          title="Email"
          body="A summary of finder messages, sent to the address you signed in with."
        >
          <span className="text-caption text-muted">Always on (for now)</span>
        </Row>

        <Row
          icon={Moon}
          title="Quiet hours"
          body="Pause push between 10pm and 7am unless the tag is in lost mode."
        >
          <span className="text-caption text-muted">Coming soon</span>
        </Row>
      </section>

      {/* Appearance */}
      <section className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3 mb-qurtag-3">
        <Eyebrow>Appearance</Eyebrow>
        <Row
          icon={theme.resolved === 'dark' ? Moon : Sun}
          title="Theme"
          body={
            theme.preference === 'system'
              ? `Following your system (${theme.resolved} now).`
              : theme.preference === 'dark'
                ? 'Dark, always.'
                : 'Light, always.'
          }
        >
          <div className="inline-flex rounded-pill border border-hairline-strong overflow-hidden">
            {(
              [
                { v: 'light', label: 'Light', icon: Sun },
                { v: 'system', label: 'Auto', icon: Monitor },
                { v: 'dark', label: 'Dark', icon: Moon },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => theme.setPreference(opt.v)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 text-[11px] font-medium transition-colors duration-qurtag',
                  theme.preference === opt.v
                    ? 'bg-ink-900 text-canvas'
                    : 'text-muted hover:text-ink-900',
                )}
              >
                <opt.icon size={11} strokeWidth={1.75} />
                {opt.label}
              </button>
            ))}
          </div>
        </Row>
      </section>

      {/* Account */}
      <section className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-qurtag-3">
        <Eyebrow>Account</Eyebrow>
        <Row icon={Mail} title={user?.email ?? 'Signed in'} body="Where your magic link lands." />
        <Row icon={LogOut} title="Sign out" body="You can sign back in with the same email anytime.">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-caption font-medium text-muted hover:text-ink-900 transition-colors"
          >
            Sign out
          </button>
        </Row>
      </section>

      {!isPushSupported && (
        <p className="mt-qurtag-5 text-caption text-muted">
          This browser doesn't support Web Push. iOS Safari requires installing QurTag as a home-screen
          app first.
        </p>
      )}
    </div>
  );
}

function pushSubtitle(
  permission: ReturnType<typeof usePushSubscription>['permission'],
  subscribed: boolean,
): string {
  if (permission === 'unsupported') return "This browser doesn't support Web Push.";
  if (permission === 'unconfigured') return 'VAPID public key missing. See docs/SETUP.md.';
  if (permission === 'denied') return 'Push notifications are blocked at the browser level.';
  if (subscribed) return 'Your phone or laptop will buzz the moment a finder writes.';
  return 'Get a quiet alert when someone finds one of your items.';
}

interface RowProps {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: React.ReactNode;
}

function Row({ icon: Icon, title, body, children }: RowProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-qurtag-3 py-qurtag-2 border-t border-hairline first:border-t-0 first:pt-0',
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="size-9 rounded-pill bg-ink-50 grid place-items-center shrink-0">
          <Icon size={16} strokeWidth={1.75} className="text-ink-900" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-body font-medium text-ink-900 truncate">{title}</span>
          <span className="text-caption text-muted text-pretty">{body}</span>
        </div>
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  );
}
