import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/siteUrl';

/**
 * `robots.txt`.
 *
 * There was none — `GET /robots.txt` returned 404, while `BlogSEO` emitted a
 * `<link rel="sitemap">` pointing at a `/sitemap.xml` that also 404'd. So the platform announced a
 * sitemap it did not have and gave crawlers no guidance at all.
 *
 * The disallows are the paths that are either private or infinite. `/admin` and `/api` are the
 * former. Storefront listings with a `sort` or `page` parameter are the latter: the same products
 * in a different order is not a different page, and letting a crawler enumerate every permutation
 * spends a small store's crawl budget on duplicates of itself.
 *
 * @returns The robots rules and the sitemap location.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/create-store', '/dev/', '/*?sort=', '/*?page=']
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
