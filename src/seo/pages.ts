import { SITE_TITLE, titleForPath } from '../lib/pageTitle';

/**
 * The public pages search engines may index: what the build writes into each page's HTML (title,
 * description, canonical address, link-preview tags) and into sitemap.xml. One list, so a page
 * cannot be in the sitemap without its own title and description, and the other way round.
 *
 * Titles come from src/lib/pageTitle.ts, the same ones the browser tab shows. Everything not
 * listed here (the signed-in app, sign-in, the finder's page, invite links) is never indexed:
 * its HTML says noindex and the sitemap leaves it out. src/routes.tsx must have a route for every path.
 */
export const SITE_ORIGIN = 'https://www.qurtag.com';
export const SITE_NAME = 'QuR Tag';
export const SHARE_IMAGE = `${SITE_ORIGIN}/og.png`;
export const SHARE_IMAGE_ALT = 'QuR Tag: a free QR tag so a kind stranger can message you';

export interface PublicPage {
  path: string;
  title: string;
  /** 70 to 160 characters: what a search result shows under the title. */
  description: string;
  changefreq: 'weekly' | 'monthly';
  priority: number;
}

export const HOME_DESCRIPTION =
  'Print a free QR tag at home and put it on your things. When a kind stranger finds one, they scan it and write you a note. No app for the finder.';

const page = (path: string, description: string, changefreq: PublicPage['changefreq'], priority: number): PublicPage => ({
  path,
  title: path === '/' ? SITE_TITLE : titleForPath(path),
  description,
  changefreq,
  priority,
});

export const PUBLIC_PAGES: PublicPage[] = [
  page('/', HOME_DESCRIPTION, 'weekly', 1.0),
  page('/how-it-works', 'How QuR Tag works: make a tag, print it and stick it on. A finder scans it with their camera, writes you a note, and you reply.', 'monthly', 0.9),
  page('/tags', 'Pick a QR tag style for bottles, keys, bags or clothes, then print it at home on paper or sticker paper. A short code is printed as a backup.', 'weekly', 0.9),
  page('/make-it-last', 'How to make a printed QR tag last: what to print on, what to cover it with and where to put it, so it still scans when someone finds your thing.', 'monthly', 0.7),
  page('/pricing', 'QuR Tag is free for up to three items. Plus is $19 a year with no item limit. Family is $29 a year and shares items and inbox with up to five people.', 'weekly', 0.9),
  page('/security', 'What a finder sees on a QuR Tag page and what they cannot. Your email and phone number stay private, and every conversation stays between you and the finder.', 'monthly', 0.8),
  page('/help', 'Answers about QuR Tag: what a finder sees, how replies work, what it costs, how to make a tag last, how to report a finder and how to delete your account.', 'monthly', 0.6),
  page('/privacy', 'What QuR Tag collects, why, who can see it and how to get it deleted, written in plain words.', 'monthly', 0.4),
  page('/terms', 'The terms for using QuR Tag, the free QR tag service from Impact Consulting AI LLC: your account, the plans, finders\' notes and what we expect of you.', 'monthly', 0.4),
];

/** The full address of a public page: the home page keeps its slash, every other page has none. */
export function pageUrl(path: string): string {
  return path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
