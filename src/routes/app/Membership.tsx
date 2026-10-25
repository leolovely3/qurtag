import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AppPage } from '@/components/layout/AppPage';
import { PlanCard } from '@/components/membership/PlanCard';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ContactForm } from '@/components/support/ContactForm';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { iapAvailable, iapBuy, iapPrices, iapRestore, type StorePrice } from '@/lib/iap';
import {
  fetchBillingConfig,
  fetchFamily,
  fetchMembership,
  inviteToFamily,
  leaveFamily,
  openWebPortal,
  removeFamilyMember,
  revokeFamilyInvite,
  startWebCheckout,
  waitForMembership,
  type Family,
  type InviteResult,
  type Membership,
} from '@/lib/membership';
import { isNative, openOutside } from '@/lib/platform';
import { FAMILY_SEATS, PLAN_INFO, priceLabel, productFor, type Interval, type PaidPlan } from '../../../server/billing/catalog';

/** Apple's page where a person changes or cancels their subscriptions. */
const APPLE_SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

const button =
  'inline-flex h-11 items-center justify-center rounded-pill px-5 text-caption font-medium transition-colors duration-qurtag disabled:opacity-50 disabled:cursor-not-allowed';
const primary = `${button} bg-ink-900 text-canvas hover:bg-ink-700`;
const secondary = `${button} border border-hairline-strong text-ink-900 hover:border-ink-900`;

/**
 * /app/membership: the person's plan, how to change it, and the Family household.
 *
 * Buying differs by device and the plan reads the same on both: on the web the buttons go
 * to Stripe Checkout; in the iPhone app they go to Apple's in-app purchase (the app never
 * shows a way to pay outside Apple). A membership bought either way is shown here and
 * works everywhere, because the plan is recorded by the server (src/lib/membership.ts).
 */
export function MembershipPage() {
  const memberships = useMembershipsAvailable();
  if (!memberships) return <Navigate to="/app/settings" replace />;
  return <MembershipScreen />;
}

function MembershipScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const native = isNative();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [web, setWeb] = useState<Record<string, boolean> | null>(null);
  const [store, setStore] = useState<Map<string, StorePrice> | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const reload = useCallback(async () => {
    const [m, f] = await Promise.all([fetchMembership(), fetchFamily()]);
    if (!m) setFailed(true);
    setMembership(m);
    setFamily(f);
    return m;
  }, []);

  useEffect(() => {
    if (!user) return;
    void reload();
    if (native) {
      iapPrices(user.id).then(setStore, () => setStore(new Map()));
    } else {
      fetchBillingConfig().then((c) => setWeb(c ?? {}));
    }
  }, [user, native, reload]);

  // Back from Stripe: the payment shows up when Stripe's webhook has been recorded.
  const returned = params.get('checkout');
  useEffect(() => {
    if (!user || returned !== 'success') return;
    setNotice('Thank you. We are finishing setting up your membership. This can take a minute.');
    let cancelled = false;
    void waitForMembership((m) => m.plan !== 'free').then(async (m) => {
      if (cancelled) return;
      await reload();
      setNotice(m && m.plan !== 'free' ? `You are on ${PLAN_INFO[m.plan].name}. Thank you.` : 'Your payment is being confirmed. Reload this page in a minute.');
      setParams({}, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [user, returned, reload, setParams]);

  const paidPlan = membership?.plan && membership.plan !== 'free' ? membership.plan : null;

  async function buyOnWeb(plan: PaidPlan, interval: Interval) {
    setError(null);
    setBusy(`${plan}_${interval}`);
    const r = await startWebCheckout(plan, interval);
    if ('url' in r) {
      window.location.href = r.url;
      return;
    }
    setBusy(null);
    setError(r.error);
  }

  async function buyOnPhone(plan: PaidPlan, interval: Interval) {
    if (!user || !store) return;
    const price = store.get(productFor(plan, interval).appleId);
    if (!price) return;
    setError(null);
    setBusy(`${plan}_${interval}`);
    const r = await iapBuy(user.id, price);
    if (r.outcome === 'purchased') {
      setNotice('Thank you. We are finishing setting up your membership. This can take a minute.');
      const m = await waitForMembership((x) => x.plan !== 'free');
      await reload();
      setNotice(m && m.plan !== 'free' ? `You are on ${PLAN_INFO[m.plan].name}. Thank you.` : 'Your purchase went through. It can take a few minutes to show here. Pull to reload this page, or use Restore purchases.');
    } else if (r.outcome === 'failed') {
      setError(r.message ?? 'The purchase did not complete.');
    }
    setBusy(null);
  }

  async function restore() {
    if (!user) return;
    setError(null);
    setBusy('restore');
    const r = await iapRestore(user.id);
    if ('error' in r) {
      setError(r.error);
    } else if (!r.found) {
      setNotice('No active membership was found for this Apple ID.');
    } else {
      setNotice('Restoring your membership...');
      const m = await waitForMembership((x) => x.plan !== 'free', 10);
      await reload();
      setNotice(m && m.plan !== 'free' ? `Restored. You are on ${PLAN_INFO[m.plan].name}.` : 'Apple has a membership for this Apple ID, but it belongs to a different QuR Tag account. Sign in to the account you bought it with.');
    }
    setBusy(null);
  }

  async function manageOnWeb() {
    setError(null);
    setBusy('portal');
    const r = await openWebPortal();
    if ('url' in r) {
      window.location.href = r.url;
      return;
    }
    setBusy(null);
    setError(r.error);
  }

  const manage = (() => {
    if (!membership || !paidPlan) return null;
    const name = PLAN_INFO[paidPlan].name;
    let status: string;
    if (membership.status === 'canceling') status = `Auto-renew is off. Your ${name} plan ends on ${when(membership.period_end)}.`;
    else if (membership.status === 'billing_issue') status = `The last payment did not go through. Update your payment method to keep ${name}.`;
    else status = `Billed yearly. Renews on ${when(membership.period_end)}.`;
    const source = membership.provider === 'apple' ? 'Bought in the iPhone app, with Apple.' : 'Bought on the web, with Stripe.';
    return { name, status, source };
  })();

  if (!user) return null;

  return (
    <AppPage title="Membership" back={{ to: '/app/settings', label: 'Settings' }} width="wide">
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 px-1">
        <p className="text-lg font-semibold text-ink-900">
          {membership ? `You are on ${PLAN_INFO[membership.plan].name}` : 'Your plan'}
        </p>
        {membership && (
          <p className="text-base text-muted text-pretty">
            {membership.item_limit === null
              ? `${membership.items_used} ${membership.items_used === 1 ? 'item' : 'items'}, no limit.`
              : `${membership.items_used} of ${membership.item_limit} items.`}
            {membership.items_plan !== membership.plan && ` Your items follow your family's ${PLAN_INFO[membership.items_plan].name} plan.`}
          </p>
        )}
      </div>

      {failed && (
        <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
          We could not load your plan. Reload the page to try again.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-card bg-ink-50 px-4 py-3 text-body text-ink-900 text-pretty">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-body text-signal-700 text-pretty">
          {error}
        </p>
      )}
      {membership && membership.read_only_item_ids.length > 0 && (
        <p className="rounded-card bg-ink-50 px-4 py-3 text-body text-ink-900 text-pretty">
          {membership.read_only_item_ids.length === 1 ? '1 of your items is' : `${membership.read_only_item_ids.length} of your items are`}{' '}
          over the limit of your plan, so {membership.read_only_item_ids.length === 1 ? 'it is' : 'they are'} read-only. Nothing was deleted.
          Choose a plan below to edit {membership.read_only_item_ids.length === 1 ? 'it' : 'them'} again, or delete items to get back under the limit.
        </p>
      )}

      {manage && membership && (
        <section aria-label="Your membership" className="flex flex-col gap-3 rounded-modal border border-hairline bg-paper p-5">
          <p className="text-sm font-semibold text-ink-700">Your membership</p>
          <p className="text-xl font-semibold text-ink-900">{manage.name}</p>
          <p className="text-body text-ink-700 text-pretty">{manage.status}</p>
          <p className="text-caption text-muted">{manage.source}</p>
          {membership.provider === 'stripe' && !native && (
            <div className="flex flex-col gap-2 items-start">
              <button type="button" className={primary} onClick={manageOnWeb} disabled={busy === 'portal'}>
                {busy === 'portal' ? 'Opening...' : 'Manage membership'}
              </button>
              <p className="text-caption text-muted text-pretty">Change your plan or card, or cancel, on Stripe's secure page.</p>
            </div>
          )}
          {membership.provider === 'stripe' && native && (
            <p className="text-caption text-muted text-pretty">
              To change or cancel it, sign in to your QuR Tag account on the web.
            </p>
          )}
          {membership.provider === 'apple' && native && (
            <div className="flex flex-col gap-2 items-start">
              <button type="button" className={primary} onClick={() => void openOutside(APPLE_SUBSCRIPTIONS)}>
                Manage subscription
              </button>
              <p className="text-caption text-muted text-pretty">Opens your Apple subscriptions, where you can change or cancel.</p>
            </div>
          )}
          {membership.provider === 'apple' && !native && (
            <p className="text-caption text-muted text-pretty">
              To change or cancel it, open Settings on your iPhone, tap your name, then Subscriptions.
            </p>
          )}
        </section>
      )}

      {/* The family comes first for the people in one: it is what they come here to manage. */}
      {family && family.role !== 'none' && (
        <FamilySection
          family={family}
          onChanged={async () => {
            await reload();
          }}
          toast={(m) => toast.show({ kind: 'success', title: m })}
        />
      )}

      <section aria-label="Plans" className="grid md:grid-cols-3 gap-qurtag-3 items-stretch">
        <PlanCard plan="free" current={membership?.plan === 'free'} />
        {(['plus', 'family'] as const).map((plan) => {
          const prices = store ? new Map([...store].map(([id, p]) => [id, p.priceString])) : undefined;
          const showBuy = !paidPlan;
          return (
            <PlanCard key={plan} plan={plan} current={membership?.plan === plan} prices={native && prices && prices.size ? prices : undefined}>
              {showBuy && (() => {
                const interval = 'year' as const;
                const key = `${plan}_${interval}`;
                const product = productFor(plan, interval);
                if (native) {
                  const price = store?.get(product.appleId);
                  if (!iapAvailable() || (store && !price)) {
                    return (
                      <button type="button" className={secondary} disabled>
                        Coming soon
                      </button>
                    );
                  }
                  return (
                    <button type="button" className={primary} disabled={!price || !!busy} onClick={() => void buyOnPhone(plan, interval)}>
                      {busy === key ? 'Opening the App Store...' : `Pay ${price ? `${price.priceString} ` : ''}a year`}
                    </button>
                  );
                }
                if (web && !web[key]) {
                  return (
                    <button type="button" className={secondary} disabled>
                      Coming soon
                    </button>
                  );
                }
                return (
                  <button type="button" className={primary} disabled={!web || !!busy} onClick={() => void buyOnWeb(plan, interval)}>
                    {busy === key ? 'Opening...' : `Pay ${priceLabel(product.cents)} a year`}
                  </button>
                );
              })()}
            </PlanCard>
          );
        })}
      </section>

      {native && (
        <div className="flex flex-col gap-2 items-start">
          <button type="button" className={secondary} onClick={restore} disabled={busy === 'restore'}>
            {busy === 'restore' ? 'Restoring...' : 'Restore purchases'}
          </button>
          <p className="text-caption text-muted text-pretty">
            Already subscribed with this Apple ID, on another phone or before you reinstalled? Restore brings your membership back.
          </p>
        </div>
      )}

      <section aria-label="Question about a charge" className="flex flex-col gap-3">
        {asking ? (
          <ContactForm initialTopic="billing" />
        ) : (
          <button type="button" className={`${secondary} self-start`} onClick={() => setAsking(true)}>
            Question about a charge?
          </button>
        )}
      </section>

      <section aria-label="Billing terms" className="border-t border-hairline pt-qurtag-5 flex flex-col gap-2 text-caption text-muted text-pretty">
        <p>
          Plus and Family are subscriptions that renew automatically every year until you
          cancel. You can cancel at any time, and you keep your plan until the end of the period you already paid for. Canceling stops the
          next payment; it does not delete anything you made.
        </p>
        {(native || membership?.provider === 'apple') && (
        <p>
          On iPhone, payment is charged to your Apple ID at confirmation of purchase. The subscription renews unless it is canceled at
          least 24 hours before the end of the current period, and your Apple ID is charged for the renewal within 24 hours before the
          period ends. Manage or cancel it in Settings on your iPhone: tap your name, then Subscriptions. Refunds for purchases made in the
          app are handled by Apple, at reportaproblem.apple.com.
        </p>
        )}
        {(!native || membership?.provider === 'stripe') && (
        <p>
          On the web, payment is taken by Stripe.{' '}
          {membership?.provider === 'stripe'
            ? 'Cancel with Manage membership, under Your membership above.'
            : 'If you subscribe on the web, you can cancel on this page at any time.'}{' '}
          If you think you were charged by mistake, use{' '}
          <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-[44px] items-center align-middle text-left underline underline-offset-4 text-ink-900">Question about a charge?</button>
          {' '}above, or email info@impactconsulting.ai if you cannot sign in.
        </p>
        )}
        <p>
          If you go back to a lower plan, nothing is deleted: items over the limit stay and become read-only until you upgrade or delete
          some.
        </p>
        <p>
          <Link to="/app/terms" className="underline underline-offset-4 text-ink-900">Terms</Link>
          {' · '}
          <Link to="/app/privacy" className="underline underline-offset-4 text-ink-900">Privacy</Link>
        </p>
      </section>
    </div>
    </AppPage>
  );
}

// ------------------------------------------------------------------ Family

function FamilySection({ family, onChanged, toast }: { family: Family; onChanged: () => Promise<void>; toast: (message: string) => void }) {
  const owner = family.role === 'owner';
  const members = family.members ?? [];
  const invites = family.invites ?? [];
  const used = members.length + invites.length;
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InviteResult | null>(null);
  const [removing, setRemoving] = useState<{ user_id: string; name: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, setPending] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(null);
    setSending(true);
    const r = await inviteToFamily(email);
    setSending(false);
    if ('error' in r) return setError(r.error);
    setSent(r);
    setEmail('');
    await onChanged();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied');
    } catch {
      toast('Select the link and copy it');
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setPending(true);
    const r = await removeFamilyMember(removing.user_id);
    setPending(false);
    setRemoving(null);
    if (!r.ok) return setError(r.error);
    toast('Removed from your family');
    await onChanged();
  }

  async function confirmLeave() {
    setPending(true);
    const r = await leaveFamily();
    setPending(false);
    setLeaving(false);
    if (!r.ok) return setError(r.error);
    toast('You left the family');
    await onChanged();
  }

  return (
    <section aria-label="Family" className="flex flex-col gap-4 rounded-modal border border-hairline bg-canvas p-5">
      <p className="text-sm font-semibold text-ink-700">Family</p>
      <h2 className="text-xl font-semibold text-ink-900">
        {used > 0 || !owner ? `${members.length} of ${FAMILY_SEATS} places used` : 'Share with your family'}
      </h2>

      {family.active === false && (
        <p role="status" className="rounded-card bg-ink-50 px-4 py-3 text-body text-ink-900 text-pretty">
          {owner
            ? 'Your Family plan is not active, so the people below are paused: they cannot see the family\'s items until you have Family again. Nothing was deleted.'
            : 'This family\'s plan is not active right now, so you cannot see its items. Nothing was deleted: they come back when the owner has Family again.'}
        </p>
      )}

      <p className="text-caption text-muted text-pretty">
        Everyone in a family sees the same items and the same inbox. Items someone adds belong to the family and stay if they leave. Each person
        keeps their own account and sign-in, and anything they made on their own stays theirs.
      </p>

      <ul className="flex flex-col divide-y divide-hairline">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-body text-ink-900 truncate">
                {m.name || m.email}
                {m.is_me && <span className="text-muted"> (you)</span>}
              </p>
              <p className="text-caption text-muted truncate">
                {m.role === 'owner' ? 'Owner' : 'Member'} · {m.email}
              </p>
            </div>
            {owner && m.role === 'member' && (
              <button type="button" className={secondary} onClick={() => setRemoving({ user_id: m.user_id, name: m.name || m.email })}>
                Remove
              </button>
            )}
            {!owner && m.is_me && (
              <button type="button" className={secondary} onClick={() => setLeaving(true)}>
                Leave
              </button>
            )}
          </li>
        ))}
      </ul>

      {owner && invites.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-caption font-medium text-ink-900">Waiting to accept</p>
          <ul className="flex flex-col divide-y divide-hairline">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-body text-ink-900 truncate">{i.email}</p>
                  <p className="text-caption text-muted">Invite expires {when(i.expires_at)}</p>
                </div>
                <button
                  type="button"
                  className={secondary}
                  onClick={async () => {
                    const r = await revokeFamilyInvite(i.id);
                    if (!r.ok) setError(r.error);
                    await onChanged();
                  }}
                >
                  Cancel invite
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {owner && family.active !== false && used < FAMILY_SEATS && (
        <form onSubmit={invite} className="flex flex-col gap-2 max-w-md">
          <Input
            name="family-email"
            type="email"
            label="Invite someone by email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="They get a link to join. It works once, for that address, and lasts 7 days."
            required
          />
          <button type="submit" className={`${primary} self-start`} disabled={sending || !email.trim()}>
            {sending ? 'Making the invite...' : 'Invite'}
          </button>
        </form>
      )}
      {owner && family.active !== false && used >= FAMILY_SEATS && (
        <p className="text-caption text-muted">All {FAMILY_SEATS} places are taken. Remove someone or cancel an invite to invite another person.</p>
      )}

      {sent && (
        <div role="status" className="rounded-card bg-ink-50 p-4 flex flex-col gap-2">
          <p className="text-body text-ink-900 text-pretty">
            {sent.emailed
              ? `We emailed an invite to ${sent.email}. Ask them to check their spam or junk folder if it does not arrive. You can also send them this link yourself:`
              : `Email is not set up on our side yet, so nothing was sent. Copy this link and send it to ${sent.email} yourself:`}
          </p>
          <input
            readOnly
            value={sent.link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-card border border-hairline-strong bg-canvas px-4 text-caption text-ink-900"
          />
          <button type="button" className={`${secondary} self-start`} onClick={() => void copy(sent.link)}>
            Copy link
          </button>
          <p className="text-caption text-muted">This link is shown only now. Anyone with it who signs in with that email address can join.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-body text-signal-700 text-pretty">
          {error}
        </p>
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        eyebrow="Family"
        title={`Remove ${removing?.name ?? ''}?`}
        description="They lose access to the family's items and inbox right away. Their own account and anything they made on their own stay theirs."
        primaryAction={{ label: 'Remove', tone: 'destructive', onClick: confirmRemove, pending }}
        secondaryAction={{ label: 'Cancel', onClick: () => setRemoving(null) }}
      />
      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        eyebrow="Family"
        title="Leave this family?"
        description="You lose access to the family's items and inbox. Items you added to the family stay with the family. Your own account and anything you made on your own stay yours."
        primaryAction={{ label: 'Leave', tone: 'destructive', onClick: confirmLeave, pending }}
        secondaryAction={{ label: 'Cancel', onClick: () => setLeaving(false) }}
      />
    </section>
  );
}
