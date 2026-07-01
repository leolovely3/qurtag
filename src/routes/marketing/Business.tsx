import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Plane, Briefcase, GraduationCap, Hotel, ScanLine, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

const verticals = [
  {
    icon: Hotel,
    title: 'Hotels',
    body:
      'Front desks process dozens of forgotten items a week. QurTag turns the queue into a five-second scan, sends the owner a calm note, and books the courier. All without your staff handling another email thread.',
  },
  {
    icon: Plane,
    title: 'Airlines + airports',
    body:
      'Cabin crew scan tagged bags at the gate; baggage handlers scan strays in the belt room. Owners are reached before they\'ve filed a Property Irregularity Report. We sync with Okoban so the existing aviation lost-and-found ecosystem sees you, too.',
  },
  {
    icon: Briefcase,
    title: 'Coworking + offices',
    body:
      'Your members leave AirPods and water bottles in conference rooms. QurTag at the front desk gets each one home with a single scan, and tells you which rooms produce the most lost-and-found traffic.',
  },
  {
    icon: GraduationCap,
    title: 'Schools + sports clubs',
    body:
      'PE class gear, marching band instruments, uniforms. Bulk-provision iron-on Core tags, hand them out at the start of the year, and watch the lost-and-found bin shrink to nothing.',
  },
];

const features = [
  'SSO via SAML or OIDC.',
  'CSV bulk-provision tags by the thousand.',
  'Custom branding on the finder page (your logo, your accent color).',
  'Role-based access for admins, managers, and front-desk staff.',
  'Partner portal with a tag-scan workflow tied to your queue.',
  'Public API and webhooks for your existing PMS, CRM, or asset-management system.',
  'Regional data residency (EU on request).',
  '99.9% uptime SLA, with credits documented in the MSA.',
  'A real human, named, who answers your account email.',
  'Quarterly reviews of your recovery rate and what we can improve.',
];

export function Business() {
  return (
    <>
      {/* Hero */}
      <section>
        <Container size="xl">
          <div className="pt-qurtag-8 pb-qurtag-8 md:pt-16 md:pb-qurtag-8 grid md:grid-cols-12 gap-qurtag-8 items-end">
            <div className="md:col-span-7 flex flex-col gap-5">
              <Eyebrow>For business</Eyebrow>
              <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
                Your lost-and-found, finally calm.
              </h1>
              <Lede>
                QurTag for Business turns a hotel's front desk, an airline's baggage room, or a
                coworking space's lobby into a quiet recovery network. Five-second scans. Owners
                reached instantly. No one's inbox set on fire.
              </Lede>
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <a
                  href="mailto:partners@qurtag.com"
                  className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-qurtag"
                >
                  Talk to us
                  <ArrowRight size={16} strokeWidth={1.75} />
                </a>
                <Link to="/pricing" className="link-arrow text-body">
                  See pricing
                  <ArrowRight size={16} strokeWidth={1.75} />
                </Link>
              </div>
            </div>
            <div className="md:col-span-5">
              <div className="rounded-modal border border-hairline bg-paper p-qurtag-5 flex flex-col gap-3">
                <Eyebrow>Pilot terms</Eyebrow>
                <p className="text-body text-ink-900 font-medium">
                  Free for the first 90 days at one location.
                </p>
                <p className="text-caption text-muted text-pretty">
                  We onboard you, your staff, and your front desk in one afternoon. If after 90
                  days the recovery rate hasn't moved meaningfully, we walk away. No charge,
                  no awkward exit.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Verticals */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 flex flex-col gap-qurtag-8">
            <div className="max-w-2xl flex flex-col gap-3">
              <Eyebrow>Who it's for</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.032em] leading-[1.02] text-balance">
                Built for the places people leave things.
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {verticals.map((v) => (
                <article
                  key={v.title}
                  className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3"
                >
                  <v.icon size={22} strokeWidth={1.25} className="text-verdigris-700" />
                  <h3 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
                    {v.title}
                  </h3>
                  <p className="text-body text-ink-700 text-pretty">{v.body}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* How it works for partners */}
      <section className="border-t border-hairline">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 grid lg:grid-cols-2 gap-qurtag-8 items-start">
            <div className="flex flex-col gap-4">
              <Eyebrow>How it works for staff</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Front desk gets a portal. Owner gets a note.
              </h2>
              <ol className="flex flex-col gap-3 text-body text-ink-700 mt-2">
                <li className="flex gap-3">
                  <span className="font-mono text-caption text-muted shrink-0">01</span>
                  <span>A guest leaves something behind. Cleaning staff or a colleague finds it.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-caption text-muted shrink-0">02</span>
                  <span>Front desk opens <span className="font-mono text-caption">partners.qurtag.com</span> and scans the QurTag tag.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-caption text-muted shrink-0">03</span>
                  <span>A drop-off is logged. The owner is notified the moment the scan happens.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-caption text-muted shrink-0">04</span>
                  <span>Owner books a courier from their phone, or stops by within 48 hours. The queue clears.</span>
                </li>
              </ol>
            </div>
            <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-pill bg-ink-50 grid place-items-center shrink-0">
                  <ScanLine size={18} strokeWidth={1.75} className="text-ink-900" />
                </div>
                <Eyebrow>Partner portal</Eyebrow>
              </div>
              <h3 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em] text-balance">
                Five seconds at the front desk.
              </h3>
              <p className="text-body text-ink-700 text-pretty">
                A focused web app for staff: scan, log, see the queue. Designed to be used while
                someone is in front of the desk asking about their lost item. Fast, calm, no
                training required.
              </p>
              <Link to="/partners" className="link-arrow text-body mt-2">
                See the partner portal
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* What's included */}
      <section className="border-t border-hairline bg-paper">
        <Container size="xl">
          <div className="py-qurtag-12 md:py-qurtag-8 grid lg:grid-cols-12 gap-qurtag-8 items-start">
            <div className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-28">
              <Eyebrow>What's included</Eyebrow>
              <h2 className="font-display font-semibold text-ink-900 text-h2 tracking-[-0.028em] leading-[1.05] text-balance">
                Everything in the consumer product, plus the things you need at scale.
              </h2>
              <Lede className="max-w-md">
                Business pricing is $79/month per workspace + $4 per seat. Tags are billed
                separately at volume pricing.
              </Lede>
            </div>
            <ul className="lg:col-span-7 flex flex-col gap-3">
              {features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-3 rounded-card border border-hairline bg-canvas p-qurtag-3"
                >
                  <ShieldCheck size={14} strokeWidth={1.75} className="mt-1 text-verdigris-700 shrink-0" />
                  <span className="text-body text-ink-700 text-pretty">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* Outro */}
      <section className="border-t border-hairline">
        <Container size="md">
          <div className="py-qurtag-8 flex flex-col items-start gap-6">
            <Building2 size={28} strokeWidth={1.25} className="text-verdigris-700" />
            <h2 className="font-display font-semibold text-ink-900 text-h1 tracking-[-0.038em] leading-[0.95] text-balance">
              A pilot in one location. Decide from there.
            </h2>
            <p className="text-body text-muted text-pretty max-w-2xl">
              Twenty-minute onboarding call, ninety free days, a recovery dashboard you can show
              your operations director. If the numbers move, we expand. If they don't, we owe you
              the time back.
            </p>
            <a
              href="mailto:partners@qurtag.com"
              className="inline-flex h-12 items-center gap-2 rounded-pill bg-ink-900 px-6 text-body font-medium text-canvas hover:bg-ink-700 transition-colors duration-qurtag"
            >
              Email partners@qurtag.com
              <ArrowRight size={16} strokeWidth={1.75} />
            </a>
          </div>
        </Container>
      </section>
    </>
  );
}
