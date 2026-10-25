import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/ui/Container';
import { PlanCard } from '@/components/membership/PlanCard';
import { fetchBillingConfig } from '@/lib/membership';
import { FREE_ITEM_LIMIT, FREE_SCAN_DAYS, priceLabel, productFor, type PaidPlan } from '../../../server/billing/catalog';
import { PageHero, PageBody, Section, P, Bullets, CtaBand, ContactLink } from './parts';

const button =
  'inline-flex min-h-11 items-center justify-center rounded-pill px-5 text-caption font-medium transition-colors duration-qurtag';

/**
 * /pricing: the three plans and what they cost, with only what the product does. A paid
 * plan's buttons take the person to sign in and pay on the Membership page; while payment is
 * not open (a setting is missing on the server) each says "Coming soon" instead.
 */
export function Pricing() {
  const [available, setAvailable] = useState<Record<string, boolean> | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchBillingConfig().then((c) => {
      if (!cancelled) setAvailable(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function buy(plan: PaidPlan) {
    const p = productFor(plan, 'year');
    const label = `Pay ${priceLabel(p.cents)} a year`;
    if (available === undefined) {
      return (
        <button type="button" disabled className={`${button} border border-hairline-strong text-muted`}>
          {label}
        </button>
      );
    }
    if (!available || !available[`${plan}_year`]) {
      return (
        <button type="button" disabled className={`${button} border border-hairline-strong text-muted`}>
          Coming soon
        </button>
      );
    }
    return (
      <Link to="/app/membership" className={`${button} bg-ink-900 text-canvas hover:bg-ink-700`}>
        {label}
      </Link>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="Plans"
        title="Free for three things. Plus for everything."
        lede={`Start free with up to ${FREE_ITEM_LIMIT} items. Move to Plus for no limit, or Family to share with the people you live with.`}
      />
      <section className="border-t border-hairline bg-paper">
        <Container size="lg">
          <div className="py-qurtag-12 grid md:grid-cols-3 gap-qurtag-3 items-stretch">
            <PlanCard plan="free">
              <Link to="/start" className={`${button} bg-ink-900 text-canvas hover:bg-ink-700`}>
                Make a free tag
              </Link>
            </PlanCard>
            <PlanCard plan="plus">{buy('plus')}</PlanCard>
            <PlanCard plan="family">{buy('family')}</PlanCard>
          </div>
        </Container>
      </section>
      <PageBody>
        <Section title="The same QuR Tag on every plan">
          <Bullets
            items={[
              "The page a finder sees when they scan, with your item's name, photo and note. Finders need no app and no account.",
              'Your QuR Tag inbox, where you read and reply to finders. Neither side sees the other\'s email address.',
              'A lost switch, so the tag page says the item is missing.',
              'Printing your tags as often as you like, on paper at home.',
            ]}
          />
        </Section>
        <Section title="What changes with a plan">
          <Bullets
            items={[
              `Items: ${FREE_ITEM_LIMIT} on Free, no limit on Plus and Family.`,
              `Scan history: the last ${FREE_SCAN_DAYS} days on Free, all of it on Plus and Family.`,
              'People: 1 on Free and Plus, up to 5 on Family, sharing the items and the inbox.',
            ]}
          />
        </Section>
        <Section title="Paying and canceling">
          <P>
            Plus and Family renew automatically every year until you cancel. Cancel at any time and you
            keep your plan until the end of the period you paid for. On the web, you pay with a card through Stripe and manage or cancel
            your membership from the Membership page. On iPhone, you pay through Apple and manage or cancel it in your iPhone's
            Subscriptions settings. A membership bought either way works on the web and on iPhone when you sign in to the same account.
          </P>
          <P>
            If you move to a lower plan, nothing is deleted. Items over the new limit stay, and can be read and deleted, but not changed,
            until you upgrade again. If you have any questions, write to <ContactLink />. Read the <Link to="/terms" className="underline underline-offset-4 text-ink-900">Terms</Link> and
            the <Link to="/privacy" className="underline underline-offset-4 text-ink-900">Privacy policy</Link>.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Make a free tag." body="You can move to Plus or Family whenever you need more." />
    </>
  );
}
