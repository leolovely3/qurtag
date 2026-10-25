import { Link } from 'react-router-dom';
import { PageHero, PageBody, Section, P, Bullets, ContactLink } from './parts';

export function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Privacy and safety"
        title="What a finder can see, and what they cannot."
        lede="QuR Tag is built so a stranger can reach you without learning who you are."
      />
      <PageBody>
        <Section title="What a finder sees">
          <P>The item's name, its photo if you added one, and your short note. That is all.</P>
          <P>Your email address is never shown to a finder.</P>
        </Section>
        <Section title="How a conversation is kept private">
          <P>
            Each finder conversation is opened by a private link that is held in the finder's
            browser. Only that browser can read and add to that conversation on the tag page.
          </P>
        </Section>
        <Section title="Your password and your data">
          <Bullets
            items={[
              'Passwords are handled by our sign-in service and stored hashed.',
              'Pages and messages are sent over HTTPS.',
              'Your data lives in a database in the United States, run by our hosting providers.',
              'We do not sell data.',
            ]}
          />
        </Section>
        <Section title="Staying safe">
          <Bullets
            items={[
              'Do not put your home address or phone number in the item note. Anyone who scans the tag can read it.',
              'Meet in a public place if you arrange a handover, and tell someone you trust.',
              'You can switch an item to lost, or delete it, at any time.',
            ]}
          />
        </Section>
        <Section title="Report a problem">
          <P>
            If you see abuse or find a security problem, email <ContactLink />.
          </P>
          <P>
            More detail is in our{' '}
            <Link to="/privacy" className="text-ink-900 underline underline-offset-4">Privacy policy</Link>.
          </P>
        </Section>
      </PageBody>
    </>
  );
}
