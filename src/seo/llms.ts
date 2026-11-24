import { FREE_ITEM_LIMIT } from '../../server/billing/catalog';
import { PUBLIC_PAGES, SITE_NAME, pageUrl } from './pages';

/**
 * /llms.txt (https://llmstxt.org): a plain-text summary of QuR Tag for answer engines, written into
 * the build by scripts/seo/prerender.mjs. The page list is PUBLIC_PAGES, the same list as the
 * sitemap, so a public page cannot be in one and missing from the other. What it says QuR Tag does
 * not hold matches the Privacy page (src/routes/marketing/Privacy.tsx).
 */
export function llmsText(): string {
  return [
    `# ${SITE_NAME}`,
    '',
    '> QuR Tag makes free QR tags you print at home, so a kind stranger who finds your lost thing can scan the tag and message you.',
    '',
    `QuR Tag is a web app at ${pageUrl('/')} from Impact Consulting AI LLC. You make a tag for an item (a water bottle, keys, a bag, a jacket), print it on paper or sticker paper and stick it on. A finder scans the tag with their phone camera and writes you a note, with no app and no account for the finder. You read the note in your QuR Tag inbox and reply. Neither side sees the other's email address or phone number.`,
    '',
    `It is free for up to ${FREE_ITEM_LIMIT} items. The pricing page lists the paid plans.`,
    '',
    'What QuR Tag does not do: QuR Tag does not hold payment card or bank details; payments are taken by Stripe, Apple or Google Play. It does not track location: a tag is not a GPS tracker, and no precise location is collected from owners or finders.',
    '',
    '## Pages',
    '',
    ...PUBLIC_PAGES.map((p) => `- [${p.title}](${pageUrl(p.path)}): ${p.description}`),
    '',
  ].join('\n');
}
