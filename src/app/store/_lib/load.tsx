import { notFound } from 'next/navigation';

import { StoreUnavailable } from '@/components/store/states/StoreUnavailable';
import type { ResolvedTheme, Section, StoreNavigation } from '@/lib/storefront-theme';

import { getPublishedPages } from '@/lib/storefront-theme/pages.db';

import { getCategories, getStoreBySlug } from './queries';
import { getStorefrontTheme, readPreviewToken } from './theme';
import type { CategoryRecord, StoreRecord } from './types';

/** Everything a storefront page needs before it can render anything. */
export interface StorefrontData {
  store: StoreRecord;
  theme: ResolvedTheme;
  sections: Section[];
  /** Header and footer menus. Absent menus are derived from `categories`. */
  navigation: StoreNavigation;
  /**
   * Published custom pages, for the footer's Information column.
   *
   * Loaded here rather than per page so every storefront route links them:
   * a returns policy nobody can reach from the footer is one Stripe cannot
   * find either.
   */
  pages: { slug: string; title: string }[];
  categories: CategoryRecord[];
  isPreview: boolean;
}

export type LoadResult =
  | { ok: true; data: StorefrontData }
  | { ok: false; fallback: React.ReactNode };

/** The resolved `searchParams` shape Next hands a page. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Load a storefront for one request.
 *
 * Every page in the store calls this first. It resolves the shop, decides
 * whether the request may see the draft theme, and loads the theme, sections
 * and categories in parallel — all on the server, so the page can render the
 * merchant's palette into its first byte.
 *
 * A shop that cannot be shown returns a `fallback` node rather than throwing:
 * "not found" becomes a real 404 through `notFound()`, while "private" and
 * "inactive" get their own designed pages, because a merchant debugging why
 * their shop is blank deserves to be told rather than shown a 404.
 *
 * @param storeSlug - The route's store slug
 * @param searchParams - The page's resolved search params, for `?preview=`
 * @returns Either the loaded storefront, or the page to render instead
 */
export async function loadStorefront(
  storeSlug: string,
  searchParams?: SearchParams,
): Promise<LoadResult> {
  const previewToken = readPreviewToken(searchParams);

  // A preview token is proof of authorisation, so it may also reveal a shop
  // that is not published yet — that is the whole point of previewing one.
  const lookup = await getStoreBySlug(storeSlug, {
    allowUnpublished: Boolean(previewToken),
  });

  if (!lookup.ok) {
    if (lookup.reason === 'not-found') notFound();
    return {
      ok: false,
      fallback: <StoreUnavailable reason={lookup.reason} slug={storeSlug} />,
    };
  }

  const { store } = lookup;
  const [themeResult, categories, publishedPages] = await Promise.all([
    getStorefrontTheme(store, previewToken),
    getCategories(store.id),
    // Never fatal: a shop with an unreadable pages table is a shop with no
    // custom pages, not a broken one.
    getPublishedPages(store.id).catch((error) => {
      console.error('[storefront] page lookup failed', error);
      return [];
    }),
  ]);

  // A token that does not verify against *this* store must not reveal an
  // unpublished shop either.
  if (!themeResult.isPreview && (!store.isActive || !store.isPublic)) {
    return {
      ok: false,
      fallback: (
        <StoreUnavailable reason={store.isActive ? 'private' : 'inactive'} slug={storeSlug} />
      ),
    };
  }

  return {
    ok: true,
    data: {
      store,
      theme: themeResult.theme,
      navigation: themeResult.navigation,
      pages: publishedPages.map((page) => ({ slug: page.slug, title: page.title })),
      sections: themeResult.sections,
      categories,
      isPreview: themeResult.isPreview,
    },
  };
}
