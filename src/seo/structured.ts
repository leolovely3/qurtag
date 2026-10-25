import { visibleFaqs, plainAnswer } from '../lib/faq';
import { FREE_ITEM_LIMIT, FAMILY_SEATS, PRODUCTS, priceLabel } from '../../server/billing/catalog';
import { SITE_NAME, SITE_ORIGIN } from './pages';

/**
 * JSON-LD for search (https://schema.org), written into the HTML at build time by
 * scripts/seo/prerender.mjs. Prices come from the billing catalog, the one list the Pricing page
 * and the store products also use, and the FAQ comes from src/lib/faq.ts, the list the Help page
 * shows, so none of it can drift from what a visitor reads.
 */
const ORG_ID = `${SITE_ORIGIN}/#publisher`;
const SITE_ID = `${SITE_ORIGIN}/#website`;

const usd = (cents: number) => (cents / 100).toFixed(2);

/** The home page: the company that publishes QuR Tag, the website, and the product with its plans. */
export function homeStructuredData(): object {
  const plus = PRODUCTS.find((p) => p.plan === 'plus')!;
  const family = PRODUCTS.find((p) => p.plan === 'family')!;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'Impact Consulting AI LLC',
        brand: { '@type': 'Brand', name: SITE_NAME },
        logo: `${SITE_ORIGIN}/icons/icon-512.png`,
        email: 'info@impactconsulting.ai',
        contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'info@impactconsulting.ai' },
      },
      {
        '@type': 'WebSite',
        '@id': SITE_ID,
        url: `${SITE_ORIGIN}/`,
        name: SITE_NAME,
        inLanguage: 'en-US',
        publisher: { '@id': ORG_ID },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_ORIGIN}/#app`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        description:
          'Free QR tags you print at home. When a kind stranger finds your thing, they scan the tag and write you a note, with no app for the finder, and neither side sees the other\'s contact details.',
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Any web browser',
        publisher: { '@id': ORG_ID },
        offers: [
          {
            '@type': 'Offer',
            name: 'Free',
            description: `Up to ${FREE_ITEM_LIMIT} items, each with a printable QR tag.`,
            price: '0',
            priceCurrency: 'USD',
          },
          {
            '@type': 'Offer',
            name: 'Plus',
            description: `No limit on items, with your full scan history. ${priceLabel(plus.cents)} a year.`,
            price: usd(plus.cents),
            priceCurrency: 'USD',
            priceSpecification: { '@type': 'UnitPriceSpecification', price: usd(plus.cents), priceCurrency: 'USD', billingDuration: 1, unitCode: 'ANN' },
          },
          {
            '@type': 'Offer',
            name: 'Family',
            description: `Plus for up to ${FAMILY_SEATS} people who share the items and the inbox. ${priceLabel(family.cents)} a year.`,
            price: usd(family.cents),
            priceCurrency: 'USD',
            priceSpecification: { '@type': 'UnitPriceSpecification', price: usd(family.cents), priceCurrency: 'USD', billingDuration: 1, unitCode: 'ANN' },
          },
        ],
      },
    ],
  };
}

/** The Help page's FAQPage markup, from the questions the page shows on the web. */
export function faqStructuredData(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: visibleFaqs(true).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: plainAnswer(f.a) },
    })),
  };
}
