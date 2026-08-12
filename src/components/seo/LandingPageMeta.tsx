import { Metadata } from 'next';
import { HOMEPAGE_FAQ } from '@/components/marketing/data/faq';

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
  ogImage = '/brand/og-image.png',
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
          alt: 'A RebelShops storefront showing a product grid with live stock levels',
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
      'theme-color': '#111214',
      'msapplication-TileColor': '#111214',
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
        url: `${SITE_URL}/brand/icon-512.png`,
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
      // No `offers` block: docs/marketing-copy.md §6 gates Offer schema on live
      // subscription billing, and there is no billing flow in the product yet.
      // Publishing a price as structured data before we can charge it would be
      // a claim we cannot honour.
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
 * FAQ structured data.
 *
 * §6 of the copy deck: `FAQPage` may only contain questions and answers that
 * appear verbatim on the rendered page. This is generated from the same array
 * the homepage FAQ renders, so the two can never drift.
 */
export const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOMEPAGE_FAQ.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};
