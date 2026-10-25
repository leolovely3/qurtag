import { Link } from 'react-router-dom';
import { Camera, Lock, MessageCircle, Printer } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';
import { PhoneMockup } from '@/components/brand/PhoneMockup';
import { PrimaryLink, SecondaryLink, CtaBand } from './parts';

const audiences = [
  {
    title: 'Students and parents',
    body: 'Water bottles, instruments and instrument cases, school uniforms and sports kit, school bags and lunch boxes. A parent sets up the tags, so the note comes to you.',
  },
  {
    title: 'Ages 18 to 30',
    body: 'Festival gear, gym bags and gym kit, and everyday things you carry to work: umbrellas, headphone cases, bike helmets and laptop sleeves.',
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
    body: 'Print the tag at home on plain paper or sticker paper. Free for up to two items.',
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

export function MarketingHome() {
  return (
    <>
      <section className="relative overflow-hidden">
        <Container size="xl">
          <div className="grid gap-qurtag-8 lg:grid-cols-2 lg:items-center pt-qurtag-8 pb-qurtag-12 md:pt-16 md:pb-qurtag-16">
            <div className="flex flex-col gap-5 items-start">
              <Eyebrow>Free QR tags for everyday things</Eyebrow>
              <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 lg:text-display tracking-[-0.035em] leading-[0.98] text-balance">
                A free QR tag, so a kind stranger can message you.
              </h1>
              <Lede>
                Print a tag at home and stick it on a water bottle, a violin case or your keys. When
                someone finds it, they scan it with their camera and write you a note. Free, private,
                and no app for the finder.
              </Lede>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <PrimaryLink to="/start">Make a free tag</PrimaryLink>
                <SecondaryLink to="/how-it-works">How it works</SecondaryLink>
              </div>
              <p className="text-caption text-muted text-pretty max-w-md">
                QuR Tag is not a tracker. It does not find anything by itself. It works when someone
                kind finds your thing.
              </p>
            </div>
            <div className="flex justify-center">
              <PhoneMockup />
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="lg">
          <div className="py-qurtag-12 md:py-qurtag-16 flex flex-col gap-qurtag-8">
            <div className="flex flex-col gap-3 max-w-2xl">
              <Eyebrow>Why it is different</Eyebrow>
              <h2 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.025em] text-balance">
                For the things too cheap, or too many, to put a tracker on.
              </h2>
            </div>
            <div className="grid gap-qurtag-4 md:grid-cols-3">
              {points.map((p) => (
                <div key={p.title} className="rounded-card border border-hairline bg-canvas p-qurtag-4 flex flex-col gap-3">
                  <p.icon size={20} strokeWidth={1.5} className="text-ink-900" aria-hidden />
                  <h3 className="font-display font-semibold text-h6 text-ink-900">{p.title}</h3>
                  <p className="text-body text-ink-700 text-pretty">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline">
        <Container size="lg">
          <div className="py-qurtag-12 md:py-qurtag-16 flex flex-col gap-qurtag-8">
            <div className="flex flex-col gap-3 max-w-2xl">
              <Eyebrow>Who it is for</Eyebrow>
              <h2 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.025em] text-balance">
                The things that go missing at school, the gym and the bus stop.
              </h2>
            </div>
            <div className="grid gap-qurtag-4 md:grid-cols-3">
              {audiences.map((a) => (
                <div key={a.title} className="rounded-card border border-hairline p-qurtag-4 flex flex-col gap-2">
                  <h3 className="font-display font-semibold text-h6 text-ink-900">{a.title}</h3>
                  <p className="text-body text-ink-700 text-pretty">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-qurtag-12 flex flex-col gap-4 items-start">
            <MessageCircle size={22} strokeWidth={1.5} className="text-ink-900" aria-hidden />
            <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.02em]">Found something?</h2>
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

      <CtaBand title="Make your first tag in a few minutes." body="It is free for up to two items. You need an email address and a printer." />
    </>
  );
}
