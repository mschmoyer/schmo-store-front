import type { Metadata } from 'next';

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
 * with its own `searchParams`. This layout keeps only what genuinely belongs to
 * the whole subtree: metadata.
 *
 * @param props.children - The page being rendered
 * @returns The children, untouched
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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

  return {
    title: { default: title, template: `%s · ${store.storeName}` },
    description,
    openGraph: { title, description, type: 'website', siteName: store.storeName },
  };
}
