import { Link } from 'react-router-dom';
import { ArrowRight, Quote, MapPin } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';
import { cn } from '@/lib/cn';

interface Story {
  who: string;
  where: string;
  item: string;
  duration: string;
  quote: string;
  context: string;
  featured?: boolean;
}

const stories: Story[] = [
  {
    who: 'Helena, marketing director',
    where: 'Lisbon, Portugal',
    item: 'Rimowa Original Cabin',
    duration: '14 hours',
    quote:
      'A stranger wrote me in Portuguese. The map pin was already there. The next morning my bag was at the Memmo Alfama.',
    context:
      'Helena left her bag on a tram in the Alfama. The next rider scanned the Signature tag clipped to the handle, dropped a pin, and walked it to the nearest QurTag partner hotel within ten minutes of getting off. The reward was released the moment Helena confirmed the bag was back.',
    featured: true,
  },
  {
    who: 'Marcus, consultant',
    where: 'San Francisco',
    item: 'MacBook Pro',
    duration: '90 minutes',
    quote:
      "I left my laptop on the café table. A sticker the size of a coin got it back to my desk before lunch.",
    context:
      'The barista scanned the sticker on the lid, messaged through QurTag, and held it behind the counter. Marcus stopped by on the way back from his next meeting. No phone numbers, no Slack threads, no awkward "any chance you found my…" emails.',
  },
  {
    who: 'Dana, orchestra parent',
    where: 'Boston',
    item: "Daughter's clarinet",
    duration: 'Overnight',
    quote:
      "The iron-on label inside her case got scanned by the bus driver. He kept it overnight; we picked it up at the depot before rehearsal.",
    context:
      'The school bus had already done its evening route. The driver scanned the iron-on label inside the case lining and dropped a quick note. Dana wrote back, the depot held it until 8am, and the daughter walked into rehearsal on time.',
  },
  {
    who: 'James, caregiver',
    where: 'Edinburgh',
    item: "Mother's wallet",
    duration: '6 hours',
    quote:
      'Mum has early Alzheimer\'s. She left her wallet on a bus. The bus driver wrote me. Not her. Through QurTag. The wallet was on my kitchen table by dinner.',
    context:
      'The wallet had a Core tag on a keyring with Caregiver Mode enabled. The driver saw a calm "if this person seems lost or confused, please contact this number" message, and the message went to James, not to his mother. The handoff happened at a partner café near her usual route.',
  },
  {
    who: 'Priya, frequent flyer',
    where: 'London Heathrow',
    item: 'Bellroy passport sleeve',
    duration: '36 hours',
    quote:
      "I never gave anyone my number. The finder never gave me their address. The sleeve arrived with the magazines folded the way I left them.",
    context:
      "Found by another traveler in the queue at T2. Posted through the courier pickup flow at the partner hotel where she'd stayed the night before. Priya was already in Singapore by the time the package landed back in her London letterbox.",
  },
  {
    who: 'Robert, photographer',
    where: 'Tokyo Narita',
    item: 'Camera lens (Sigma 35mm)',
    duration: '4 days',
    quote:
      "Customs found my lens. I'd put a Pro tag on the case at the last minute. I'd written it off, and then the email arrived.",
    context:
      "Slipped out of the bag at the inspection bench. A customs agent scanned the Pro tag, and the lens spent three days in their lost-property locker before being couriered to Robert's onward hotel in Kyoto.",
  },
];

export function Stories() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container size="xl">
          <div className="pt-cairn-8 pb-cairn-8 md:pt-16 md:pb-cairn-8 max-w-3xl flex flex-col gap-5">
            <Eyebrow>Stories of return</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              Quiet wins, one bag at a time.
            </h1>
            <Lede>
              Real recovery stories, told carefully. Every one of these started with a stranger
              scanning a tag, and ended with a thing back where it belonged, and not a single phone
              number, email, or address exchanged either direction.
            </Lede>
          </div>
        </Container>
      </section>

      {/* Stories */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-cairn-12 md:py-cairn-8 flex flex-col gap-cairn-3">
            {stories.map((s, idx) => (
              <article
                key={s.who}
                className={cn(
                  'rounded-modal border p-cairn-5 grid lg:grid-cols-12 gap-cairn-5 items-start',
                  'transition-colors duration-cairn',
                  s.featured
                    ? 'border-signal-200 bg-canvas shadow-card'
                    : 'border-hairline bg-canvas hover:border-hairline-strong',
                )}
              >
                <div className="lg:col-span-4 flex flex-col gap-2">
                  <span className="font-mono text-caption text-muted">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <Eyebrow>{s.duration}</Eyebrow>
                  <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
                    {s.who}
                  </h2>
                  <p className="text-caption text-muted inline-flex items-center gap-1.5">
                    <MapPin size={12} strokeWidth={1.75} />
                    {s.where}
                  </p>
                  <p className="text-caption text-muted">{s.item}</p>
                </div>
                <div className="lg:col-span-8 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Quote
                      size={20}
                      strokeWidth={1.5}
                      className="text-verdigris-700 shrink-0 mt-1"
                    />
                    <p className="text-lede text-ink-900 text-pretty leading-[1.4]">
                      “{s.quote}”
                    </p>
                  </div>
                  <p className="text-body text-muted text-pretty">{s.context}</p>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Transparency footnote */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-cairn-8 flex flex-col gap-2">
            <p className="text-caption text-muted text-pretty">
              <strong className="text-ink-900">A note on these stories.</strong> They're composite
             . Assembled from the patterns we see in early QurTag testing and from conversations
              with travelers who have lived these moments. As real customers consent to share
              their own reunions, named and verified, we'll replace these one by one.
            </p>
          </div>
        </Container>
      </section>

      {/* Share your story */}
      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-cairn-8 flex flex-col items-start gap-6">
            <Eyebrow>Your turn</Eyebrow>
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
              Share yours.
            </h2>
            <p className="text-body text-muted text-pretty max-w-2xl">
              Recovered something with QurTag? Email{' '}
              <a
                href="mailto:stories@qurtag.com"
                className="text-ink-900 underline-offset-4 hover:underline"
              >
                stories@qurtag.com
              </a>{' '}
              with a few sentences. We'll come back to you for the rest. We never publish anything
              without your explicit yes.
            </p>
            <div className="flex items-center gap-6">
              <Link
                to="/start"
                className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-cairn"
              >
                Start free
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
              <Link to="/how-it-works" className="link-arrow text-body">
                See how QurTag works
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
