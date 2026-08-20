import type { MetadataRoute } from 'next';
import { db } from '@/lib/database/connection';
import { SITE_URL } from '@/lib/seo/siteUrl';

/**
 * The sitemap.
 *
 * There was none. Every product page on every storefront was reachable only by a crawler that
 * happened to find a link to it, on a platform whose merchants are found through organic search —
 * and `BlogSEO` was already advertising a `/sitemap.xml` that returned 404.
 *
 * Products carry `lastModified`, which is what tells a crawler to come back for a price change
 * rather than re-reading the whole catalogue.
 */

/** Re-generated hourly. A catalogue does not change faster than that in a way a crawler cares. */
export const revalidate = 3600;

/**
 * Every publicly reachable URL: the marketing pages, each live storefront, and each published
 * product.
 *
 * Degrades to the marketing pages if the database is unreachable — a sitemap that 500s is worse
 * than a short one, because a crawler treats the error as a signal about the site.
 *
 * @returns The sitemap entries.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketing: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 }
  ];

  try {
    const stores = await db.query<{ store_slug: string; updated_at: Date }>(
      `SELECT store_slug, updated_at FROM stores
        WHERE is_active = true AND is_public = true AND store_slug IS NOT NULL
        ORDER BY store_slug
        LIMIT 5000`
    );

    /*
     * Only products a shopper can actually reach: active, and not archived. Listing a draft would
     * hand a crawler a 404 and teach it that this site's sitemap cannot be trusted.
     */
    const products = await db.query<{
      store_slug: string;
      slug: string;
      updated_at: Date;
    }>(
      `SELECT s.store_slug, p.slug, p.updated_at
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE p.is_active = true
          AND p.status = 'active'
          AND p.slug IS NOT NULL
          AND s.is_active = true
          AND s.is_public = true
        ORDER BY s.store_slug, p.slug
        LIMIT 45000`
    );

    return [
      ...marketing,
      ...stores.rows.map((store) => ({
        url: `${SITE_URL}/store/${store.store_slug}`,
        lastModified: store.updated_at,
        changeFrequency: 'daily' as const,
        priority: 0.9
      })),
      ...stores.rows.map((store) => ({
        url: `${SITE_URL}/store/${store.store_slug}/products`,
        lastModified: store.updated_at,
        changeFrequency: 'daily' as const,
        priority: 0.8
      })),
      ...products.rows.map((product) => ({
        url: `${SITE_URL}/store/${product.store_slug}/product/${product.slug}`,
        lastModified: product.updated_at,
        changeFrequency: 'weekly' as const,
        priority: 0.7
      }))
    ];
  } catch (error) {
    console.error('[sitemap] falling back to marketing pages only', error);
    return marketing;
  }
}
