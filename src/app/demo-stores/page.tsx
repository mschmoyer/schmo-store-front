import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { DemoStoreCard } from '@/components/marketing/demo/DemoStoreCard';
import { ROUTES } from '@/components/marketing/data/routes';
import { loadShowcaseStores } from '@/components/marketing/data/showcase';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';
import styles from './page.module.css';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'Demo Stores — See RebelShops Running | RebelShops',
  description:
    'Browse real RebelShops storefronts. Search them, add to cart, walk the checkout. '
    + 'Same code your store would run on.',
  canonicalUrl: 'https://rebelshops.com/demo-stores',
});

/**
 * `/demo-stores` — the three seeded storefronts, loaded from the database so
 * the product counts, stock states and prices on this page are the ones the
 * visitor will find after they click.
 *
 * @returns The demo stores page.
 */
export default async function DemoStoresPage() {
  const stores = await loadShowcaseStores();
  const totalProducts = stores.reduce((sum, s) => sum + s.productCount, 0);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className={styles.head}>
          <div className={styles.headInner}>
            <Eyebrow rule className={styles.eyebrow}>
              Demo stores
            </Eyebrow>
          
            <h1 className={styles.title}>Three real stores. Go break them.</h1>
          
            <p className={styles.lede}>
              These are RebelShops storefronts running on the same code your store would run on —
              {stores.length > 0 ? ` ${totalProducts} products` : ' products'} with live stock
              levels, working search, a cart and a checkout. Nothing here is a screenshot.
            </p>
          
            <div className={styles.actions}>
              <Button as={Link} href={ROUTES.signUp} size="lg">
                Start for $1
              </Button>
              <p className={styles.microcopy}>
                $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime.
              </p>
            </div>
          
          </div>
        </section>

        <section className={styles.list}>
          <div className={styles.listInner}>
            {stores.length === 0 ? (
              <p className={styles.empty}>
                The demo stores are temporarily unreachable. Try again in a minute.
              </p>
            ) : (
              stores.map((store, index) => (
                <DemoStoreCard store={store} priority={index === 0} />
              
              ))
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
