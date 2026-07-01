import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

export function Privacy() {
  return (
    <>
      <section>
        <Container size="md">
          <div className="pt-qurtag-8 pb-qurtag-8 md:pt-16 md:pb-qurtag-8 flex flex-col gap-5">
            <Eyebrow>Privacy</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              What we collect, what we don't, and what we do with the rest.
            </h1>
            <Lede>
              QurTag is a privacy product. The whole point is that we know as little about you as
              we can get away with, and that the people who scan your tags know nothing at all.
              This page is the long version of that promise.
            </Lede>
            <div className="rounded-card border border-signal-200 bg-signal-50 p-qurtag-3 flex items-start gap-3">
              <AlertTriangle size={18} strokeWidth={1.75} className="text-signal-700 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-caption font-medium text-signal-700">
                  This is a DRAFT pending legal review.
                </p>
                <p className="text-caption text-ink-700 text-pretty">
                  The plain-English summary below describes how we actually run QurTag. A formal
                  policy reviewed by counsel will replace this before public launch.
                </p>
              </div>
            </div>
            <p className="text-caption text-muted">Last updated: {new Date('2026-06-15').toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-qurtag-12 md:py-qurtag-16 flex flex-col gap-qurtag-8 text-ink-700">
            <Section title="1. What we collect about you (the owner)">
              <Body>
                When you sign up, we collect your email address. That's it. There is no name field,
                no phone field, no address field on the sign-up form.
              </Body>
              <Body>
                If you later choose to use the courier flow we ask you for a return address (so we
                can generate a prepaid pickup label). If you choose to use trip mode we ask you for
                a flight number. If you upload photos of your items we store them. In every case,
                we collect that information because you typed it and we use it for the feature you
                asked for.
              </Body>
              <Body>
                Web Push subscriptions are stored only after you opt in from{' '}
                <Link to="/app/settings" className="text-ink-900 underline-offset-4 hover:underline">
                  /app/settings
                </Link>
                . They contain an endpoint your browser issued, scoped to your account.
              </Body>
            </Section>

            <Section title="2. What we collect about the finder">
              <Body>
                Almost nothing. When somebody scans your tag, we record the scan (timestamp,
                coarse-grained country from IP, anonymized user-agent class) and assign their
                browser an anonymous session ID stored in their own localStorage. We do not log
                their IP address beyond the country lookup. We never ask for their name, phone,
                email, or address.
              </Body>
              <Body>
                The only time a finder gives us personal information is when they choose to: a
                payout email if they set up Stripe Connect to receive a reward, or a pickup
                address if they request a courier (and that address is encrypted on our side and
                never shown to you).
              </Body>
            </Section>

            <Section title="3. What we share between owner and finder">
              <Body>
                QurTag is a bridge. Messages typed by the finder appear in your inbox; replies you
                type appear on the finder's page. Neither side sees the other's account email,
                phone, address, or browser identity. This is enforced at the database layer (RLS)
                and at the application layer.
              </Body>
              <Body>
                A finder who shares their location does so explicitly via a system message. They
                see the prompt, they tap accept, the coordinates land in the conversation. You
                never see anything they didn't choose to send.
              </Body>
            </Section>

            <Section title="4. The processors we use">
              <Body>
                QurTag runs on:{' '}
                <strong className="text-ink-900">Supabase</strong> (our database + auth + storage),{' '}
                <strong className="text-ink-900">Stripe</strong> (reward escrow + courier
                payments),{' '}
                <strong className="text-ink-900">Resend</strong> (transactional email),{' '}
                <strong className="text-ink-900">Mapbox</strong> (maps + geocoding),{' '}
                <strong className="text-ink-900">FlightAware AeroAPI</strong> (trip status),{' '}
                <strong className="text-ink-900">Shippo</strong> (courier labels), and{' '}
                <strong className="text-ink-900">Vercel</strong> (hosting).
              </Body>
              <Body>
                We share with each processor only the data they need to do the job. Email
                addresses go to Resend so they can deliver email. A pickup address goes to Shippo
                so they can generate a label. Flight numbers go to AeroAPI so we can show live
                status. Nothing else.
              </Body>
            </Section>

            <Section title="5. What we never sell">
              <Body>
                Your data. Anyone's data. Ever. QurTag makes money from one-time hardware
                purchases, software subscriptions, and transaction fees on rewards and courier
                labels. Not from advertising, not from data brokers, not from anything that would
                require sharing what you put in your inbox.
              </Body>
            </Section>

            <Section title="6. How long we keep it">
              <Body>
                Account data: while you have an account. Items, tags, and household records:
                until you delete them. Scan history: 30 days on Free, 12 months on Plus, forever
                on Family. Messages: while a thread is open + 90 days after it's closed, then
                deleted. Logs: 30 days for operations, 365 days for security events. Backups:
                daily encrypted snapshots, retained 7 days.
              </Body>
            </Section>

            <Section title="7. Your rights (GDPR / CCPA)">
              <Body>
                If you live in the EU/UK or California (or anywhere that has parallel rules), you
                have rights to access, export, correct, and delete your personal data. You can
                trigger each of those from{' '}
                <Link to="/app/settings" className="text-ink-900 underline-offset-4 hover:underline">
                  /app/settings
                </Link>
                . If anything doesn't work the way it should, write to{' '}
                <a href="mailto:privacy@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  privacy@qurtag.com
                </a>{' '}
                and we'll respond within 14 days.
              </Body>
            </Section>

            <Section title="8. Children">
              <Body>
                QurTag isn't designed for children under 13 (or 16 in the EU). Kid Mode lets a
                parent manage tags on a child's belongings, but the account remains the
                parent's. We do not knowingly collect data from children directly.
              </Body>
            </Section>

            <Section title="9. Changes to this policy">
              <Body>
                If we materially change how we collect or use data, we'll tell you by email and
                show a notice in the app before the change takes effect. Minor edits (clarifying
                wording, adding processors) we just push and date.
              </Body>
            </Section>

            <Section title="10. Contact">
              <Body>
                Email{' '}
                <a href="mailto:privacy@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  privacy@qurtag.com
                </a>{' '}
                for anything privacy-related. For data-subject requests, security disclosures,
                press, or general support, see{' '}
                <Link to="/help" className="text-ink-900 underline-offset-4 hover:underline">
                  /help
                </Link>
                .
              </Body>
            </Section>
          </div>
        </Container>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-qurtag-5 first:border-t-0 first:pt-0">
      <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-ink-700 text-pretty">{children}</p>;
}
