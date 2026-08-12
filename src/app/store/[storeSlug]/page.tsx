import { cookies } from 'next/headers';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import { SectionList } from '@/components/store/sections';
import { EmptyCatalogue } from '@/components/store/states/EmptyStates';
import { SectionHeading, StoreBand, StoreContainer } from '@/components/store/ui';
import { verifySession } from '@/lib/auth/session';

import { loadStorefront, type SearchParams } from '../_lib/load';
import { countActiveProducts } from '../_lib/queries';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * Whether this request is the shop's own owner looking at it.
 *
 * The merchant-facing troubleshooting block ("Open your dashboard and go to
 * Products…", plus a *Manage products* button) is useful advice for exactly one
 * person, and internal noise on the public web for everybody else. Gating it on
 * "the shop is empty" published it to shoppers; gating it on identity does not.
 *
 * Any failure to read the cookie is treated as "not the owner". The cost of a
 * false negative is a merchant seeing the same polite line a shopper sees; the
 * cost of a false positive is admin instructions on a public URL, which is the
 * defect this exists to close.
 *
 * @param storeId - The store being rendered
 * @returns True only for an authenticated owner of this store
 */
async function isStoreOwner(storeId: string): Promise<boolean> {
  try {
    const token = (await cookies()).get('session')?.value;
    if (!token) return false;
    const session = await verifySession(token);
    return session?.storeId === storeId;
  } catch {
    return false;
  }
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
 * A shop with no products still renders its own home page. Most of what a
 * merchant composes — the hero, the value props, the image-with-text, the rich
 * text — needs no catalogue at all, and the product-bearing sections already
 * return `null` when they have nothing to show. Suppressing all seven and
 * replacing them with a single panel was how a freshly published store came out
 * as a black page reading "NO PRODUCTS YET · If it is yours, here is how to fill
 * it: Open your dashboard…" — internal instructions, addressed to the owner,
 * served to whoever the merchant had just been told to send the link to.
 *
 * So the empty case now splits by audience: the owner gets the troubleshooting
 * block, and everyone else gets one quiet line under the merchant's real
 * sections.
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

  // A preview token is already proof the viewer is authorised to see the draft,
  // so it counts as the merchant looking at their own shop.
  const isOwner = isPreview || (await isStoreOwner(store.id));

  // The default sections and `footer.showNewsletter` are both on out of the
  // box, which would stack two identical email forms at the bottom of the page.
  const hasNewsletterSection = sections.some(
    (section) => section.type === 'newsletter' && section.enabled,
  );

  return (
    <StorefrontShell {...result.data} suppressFooterNewsletter={hasNewsletterSection}>
      {productCount === 0 ? (
        <>
          {/* The merchant's own composition, exactly as they designed it. The
              sections that need products bow out by themselves. */}
          <SectionList sections={sections} ctx={{ store, theme, categories, isPreview }} />

          <StoreBand>
            <StoreContainer width="narrow">
              {isOwner ? (
                <EmptyCatalogue />
              ) : (
                <SectionHeading
                  align="center"
                  heading="Nothing for sale just yet"
                  subheading="This shop is still being set up. Check back soon."
                />
              )}
            </StoreContainer>
          </StoreBand>
        </>
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
