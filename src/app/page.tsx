import type { Metadata } from 'next';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { AnalyticsBoot } from '@/components/marketing/parts/AnalyticsBoot';
import { Hero } from '@/components/marketing/home/Hero';
import { AlreadyHaveIt } from '@/components/marketing/home/AlreadyHaveIt';
import { HowItWorksSteps } from '@/components/marketing/home/HowItWorksSteps';
import { MakeItYours } from '@/components/marketing/home/MakeItYours';
import { SyncSection } from '@/components/marketing/home/SyncSection';
import { InventorySection } from '@/components/marketing/home/InventorySection';
import { AnalyticsSection } from '@/components/marketing/home/AnalyticsSection';
import { ProofSection } from '@/components/marketing/home/ProofSection';
import { PricingSection } from '@/components/marketing/home/PricingSection';
import { CostComparison } from '@/components/marketing/home/CostComparison';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import {
  interleaveProducts,
  loadShowcaseStores,
  loadZeroResultSearches,
  pickHeroProduct,
} from '@/components/marketing/data/showcase';
import {
  faqStructuredData,
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
 * Renders on the server so the hero, the storefront showcase and the
 * zero-result search table are built from live rows in the seeded demo stores
 * rather than from copy. Section order follows docs/marketing-copy.md §3, with
 * the FAQ placed before the final CTA so the page ends on the offer (§3.12).
 *
 * @returns The homepage.
 */
export default async function HomePage() {
  const [stores, searches] = await Promise.all([loadShowcaseStores(), loadZeroResultSearches(5)]);

  const hero = pickHeroProduct(stores);
  const heroRows = hero
    ? [
        hero.product,
        ...hero.store.products.filter((p) => p.sku !== hero.product.sku).slice(0, 3),
      ].sort((a, b) => a.sku.localeCompare(b.sku))
    : [];

  const showcase = interleaveProducts(stores, 12);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingPageStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <AnalyticsBoot />
      <SiteHeader />

      <main id="main">
        <Hero store={hero?.store ?? null} rows={heroRows} focus={hero?.product ?? null} />
        <AlreadyHaveIt />
        <HowItWorksSteps />
        <MakeItYours stores={stores} />
        <SyncSection />
        <InventorySection />
        <AnalyticsSection searches={searches} />
        <ProofSection items={showcase} />
        <PricingSection />
        <CostComparison />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
