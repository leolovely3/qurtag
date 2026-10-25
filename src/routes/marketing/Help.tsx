import { PageHero, PageBody, Section, P, CtaBand, ContactLink } from './parts';
import { Link } from 'react-router-dom';
import { ContactForm } from '@/components/support/ContactForm';
import type { ReactNode } from 'react';

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: 'What does the finder see?',
    a: 'The item\'s name, its photo if you added one, and your short note. They do not see your email, name or phone number. They can write you a message from the page, with no app and no account.',
  },
  {
    q: 'What do I see as the owner?',
    a: 'Your QuR Tag inbox shows each note from a finder. You can reply there. In the iPhone app you can also get an alert the moment a finder writes, and reply from the alert itself. Turn it on in Settings, under Notifications. You choose which alerts you want.',
  },
  {
    q: 'How does the finder read my reply?',
    a: 'They open the same tag page on the same phone. The page keeps their conversation in that browser and shows your reply there.',
  },
  {
    q: 'Is QuR Tag a tracker?',
    a: 'No. It cannot find anything on its own. It works when a kind person finds your item and scans the tag.',
  },
  {
    q: 'What does it cost?',
    a: 'Free for up to two items, and you print your own tags. Plus ($2.99 a month or $19 a year) has no limit on items and keeps your full scan history. Family ($4.99 a month or $39 a year) is Plus for up to five people who share the items and the inbox.',
  },
  {
    q: 'How do I cancel?',
    a: 'On the web, open Membership in your account and choose Manage membership. On iPhone, open Settings, tap your name, then Subscriptions. You keep your plan until the end of the period you paid for.',
  },
  {
    q: 'What happens to my items if I go back to Free?',
    a: 'Nothing is deleted. Your two oldest items stay editable. The rest stay, and you can read them, print their tags and delete them, but not change them until you upgrade or delete some. Finders can still scan their tags and write to you.',
  },
  {
    q: 'How does Family work?',
    a: 'The person who buys Family invites up to four others by email. Everyone sees the same items and inbox. The owner can remove people and anyone can leave. Invites are made on the Membership page.',
  },
  {
    q: 'Can I offer a thank-you?',
    a: 'You can write a note such as "Small thank-you if you return it". It is only text. No money moves through QuR Tag.',
  },
  {
    q: 'What if my tag is damaged or lost?',
    a: 'Open the item and print its tag again. If the old tag went missing and you want it to stop working, choose Make a new code: the old tag stops working at once.',
  },
  {
    q: 'How do I mark an item as lost?',
    a: 'Open the item in the app and switch it to lost. Its tag page then says the item is missing.',
  },
  {
    q: 'How do I delete my account?',
    a: (
      <>
        From Settings, or email <ContactLink />.
      </>
    ),
  },
  {
    q: 'Who runs QuR Tag?',
    a: 'Impact Consulting AI LLC, a Florida limited liability company.',
  },
];

export function Help() {
  return (
    <>
      <PageHero eyebrow="Help" title="Questions, answered plainly." />
      <PageBody>
        <div className="flex flex-col gap-qurtag-5">
          {faqs.map((f) => (
            <Section key={f.q} title={f.q}>
              <P>{f.a}</P>
            </Section>
          ))}
        </div>
        <Section title="Contact us">
          <P>Write to us here and we will reply by email. If you are signed in we see your account and plan with your message.</P>
          <ContactForm />
        </Section>
        <Section title="Still stuck?">
          <P>
            If you cannot sign in, email <ContactLink />. For how we handle your data, see{' '}
            <Link to="/privacy" className="text-ink-900 underline underline-offset-4">Privacy</Link>.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Make a free tag." />
    </>
  );
}
