import type { Metadata } from 'next';
import { Button } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { MakeItYours } from '@/components/marketing/home/MakeItYours';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { FeatureReports } from '@/components/marketing/features/FeatureReports';
import { IncludedLists } from '@/components/marketing/parts/IncludedLists';
import { PageHead } from '@/components/marketing/parts/PageHead';
import { ROUTES } from '@/components/marketing/data/routes';
import { loadShowcaseStores, loadZeroResultSearches } from '@/components/marketing/data/showcase';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'Features — Sync, Inventory, Purchase Orders | RebelShops',
  description:
    'ShipStation catalog sync, demand forecasting, reorder points, dead-stock reports, '
    + 'purchase orders and coupons. Included, not add-ons.',
  canonicalUrl: 'https://rebelshops.com/features',
});

/**
 * `/features` — the supporting claims from copy deck §2, landed in full.
 *
 * This page carries the density: the dead-stock report and the zero-result
 * search table render here at their real column counts, written for this page
 * in `components/marketing/features` rather than shared with the homepage. The
 * homepage summarises each in a sentence and links here.
 *
 * @returns The features page.
 */
export default async function FeaturesPage() {
  const [stores, searches] = await Promise.all([loadShowcaseStores(), loadZeroResultSearches(5)]);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <PageHead
          eyebrow="Features"
          title="In the box, not in an app store."
          lede="Inventory valuation, dead-stock and turnover reports, purchase orders and supplier records ship in the box. On Shopify Basic those are apps."
        >
          <Button href={ROUTES.signUp} size="lg">
            Start for $1
          </Button>
          <Button href={ROUTES.comparison} variant="secondary" size="lg">
            See the 12-month math
          </Button>
        </PageHead>

        <FeatureReports searches={searches} />
        <MakeItYours stores={stores} />
        <IncludedLists />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
