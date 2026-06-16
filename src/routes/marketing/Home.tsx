import { Link } from 'react-router-dom';
import { ArrowRight, Printer, Package, Sparkles, Check } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede, Body } from '@/components/brand/Typography';
import { PhoneMockup } from '@/components/brand/PhoneMockup';
import { DesktopMockup } from '@/components/brand/DesktopMockup';
import { cn } from '@/lib/cn';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: '2 items. The full recovery loop. 7% QurTag fee on rewards and labels.',
    features: [
      'Print your own tags',
      'Private messaging bridge',
      'Reward escrow + courier (7% fee)',
      '30-day scan history',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Plus',
    price: '$2.99',
    cadence: 'per month · or $19/yr',
    description: 'Unlimited items. Zero transaction fees. Worth it the first time you travel.',
    features: [
      'Unlimited items',
      '0% fees on rewards + labels',
      'Translation by default',
      'Trip mode with live flight context',
      'Lifetime scan history',
    ],
    cta: 'Try Plus free for 14 days',
    featured: true,
  },
  {
    name: 'Family',
    price: '$4.99',
    cadence: 'per month · or $39/yr',
    description: 'Up to 5 members. Kids and caregivers included.',
    features: [
      'Everything in Plus',
      '5 members',
      'Kid Mode and Caregiver Mode',
      'Shared collections',
    ],
    cta: 'Choose Family',
    featured: false,
  },
];

const entryPoints = [
  {
    icon: Printer,
    title: 'Print one tonight.',
    body: 'Sign up, customize a tag, and print it at home on plain paper or a sticker sheet. Yours in five minutes, free with any plan.',
    cta: 'See the printable',
  },
  {
    icon: Package,
    title: 'Order one tomorrow.',
    body: 'Premium aluminum, full-grain leather, or a BLE-equipped tag for the people who want real materials. Ships with your monogram.',
    cta: 'Shop the tags',
  },
  {
    icon: Sparkles,
    title: 'Bring your own QR.',
    body: 'Got a sticker sheet from somewhere else? QurTag works with any QR. Paste a URL on your bag, the app handles the rest.',
    cta: 'How it works',
  },
];

export function MarketingHome() {
  return (
    <>
      {/* ─────────── Hero ─────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-signal-glow pointer-events-none" aria-hidden />
        <Container size="xl">
          <div className="grid lg:grid-cols-12 gap-cairn-8 items-start pt-cairn-8 pb-cairn-8 md:pt-16 md:pb-cairn-8">
            <div className="lg:col-span-7 flex flex-col gap-6">
              <span className="inline-flex items-center gap-2 self-start rounded-pill border border-hairline-strong bg-canvas/70 backdrop-blur-sm px-3 py-1 text-caption text-ink-700">
                <span className="size-1.5 rounded-full bg-signal-500" />
                Software for things that matter
              </span>
              <h1 className="font-display font-semibold text-ink-900 text-balance text-h2 sm:text-h1 leading-[0.95] tracking-[-0.035em]">
                The calm app for the things you'd rather not lose.
              </h1>
              <Lede className="max-w-xl">
                A membership, an app, and a tag. From a $4 sticker to hand-stitched leather,
                quietly standing between your things and the world. Luggage, laptops, kids'
                instruments, the AirPods you'd hate to replace.
              </Lede>
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <Link
                  to="/start"
                  className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-cairn"
                >
                  Start free
                </Link>
                <Link
                  to="/how-it-works"
                  className="link-arrow text-body"
                >
                  See how it works
                  <ArrowRight size={16} strokeWidth={1.75} />
                </Link>
              </div>
              <p className="text-caption text-muted">
                Free forever for two items. No card. No app store required.
              </p>
              {/* Inline brand mentions. Replaces the divider-banded "footer strip" */}
              <div className="flex flex-wrap items-center gap-x-cairn-3 gap-y-1 mt-cairn-2 text-caption text-muted">
                <span className="text-eyebrow uppercase tracking-[0.14em]">Built for owners of</span>
                <span className="font-medium text-ink-700">Tumi</span>
                <span className="text-muted">·</span>
                <span className="font-medium text-ink-700">Rimowa</span>
                <span className="text-muted">·</span>
                <span className="font-medium text-ink-700">Bellroy</span>
                <span className="text-muted">·</span>
                <span className="font-medium text-ink-700">MacBook</span>
                <span className="text-muted">·</span>
                <span className="font-medium text-ink-700">Bose</span>
              </div>
            </div>
            <div className="lg:col-span-5 relative flex justify-center lg:justify-end min-h-[320px] lg:min-h-[420px]">
              {/* Desktop in the back. Hidden on mobile (too cluttered) */}
              <div className="hidden lg:block absolute top-cairn-5 right-cairn-8 left-auto w-[400px] opacity-95">
                <DesktopMockup />
              </div>
              {/* Phone in the foreground */}
              <div className="relative z-10 lg:translate-y-cairn-8 lg:-translate-x-cairn-3">
                <PhoneMockup />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ─────────── The membership ─────────── */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 grid lg:grid-cols-12 gap-cairn-8 items-start">
            <div className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-28">
              <Eyebrow>The membership</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Every item you'd hate to lose, organized in one calm place.
              </h2>
              <Body className="max-w-md text-pretty">
                QurTag is software first. The tag is a delivery vehicle for it. Pay a few dollars a
                month for the app and you get the recovery network, translation by default, trip
                mode, reward escrow, and the courier handoff. On any QR you can stick to anything.
              </Body>
              <Link to="/pricing" className="link-arrow text-body mt-1">
                See pricing
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
            <div className="lg:col-span-7 grid sm:grid-cols-2 gap-3">
              {[
                {
                  title: 'Items',
                  body: 'Photo, brand, declared value, receipt, serial. The profile that makes recovery (and an insurance claim) easy.',
                },
                {
                  title: 'Trips',
                  body: 'Paste a flight number. Your message and finder page know the itinerary, in the finder\'s language.',
                },
                {
                  title: 'Inbox',
                  body: 'A bridge between you and a stranger. Their language, your language, no exposure either way.',
                },
                {
                  title: 'Custody',
                  body: 'Every hand-off is signed. Generate the insurance packet in one click if something goes wrong.',
                },
              ].map((feat) => (
                <article
                  key={feat.title}
                  className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-2 hover:border-hairline-strong transition-colors duration-cairn"
                >
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em]">
                    {feat.title}
                  </h3>
                  <Body className="text-caption text-muted text-pretty">{feat.body}</Body>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ─────────── DARK MOMENT. Privacy story ─────────── */}
      <section className="relative bg-ink-950 text-ink-50 overflow-hidden">
        <div className="absolute inset-0 bg-dark-grain pointer-events-none" aria-hidden />
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 size-[640px] rounded-full opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, #FF5C2E40, transparent)' }}
          aria-hidden
        />
        <Container size="xl">
          <div className="relative py-cairn-24 flex flex-col items-center text-center gap-7">
            <span className="inline-flex items-center gap-2 rounded-pill border border-hairline-dark px-3 py-1 text-caption text-ink-200">
              <span className="size-1.5 rounded-full bg-signal-500" />
              Privacy by structure
            </span>
            <h2 className="font-display font-semibold text-ink-50 text-h1 sm:text-display tracking-[-0.04em] leading-[0.95] text-balance max-w-4xl">
              Nothing about you. Nothing about them. Just the thing, finding its way home.
            </h2>
            <p className="max-w-2xl text-lede text-ink-300 text-pretty">
              A scan opens a contact bridge, not a contact card. Owners stay private. Finders stay
              private. QurTag passes notes between two strangers, then dissolves the channel when
              the item is home.
            </p>
            <Link to="/security" className="link-arrow text-body text-ink-50 mt-1">
              Read the architecture
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
        </Container>
      </section>

      {/* ─────────── Three ways in ─────────── */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-8">
            <div className="max-w-3xl flex flex-col gap-4">
              <Eyebrow>Three ways in</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Print one tonight. Buy one tomorrow.
              </h2>
              <Lede className="max-w-2xl">
                The membership is the product. The tag is up to you. Three doors into the same calm system.
              </Lede>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {entryPoints.map((point) => (
                <article
                  key={point.title}
                  className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3 hover:shadow-elevated hover:border-hairline-strong transition-all duration-cairn"
                >
                  <point.icon size={22} strokeWidth={1.5} className="text-ink-900" />
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em]">
                    {point.title}
                  </h3>
                  <Body className="text-caption text-muted text-pretty flex-1">{point.body}</Body>
                  <Link to="/tags" className="link-arrow text-caption text-ink-900 mt-1">
                    {point.cta}
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ─────────── Pricing ─────────── */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-8">
            <div className="max-w-3xl flex flex-col gap-4">
              <Eyebrow>Membership</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Free is a real plan. Plus is when you travel.
              </h2>
              <Lede className="max-w-2xl">
                Every plan includes printable tags. Premium hardware is optional, and beautiful when
                you want it.
              </Lede>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {tiers.map((tier) => (
                <article
                  key={tier.name}
                  className={cn(
                    'relative rounded-modal p-cairn-5 flex flex-col gap-4 transition-all duration-cairn',
                    tier.featured
                      ? 'bg-ink-950 text-ink-50 shadow-elevated'
                      : 'bg-canvas border border-hairline',
                  )}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-cairn-5 inline-flex items-center gap-1.5 rounded-pill bg-signal-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-canvas">
                      Most loved
                    </span>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className={cn(
                      'text-eyebrow uppercase tracking-[0.14em]',
                      tier.featured ? 'text-ink-200' : 'text-muted',
                    )}>{tier.name}</span>
                    <div className="flex items-baseline gap-2">
                      <span className={cn(
                        'font-display font-semibold text-h2 tracking-[-0.028em]',
                        tier.featured ? 'text-ink-50' : 'text-ink-900',
                      )}>{tier.price}</span>
                      <span className={cn(
                        'text-caption',
                        tier.featured ? 'text-ink-300' : 'text-muted',
                      )}>{tier.cadence}</span>
                    </div>
                  </div>
                  <p className={cn(
                    'text-body text-pretty',
                    tier.featured ? 'text-ink-200' : 'text-ink-700',
                  )}>{tier.description}</p>
                  <ul className="flex flex-col gap-2 flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className={cn(
                        'flex items-start gap-2 text-caption',
                        tier.featured ? 'text-ink-100' : 'text-ink-700',
                      )}>
                        <Check size={14} strokeWidth={2} className={cn(
                          'mt-0.5 shrink-0',
                          tier.featured ? 'text-signal-500' : 'text-ink-900',
                        )} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/start"
                    className={cn(
                      'inline-flex h-11 items-center justify-center rounded-pill px-5 text-caption font-medium transition-colors duration-cairn',
                      tier.featured
                        ? 'bg-canvas text-ink-900 hover:bg-ink-50'
                        : 'bg-ink-900 text-canvas hover:bg-ink-700',
                    )}
                  >
                    {tier.cta}
                  </Link>
                </article>
              ))}
            </div>
            <p className="text-caption text-muted">
              Business plans, partner portal, and API available. <Link to="/business" className="text-ink-900 underline-offset-4 hover:underline">talk to us</Link>.
            </p>
          </div>
        </Container>
      </section>

      {/* ─────────── Stories ─────────── */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-8">
            <div className="max-w-3xl flex flex-col gap-4">
              <Eyebrow>Stories of return</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Quiet wins, one bag at a time.
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                {
                  who: 'Helena, Lisbon',
                  what: 'Rimowa, left on a tram',
                  quote: 'A stranger wrote me in Portuguese. The map pin was already there. The next morning my bag was at the Memmo Alfama.',
                },
                {
                  who: 'Marcus, SFO',
                  what: 'MacBook Pro, café in SOMA',
                  quote: 'I left my laptop on the café table. A sticker the size of a coin got it back to my desk before lunch, with the coffee stains intact.',
                },
                {
                  who: 'Dana, the orchestra parent',
                  what: "Daughter's clarinet, school bus",
                  quote: "The iron-on label inside her case got scanned by the bus driver. He kept it overnight; we picked it up at the depot before rehearsal. No tears, no missed concert.",
                },
              ].map((s) => (
                <article
                  key={s.who}
                  className="rounded-modal border border-hairline bg-canvas p-cairn-5 flex flex-col gap-3"
                >
                  <Eyebrow>{s.who}</Eyebrow>
                  <p className="text-body text-ink-700 text-pretty leading-[1.5]">
                    “{s.quote}”
                  </p>
                  <p className="mt-auto text-caption text-muted">{s.what}</p>
                </article>
              ))}
            </div>
            <p className="text-caption text-muted">
              Composite stories. Real recovery narratives will land here as customers opt in.
            </p>
          </div>
        </Container>
      </section>

      {/* ─────────── Outro ─────────── */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col items-start gap-6">
            <Eyebrow>Start tonight</Eyebrow>
            <h2 className="font-display font-semibold text-ink-900 text-h1 sm:text-display tracking-[-0.038em] leading-[0.95] text-balance">
              The thirty seconds between you and never losing a bag again.
            </h2>
            <div className="flex items-center gap-6">
              <Link
                to="/start"
                className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-cairn"
              >
                Start free
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
              <Link to="/how-it-works" className="link-arrow text-body">
                Watch how it works
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
