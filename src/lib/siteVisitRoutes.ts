/**
 * Routes counted as their pattern by the anonymous page view counter (siteVisits.ts): a tag's page, an item,
 * a conversation, an invitation and an account are one line each, never their id or code.
 *
 * Every address the site answers is listed, because a path that is not listed would be counted as it is
 * spelled. The finder's short link (qurtag.com/k7m2p) is a tag's code in the address, so an address that
 * is not a known page is counted under a catch-all (UNKNOWN), however many segments it has, never as the
 * words in it. scripts/qurtag/unit/site-visits.test.ts checks that every path in
 * src/routes.tsx is in this list.
 */
export const VISIT_ROUTES = [
  '/',
  '/how-it-works',
  '/pricing',
  '/security',
  '/help',
  '/tags',
  '/make-it-last',
  '/privacy',
  '/delete-account',
  '/terms',
  '/start',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/join/:token',
  '/app',
  '/start/setup',
  '/app/tags/:tagId/print',
  '/app/tags/sheet',
  '/app/items',
  '/app/items/:itemId',
  '/app/tags',
  '/app/inbox',
  '/app/inbox/:threadId',
  '/app/trips',
  '/app/membership',
  '/app/settings',
  '/app/help',
  '/app/first-tag',
  '/app/account',
  '/app/terms',
  '/app/privacy',
  '/app/make-it-last',
  '/app/admin',
  '/app/admin/accounts/:userId',
  '/app/items/:itemId/insurance-packet',
  '/partners',
  '/partners/scan',
  '/partners/queue',
  '/find/:tagId',
  '/reply',
  '/find',
] as const;

/**
 * Any address that is not a page above, from one segment to fifty (a path has at most 100 characters, so it
 * has at most 50 segments): counted without its words. One that is too long to count is not counted.
 */
export const UNKNOWN: readonly string[] = Array.from({ length: 50 }, (_, n) => '/' + Array.from({ length: n + 1 }, () => ':other').join('/'));

/** No public page keeps its own slug: nothing here. */
export const KEEP_SLUG = [] as const;

/** The link's own tag: ?ch= (src/lib/measures.ts) first, then utm_source and src. */
export const TAG_PARAMS = ['ch', 'utm_source', 'src'] as const;
