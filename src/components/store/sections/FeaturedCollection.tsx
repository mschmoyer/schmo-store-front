import { getSectionProducts } from '@/app/store/_lib/queries';
import { bool, idList, num, str } from '@/app/store/_lib/settings';

import { ProductGrid } from '../product/ProductGrid';
import { SectionHeading, StoreBand, StoreContainer, StoreLinkButton } from '../ui';
import type { SectionProps } from './types';

/**
 * A band of products.
 *
 * The merchant can hand-pick products, point at a collection, or leave both
 * blank — in which case the query layer falls back to featured products and
 * then to the newest, so this section is never empty on a stocked shop. If the
 * shop genuinely has no products, the band removes itself rather than rendering
 * a heading over a void.
 *
 * @param props - {@link SectionProps}
 * @returns A product band, or null
 */
export async function FeaturedCollection({ section, ctx }: SectionProps) {
  const { settings } = section;
  const { store, theme } = ctx;

  const products = await getSectionProducts(store.id, {
    productIds: idList(settings, 'products'),
    collection: str(settings, 'collection'),
    limit: num(settings, 'limit', 8, 2, 24),
  });

  if (products.length === 0) return null;

  const heading = str(settings, 'heading', 'Featured');
  const subheading = str(settings, 'subheading');
  const showViewAll = bool(settings, 'showViewAll', true);
  const collection = str(settings, 'collection');

  const viewAllHref = collection
    ? `/store/${store.storeSlug}/products?category=${encodeURIComponent(collection)}`
    : `/store/${store.storeSlug}/products`;

  return (
    <StoreBand tone="surface">
      <StoreContainer>
        <SectionHeading
          heading={heading}
          subheading={subheading}
          action={
            showViewAll ? (
              <StoreLinkButton href={viewAllHref} variant="secondary" size="sm">
                View all
              </StoreLinkButton>
            ) : null
          }
        />
        <ProductGrid
          products={products}
          storeSlug={store.storeSlug}
          currency={store.currency}
          card={theme.productCard}
          columns={num(settings, 'columns', 4, 2, 6)}
        />
      </StoreContainer>
    </StoreBand>
  );
}
