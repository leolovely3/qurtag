import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { createContext, useContext } from 'react';
import { AppPage } from '@/components/layout/AppPage';
import { Container } from '@/components/ui/Container';
import { Lede } from '@/components/brand/Typography';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/** Shared building blocks for the plain marketing pages. */

/**
 * Help, Terms, Privacy and Make it last are written once. Signed-in people reach them from
 * inside the app, at /app/help and so on, where they sit in the app frame (tab bar or sidebar,
 * a Back button) and not under the website's header, which would look like being signed out.
 * Inside the frame the page drops its own big heading (the frame's title is the h1), its
 * sign-up band, and its links point at the /app copies.
 */
const InAppDocContext = createContext(false);
const IN_APP_DOCS = ['/help', '/terms', '/privacy', '/make-it-last'];

export function InAppDoc({
  title,
  back,
  children,
}: {
  title: string;
  back: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <InAppDocContext.Provider value={true}>
      <AppPage title={title} back={back} width="normal">
        <div className="flex flex-col gap-8 pb-4">{children}</div>
      </AppPage>
    </InAppDocContext.Provider>
  );
}

/** A link to one of the four shared pages: the app copy when read inside the app. */
export function DocLink({ to, ...rest }: LinkProps & { to: string }) {
  const inApp = useContext(InAppDocContext);
  return <Link to={inApp && IN_APP_DOCS.includes(to) ? `/app${to}` : to} {...rest} />;
}

export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  const inApp = useContext(InAppDocContext);
  if (inApp) {
    return (
      <div className="flex flex-col gap-3">
        {lede && <p className="text-body text-muted text-pretty">{lede}</p>}
        {children}
      </div>
    );
  }
  return (
    <section>
      <Container size="md">
        <div className="flex flex-col gap-4 pb-10 pt-10 md:pb-12 md:pt-16" data-section={eyebrow}>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.025em] text-ink-900 text-balance sm:text-5xl">
            {title}
          </h1>
          {lede && <Lede>{lede}</Lede>}
          {children}
        </div>
      </Container>
    </section>
  );
}

export function PageBody({ children, tone = 'paper' }: { children: ReactNode; tone?: 'paper' | 'canvas' }) {
  const inApp = useContext(InAppDocContext);
  if (inApp) return <div className="flex flex-col gap-10 text-ink-700">{children}</div>;
  return (
    <section className={cn('border-t border-hairline', tone === 'paper' && 'bg-paper')}>
      <Container size="md">
        <div className="flex flex-col gap-10 py-12 text-ink-700 md:py-16">
          {children}
        </div>
      </Container>
    </section>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink-900 text-balance">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-body text-ink-700 text-pretty">{children}</p>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 list-disc pl-5 text-body text-ink-700 marker:text-ink-300">
      {items.map((item, i) => (
        <li key={i} className="text-pretty">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="flex flex-col gap-qurtag-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-modal border border-hairline bg-canvas p-5 shadow-card">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-canvas">
            {i + 1}
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="text-base font-semibold text-ink-900">{s.title}</h3>
            <p className="text-body text-ink-700 text-pretty">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
      {children}
    </Link>
  );
}

export function CtaBand({ title, body, wide = false }: { title: string; body?: string; wide?: boolean }) {
  const inApp = useContext(InAppDocContext);
  if (inApp) return null;
  return (
    <section className="border-t border-hairline">
      <Container size={wide ? 'xl' : 'md'}>
        <div className="flex flex-col items-start gap-4 py-16">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">{title}</h2>
          {body && <P>{body}</P>}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <PrimaryLink to="/start">Make a free tag</PrimaryLink>
            <SecondaryLink to="/how-it-works">How it works</SecondaryLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

export const CONTACT = 'info@impactconsulting.ai';

export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT}`} className="text-ink-900 underline underline-offset-4 break-words">
      {CONTACT}
    </a>
  );
}
