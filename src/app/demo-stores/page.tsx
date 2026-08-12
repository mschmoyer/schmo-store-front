import type { Metadata } from 'next';
import { Button } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { DemoStoreCard } from '@/components/marketing/demo/DemoStoreCard';
import { PageHead } from '@/components/marketing/parts/PageHead';
import { Section } from '@/components/marketing/parts/Section';
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
        <PageHead
          eyebrow="Demo stores"
          title="Three real stores. Go break them."
          lede={
            <>
              These are RebelShops storefronts running on the same code your store would run on —
              {stores.length > 0 ? ` ${totalProducts} products` : ' products'} with live stock
              levels, working search, a cart and a checkout. Nothing here is a screenshot.
            </>
          }
        >
          <Button href={ROUTES.signUp} size="lg">
            Start for $1
          </Button>
        </PageHead>

        <Section ruled innerClassName={styles.listInner}>
          {stores.length === 0 ? (
            <p className={styles.empty}>
              The demo stores are temporarily unreachable. Try again in a minute.
            </p>
          ) : (
            stores.map((store, index) => (
              <DemoStoreCard key={store.slug} store={store} priority={index === 0} />
            ))
          )}
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}
