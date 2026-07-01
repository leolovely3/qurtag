import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Shield, FileText, Key, Globe } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

const principles = [
  {
    icon: Shield,
    title: 'Privacy by structure, not by promise.',
    body:
      "A finder's view of the world contains a calm prompt, a few action buttons, and nothing about you. An owner's view contains a thread, a few message bubbles, and nothing about the finder. The system literally cannot reveal one party to the other. There is no code path that would.",
  },
  {
    icon: Key,
    title: 'Encryption at rest.',
    body:
      'Notes, item serial numbers, declared values, and any document you upload are encrypted at rest in Supabase Postgres. TLS 1.3 in transit. We rotate keys annually.',
  },
  {
    icon: Lock,
    title: 'Zero PII in URLs or logs.',
    body:
      "Tag URLs use a short, unguessable id. Server logs are scrubbed of PII at the SDK layer before they ever land. We don't log message bodies.",
  },
  {
    icon: FileText,
    title: 'Plain-language data export and deletion.',
    body:
      'One click from Settings exports everything we hold about you as a downloadable archive. One click deletes it permanently. We honor data-subject requests in 14 days.',
  },
  {
    icon: Globe,
    title: 'Regional residency for EU customers.',
    body:
      "Plus and Family customers in the EU can opt their data into a Frankfurt-region Supabase project. We don't share data across borders without your explicit consent.",
  },
];

const retentions = [
  ['Account', 'Until you delete it.'],
  ['Items, tags', 'Until you delete them or close your account.'],
  ['Scan history', '30 days on Free, 12 months on Plus, forever on Family.'],
  ['Messages', "While the thread is open + 90 days after it's closed. Then deleted."],
  ['Stripe records', "We don't store full payment data. Stripe holds it per their retention."],
  ['Logs', '30 days on operations, 365 days on security events.'],
  ['Backups', 'Daily snapshots, retained 7 days. Encrypted.'],
];

export function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container size="xl">
          <div className="pt-qurtag-8 pb-qurtag-8 md:pt-16 md:pb-qurtag-8 max-w-3xl flex flex-col gap-5">
            <Eyebrow>Security &amp; privacy</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              The quiet promise behind every tag.
            </h1>
            <Lede>
              QurTag is a privacy product. The whole point is that the finder learns nothing about
              you, and you learn nothing about the finder, and yet your thing comes home. This
              page documents how we hold up that promise in code.
            </Lede>
          </div>
        </Container>
      </section>

      {/* Principles */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-8">
            <div className="max-w-2xl flex flex-col gap-4">
              <Eyebrow>Principles</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Five rules we wrote into the architecture before we wrote anything else.
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {principles.map((p) => (
                <article
                  key={p.title}
                  className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3"
                >
                  <p.icon size={22} strokeWidth={1.25} className="text-verdigris-700" />
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
                    {p.title}
                  </h3>
                  <p className="text-body text-ink-700 text-pretty">{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Bridge architecture diagram */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 grid lg:grid-cols-12 gap-qurtag-8 items-start">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <Eyebrow>The bridge</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                We pass notes. Nothing else.
              </h2>
              <p className="text-body text-ink-700 text-pretty">
                When a finder scans a tag, their request goes to a QurTag server, never to your
                phone. We read the tag's id, find the linked item, and render a page that contains
                only what you've chosen to show. The finder writes a message; we store it.
              </p>
              <p className="text-body text-ink-700 text-pretty">
                When you reply, we relay your words to the thread. The finder's browser fetches
                them by polling, or via realtime. Using the thread's unguessable id. At no point
                in this loop does either party receive the other's account.
              </p>
              <Link to="/how-it-works" className="link-arrow text-body mt-1">
                Read the step-by-step
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
            <div className="lg:col-span-7">
              <pre className="rounded-modal border border-hairline bg-ink-950 text-ink-100 p-qurtag-5 text-caption font-mono leading-relaxed overflow-x-auto">
{`         finder's browser            owner's browser
                │                          │
                │  scan / message          │  inbox / reply
                ▼                          ▼
       ┌─────────────────────────────────────────┐
       │           QurTag  (the bridge)           │
       │   ┌─────────┐    ┌─────────┐            │
       │   │ thread  │    │ message │            │
       │   │  id:    │    │  text:  │            │
       │   │  R3Xc..│ ◄──►│ encryp- │            │
       │   │         │    │ ted at  │            │
       │   │         │    │  rest   │            │
       │   └─────────┘    └─────────┘            │
       └─────────────────────────────────────────┘
                ▲                          ▲
                │      no PII crosses      │
                │       this dotted        │
                ├──────────────line────────┤
                │                          │
       no phone, email, address     no phone, email, address`}
              </pre>
            </div>
          </div>
        </Container>
      </section>

      {/* Retention table */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-5">
            <div className="max-w-2xl flex flex-col gap-3">
              <Eyebrow>Retention</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                What we keep, and for how long.
              </h2>
            </div>
            <div className="rounded-modal border border-hairline bg-canvas overflow-hidden">
              <table className="w-full text-body">
                <tbody className="divide-y divide-hairline">
                  {retentions.map(([what, when]) => (
                    <tr key={what} className="grid grid-cols-3">
                      <td className="px-qurtag-5 py-4 font-medium text-ink-900 col-span-1">
                        {what}
                      </td>
                      <td className="px-qurtag-5 py-4 text-muted col-span-2">{when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      {/* Disclosure + transparency */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 grid md:grid-cols-2 gap-qurtag-5">
            <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
              <Eyebrow>Responsible disclosure</Eyebrow>
              <h3 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
                Found a vulnerability?
              </h3>
              <p className="text-body text-ink-700 text-pretty">
                Email{' '}
                <a href="mailto:security@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  security@qurtag.com
                </a>{' '}
                with a description and steps to reproduce. We respond within 48 hours and pay a
                bounty per the severity table on{' '}
                <a
                  href="https://hackerone.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-900 underline-offset-4 hover:underline"
                >
                  HackerOne
                </a>
                .
              </p>
              <p className="text-caption text-muted">
                Our policy and contact live at{' '}
                <a
                  href="/.well-known/security.txt"
                  className="underline-offset-4 hover:underline"
                >
                  /.well-known/security.txt
                </a>
                .
              </p>
            </div>
            <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
              <Eyebrow>Transparency report</Eyebrow>
              <h3 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
                Quarterly, in full.
              </h3>
              <p className="text-body text-ink-700 text-pretty">
                Every quarter we publish a transparency report covering vulnerabilities resolved,
                law-enforcement requests received, data-subject requests honored, and any
                outage that took longer than fifteen minutes.
              </p>
              <p className="text-caption text-muted">First report: end of Q3 of our first year.</p>
            </div>
          </div>
        </Container>
      </section>

      {/* Outro */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-qurtag-8 flex flex-col items-start gap-6">
            <Lock size={28} strokeWidth={1.25} className="text-verdigris-700" />
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
              Trust, but verify.
            </h2>
            <p className="text-body text-muted text-pretty max-w-2xl">
              The PRD, the schema, the RLS policies, and every Edge Function for QurTag live in a
              public repo. If a sentence above can't be traced to a line of code, tell us. We'll
              fix the sentence or the line.
            </p>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="link-arrow text-body">
                Read the privacy policy
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
              <Link to="/terms" className="link-arrow text-body">
                Read the terms
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
