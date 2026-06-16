import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ScanLine,
  ShieldCheck,
  MessageCircle,
  MapPin,
  PartyPopper,
  Lock,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

const steps = [
  {
    n: '01',
    icon: ScanLine,
    title: 'Activate in thirty seconds.',
    body:
      "Sign in with a single email link. Name your first item (Rimowa Original Cabin, MacBook Pro, your kid's clarinet) and QurTag mints a tag. Print it tonight on plain paper or order a premium one.",
    detail:
      "No app store. No password. Two items are free forever, so the first one is on us before you've decided whether you care.",
  },
  {
    n: '02',
    icon: ShieldCheck,
    title: 'Lose it. QurTag quietly waits.',
    body:
      "The tag rides on your bag, in your wallet, on the kid's flute case. Nothing happens until someone finds it.",
    detail:
      "When you notice it's gone, flip lost mode in the app. The next person to scan the tag sees a calm urgent prompt instead of a normal one.",
  },
  {
    n: '03',
    icon: MessageCircle,
    title: 'A stranger writes you a note.',
    body:
      'They scan the QR. Their phone opens a page in their language. They tap "I have this" and type a short message.',
    detail:
      "You're told the moment they do. Push, email, or both. Replies in your inbox feel like a normal chat. Neither side ever sees a phone, email, or address.",
  },
  {
    n: '04',
    icon: MapPin,
    title: 'You agree on a handoff.',
    body:
      'In person, drop at a partner hotel, or arrange courier pickup. QurTag handles the logistics so the two of you only handle the introduction.',
    detail:
      "If you offered a reward, it's held in escrow by Stripe. Released the moment the bag is back. No payment details exchanged either direction.",
  },
  {
    n: '05',
    icon: PartyPopper,
    title: 'It comes home.',
    body:
      'QurTag closes the bridge. The thread is archived. If you need it for an insurance claim, a one-tap PDF packet bundles the photos, the chain of custody, and the scan log.',
    detail:
      'And the finder, if they set up a Stripe payout, gets the reward in their bank within a couple of days.',
  },
];

export function HowItWorks() {
  return (
    <>
      {/* Hero */}
      <section className="relative">
        <Container size="xl">
          <div className="pt-cairn-8 pb-cairn-8 md:pt-16 md:pb-cairn-8 max-w-3xl flex flex-col gap-5">
            <Eyebrow>How it works</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              Five small steps. One calm reunion.
            </h1>
            <Lede>
              QurTag is software that sits behind a QR code. When the thing goes missing and someone
              finds it, we pass notes between you and them, and only that. The whole product fits
              in the spaces between everyone's normal day.
            </Lede>
          </div>
        </Container>
      </section>

      {/* Steps */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-12">
            {steps.map((s, idx) => (
              <article
                key={s.n}
                className="grid lg:grid-cols-12 gap-cairn-8 items-start"
              >
                <div className="lg:col-span-1">
                  <span className="font-mono text-caption text-muted">{s.n}</span>
                </div>
                <div className="lg:col-span-5 flex flex-col gap-3">
                  <s.icon size={24} strokeWidth={1.25} className="text-verdigris-700" />
                  <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                    {s.title}
                  </h2>
                </div>
                <div className="lg:col-span-6 lg:pt-cairn-3 flex flex-col gap-3">
                  <p className="text-lede text-ink-700 text-pretty">{s.body}</p>
                  <p className="text-body text-muted text-pretty">{s.detail}</p>
                </div>
                {idx < steps.length - 1 && (
                  <div className="lg:col-span-12 border-b border-hairline" />
                )}
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Privacy strip */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-cairn-12 flex flex-col gap-3 items-start">
            <div className="size-10 rounded-pill bg-ink-50 grid place-items-center">
              <Lock size={18} strokeWidth={1.5} className="text-ink-900" />
            </div>
            <Eyebrow>The quiet bit</Eyebrow>
            <h3 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
              At no point in this story does anyone hand over a phone number, an email, or an
              address.
            </h3>
            <p className="text-body text-muted text-pretty max-w-2xl">
              That's the architecture. QurTag is the bridge. We don't reveal you to the finder.
              We don't reveal them to you. We dissolve the channel when the thing is home.
            </p>
            <Link to="/security" className="link-arrow text-body mt-2">
              Read the architecture
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
        </Container>
      </section>

      {/* Outro */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-cairn-8 flex flex-col items-start gap-6">
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
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
              <Link to="/pricing" className="link-arrow text-body">
                See pricing
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
