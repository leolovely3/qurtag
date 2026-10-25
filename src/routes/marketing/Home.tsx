import { Link } from 'react-router-dom';
import { Camera, Lock, MessageCircle, Printer, Smartphone } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { useTheme } from '@/lib/theme';
import { Lede } from '@/components/brand/Typography';
import { HowVisuals } from './HowVisuals';
import { audienceFor, HERO } from '@/lib/audience';
import { CHANNEL_KEY, channelFromSearch } from '@/lib/measures';
import { PrimaryLink, SecondaryLink, CtaBand } from './parts';

const audiences = [
  {
    title: 'Parents of students',
    body: 'Water bottles, instruments and instrument cases, school uniforms and sports gear, school bags and lunch boxes. Accounts are for adults: parents tag their children’s things, and notes come to the parent.',
  },
  {
    title: 'Ages 18 to 30',
    body: 'Festival gear, gym bags and gym clothes, and everyday things you carry to work: umbrellas, headphone cases, bike helmets and laptop sleeves.',
  },
  {
    title: 'Keys, glasses and bags',
    body: 'Keys, glasses cases, walking sticks and walkers, hearing-aid cases and tote bags. The owner can be a daughter or son who set the tags up for a parent.',
  },
];

const points = [
  {
    icon: Printer,
    title: 'Free, and you print it',
    body: 'Print the tag at home on plain paper or sticker paper. Free for up to three items.',
  },
  {
    icon: Camera,
    title: 'No app for the finder',
    body: 'Whoever finds your thing scans the QR with their phone camera. A web page opens. No account, no download.',
  },
  {
    icon: Lock,
    title: 'Private both ways',
    body: 'Neither of you sees the other\'s phone number, email or address unless you choose to write it in a message.',
  },
];

function storedChannel(): string | null {
  try {
    return window.sessionStorage.getItem(CHANNEL_KEY) ?? channelFromSearch(window.location.search);
  } catch {
    return null;
  }
}

export function MarketingHome() {
  const theme = useTheme();
  const hero = HERO[audienceFor(storedChannel())];
  return (
    <>
      <section className="relative overflow-hidden">
        <Container size="xl">
          <div className="grid gap-12 pb-16 pt-8 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex h-8 items-center gap-2 rounded-pill border border-hairline bg-paper px-3 text-sm font-medium text-ink-700">
                <span className="size-1.5 rounded-full bg-signal-500" aria-hidden />
                Free QR tags for everyday things
              </span>
              <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-ink-900 text-balance sm:text-5xl lg:text-[3.5rem]">
                {hero.headline}
              </h1>
              <Lede>{hero.lede}</Lede>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <PrimaryLink to="/start">Make a free tag</PrimaryLink>
                <SecondaryLink to="/how-it-works">How it works</SecondaryLink>
              </div>
              <p className="inline-flex items-start gap-2 text-base text-ink-700 text-pretty">
                <Printer size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  What you need: a printer and ordinary paper. Sticker paper or clear tape makes it last.
                </span>
              </p>
              <p className="text-caption text-muted text-pretty max-w-md">
                QuR Tag is not a tracker. It does not find anything by itself. It works when someone
                kind finds your thing.
              </p>
            </div>
            <div className="flex justify-center">
              {/* A real screen from the app, light or dark to match the visitor. */}
              <div className="w-[17.5rem] rounded-[2.75rem] bg-[#050608] p-2.5 shadow-device ring-1 ring-hairline-strong sm:w-[19rem]">
                <picture>
                  <img
                    src={theme.resolved === 'dark' ? '/how/inbox-dark.webp' : '/how/inbox-light.webp'}
                    width={780}
                    height={1560}
                    alt="The QuR Tag app on a phone: the owner of a blue water bottle reads a note from the person who found it at the gym, and replies."
                    className="block h-auto w-full rounded-[2.125rem]"
                  />
                </picture>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="flex flex-col gap-10 py-16 md:py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900 text-balance sm:text-4xl">
                How it works
              </h2>
            </div>
            <HowVisuals />
            <div className="flex flex-col items-start gap-4">
              <SecondaryLink to="/how-it-works">See both sides in full</SecondaryLink>
              {/* Below the first screen, so it does not pull attention to something a visitor cannot have yet.
                  Apple's "Download on the App Store" badge may only link to a live listing, so until the
                  app is approved this is plain text; swap in the badge on launch day. */}
              <p className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-paper px-3 py-1.5 text-caption font-medium text-ink-700">
                <Smartphone size={16} strokeWidth={1.75} aria-hidden />
                The QuR Tag iPhone app is coming soon to the App Store. The website works on any phone today.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="flex flex-col gap-10 py-16 md:py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900 text-balance sm:text-4xl">
                For the things too cheap, or too many, to put a tracker on.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {points.map((p) => (
                <div key={p.title} className="flex flex-col gap-3 rounded-modal border border-hairline bg-canvas p-6 shadow-card">
                  <span className="grid size-10 place-items-center rounded-card bg-signal-50">
                    <p.icon size={20} strokeWidth={1.75} className="text-signal-700" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold text-ink-900">{p.title}</h3>
                  <p className="text-base text-ink-700 text-pretty">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="flex flex-col gap-10 py-16 md:py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900 text-balance sm:text-4xl">
                The things that go missing at school, the gym and the bus stop.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {audiences.map((a) => (
                <div key={a.title} className="flex flex-col gap-2 rounded-modal border border-hairline bg-canvas p-6">
                  <h3 className="text-lg font-semibold text-ink-900">{a.title}</h3>
                  <p className="text-base text-ink-700 text-pretty">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="flex max-w-2xl flex-col items-start gap-4 py-16">
            <span className="grid size-10 place-items-center rounded-card bg-canvas shadow-card">
              <MessageCircle size={20} strokeWidth={1.75} className="text-ink-900" aria-hidden />
            </span>
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900">Found something?</h2>
            <p className="text-body text-ink-700 text-pretty">
              Thank you. Open your phone camera and point it at the QR code on the item. A page opens
              with the item's name and a short note from the owner. Write the owner a message. You do
              not need an app or an account. Your phone number and email stay with you.
            </p>
            <Link
              to="/how-it-works"
              className="inline-flex min-h-11 items-center text-body font-medium text-ink-900 underline underline-offset-4"
            >
              See what happens next
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="flex max-w-2xl flex-col items-start gap-4 py-16 md:py-24">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900 text-balance sm:text-4xl">
              Already use a tracker? Add a QuR Tag as the backup.
            </h2>
            <p className="text-body text-ink-700 text-pretty">
              A Bluetooth tracker shows where your thing is. A QuR Tag helps an honest finder send it
              back: they scan it with any phone camera, no app, and write you a note without ever
              seeing your phone number or email. It needs no battery, so it keeps working after the
              tracker's battery runs out.
            </p>
            <p className="text-body text-ink-700 text-pretty">
              For the things that matter most, like luggage, backpacks and instrument cases, use both.
            </p>
          </div>
        </Container>
      </section>

      <CtaBand wide title="Make your first tag in a few minutes." body="It is free for up to three items. You need an email address, a printer and ordinary paper. Sticker paper or clear tape makes it last." />
    </>
  );
}
