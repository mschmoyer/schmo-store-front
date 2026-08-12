import type { Metadata } from 'next';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { AnalyticsBoot } from '@/components/marketing/parts/AnalyticsBoot';
import { Hero } from '@/components/marketing/home/Hero';
import { AlreadyHaveIt } from '@/components/marketing/home/AlreadyHaveIt';
import { HowItWorksSteps } from '@/components/marketing/home/HowItWorksSteps';
import { WhatYouGet } from '@/components/marketing/home/WhatYouGet';
import { ProofSection } from '@/components/marketing/home/ProofSection';
import { PricingSection } from '@/components/marketing/home/PricingSection';
import { CostComparison } from '@/components/marketing/home/CostComparison';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { loadShowcaseStores, pickHeroProduct } from '@/components/marketing/data/showcase';
import {
  generateLandingPageMeta,
  landingPageStructuredData,
} from '@/components/seo/LandingPageMeta';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'ShipStation Storefront — Sell Your Catalog | RebelShops',
  description:
    'Turn your ShipStation catalog into an online store. Products, SKUs and stock sync '
    + 'automatically. $1 for 3 months, then $19.99/mo. No transaction fees.',
  canonicalUrl: 'https://rebelshops.com',
});

/**
 * The RebelShops marketing homepage.
 *
 * Renders on the server so the hero's before/after visual is built from live
 * rows in the seeded demo stores rather than from copy.
 *
 * LAYOUT CONTRACT — the page is one white ground from the header to the footer.
 * Sections are separated by whitespace, a 1px rule and type hierarchy, never by
 * an alternating background. Exactly one section inverts to ink: pricing, the
 * decision point. Every section renders through `parts/Section`, which owns the
 * only container on the site, so all content shares one left edge and no CTA
 * can drift to an alignment of its own.
 *
 * SEVEN SECTIONS, NOT THIRTEEN. docs/marketing-copy.md §3 specifies thirteen,
 * which is a features page wearing a homepage's name: the build followed it
 * faithfully and produced 12,381px, 48% of which rendered byte-identically on
 * /features and /how-it-works because those pages imported the same modules.
 * What now lives elsewhere:
 *
 *   §3.4 MakeItYours ....... /features (it was the lowest-density section here)
 *   §3.6 InventorySection .. /features (summarised in one line by WhatYouGet)
 *   §3.8 AnalyticsSection .. /features (likewise)
 *   §3.13 FaqSection ....... /pricing, beside the price it asks about
 *   Full Shopify table ..... /pricing (the homepage keeps a three-row strip)
 *
 * That is only deletable because ROUTES.pricing/faq/comparison now point at
 * /pricing instead of at `/#…` anchors on this page. See data/routes.ts.
 *
 * @returns The homepage.
 */
export default async function HomePage() {
  const stores = await loadShowcaseStores();

  const hero = pickHeroProduct(stores);
  const heroRows = hero
    ? [
        hero.product,
        ...hero.store.products.filter((p) => p.sku !== hero.product.sku).slice(0, 2),
      ].sort((a, b) => a.sku.localeCompare(b.sku))
    : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingPageStructuredData) }}
      />
      <AnalyticsBoot />
      <SiteHeader />

      <main id="main">
        <Hero store={hero?.store ?? null} rows={heroRows} focus={hero?.product ?? null} />
        <AlreadyHaveIt />
        <HowItWorksSteps showFigures={false} hideCta />
        <WhatYouGet />
        <ProofSection />
        <PricingSection />
        <CostComparison />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
