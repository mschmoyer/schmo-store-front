import { ProductGridSkeleton } from '@/components/store/states/Skeletons';
import { StoreBand, StoreContainer } from '@/components/store/ui';

/**
 * The listing page's loading state.
 *
 * Scoped to this segment on purpose. A `loading.tsx` one level up at
 * `[storeSlug]/` would wrap every nested route in a Suspense boundary,
 * including the product page — and a response that has started streaming has
 * already sent `200`, so `notFound()` on a dead product URL would degrade into
 * a soft 404. Keeping the boundary on routes that cannot 404 avoids that
 * entirely.
 *
 * @returns A skeleton matching the listing grid
 */
export default function ProductsLoading() {
  return (
    <StoreBand>
      <StoreContainer>
        <ProductGridSkeleton count={12} />
      </StoreContainer>
    </StoreBand>
  );
}
