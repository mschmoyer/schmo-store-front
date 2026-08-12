import { Metadata } from 'next';

/**
 * Canonical site origin. Overridable per environment; falls back to the production domain.
 */
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://rebelshops.com';

/**
 * INTEGRITY NOTE — read before adding anything to this file.
 *
 * Everything here is served to search engines as structured data, where it is
 * treated as factual claims about the product. RebelShops has no customers yet
 * and several advertised capabilities are still in progress. Therefore:
 *
 *   - No aggregateRating, no review, no testimonial, no customer count until
 *     they describe real, attributable customers.
 *   - No FAQ answer may describe a capability that is not shipped. An answer
 *     here is a promise a buyer can hold us to.
 *
 * A previous version of this file published a fabricated 4.8/5 rating from 150
 * nonexistent customers, an invented testimonial, a nonexistent 14-day free
 * trial, and payment methods the platform does not support. Do not reintroduce
 * that pattern.
 */

interface LandingPageMetaProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

/**
 * Builds the Next.js Metadata object for the RebelShops marketing site.
 *
 * @param props - Optional overrides for title, description, keywords, OG image and canonical URL.
 * @returns A Next.js `Metadata` object for the landing page.
 */
export const generateLandingPageMeta = ({
  title = 'RebelShops — Your ShipStation catalog, now a storefront',
  description =
    'Turn the products already in your ShipStation account into a real online store. '
    + 'Set up in minutes, sell with Stripe, and keep shipping the way you already do. '
    + '$1 for 3 months, then $19.99/month.',
  keywords =
    'shipstation storefront, shipstation ecommerce, sell from shipstation, '
    + 'online store for shipstation sellers, shopify alternative, direct to consumer storefront',
  ogImage = '/landing/og-image.jpg',
  canonicalUrl = SITE_URL,
}: LandingPageMetaProps = {}): Metadata => {
  return {
    title,
    description,
    keywords,
    authors: [{ name: 'RebelShops' }],
    creator: 'RebelShops',
    publisher: 'RebelShops',
    robots: 'index, follow',
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalUrl,
      siteName: 'RebelShops',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'RebelShops — turn your ShipStation catalog into a storefront',
        },
      ],
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    other: {
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'theme-color': '#F94E1B',
      'msapplication-TileColor': '#F94E1B',
    },
  };
};

/**
 * Schema.org structured data describing the site, the organization and the product.
 * Claims here must be verifiable — see the integrity note at the top of this file.
 */
export const landingPageStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'RebelShops',
      description:
        'A storefront for sellers who already run their inventory and shipping through ShipStation.',
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'RebelShops',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'RebelShops',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Turn the products already in your ShipStation account into an online store, '
        + 'with Stripe checkout and orders that flow back into your existing shipping workflow.',
      url: SITE_URL,
      offers: {
        '@type': 'Offer',
        price: '19.99',
        priceCurrency: 'USD',
        description: '$1 for the first 3 months, then $19.99 per month. No transaction fees.',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: title(),
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#organization` },
      mainEntity: { '@id': `${SITE_URL}/#software` },
    },
  ],
};

/** @returns The canonical page title used in structured data. */
function title(): string {
  return 'RebelShops — Your ShipStation catalog, now a storefront';
}

/**
 * FAQ structured data. Every answer below describes behavior that exists today.
 * If a capability is still in progress, it does not get an entry here.
 */
export const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What does RebelShops do?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'RebelShops reads the product catalog and inventory in your existing ShipStation '
          + 'account and gives you a public online store to sell them from, so you do not have '
          + 'to re-enter your products anywhere or change how you ship.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does RebelShops cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          '$1 for the first three months, then $19.99 per month. We do not take a percentage '
          + 'of your sales. Payment processing fees are charged by Stripe directly and go to Stripe, '
          + 'not to us.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to use ShipStation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'ShipStation is the only shipping platform RebelShops integrates with today. The product '
          + 'is built specifically for sellers who already use it.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need technical skills to set up a store?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'No. Setup is connecting your ShipStation account, choosing how your store looks, and '
          + 'publishing. There is nothing to install and no code to write.',
      },
    },
  ],
};
