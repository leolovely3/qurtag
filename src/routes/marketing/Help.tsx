import { Link } from 'react-router-dom';
import { ArrowRight, Plane, Hotel, Bus, Coffee, MessageCircle } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

const ownerFaqs = [
  {
    q: 'What happens the moment someone scans my tag?',
    a: 'Their phone opens a QurTag page in their language. They tap "I have this" and write a short message. You\'re told by push or email (or both), and the conversation appears in your inbox. They don\'t see your number, email, or address.',
  },
  {
    q: 'How do I turn on lost mode?',
    a: 'Open the item in your dashboard and flip the Lost Mode switch. From that moment, the tag\'s finder page shows an urgent prompt, and we treat scans differently. You get an escalating notification cascade if you don\'t respond.',
  },
  {
    q: 'Can I offer a reward?',
    a: 'Yes. Pick an amount on the item page. The funds are pre-authorized on your card and held by Stripe in escrow. Released to the finder the moment you confirm reunion. If you cancel lost mode or scan the tag yourself, the hold is released and your card isn\'t charged.',
  },
  {
    q: 'My phone died. Can I still recover the item?',
    a: 'Yes. Sign in to QurTag from any browser. Your password is a magic link to your email. The full inbox, scan log, and recovery actions are there.',
  },
  {
    q: 'Can I reuse a tag on a different item?',
    a: 'Yes. "Replace tag" on either item, then assign the existing tag to a new one. Scan history follows the item, not the tag.',
  },
];

const finderFaqs = [
  {
    q: "I found a tagged item. What's the safest way to return it?",
    a: 'Scan the tag, tell the owner you have it, and pick the option you\'re most comfortable with: drop it at a participating partner (a hotel front desk, often), let the owner book a courier to pick it up from you, or arrange to meet. Your address and contact details stay private. QurTag handles the bridge.',
  },
  {
    q: "Will I get the reward the owner offered?",
    a: 'Yes, if you accept one. Set up a Stripe payout from the finder page. Takes about two minutes, and the funds land in your bank when the owner confirms the item is back. You can also donate the reward to a vetted charity; we match 10%.',
  },
  {
    q: "Does the owner see my phone or address?",
    a: 'No. We pass your message through. If you choose courier pickup, you enter your address into a form the owner never sees. We generate a label and send it to your email.',
  },
  {
    q: "What if the owner doesn't respond?",
    a: 'After six hours of silence, we escalate to any emergency contact they\'ve listed. After 24 hours, our concierge team reaches out to help. If a week passes and there\'s still no response, you can drop the item at any QurTag partner and we treat it as abandoned recovery. Small payment, no hassle.',
  },
];

const playbooks = [
  {
    icon: Plane,
    title: 'You lost it at an airport.',
    steps: [
      'Open the item in QurTag and toggle Lost Mode now. Even before you\'re sure it\'s missing.',
      'File the airline\'s Property Irregularity Report (PIR) at the baggage office. Mention you have a QurTag tag. Many baggage systems sync with our Okoban partner registry.',
      'Watch your QurTag inbox. Most airport finders scan within 24 hours.',
      'If a courier pickup is offered, accept it; airport workers can\'t leave the secure zone, so QurTag arranges a runner.',
    ],
  },
  {
    icon: Hotel,
    title: 'You left it at a hotel.',
    steps: [
      'Toggle Lost Mode.',
      'If the hotel is a QurTag partner, your tag is already in their queue. The front desk has been notified.',
      'Otherwise, email the hotel concierge with your item\'s description and the QurTag tag URL. We\'ve found this convinces hotel staff to look more thoroughly than a vague description.',
      'If the hotel mails it back, ask them to scan the tag once more so the recovery is recorded.',
    ],
  },
  {
    icon: Bus,
    title: 'You left it in a taxi or rideshare.',
    steps: [
      'Toggle Lost Mode.',
      'Use the rideshare app to contact your driver; mention the QurTag tag and offer to cover their inconvenience.',
      'If the driver finds it, they scan and contact you through QurTag. No need to exchange numbers.',
      'For a tip, the reward escrow is built for exactly this moment.',
    ],
  },
  {
    icon: Coffee,
    title: 'You left it at a café, gym, or somewhere casual.',
    steps: [
      'Toggle Lost Mode.',
      'Call ahead and describe it. Mention "it has a QurTag tag, you can scan the QR". This is often enough to nudge a staff member to actually look.',
      'If they find it, they scan and you\'re both connected. QurTag handles the rest.',
    ],
  },
];

export function Help() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container size="xl">
          <div className="pt-qurtag-8 pb-qurtag-8 md:pt-16 md:pb-qurtag-8 max-w-3xl flex flex-col gap-5">
            <Eyebrow>Help</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              We're calm so you don't have to be.
            </h1>
            <Lede>
              Most questions get answered below. If yours doesn't, email{' '}
              <a href="mailto:hello@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                hello@qurtag.com
              </a>
              . A real human writes back within an hour during business hours and by the next
              morning otherwise.
            </Lede>
          </div>
        </Container>
      </section>

      {/* Owner FAQ */}
      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>If you own the item</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Owner FAQ.
              </h2>
            </div>
            <div className="flex flex-col gap-qurtag-5">
              {ownerFaqs.map((f) => (
                <Q key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Finder FAQ */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>If you found one</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Finder FAQ.
              </h2>
            </div>
            <div className="flex flex-col gap-qurtag-5">
              {finderFaqs.map((f) => (
                <Q key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Playbooks */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-8">
            <div className="max-w-2xl flex flex-col gap-3">
              <Eyebrow>Recovery playbooks</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                What to do, scenario by scenario.
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {playbooks.map((p) => (
                <article
                  key={p.title}
                  className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3"
                >
                  <p.icon size={22} strokeWidth={1.25} className="text-verdigris-700" />
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
                    {p.title}
                  </h3>
                  <ol className="flex flex-col gap-2 mt-1">
                    {p.steps.map((s, idx) => (
                      <li key={idx} className="flex gap-3 text-body text-ink-700">
                        <span className="font-mono text-caption text-muted shrink-0 mt-0.5">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-pretty">{s}</span>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Talk to a human */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-qurtag-8 flex flex-col items-start gap-6">
            <MessageCircle size={28} strokeWidth={1.25} className="text-verdigris-700" />
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
              Still stuck?
            </h2>
            <p className="text-body text-muted text-pretty max-w-2xl">
              Email <a href="mailto:hello@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">hello@qurtag.com</a> with as much detail as you can. The tag URL,
              what you've tried, where the item probably is. We work every case until it's home or
              we've exhausted the options together.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="mailto:hello@qurtag.com"
                className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-qurtag"
              >
                Talk to a human
                <ArrowRight size={16} strokeWidth={1.75} />
              </a>
              <Link to="/security" className="link-arrow text-body">
                Read the security page
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function Q({ q, a }: { q: string; a: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-qurtag-3 first:border-t-0 first:pt-0">
      <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
        {q}
      </h3>
      <p className="text-body text-ink-700 text-pretty">{a}</p>
    </div>
  );
}
