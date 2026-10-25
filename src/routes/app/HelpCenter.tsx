import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { ContactForm } from '@/components/support/ContactForm';
import { HELP, visibleHelp } from '@/lib/helpContent';
import { isNative } from '@/lib/platform';
import { useHashScroll } from '@/lib/useHashScroll';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { cn } from '@/lib/cn';

/**
 * /app/help: answers grouped by what the person is doing (src/lib/helpContent.ts), with search,
 * and a link on each answer that does the thing. The "?" button on each main screen opens it at
 * the matching group (#getting-started, #found, #account); a link to one answer (#alerts) opens it.
 * The public Help page for visitors stays at /help.
 */
export function HelpCenter() {
  const memberships = useMembershipsAvailable();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => visibleHelp(HELP, { memberships, native: isNative(), query }), [memberships, query]);
  const searching = query.trim().length > 0;

  useHashScroll((el) => {
    if (el instanceof HTMLDetailsElement) el.open = true;
  });

  return (
    <AppPage title="Help" back={{ to: '/app/settings', label: 'Settings' }} width="narrow">
      <div className="flex flex-col gap-6">
        <div className="relative">
          <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            name="help-search"
            aria-label="Search help"
            placeholder="Search help"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-pill border border-ink-400 bg-canvas pl-11 pr-11 text-base text-ink-900 placeholder:text-muted focus:border-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-pill text-muted hover:text-ink-900">
              <X size={18} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>

        {searching && sections.length === 0 && (
          <p className="rounded-modal border border-hairline bg-paper px-4 py-4 text-base text-ink-700 text-pretty">
            Nothing matches that. Try a simpler word, or{' '}
            <Link to="/app/help#contact" onClick={() => setQuery('')} className="font-medium text-ink-900 underline underline-offset-4">contact us</Link>.
          </p>
        )}

        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="flex scroll-mt-16 flex-col gap-2">
            <h2 id={`${s.id}-h`} className="px-1 text-sm font-semibold text-ink-700">{s.title}</h2>
            <div className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline">
              {s.entries.map((e) => (
                <details key={`${e.id}-${searching}`} id={e.id} open={searching || undefined} className="group scroll-mt-16 target:bg-paper">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-base font-medium text-ink-900 marker:hidden hover:bg-ink-50 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 text-pretty">{e.q}</span>
                    <ChevronDown size={20} strokeWidth={1.75} className="shrink-0 text-ink-300 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="flex flex-col items-start gap-3 px-4 pb-4 text-base text-ink-700">
                    <p className="text-pretty">{e.a}</p>
                    {e.action && (
                      <Link
                        to={e.action.to}
                        className={cn('inline-flex min-h-11 items-center rounded-pill border border-hairline-strong px-4 text-sm font-medium text-ink-900 hover:bg-ink-50')}
                      >
                        {e.action.label}
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section id="contact" aria-labelledby="contact-h" className="flex scroll-mt-16 flex-col gap-3">
          <h2 id="contact-h" className="px-1 text-sm font-semibold text-ink-700">Contact us</h2>
          <div className="flex flex-col gap-3 rounded-modal border border-hairline bg-canvas p-4">
            <p className="text-base text-ink-700 text-pretty">
              Write to us here and we will reply by email. We see your account and plan with your message.
            </p>
            <ContactForm />
          </div>
        </section>

        <p className="px-1 text-sm text-muted text-pretty">
          More: <Link to="/app/make-it-last" className="underline underline-offset-4">Make it last</Link>,{' '}
          <Link to="/app/privacy" className="underline underline-offset-4">Privacy</Link> and{' '}
          <Link to="/app/terms" className="underline underline-offset-4">Terms</Link>.
        </p>
      </div>
    </AppPage>
  );
}
