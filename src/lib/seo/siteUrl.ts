/**
 * The site's own origin, and how to build an absolute URL from a path.
 *
 * One definition, because getting this wrong is invisible locally and expensive in production. The
 * marketing metadata had its own copy of the `NEXT_PUBLIC_APP_URL` fallback and the storefront had
 * none at all — which is why the storefront's structured data shipped relative URLs that no
 * crawler can resolve.
 */

/** The deployment's origin, with no trailing slash. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://rebelshops.com';

/**
 * Make a site-relative path absolute.
 *
 * Structured data and `og:url` must carry absolute URLs — a relative one in JSON-LD is not
 * resolvable by the consumer, so the offer, the breadcrumb and the image are silently discarded.
 * `ProductSchema` was rendered with no base at all, so its own `absolute()` helper was a no-op and
 * every product shipped `"url": "/store/…"`.
 *
 * @param path - A path beginning with `/`, or an already-absolute URL.
 * @returns The absolute URL.
 */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * The canonical URL for a storefront page.
 *
 * @param storeSlug - The store's slug.
 * @param path - The path within the store, such as `/product/aviator-headphones`.
 * @returns The absolute canonical URL.
 */
export function storefrontUrl(storeSlug: string, path = ''): string {
  return absoluteUrl(`/store/${storeSlug}${path}`);
}
