import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Minus, MoveHorizontal } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';
import { cn } from '@/lib/cn';

const plans = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: 'Two items, the printable tag, and the full recovery loop. 7% QurTag fee on rewards and prepaid labels.',
    cta: 'Start free',
    featured: false,
  },
  {
    key: 'plus',
    name: 'Plus',
    price: '$2.99',
    cadence: 'per month · or $19/yr',
    description: 'Unlimited items. Zero transaction fees. Worth it the first time you travel.',
    cta: 'Try Plus free for 14 days',
    featured: true,
  },
  {
    key: 'family',
    name: 'Family',
    price: '$4.99',
    cadence: 'per month · or $39/yr',
    description: 'Up to 5 members. Kids and caregivers included. Zero transaction fees.',
    cta: 'Choose Family',
    featured: false,
  },
  {
    key: 'business',
    name: 'Business',
    price: '$79',
    cadence: '+ $4 per seat',
    description: 'For hotels, airlines, schools, IT teams.',
    cta: 'Talk to us',
    featured: false,
  },
];

interface Feature {
  label: string;
  free: boolean | string;
  plus: boolean | string;
  family: boolean | string;
  business: boolean | string;
}

const featureRows: Array<{ section: string; rows: Feature[] }> = [
  {
    section: 'Core',
    rows: [
      { label: 'Items', free: '2', plus: 'Unlimited', family: 'Unlimited', business: 'Unlimited' },
      { label: 'Printable tags', free: true, plus: true, family: true, business: true },
      { label: 'Private messaging bridge', free: true, plus: true, family: true, business: true },
      { label: 'Scan history', free: '30 days', plus: 'Forever', family: 'Forever', business: 'Forever' },
      { label: 'Push, email, SMS alerts', free: true, plus: true, family: true, business: true },
    ],
  },
  {
    section: 'Recovery',
    rows: [
      { label: 'Reward escrow', free: 'Available · 7% fee', plus: '0% fee', family: '0% fee', business: '0% fee' },
      { label: 'Prepaid courier handoff', free: 'Available · 7% fee', plus: '0% fee', family: '0% fee', business: '0% fee' },
      { label: 'Translation by default', free: false, plus: true, family: true, business: true },
      { label: 'Trip mode with live flight context', free: false, plus: true, family: true, business: true },
      { label: 'Chain-of-custody PDF for insurance', free: false, plus: true, family: true, business: true },
    ],
  },
  {
    section: 'People',
    rows: [
      { label: 'Members', free: '1', plus: '1', family: '5', business: 'Unlimited' },
      { label: 'Kid Mode + Caregiver Mode', free: false, plus: false, family: true, business: true },
      { label: 'SSO (SAML, OIDC)', free: false, plus: false, family: false, business: true },
      { label: 'Role-based access', free: false, plus: false, family: false, business: true },
    ],
  },
  {
    section: 'Surface',
    rows: [
      { label: 'Apple Wallet + Google Wallet passes', free: true, plus: true, family: true, business: true },
      { label: 'iOS Live Activity', free: false, plus: true, family: true, business: true },
      { label: 'API + webhooks', free: false, plus: false, family: false, business: true },
      { label: 'Custom branding on finder pages', free: false, plus: false, family: false, business: true },
    ],
  },
  {
    section: 'Support',
    rows: [
      { label: 'Help center + community', free: true, plus: true, family: true, business: true },
      { label: 'Recovery concierge (a human on every case)', free: false, plus: true, family: true, business: true },
      { label: 'SLA', free: false, plus: false, family: false, business: true },
    ],
  },
];

const faqs = [
  {
    q: 'Is free really free?',
    a: "Yes. Two items, printable tags included, the full recovery loop works exactly the same as Plus. Free is not a trial. It's a real plan a lot of people will stay on.",
  },
  {
    q: "What's the 7% QurTag fee on Free?",
    a: "Reward escrow and prepaid courier labels still work on Free. QurTag takes a 7% platform fee on the funds that flow through Stripe (rewards captured, label payments). Plus and Family remove that fee entirely. Translation: if you set a $50 reward on Free, the finder gets $46.50 and QurTag keeps $3.50. On Plus, the finder gets the full $50.",
  },
  {
    q: 'When is Plus worth it?',
    a: "If you put more than one reward on something a year. Say a $40 hold once and a $30 hold once. Plus pays for itself with the 7% you'd otherwise pay. It also unlocks unlimited items, translation, trip mode, and full scan history. Most travelers cover the annual cost the first time they recover a bag.",
  },
  {
    q: "What's the difference between the printable tag and a premium one?",
    a: "Function: identical. Premium tags (Pro aluminum, Signature leather, Track BLE) are about materials, durability, and how the tag looks on your bag. The software does exactly the same thing regardless.",
  },
  {
    q: 'What happens to the reward in escrow?',
    a: "Stripe holds it on your card. Released to the finder the moment you confirm the item is back. Auto-refunded if you cancel lost mode or scan the tag yourself. We never touch the funds. The only thing QurTag takes is the 7% platform fee on Free, or nothing at all on Plus and above.",
  },
  {
    q: 'Do I have to keep paying for the tag to keep working?',
    a: "No. Even if you cancel Plus, your tags keep working at the Free tier. You don't lose the recovery loop. You lose the extras, and the 7% fee comes back on transactions.",
  },
  {
    q: 'How do I get a refund?',
    a: 'Email us within 30 days. No questions. Hardware returns: 100 days, no questions, prepaid return label.',
  },
];

export function Pricing() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container size="xl">
          <div className="pt-cairn-8 pb-cairn-8 md:pt-16 md:pb-cairn-8 max-w-3xl flex flex-col gap-5">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              Free is a real plan. Plus is when you travel.
            </h1>
            <Lede>
              Membership is the product. The tag is up to you. Print one at home or buy one made
              of leather. Either way, you keep the calm app behind it.
            </Lede>
          </div>
        </Container>
      </section>

      {/* Hardware */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-cairn-8 flex flex-col gap-cairn-5">
            <div className="max-w-2xl flex flex-col gap-3">
              <Eyebrow>Hardware (one-time)</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Pay for the tag. Keep the app.
              </h2>
              <p className="text-body text-ink-700 text-pretty max-w-xl">
                Hardware is one-time. Membership is the software. Every tag works on every plan,
                including Free.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { name: 'Printable', detail: 'A4 PDF, free with any plan', price: '$0' },
                { name: 'Stickers', detail: '5-pack / 12-pack / 40-pack', price: 'From $18' },
                { name: 'Core silicone', detail: '2-pack', price: '$26' },
                { name: 'Pro aluminum', detail: 'NFC, etched, 2-pack', price: '$52' },
                { name: 'Signature leather', detail: 'Brass, monogrammed', price: '$58' },
                { name: 'Track', detail: 'Find My + Find Hub beacon', price: '$72' },
              ].map((h) => (
                <article
                  key={h.name}
                  className="rounded-card border border-hairline bg-canvas p-cairn-3 flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col">
                    <span className="text-body font-medium text-ink-900">{h.name}</span>
                    <span className="text-caption text-muted">{h.detail}</span>
                  </div>
                  <span className="text-body font-medium text-ink-900">{h.price}</span>
                </article>
              ))}
            </div>
            <Link to="/tags" className="link-arrow text-body mt-1">
              See the hardware lineup
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
        </Container>
      </section>

      {/* Plan cards */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-cairn-8 grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {plans.map((p) => (
              <article
                key={p.key}
                className={cn(
                  'relative rounded-modal p-cairn-5 flex flex-col gap-4 transition-all duration-cairn',
                  p.featured
                    ? 'bg-ink-950 text-ink-50 shadow-elevated'
                    : 'bg-canvas border border-hairline',
                )}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-cairn-5 inline-flex items-center rounded-pill bg-signal-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-canvas">
                    Most loved
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'text-eyebrow uppercase tracking-[0.14em]',
                      p.featured ? 'text-ink-200' : 'text-muted',
                    )}
                  >
                    {p.name}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        'font-display font-semibold text-h2 tracking-[-0.028em]',
                        p.featured ? 'text-ink-50' : 'text-ink-900',
                      )}
                    >
                      {p.price}
                    </span>
                    <span
                      className={cn(
                        'text-caption',
                        p.featured ? 'text-ink-300' : 'text-muted',
                      )}
                    >
                      {p.cadence}
                    </span>
                  </div>
                </div>
                <p
                  className={cn(
                    'text-body text-pretty',
                    p.featured ? 'text-ink-200' : 'text-ink-700',
                  )}
                >
                  {p.description}
                </p>
                <Link
                  to={p.key === 'business' ? '/business' : '/start'}
                  className={cn(
                    'mt-auto inline-flex h-11 items-center justify-center rounded-pill px-5 text-caption font-medium transition-colors duration-cairn',
                    p.featured
                      ? 'bg-canvas text-ink-900 hover:bg-ink-50'
                      : 'bg-ink-900 text-canvas hover:bg-ink-700',
                  )}
                >
                  {p.cta}
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Feature comparison */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-5">
            <div className="flex flex-col gap-3 max-w-2xl">
              <Eyebrow>What's in each</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                The honest comparison.
              </h2>
            </div>
            <ComparisonTable />
            <p className="text-caption text-muted">
              All plans include unlimited threads, realtime updates, the QurTag web app, and the
              service worker for Web Push.
            </p>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>Questions worth answering</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Frequently, and honestly. Asked.
              </h2>
            </div>
            <div className="flex flex-col gap-cairn-5">
              {faqs.map((faq) => (
                <div key={faq.q} className="flex flex-col gap-2 border-t border-hairline pt-cairn-3 first:border-t-0 first:pt-0">
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
                    {faq.q}
                  </h3>
                  <p className="text-body text-ink-700 text-pretty">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Outro */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-cairn-8 flex flex-col items-start gap-6">
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
              Start free. Upgrade when a trip is on the calendar.
            </h2>
            <div className="flex items-center gap-6">
              <Link
                to="/start"
                className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-cairn"
              >
                Start free
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
              <Link to="/business" className="link-arrow text-body">
                Talk to us about Business
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function ComparisonTable() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setAtStart(el.scrollLeft <= 2);
      setAtEnd(max <= 2 || el.scrollLeft >= max - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'md:hidden inline-flex items-center gap-1.5 self-start text-caption text-muted',
          'transition-opacity duration-cairn',
          atEnd ? 'opacity-0' : 'opacity-100',
        )}
        aria-hidden
      >
        <MoveHorizontal size={13} strokeWidth={1.75} />
        Swipe to compare all plans
      </div>
      <div className="relative rounded-modal border border-hairline bg-canvas">
        <div ref={scrollerRef} className="overflow-x-auto rounded-modal">
          <table className="w-full text-body min-w-[720px]">
            <thead>
              <tr className="bg-paper text-caption text-muted">
                <th className="text-left px-cairn-5 py-3 font-medium" />
                {plans.map((p) => (
                  <th
                    key={p.key}
                    className="text-left px-cairn-5 py-3 font-medium text-ink-900"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((section) => (
                <Fragment key={section.section}>
                  <tr key={`${section.section}-header`} className="border-t border-hairline">
                    <td
                      colSpan={5}
                      className="px-cairn-5 pt-cairn-3 pb-2 text-eyebrow uppercase tracking-[0.14em] text-muted"
                    >
                      {section.section}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className="border-t border-hairline">
                      <td className="px-cairn-5 py-3 text-ink-700">{row.label}</td>
                      <Cell value={row.free} />
                      <Cell value={row.plus} />
                      <Cell value={row.family} />
                      <Cell value={row.business} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Edge fades. Only visible on mobile while there is overflow in that direction. */}
        <div
          className={cn(
            'md:hidden pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-modal',
            'bg-gradient-to-r from-canvas to-transparent transition-opacity duration-cairn',
            atStart ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden
        />
        <div
          className={cn(
            'md:hidden pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-modal',
            'bg-gradient-to-l from-canvas to-transparent transition-opacity duration-cairn',
            atEnd ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <td className="px-cairn-5 py-3">
        <Check size={16} strokeWidth={2} className="text-verdigris-700" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-cairn-5 py-3">
        <Minus size={16} strokeWidth={1.5} className="text-ink-200" />
      </td>
    );
  }
  return (
    <td className="px-cairn-5 py-3 text-caption text-ink-700 font-medium">{value}</td>
  );
}
