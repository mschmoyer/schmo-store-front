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
        // Rendered inline, with no Suspense boundary.
        //
        // The boundary that used to be here bought a fast first paint at a
        // price nobody had measured: React streams the contents of a suspended
        // subtree into `<div hidden>` and un-hides it with an inline script, so
        // with JavaScript disabled this page was a header, a footer, and 28,814
        // characters of shop parked in a hidden div — an empty storefront for a
        // failed bundle, a text-mode client, or a crawler that does not run JS.
        // It also cost 0.3077 CLS, because the fallback was a hero skeleton and
        // eight cards while the real page is a merchant-composed section list of
        // entirely different geometry; there is no skeleton that can match a
        // shape the customizer decides.
        //
        // The sections do query the catalogue, so this delays the first byte
        // rather than the first section. A shop that renders is worth more than
        // a shop that renders sooner.
        <SectionList sections={sections} ctx={{ store, theme, categories, isPreview }} />
      )}
    </StorefrontShell>
  );
}
