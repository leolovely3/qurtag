import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * The browser tab's title for every page (WCAG 2.4.2 Page Titled): "<page> | QuR Tag", so a
 * screen reader user moving between tabs, and a search result, says which page it is. The home
 * page keeps the full name and promise.
 *
 * Signed-in screens take the title they show (AppPage); the public pages, sign-in and the finder's
 * page take theirs from this list by address (usePathTitle in their layouts).
 */
export const SITE_TITLE = 'QuR Tag: a free QR tag so a kind stranger can message you';

const PUBLIC_TITLES: Record<string, string> = {
  '/how-it-works': 'How it works',
  '/pricing': 'Pricing',
  '/security': 'Security',
  '/help': 'Help',
  '/tags': 'Tag styles',
  '/make-it-last': 'Make your tag last',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
  '/start': 'Sign in or create an account',
  '/forgot-password': 'Forgot password',
  '/reset-password': 'Choose a new password',
  '/auth/callback': 'Signing in',
};

export function pageTitle(name?: string | null): string {
  return name ? `${name} | QuR Tag` : SITE_TITLE;
}

/** The title for a public address, or the site's own name for the home page and anything unknown. */
export function titleForPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (PUBLIC_TITLES[path]) return pageTitle(PUBLIC_TITLES[path]);
  if (path.startsWith('/join/')) return pageTitle('Join a family');
  if (path.startsWith('/find/')) return pageTitle('You found something');
  return SITE_TITLE;
}

export function usePageTitle(name: string): void {
  useEffect(() => {
    document.title = pageTitle(name);
  }, [name]);
}

export function usePathTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
}
