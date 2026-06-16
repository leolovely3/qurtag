import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';

export function Terms() {
  return (
    <>
      <section>
        <Container size="md">
          <div className="pt-cairn-8 pb-cairn-8 md:pt-16 md:pb-cairn-8 flex flex-col gap-5">
            <Eyebrow>Terms of service</Eyebrow>
            <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.95] text-balance">
              The boring necessary things, written plainly.
            </h1>
            <Lede>
              These are the rules that govern your use of QurTag. We've written them in English
              instead of legalese where we can, and noted the spots where formal language is the
              point.
            </Lede>
            <div className="rounded-card border border-signal-200 bg-signal-50 p-cairn-3 flex items-start gap-3">
              <AlertTriangle size={18} strokeWidth={1.75} className="text-signal-700 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-caption font-medium text-signal-700">
                  This is a DRAFT pending legal review.
                </p>
                <p className="text-caption text-ink-700 text-pretty">
                  The terms below describe how QurTag actually operates today. A formal version
                  reviewed by counsel will replace this before public launch and may add or
                  reword sections to match local law.
                </p>
              </div>
            </div>
            <p className="text-caption text-muted">Last updated: {new Date('2026-06-15').toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline bg-paper">
        <Container size="md">
          <div className="py-cairn-12 md:py-cairn-16 flex flex-col gap-cairn-8 text-ink-700">
            <Section title="1. The agreement">
              <Body>
                By creating a QurTag account or using a QurTag tag, you agree to these terms and to
                our{' '}
                <Link to="/privacy" className="text-ink-900 underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
                . If you don't agree, don't use QurTag, and write to us so we know what to fix.
              </Body>
            </Section>

            <Section title="2. What QurTag does">
              <Body>
                QurTag is software (and optional hardware tags) that helps you recover items you've
                lost. The recovery loop works by letting someone who finds a tagged item send you
                a private message; you both stay anonymous. QurTag is not a real-time tracker.
                We don't claim that every lost item will come home. Only that the odds are
                materially better with us than without us, and that we'll try.
              </Body>
            </Section>

            <Section title="3. Your account">
              <Body>
                You're responsible for keeping your email secure (you sign in via magic link, so
                whoever can read your email can sign in as you). You can delete your account at
                any time from{' '}
                <Link to="/app/settings" className="text-ink-900 underline-offset-4 hover:underline">
                  /app/settings
                </Link>
                ; we'll erase your account data per the retention policy on the Privacy page.
              </Body>
            </Section>

            <Section title="4. Plans, fees, and the 7%">
              <Body>
                <strong className="text-ink-900">Free</strong> includes up to 2 items, the
                printable tag, and the full recovery loop. When you offer a reward or pay for a
                prepaid courier label on Free, QurTag keeps a 7% platform fee on the funds flowing
                through Stripe.
              </Body>
              <Body>
                <strong className="text-ink-900">Plus</strong> ($2.99/mo or $19/yr) removes the
                7% fee, unlocks unlimited items, translation, trip mode, and lifetime scan
                history.{' '}
                <strong className="text-ink-900">Family</strong> ($4.99/mo or $39/yr) adds up to
                5 members and Kid/Caregiver modes.{' '}
                <strong className="text-ink-900">Business</strong> is custom; talk to us.
              </Body>
              <Body>
                Subscription fees are charged in advance. If you cancel, your subscription stays
                active until the end of the period you've paid for and then drops to Free.
              </Body>
            </Section>

            <Section title="5. Reward escrow">
              <Body>
                When you offer a reward to a finder, QurTag places a hold on your payment method
                via Stripe. The hold becomes a charge the moment you confirm the item has been
                returned, and the funds are released to the finder. If you cancel lost mode, scan
                the tag yourself, or take no action for 30 days, the hold is released and you are
                not charged.
              </Body>
              <Body>
                QurTag is not a party to the relationship between you and the finder. The reward
                is a thank-you you offered; we relay it, hold the funds in escrow, and release
                them when you confirm. If you and the finder dispute whether the item has been
                returned, you can open a dispute in the app and a human at QurTag will review the
                evidence within 48 hours.
              </Body>
            </Section>

            <Section title="6. Courier labels">
              <Body>
                When you pay for a prepaid courier label, QurTag purchases the label via Shippo on
                your behalf and emails it to the finder. The label price covers carrier fees,
                Shippo's markup, and QurTag's transaction fee (7% on Free, $0 on Plus and above).
              </Body>
            </Section>

            <Section title="7. Hardware purchases + returns">
              <Body>
                Hardware (premium tags, sticker packs, Signature monogrammed tags) is sold
                separately. We accept returns within 100 days for any reason. Hardware returns
                are free in the contiguous US; international returns are at your cost up to $10.
              </Body>
              <Body>
                If a tag fails within 1 year (the QR scuffs off, the leather delaminates, the
                aluminum bends in normal use), we will replace it free. Send a photo and we'll
                send a new one.
              </Body>
            </Section>

            <Section title="8. Acceptable use">
              <Body>
                Don't use QurTag to harass people, send spam, defraud Stripe, or attach tags to
                things that aren't yours. We reserve the right to suspend or delete accounts that
                violate this, and we report illegal activity to law enforcement when required.
              </Body>
              <Body>
                Owners cannot use QurTag to track other people. Tags are for items; not for
                covertly monitoring a person's location. If a partner has used QurTag to surveil
                you, write to{' '}
                <a href="mailto:safety@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  safety@qurtag.com
                </a>{' '}
                and we will help.
              </Body>
            </Section>

            <Section title="9. Refunds">
              <Body>
                Subscriptions: 30-day money-back guarantee. Email{' '}
                <a href="mailto:hello@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  hello@qurtag.com
                </a>{' '}
                within 30 days of purchase, no questions. Hardware: 100 days, no questions, free
                return label.
              </Body>
            </Section>

            <Section title="10. Disclaimers">
              <Body>
                QurTag is provided "as is." We make no warranty that every lost item will be
                recovered or that the messaging bridge will be available without interruption.
                We're allergic to that kind of language, so we'll add: we take outages seriously,
                and our uptime target is 99.9% for paying customers.
              </Body>
              <Body>
                To the maximum extent permitted by law, QurTag is not liable for indirect or
                consequential damages, lost profits, or the recovery (or non-recovery) of any
                specific item. Our total liability for any claim is capped at the amount you've
                paid us in the prior 12 months.
              </Body>
            </Section>

            <Section title="11. Governing law">
              <Body>
                These terms are governed by the law of Delaware, USA. Disputes are resolved by
                binding arbitration in Wilmington, DE. Except that either party may pursue
                claims in small claims court, and either party may seek injunctive relief in any
                court of competent jurisdiction.
              </Body>
            </Section>

            <Section title="12. Changes to these terms">
              <Body>
                If we materially change these terms, we'll tell you by email 30 days before the
                change takes effect. If you don't like the change, cancel before the effective
                date and we'll refund any prorated subscription time.
              </Body>
            </Section>

            <Section title="13. Contact">
              <Body>
                Email{' '}
                <a href="mailto:hello@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  hello@qurtag.com
                </a>{' '}
                for general questions,{' '}
                <a href="mailto:safety@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  safety@qurtag.com
                </a>{' '}
                for misuse, and{' '}
                <a href="mailto:legal@qurtag.com" className="text-ink-900 underline-offset-4 hover:underline">
                  legal@qurtag.com
                </a>{' '}
                for formal notices.
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
    <div className="flex flex-col gap-3 border-t border-hairline pt-cairn-5 first:border-t-0 first:pt-0">
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
