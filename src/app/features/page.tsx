import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { MakeItYours } from '@/components/marketing/home/MakeItYours';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { IncludedLists } from '@/components/marketing/parts/IncludedLists';
import { ROUTES } from '@/components/marketing/data/routes';
import {
  loadShowcaseStores,
} from '@/components/marketing/data/showcase';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';
import styles from './page.module.css';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'Features — Sync, Inventory, Purchase Orders | RebelShops',
  description:
    'ShipStation catalog sync, demand forecasting, reorder points, dead-stock reports, '
    + 'purchase orders and coupons. Included, not add-ons.',
  canonicalUrl: 'https://rebelshops.com/features',
});

/**
 * `/features` — the supporting claims from copy deck §2, landed in full: the
 * sync, the inventory reporting, the storefront and the analytics, followed by
 * the complete included / not-included pair from §3.10.
 *
 * @returns The features page.
 */
export default async function FeaturesPage() {
  const stores = await loadShowcaseStores();

  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className={styles.head}>
          <div className={styles.headInner}>
            <Eyebrow rule className={styles.eyebrow}>
              Features
            </Eyebrow>
          
            <h1 className={styles.title}>In the box, not in an app store.</h1>
          
            <p className={styles.lede}>
              Inventory valuation, dead-stock and turnover reports, purchase orders and supplier
              records ship in the box. On Shopify Basic those are apps.
            </p>
          
            <div className={styles.actions}>
              <Button as={Link} href={ROUTES.signUp} size="lg">
                Start for $1
              </Button>
              <Button as={Link} href={ROUTES.comparison} variant="secondary" size="lg">
                See the 12-month math
              </Button>
            </div>
          
          </div>
        </section>

        <MakeItYours stores={stores} />
        {/* SyncSection / InventorySection / AnalyticsSection were removed: they
            were byte-identical imports shared with the homepage, which is how
            48% of the homepage came to duplicate a page the nav already links
            to. /features still needs its own denser treatment of sync,
            inventory maths and zero-result search — written for this page
            rather than shared with the homepage. */}
        <IncludedLists />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
