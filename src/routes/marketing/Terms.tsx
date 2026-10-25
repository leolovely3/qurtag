import { Link } from 'react-router-dom';
import { PageHero, PageBody, Section, P, Bullets, ContactLink } from './parts';

export function Terms() {
  return (
    <>
      <PageHero eyebrow="Terms" title="Terms of use" lede="The rules for using QuR Tag, in plain words.">
        <p className="text-caption text-muted">Last updated 25 October 2026</p>
      </PageHero>
      <PageBody>
        <Section title="1. Who we are and what this covers">
          <P>
            QuR Tag is run by Impact Consulting AI LLC, a Florida limited liability company ("we", "us").
            These terms apply to everyone who uses qurtag.com: owners who make an account and finders who
            scan a tag. By using QuR Tag you agree to them. Our{' '}
            <Link to="/privacy" className="text-ink-900 underline underline-offset-4">privacy policy</Link> explains
            how we handle information.
          </P>
        </Section>

        <Section title="2. What QuR Tag does">
          <P>
            QuR Tag lets you print a QR tag for a thing you own. When someone finds it and scans the tag,
            they see a page about the item and can send you a note, and you can reply. QuR Tag is not a
            tracker: it does not locate anything, and it works only if someone finds your thing, scans the
            tag and chooses to write. We do not promise that anything will be returned.
          </P>
        </Section>

        <Section title="3. Price">
          <P>
            QuR Tag is free for up to two items. There is nothing to buy. If we ever offer anything paid, we
            will say so clearly first, and nothing will be charged without your agreement.
          </P>
        </Section>

        <Section title="4. Your account">
          <Bullets
            items={[
              'You must be 18 or over to make an account.',
              'Give a real email address you can read, and keep your password to yourself.',
              'You are responsible for what happens in your account and for the items and notes you add.',
              'Only tag things that are yours, or that you look after for someone in your family.',
            ]}
          />
        </Section>

        <Section title="5. Finders">
          <P>
            Finders do not need an account. A finder agrees to use the page only to help return the item,
            and to write honestly. Returning an item is an arrangement between the finder and the owner. Any
            thank-you the owner offers is their own promise; QuR Tag does not handle money and is not a party
            to it.
          </P>
        </Section>

        <Section title="6. Stay safe">
          <Bullets
            items={[
              'Do not share your home address or phone number unless you want to.',
              'If you meet to hand something over, choose a busy public place, or ask the finder to leave it at a desk, office or shop.',
              'Never pay a finder in advance or send them money through a link.',
              'If someone threatens you or tries to trick you, stop replying, close the conversation and contact the police if you feel unsafe.',
            ]}
          />
        </Section>

        <Section title="7. What you must not do">
          <Bullets
            items={[
              'Use QuR Tag to harass, threaten, scam or spam anyone.',
              'Put illegal, hateful or sexual content in an item, a photo or a note.',
              "Put health details, payment details, government ID numbers or a child's full name in QuR Tag.",
              'Try to read other people\'s items or conversations, guess tag codes, overload the service, or get around its limits.',
              'Use QuR Tag for a business, or resell it, without our written agreement.',
            ]}
          />
        </Section>

        <Section title="8. Your content">
          <P>
            The items, photos and notes you add stay yours. You let us store and show them only to run
            QuR Tag, for example showing your item's name and photo to someone who scans its tag. We may
            remove content that breaks these terms.
          </P>
        </Section>

        <Section title="9. Ending your use">
          <P>
            You can delete your account at any time from Settings, which also switches off your tags. We may
            suspend or close an account, or block a tag, that breaks these terms or puts someone at risk.
          </P>
        </Section>

        <Section title="10. No warranty">
          <P>
            QuR Tag is provided "as is" and "as available". We work to keep it running and safe, but we do
            not promise it will always be available, free of errors, or that a printed tag will stay
            readable.
          </P>
        </Section>

        <Section title="11. Limits on our liability">
          <P>
            To the extent the law allows, we are not responsible for the loss of, or damage to, any item,
            for what a finder or owner does, or for indirect losses. Because QuR Tag is free, our total
            liability to you for any claim is limited to 100 US dollars. Nothing in these terms limits
            rights that the law says cannot be limited.
          </P>
        </Section>

        <Section title="12. Law and disputes">
          <P>
            These terms are governed by the laws of the State of Florida, United States, without regard to
            its conflict of law rules. Any dispute will be decided in the state or federal courts located in
            Florida, unless the law where you live gives you the right to bring it elsewhere. Before going to
            court, please email us so we can try to sort it out.
          </P>
        </Section>

        <Section title="13. Changes">
          <P>
            We may update these terms. We will change the date at the top, and put a notice on this site
            before a significant change takes effect. If you keep using QuR Tag after that, the new terms
            apply.
          </P>
        </Section>

        <Section title="14. Contact">
          <P>
            Impact Consulting AI LLC, Florida, United States. Email <ContactLink />.
          </P>
        </Section>
      </PageBody>
    </>
  );
}
