import type { Metadata } from 'next';
import { storefrontUrl } from '@/lib/seo/siteUrl';
import { notFound } from 'next/navigation';

import { StorefrontClickTracker } from '@/components/store/StorefrontClickTracker';
import { isMerchantSelfView } from '@/lib/analytics/storefront-clicks';

import { getStoreBySlug } from '../_lib/queries';

/**
 * The store route group's layout.
 *
 * Deliberately thin. The themed shell — tokens, header, footer, cart provider —
 * is **not** here, because a Next.js layout never receives `searchParams` and
 * the preview protocol (spec section 10) needs `?preview=<token>` to decide
 * between the published theme and the draft. A layout-level shell would either
 * be unable to preview drafts at all, or would render published chrome around
 * a draft page.
 *
 * So the shell is a server component (`StorefrontShell`) that each page renders
 * with its own `searchParams`. This layout keeps the two things that genuinely
 * belong to the whole subtree: metadata, and the existence check.
 *
 * The existence check has to be *here* rather than in the page. `loading.tsx`
 * puts a Suspense boundary around the page, so by the time a page calls
 * `notFound()` the response has already begun streaming and the status line has
 * gone out as `200` — a soft 404, which tells search engines a dead shop URL is
 * a real page. The layout renders above that boundary, so throwing here
 * produces a genuine `404`.
 *
 * Only *existence* is checked here. Whether an existing shop may be shown
 * depends on the preview token, which a layout cannot read.
 *
 * It also mounts the buyer-click tracker, and this is the one place it can go: the layout is the
 * only node that wraps every storefront page (home, products, product detail, cart, checkout,
 * account) exactly once, so `storefront_view` is recorded once per page here instead of six times
 * in six pages that would each drift. The tracker is a client leaf that renders nothing — see
 * `components/store/StorefrontClickTracker.tsx` — so nothing above it stops being server-rendered.
 *
 * @param props.children - The page being rendered
 * @param props.params - The route's store slug
 * @returns The children, plus the tracking leaf
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const lookup = await getStoreBySlug(storeSlug, { allowUnpublished: true });
  if (!lookup.ok) notFound();

  const ownerViewing = await isMerchantSelfView(lookup.store.id);

  return (
    <>
      <StorefrontClickTracker
        storeId={lookup.store.id}
        enabled={!ownerViewing}
        trackCartAdds
      />
      {children}
    </>
  );
}

/**
 * Per-store metadata for every page under this store.
 *
 * A merchant's shop is titled with their name and described in their words. An
 * unpublished or missing shop is marked `noindex` so a private storefront never
 * turns up in search results.
 *
 * @param props.params - The route's store slug
 * @returns Metadata inherited by every page in the store
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  const lookup = await getStoreBySlug(storeSlug);

  if (!lookup.ok) {
    return { title: 'Shop unavailable', robots: { index: false, follow: false } };
  }

  const { store } = lookup;
  const title = store.metaTitle || store.storeName;
  const description =
    store.metaDescription || store.storeDescription || `Shop ${store.storeName}.`;

  const canonical = storefrontUrl(storeSlug);

  return {
    title: { default: title, template: `%s · ${store.storeName}` },
    description,
    /*
     * The canonical has to be set here, and on every page beneath, because the root layout spreads
     * `generateLandingPageMeta()` — which sets `alternates.canonical` to the platform's marketing
     * homepage — and Next inherits `alternates` down the route tree. Nothing overrode it, so every
     * merchant's every product and collection page told Google it was a duplicate of
     * rebelshops.com. That is the strongest de-indexing signal a page can send about itself, on a
     * platform whose merchants are found through organic search.
     */
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: store.storeName,
      url: canonical,
    },
  };
}
