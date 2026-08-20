import type { Metadata } from 'next';
import { storefrontUrl } from '@/lib/seo/siteUrl';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import {
  CatalogueControls,
  Pagination,
} from '@/components/store/product/CatalogueControls';
import { ProductGrid } from '@/components/store/product/ProductGrid';
import { EmptyCatalogue, NoResults } from '@/components/store/states/EmptyStates';
import { SectionHeading, StoreBand, StoreContainer } from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../_lib/load';
import { countActiveProducts, parseCatalogueQuery, queryProducts } from '../../_lib/queries';
import { getStoreBySlug } from '../../_lib/queries';

interface ProductsPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * Title the listing after whatever the shopper is actually looking at.
 * @param props - Route and search params
 * @returns Metadata for this listing view
 */
export async function generateMetadata({
  params,
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);
  const lookup = await getStoreBySlug(storeSlug);
  if (!lookup.ok) return { title: 'Shop unavailable' };

  const query = parseCatalogueQuery(search);
  const title = query.search
    ? `Search: ${query.search}`
    : query.category
      ? query.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'All products';

  /*
   * A category is a real, distinct collection and canonicalises to itself. Every other variation —
   * a sort order, a page, a search — is the same products arranged differently, so it points at the
   * clean listing.
   *
   * Without this the page inherited the root layout's canonical, which is the platform's marketing
   * homepage, so every merchant's collection page declared itself a duplicate of rebelshops.com.
   */
  const canonical = query.category
    ? storefrontUrl(storeSlug, `/products?category=${encodeURIComponent(query.category)}`)
    : storefrontUrl(storeSlug, '/products');

  return {
    title,
    alternates: { canonical },
    /*
     * A filtered, sorted or paged view is a duplicate of the catalogue as far as search engines are
     * concerned; only the clean listing should be indexed. `sort` was missing from this test, so
     * `?sort=price-asc`, `?sort=newest` and the rest were all indexable duplicates of each other.
     * `'featured'` is the default the query parser falls back to.
     */
    robots:
      query.search || query.page > 1 || query.sort !== 'featured'
        ? { index: false, follow: true }
        : undefined,
    openGraph: { title, url: canonical, type: 'website' },
  };
}

/**
 * The collection / listing page.
 *
 * Search, category filter, sort and pagination are all read from the URL and
 * resolved on the server, so every state of this page is a real, shareable
 * address and the back button moves through them correctly. Nothing here is
 * client-only state.
 *
 * **There is deliberately no `loading.tsx` for this segment.** One used to
 * exist and it was worse than nothing twice over: it rendered
 * `ProductGridSkeleton` *outside* `StorefrontShell`, so there was no token
 * block, no header and no footer — twelve pale tiles on a pure-white page,
 * flashed in the middle of a merchant's black shop on every navigation — and
 * because a route-level fallback makes Next stream the real markup into a
 * `<div hidden>`, this page measured **zero** visible characters with
 * JavaScript disabled. Without it the navigation simply waits for a
 * server-rendered, fully themed page.
 *
 * @param props - Route and search params
 * @returns The themed listing page
 */
export default async function ProductsPage({ params, searchParams }: ProductsPageProps) {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store, theme, categories } = result.data;
  const basePath = `/store/${store.storeSlug}/products`;

  const query = parseCatalogueQuery(search);
  const [page, catalogueSize] = await Promise.all([
    queryProducts(store.id, query),
    countActiveProducts(store.id),
  ]);

  const activeCategory = categories.find((category) => category.slug === query.category);
  const heading = query.search
    ? `Results for “${query.search}”`
    : activeCategory
      ? activeCategory.name
      : 'All products';

  return (
    <StorefrontShell {...result.data}>
      <StoreBand>
        <StoreContainer>
          <SectionHeading
            heading={heading}
            subheading={
              catalogueSize === 0
                ? undefined
                : `${page.total} ${page.total === 1 ? 'product' : 'products'}`
            }
            level={2}
          />

          {catalogueSize === 0 ? (
            <EmptyCatalogue />
          ) : (
            <>
              <CatalogueControls
                basePath={basePath}
                query={query}
                categories={categories}
                total={catalogueSize}
              />

              {page.products.length === 0 ? (
                <NoResults query={query.search} resetHref={basePath} />
              ) : (
                <>
                  <ProductGrid
                    products={page.products}
                    storeSlug={store.storeSlug}
                    currency={store.currency}
                    card={theme.productCard}
                    columns={4}
                  />
                  <Pagination
                    basePath={basePath}
                    query={query}
                    page={page.page}
                    totalPages={page.totalPages}
                  />
                </>
              )}
            </>
          )}
        </StoreContainer>
      </StoreBand>
    </StorefrontShell>
  );
}
