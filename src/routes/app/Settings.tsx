import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, BellOff, ChevronRight, CreditCard, CircleHelp, Download, FileText, Home, Lock, LogOut, Mail, Monitor, Moon, Sun, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Eyebrow } from '@/components/brand/Typography';
import { AppPage, AppSection } from '@/components/layout/AppPage';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth';
import { usePushSubscription, isPushSupported } from '@/lib/push';
import { exportMyData, fetchHousehold, fetchPrimaryHouseholdId, updateHousehold } from '@/lib/queries';
import { FEATURES } from '@/lib/features';
import { saveFile } from '@/lib/saveFile';
import { fetchEmailAvailable } from '@/lib/membership';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { Modal } from '@/components/ui/Modal';
import { NotificationSettings } from '@/components/push/NotificationSettings';
import { BlockedFinders } from '@/components/moderation/BlockedFinders';
import type { Household } from '@/lib/database.types';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function Settings() {
  const { user, signOut, deleteAccount } = useAuth();
  const memberships = useMembershipsAvailable();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { permission, subscribed, pending, subscribe, unsubscribe } = usePushSubscription(
    user?.id ?? null,
  );

  useEffect(() => {
    // Null (could not be asked) is treated as not available, so no row promises email that may not come.
    void fetchEmailAvailable().then((v) => setEmailAvailable(v === true));
  }, []);

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
    // The return address belongs to the courier feature, which is not built yet.
    if (!user || !FEATURES.courier) return;
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

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      await saveFile({
        filename: 'qurtag-my-data.json',
        mime: 'application/json',
        text: JSON.stringify({ account: { email: user?.email, name: user?.name }, ...data }, null, 2),
        dialogTitle: 'Save your data',
      });
    } catch {
      toast.show({ kind: 'error', title: "Couldn't prepare your data", body: 'Your file was not saved. Try again in a moment.' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const r = await deleteAccount();
    setDeleting(false);
    if (!r.ok) {
      toast.show({ kind: 'error', title: "Couldn't delete your account", body: r.error });
      return;
    }
    setDeleteOpen(false);
    navigate('/', { replace: true });
  }

  return (
    <AppPage
      title="Settings"
      action={
        saveState === 'saving' ? (
          <span className="text-sm text-muted">Saving…</span>
        ) : saveState === 'saved' ? (
          <span className="text-sm text-verdigris-700">Saved</span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">

      {/* Return address (courier feature, hidden) */}
      {FEATURES.courier && (
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

      )}

      {/* Notifications */}
      <AppSection title="Notifications">

        {FEATURES.push && (
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
        )}

        <NotificationSettings emailAvailable={emailAvailable} />
      </AppSection>

      <AppSection title="Blocked finders" description="Finders you blocked cannot write to you, and their notes stay out of your inbox.">
        <BlockedFinders />
      </AppSection>

      {/* Appearance */}
      <AppSection title="Appearance">
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
          <div role="radiogroup" aria-label="Theme" className="grid w-full grid-cols-3 rounded-pill bg-ink-100 p-1 sm:w-auto">
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
                role="radio"
                aria-checked={theme.preference === opt.v}
                onClick={() => theme.setPreference(opt.v)}
                className={cn(
                  'inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3 text-sm font-medium transition-colors duration-150',
                  theme.preference === opt.v
                    ? 'bg-canvas text-ink-900 shadow-card'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                <opt.icon size={16} strokeWidth={1.75} aria-hidden />
                {opt.label}
              </button>
            ))}
          </div>
        </Row>
      </AppSection>

      {/* Account */}
      <AppSection title="Account">
        <Row icon={Mail} title={user?.email ?? 'Signed in'} body="The email you sign in with. Finders never see it." />
        {memberships && <ActionRow icon={CreditCard} title="Membership" body="Your plan, billing and your family." to="/app/membership" />}
        <ActionRow
          icon={Download}
          title={exporting ? 'Preparing your file…' : 'Download my data'}
          body={
            memberships
              ? 'Your items, tags, scans and conversations, as a file. On the Free plan the file holds the last 30 days of scans.'
              : 'Your items, tags, scans and conversations, as a file.'
          }
          onClick={handleExport}
          disabled={exporting}
        />
        <ActionRow icon={LogOut} title="Sign out" onClick={handleSignOut} />
      </AppSection>

      <AppSection description="Deletes your account, items, tags and conversations for good. Your tags stop working.">
        <ActionRow icon={Trash2} title="Delete my account" onClick={() => setDeleteOpen(true)} tone="danger" />
      </AppSection>

      <AppSection title="Help">
        <ul className="divide-y divide-hairline">
          {[
            { to: '/app/tags', label: 'Your tags', icon: TagIcon },
            { to: '/help', label: 'Help and questions', icon: CircleHelp },
            { to: '/privacy', label: 'Privacy', icon: Lock },
            { to: '/terms', label: 'Terms', icon: FileText },
          ].map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50">
                <span className="grid size-9 shrink-0 place-items-center rounded-card bg-ink-100">
                  <l.icon size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                </span>
                <span className="flex-1 text-base font-medium text-ink-900">{l.label}</span>
                <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </AppSection>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        eyebrow="Delete account"
        title="Delete your QuR Tag account?"
        description={
          memberships
            ? "Your account, items, tags, scans and conversations are deleted at once and cannot be brought back. Any tag you printed stops working. If you have a family, its members lose access to the family's items. A membership that is still renewing must be canceled first."
            : 'Your account, items, tags, scans and conversations are deleted at once and cannot be brought back. Any tag you printed stops working.'
        }
        primaryAction={{ label: 'Delete everything', tone: 'destructive', onClick: handleDelete, pending: deleting }}
        secondaryAction={{ label: 'Cancel', onClick: () => setDeleteOpen(false) }}
      />

      {FEATURES.push && !isPushSupported && (
        <p className="mt-6 text-sm text-muted">
          This browser doesn't support Web Push. iOS Safari requires installing QuR Tag as a home-screen
          app first.
        </p>
      )}
    </AppPage>
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

/** A whole-row button or link, like a row in iOS Settings. */
function ActionRow({
  icon: Icon,
  title,
  body,
  to,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const inner = (
    <>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-card', tone === 'danger' ? 'bg-signal-50' : 'bg-ink-100')}>
        <Icon size={18} strokeWidth={1.75} className={tone === 'danger' ? 'text-signal-700' : 'text-ink-900'} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className={cn('text-base font-medium', tone === 'danger' ? 'text-signal-700' : 'text-ink-900')}>{title}</span>
        {body && <span className="text-sm text-muted text-pretty">{body}</span>}
      </span>
      {to && <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-300" aria-hidden />}
    </>
  );
  const cls =
    'flex min-h-14 w-full items-center gap-3 border-t border-hairline px-4 py-3 transition-colors first:border-t-0 hover:bg-ink-50 active:bg-ink-50 disabled:opacity-60 focus-visible:outline-offset-[-2px]';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

interface RowProps {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: React.ReactNode;
}

function Row({ icon: Icon, title, body, children }: RowProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-card bg-ink-100">
          <Icon size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words text-base font-medium text-ink-900">{title}</span>
          <span className="text-sm text-muted text-pretty">{body}</span>
        </div>
      </div>
      {children && <div className="shrink-0 sm:pl-3">{children}</div>}
    </div>
  );
}
