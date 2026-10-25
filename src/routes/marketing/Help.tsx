import { PageHero, PageBody, Section, P, CtaBand, ContactLink } from './parts';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: 'What does the finder see?',
    a: 'The item\'s name, its photo if you added one, and your short note. They do not see your email, name or phone number. They can write you a message from the page, with no app and no account.',
  },
  {
    q: 'What do I see as the owner?',
    a: 'Your QuR Tag inbox on the site shows each note from a finder. You can reply there. Email notifications are not live yet, so check your QuR Tag inbox now and then.',
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
    a: 'Nothing. QuR Tag is free for up to two items, and you print your own tags.',
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
        <Section title="Still stuck?">
          <P>
            Email <ContactLink />. For how we handle your data, see{' '}
            <Link to="/privacy" className="text-ink-900 underline underline-offset-4">Privacy</Link>.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Make a free tag." />
    </>
  );
}
