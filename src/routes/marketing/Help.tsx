import { Fragment, type ReactNode } from 'react';
import { PageHero, PageBody, Section, P, CtaBand, ContactLink, DocLink } from './parts';
import { ContactForm } from '@/components/support/ContactForm';
import { visibleFaqs } from '@/lib/faq';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';

/** An answer from src/lib/faq.ts, with its {contact} and [words](/path) markers made into the real link and address. */
function Answer({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const marker = /\{contact\}|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(marker)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      m[0] === '{contact}' ? (
        <ContactLink key={m.index} />
      ) : (
        <DocLink key={m.index} to={m[2]} className="text-ink-900 underline underline-offset-4">{m[1]}</DocLink>
      ),
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

export function Help() {
  const memberships = useMembershipsAvailable();
  return (
    <>
      <PageHero eyebrow="Help" title="Questions, answered plainly." />
      <PageBody>
        <div className="flex flex-col gap-qurtag-5">
          {visibleFaqs(memberships).map((f) => (
            <Section key={f.q} title={f.q}>
              <P><Answer text={f.a} /></P>
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
            <DocLink to="/privacy" className="text-ink-900 underline underline-offset-4">Privacy</DocLink>.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Make a free tag." />
    </>
  );
}
