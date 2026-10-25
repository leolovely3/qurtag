import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/ui/Container';
import { Eyebrow, Lede } from '@/components/brand/Typography';
import { cn } from '@/lib/cn';

/** Shared building blocks for the plain marketing pages. */

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
  return (
    <section>
      <Container size="md">
        <div className="pt-qurtag-8 pb-qurtag-8 md:pt-16 flex flex-col gap-5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-ink-900 text-h2 sm:text-h1 tracking-[-0.035em] leading-[0.98] text-balance">
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
  return (
    <section className={cn('border-t border-hairline', tone === 'paper' && 'bg-paper')}>
      <Container size="md">
        <div className="py-qurtag-12 md:py-qurtag-16 flex flex-col gap-qurtag-8 text-ink-700">
          {children}
        </div>
      </Container>
    </section>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-qurtag-5 first:border-t-0 first:pt-0">
      <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] text-balance">
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
        <li key={s.title} className="flex gap-4 rounded-card border border-hairline bg-canvas p-qurtag-3">
          <span className="size-8 shrink-0 grid place-items-center rounded-full bg-ink-900 text-canvas text-caption font-semibold">
            {i + 1}
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="font-display font-semibold text-h6 text-ink-900 tracking-[-0.011em]">{s.title}</h3>
            <p className="text-body text-ink-700 text-pretty">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const linkBase =
  'inline-flex min-h-11 items-center justify-center rounded-pill px-6 text-body font-medium transition-colors duration-qurtag';

export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn(linkBase, 'bg-ink-900 text-canvas hover:bg-ink-700')}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn(linkBase, 'border border-hairline-strong text-ink-900 hover:border-ink-900')}>
      {children}
    </Link>
  );
}

export function CtaBand({ title, body }: { title: string; body?: string }) {
  return (
    <section className="border-t border-hairline">
      <Container size="md">
        <div className="py-qurtag-12 flex flex-col gap-4 items-start">
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.02em] text-balance">{title}</h2>
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
