import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { HelpButton } from '@/components/account/Account';
import { cn } from '@/lib/cn';

/**
 * The frame of every screen inside the app (/app and the screens nested under it).
 *
 * A top-level screen (Items, Inbox, Settings) shows its title as a calm page heading with an
 * optional action beside it, the way Things 3 and Apple's Find My title their lists. A nested
 * screen (an item, a conversation, adding an item, a tag) gets a navigation bar instead: Back on
 * the left with the name of the screen it returns to, the title in the middle, an optional
 * action on the right. On a phone the bar sticks under the status bar; from tablet width it
 * sits at the top of the content column, left aligned. One h1 per screen either way.
 */
interface AppPageProps {
  title: string;
  /** Nested screens: where Back goes and what it is called there. */
  back?: { to: string; label: string };
  /** One action beside the title (top level) or at the right of the bar (nested). */
  action?: ReactNode;
  /** A short line under a top-level title. */
  subtitle?: ReactNode;
  /** Top-level screens, phone bar: something at the left (the account button on Items). */
  leading?: ReactNode;
  /** Top-level screens: the Help section this screen's "?" opens (src/routes/app/HelpCenter.tsx). */
  help?: string;
  width?: 'narrow' | 'normal' | 'wide';
  children: ReactNode;
  className?: string;
}

const widths = {
  narrow: 'max-w-2xl',
  normal: 'max-w-3xl',
  wide: 'max-w-5xl',
} as const;

export function AppPage({ title, back, action, subtitle, leading, help, width = 'normal', children, className }: AppPageProps) {
  if (back) {
    return (
      <div className={cn('w-full', className)}>
        <header className="no-print sticky top-0 z-30 border-b border-hairline bg-canvas/90 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/80">
          <div className={cn('mx-auto w-full px-2 md:px-8', widths[width])}>
            <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:flex md:h-14 md:gap-3">
              <Link
                to={back.to}
                className="inline-flex h-11 min-w-0 items-center gap-0.5 justify-self-start rounded-pill pl-1 pr-3 text-base text-ink-900 hover:bg-ink-50 md:-ml-3 md:text-sm md:text-muted md:hover:text-ink-900"
              >
                <ChevronLeft size={22} strokeWidth={2} className="shrink-0" aria-hidden />
                <span className="truncate">{back.label}</span>
              </Link>
              <span aria-hidden className="hidden h-4 w-px bg-hairline-strong md:block" />
              <h1 className="max-w-[48vw] truncate text-center text-base font-semibold text-ink-900 md:max-w-none md:flex-1 md:text-left">
                {title}
              </h1>
              <div className="flex min-w-0 items-center justify-self-end">{action}</div>
            </div>
          </div>
        </header>
        <div className={cn('mx-auto w-full px-4 pb-8 pt-4 md:px-8 md:pt-6', widths[width])}>{children}</div>
      </div>
    );
  }
  return (
    <TopLevel title={title} action={action} subtitle={subtitle} leading={leading} help={help} width={width} className={className}>
      {children}
    </TopLevel>
  );
}

function TopLevel({
  title,
  action,
  subtitle,
  leading,
  help,
  width,
  className,
  children,
}: Pick<AppPageProps, 'title' | 'action' | 'subtitle' | 'leading' | 'help' | 'className' | 'children'> & { width: keyof typeof widths }) {
  const largeTitle = useRef<HTMLHeadingElement>(null);
  const [scrolled, setScrolled] = useState(false);
  // The bar's small title and its hairline appear once the large title has scrolled under it.
  useEffect(() => {
    const el = largeTitle.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { rootMargin: '-44px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={cn('w-full', className)}>
      <header
        className={cn(
          'no-print sticky top-0 z-30 border-b transition-colors duration-150 md:hidden',
          scrolled ? 'border-hairline bg-canvas/85 backdrop-blur-xl' : 'border-transparent bg-canvas',
        )}
      >
        <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2">
          <div className="flex justify-self-start">{leading}</div>
          <span aria-hidden className={cn('max-w-[50vw] truncate text-base font-semibold text-ink-900 transition-opacity duration-150', scrolled ? 'opacity-100' : 'opacity-0')}>
            {title}
          </span>
          <div className="flex items-center justify-self-end">
            {help && <HelpButton section={help} />}
            {action}
          </div>
        </div>
      </header>
      <div className={cn('mx-auto w-full px-4 pb-8 pt-1 md:px-8 md:pt-10', widths[width])}>
        <header className="mb-5 flex items-center justify-between gap-3 md:mb-6">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 ref={largeTitle} className="text-[2rem] font-bold leading-tight tracking-[-0.02em] text-ink-900 md:text-[2rem] md:font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted text-pretty">{subtitle}</p>}
          </div>
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            {help && <HelpButton section={help} />}
            {action}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

/** A titled group of rows or fields on an app screen: a small plain label, then a card. */
export function AppSection({
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {title && <h2 className="px-1 text-sm font-semibold text-ink-700">{title}</h2>}
      <div className={cn('overflow-hidden rounded-modal border border-hairline bg-canvas', bodyClassName)}>{children}</div>
      {description && <p className="px-1 text-sm text-muted text-pretty">{description}</p>}
    </section>
  );
}
