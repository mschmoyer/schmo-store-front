import { StorefrontShell } from '@/components/store/StorefrontShell';
import { SectionList } from '@/components/store/sections';
import { EmptyCatalogue } from '@/components/store/states/EmptyStates';
import { StoreBand, StoreContainer } from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../_lib/load';
import { countActiveProducts } from '../_lib/queries';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * The store home page.
 *
 * The page itself composes nothing: it renders the ordered `Section[]` from the
 * theme engine through the one registry in `components/store/sections`
 * (spec section 8). Reordering sections in the customizer therefore reorders
 * this page with no code change, and a section type this build does not know
 * about is skipped rather than crashing the shop.
 *
 * The only special case is a shop with no products at all, which gets the
 * merchant-facing empty state instead of a home page full of bands that would
 * each individually render nothing.
 *
 * @param props - Route params and search params
 * @returns The themed store home page
 */
export default async function StoreHomePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const search = await searchParams;

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store, theme, sections, categories, isPreview } = result.data;
  const productCount = await countActiveProducts(store.id);

  // The default sections and `footer.showNewsletter` are both on out of the
  // box, which would stack two identical email forms at the bottom of the page.
  const hasNewsletterSection = sections.some(
    (section) => section.type === 'newsletter' && section.enabled,
  );

  return (
    <StorefrontShell {...result.data} suppressFooterNewsletter={hasNewsletterSection}>
      {productCount === 0 ? (
        <StoreBand>
          <StoreContainer width="narrow">
            <EmptyCatalogue />
          </StoreContainer>
        </StoreBand>
      ) : (
        <SectionList
          sections={sections}
          ctx={{ store, theme, categories, isPreview }}
        />
      )}
    </StorefrontShell>
  );
}
