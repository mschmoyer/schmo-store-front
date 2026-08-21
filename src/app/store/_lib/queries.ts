import { db } from '@/lib/database/connection';
import { sellableStockExpression, sellableStockLateral } from '@/lib/inventory/sellable';

import type {
  CatalogueQuery,
  CategoryRecord,
  ProductQueryResult,
  ProductRecord,
  SortKey,
  StoreLookup,
  StoreRecord,
} from './types';
import { SORT_KEYS } from './types';
import { renderableImageUrl } from '@/lib/images/renderable';

/**
 * Server-side catalogue reads for the storefront.
 *
 * Store pages are server components, so they query Postgres directly rather
 * than fetching their own HTTP API — one less hop, no `headers()` gymnastics to
 * rebuild an absolute URL, and no risk of a public endpoint accidentally
 * becoming the only access-control boundary.
 *
 * This module must never reach a client bundle. The `server-only` package is
 * not a dependency here (and installing one is out of scope), so the guard is
 * the same runtime check the Stripe layer uses: loud and immediate rather than
 * silent. It is a function, not a module-level throw, because Jest runs these
 * helpers under jsdom where `window` exists.
 */

/**
 * Throw if catalogue queries are ever pulled into a browser bundle.
 * @param context - Short label naming the caller, used in the error message
 * @throws Error when a `window` object is present outside of tests
 */
function assertServerOnly(context: string): void {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      `${context} is server-only and must never be imported into client code. ` +
        'Call it from a route handler or a server component instead.',
    );
  }
}

/**
 * The one way this module talks to Postgres, so the server-only guard cannot be
 * forgotten when a new query is added.
 *
 * @param text - SQL with `$1`-style placeholders
 * @param params - Bound parameters. Never interpolate shopper input into `text`
 * @returns The driver's rows
 */
async function runQuery<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  assertServerOnly('The storefront catalogue layer');
  return db.query<T>(text, params);
}

/* ------------------------------------------------------------------ *
 * Coercion helpers
 * ------------------------------------------------------------------ */

/**
 * Coerce a Postgres `numeric` (which `pg` hands back as a string) to a number.
 * @param value - Raw column value
 * @returns A finite number, or null when the column was null or unparseable
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Coerce a Postgres `text[]` to a clean array of non-empty strings.
 * @param value - Raw column value
 * @returns An array, never null
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/* ------------------------------------------------------------------ *
 * Stores
 * ------------------------------------------------------------------ */

interface StoreRow extends Record<string, unknown> {
  id: string;
  store_name: string;
  store_slug: string;
  store_description: string | null;
  hero_title: string | null;
  hero_description: string | null;
  theme_name: string | null;
  logo_url: string | null;
  currency: string | null;
  is_active: boolean;
  is_public: boolean;
  meta_title: string | null;
  meta_description: string | null;
  hero_image_url?: string | null;
}

/**
 * Map a store row onto the renderer's view of a shop.
 * @param row - Raw `stores` row
 * @returns A typed store record
 */
function toStore(row: StoreRow): StoreRecord {
  return {
    id: row.id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    storeDescription: row.store_description,
    heroTitle: row.hero_title,
    heroDescription: row.hero_description,
    themeName: row.theme_name,
    logoUrl: row.logo_url,
    currency: row.currency || 'USD',
    isActive: row.is_active,
    isPublic: row.is_public,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    heroImageUrl: safeImagePath(row.hero_image_url),
  };
}

/**
 * Accept a store-configured image path only if it is same-origin.
 *
 * `store_config` is merchant input and this value lands in an `<img src>`, so an
 * absolute `http://` URL here would be both a mixed-content warning and a
 * third-party beacon on a shopper's page. Same rule as `settings.imageSrc`,
 * applied at the other end of the pipe.
 *
 * @param value - Raw config value
 * @returns A safe path, or null
 */
function safeImagePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

const STORE_COLUMNS = `s.id, s.store_name, s.store_slug, s.store_description, s.hero_title,
  s.hero_description, s.theme_name, s.logo_url, s.currency, s.is_active, s.is_public,
  s.meta_title, s.meta_description,
  (SELECT c.config_value
     FROM store_config c
    WHERE c.store_id = s.id AND c.config_key = 'hero_image_url' AND c.is_public = true
    LIMIT 1) AS hero_image_url`;

/**
 * Look up a store by slug, distinguishing "no such shop" from "not published".
 *
 * The distinction matters: a shopper who mistypes a URL and a merchant who has
 * not flipped their shop public deserve different pages, and returning a bare
 * 404 for both makes the second case impossible to debug.
 *
 * A caller holding a valid preview token may pass `allowUnpublished` to see a
 * shop that is private or inactive.
 *
 * @param slug - The `store_slug` from the route
 * @param options - `allowUnpublished` bypasses the public/active gate
 * @returns Either the store, or the reason it cannot be shown
 */
export async function getStoreBySlug(
  slug: string,
  options: { allowUnpublished?: boolean } = {},
): Promise<StoreLookup> {
  if (!slug || typeof slug !== 'string' || slug.length > 255) {
    return { ok: false, reason: 'not-found' };
  }

  const result = await runQuery<StoreRow>(
    `SELECT ${STORE_COLUMNS} FROM stores s WHERE s.store_slug = $1 LIMIT 1`,
    [slug],
  );

  const row = result.rows[0];
  if (!row) return { ok: false, reason: 'not-found' };

  const store = toStore(row);
  if (options.allowUnpublished) return { ok: true, store };

  if (!store.isActive) return { ok: false, reason: 'inactive' };
  if (!store.isPublic) return { ok: false, reason: 'private' };
  return { ok: true, store };
}

/**
 * List every published store. Backs the storefront directory at `/store`.
 * @returns Public, active stores, newest first
 */
export async function listPublicStores(): Promise<StoreRecord[]> {
  const result = await runQuery<StoreRow>(
    `SELECT ${STORE_COLUMNS}
       FROM stores s
      WHERE s.is_active = true AND s.is_public = true
      ORDER BY s.created_at DESC
      LIMIT 60`,
  );
  return result.rows.map(toStore);
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

interface ProductRow extends Record<string, unknown> {
  id: string;
  store_id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  description_html: string | null;
  base_price: string | number;
  sale_price: string | number | null;
  override_price: string | number | null;
  override_name: string | null;
  track_inventory: boolean | null;
  stock_quantity: number | null;
  vendor: string | null;
  barcode: string | null;
  low_stock_threshold: number | null;
  allow_backorder: boolean | null;
  weight: string | number | null;
  weight_unit: string | null;
  length: string | number | null;
  width: string | number | null;
  height: string | number | null;
  dimension_unit: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  tags: unknown;
  featured_image_url: string | null;
  gallery_images: unknown;
  is_featured: boolean | null;
  requires_shipping: boolean | null;
  meta_title: string | null;
  meta_description: string | null;
}

/**
 * Resolve what a shopper is charged, and what the was-price should be.
 *
 * Precedence is override -> sale -> base. A compare-at price is only reported
 * when it is genuinely higher than what we charge, so the storefront can never
 * render a fake "was" price that is the same as, or below, the real one.
 *
 * @param row - Raw product row
 * @returns The charged price and the optional compare-at price
 */
function resolvePricing(row: ProductRow): { price: number; compareAtPrice: number | null } {
  const base = toNumber(row.base_price) ?? 0;
  const sale = toNumber(row.sale_price);
  const override = toNumber(row.override_price);

  const price = override ?? sale ?? base;
  const compareAtPrice = base > price ? base : null;
  return { price, compareAtPrice };
}

/**
 * Map a product row onto the renderer's product shape.
 * @param row - Raw joined product row
 * @returns A typed product record
 */
function toProduct(row: ProductRow): ProductRecord {
  const { price, compareAtPrice } = resolvePricing(row);
  // Sanitise at the boundary: a hostile or unrenderable image URL in any of
  // these fields would otherwise reach `next/image` and 500 the whole page.
  const gallery = toStringArray(row.gallery_images)
    .map((entry) => renderableImageUrl(entry))
    .filter((entry): entry is string => entry !== null);
  const featured = renderableImageUrl(row.featured_image_url) || gallery[0] || null;

  return {
    id: row.id,
    storeId: row.store_id,
    sku: row.sku,
    name: row.override_name || row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    descriptionHtml: row.description_html,
    price,
    compareAtPrice,
    trackInventory: row.track_inventory !== false,
    stockQuantity: Number(row.stock_quantity ?? 0),
    vendor: row.vendor ?? null,
    barcode: row.barcode ?? null,
    lowStockThreshold: Number(row.low_stock_threshold ?? 0),
    allowBackorder: row.allow_backorder === true,
    weight: toNumber(row.weight),
    weightUnit: row.weight_unit || 'lb',
    length: toNumber(row.length),
    width: toNumber(row.width),
    height: toNumber(row.height),
    dimensionUnit: row.dimension_unit || 'in',
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: toStringArray(row.tags),
    featuredImageUrl: featured,
    galleryImages: gallery,
    isFeatured: row.is_featured === true,
    requiresShipping: row.requires_shipping !== false,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
  };
}

const PRODUCT_COLUMNS = `p.id, p.store_id, p.sku, p.name, p.slug, p.short_description,
  p.long_description, p.description_html, p.base_price, p.sale_price, p.override_price,
  p.override_name, p.track_inventory, p.low_stock_threshold,
  -- What a shopper can actually buy, not what is physically in the building.
  --
  -- This was p.stock_quantity, the sum of on_hand across every location, which subtracts neither
  -- the units committed to orders already placed nor the units held back as damaged or awaiting
  -- inspection, and counts stock sitting in a location the merchant has marked unfulfillable or
  -- closed. So migration 038 made quarantine real for the admin while the storefront went on
  -- selling the quarantined units: 157 on hand with 100 quarantined showed the admin 53 available
  -- and offered the customer 157.
  --
  -- COALESCE to stock_quantity covers a product with no levels rows at all, which is what an
  -- untracked product looks like.
  --
  -- The lateral behind this comes from src/lib/inventory/sellable.ts, shared with the cart and the
  -- checkout stock gate. It used to be spelled out here and differently there, and the two
  -- disagreed: this side subtracted quarantined units and that side did not, so the shop refused a
  -- sale the till would have allowed and the other way round.
  ${sellableStockExpression('p', 'lv')} AS stock_quantity,
  p.allow_backorder, p.weight, p.weight_unit, p.length, p.width, p.height,
  p.dimension_unit, p.category_id, c.name AS category_name, c.slug AS category_slug,
  p.tags, p.featured_image_url, p.gallery_images, p.is_featured, p.requires_shipping,
  -- Brand and a product identifier. Both are populated and neither reached the storefront, so the
  -- schema.org Product carried no brand and no gtin, without which a Product rich result is not
  -- eligible and a Merchant Center feed built from the page is rejected.
  p.vendor, p.barcode,
  p.meta_title, p.meta_description`;

const PRODUCT_FROM = `FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  ${sellableStockLateral('p', 'lv')}`;

/** `ORDER BY` fragments, keyed by sort id. Never interpolate user input here. */
const SORT_SQL: Record<SortKey, string> = {
  featured: 'p.is_featured DESC, p.created_at DESC',
  newest: 'p.created_at DESC',
  'price-asc': 'COALESCE(p.override_price, p.sale_price, p.base_price) ASC',
  'price-desc': 'COALESCE(p.override_price, p.sale_price, p.base_price) DESC',
  'name-asc': 'COALESCE(p.override_name, p.name) ASC',
};

/** Bounds on page size, so a crafted URL cannot ask for the whole catalogue. */
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 48;
export const DEFAULT_PAGE_SIZE = 12;

/**
 * Normalise raw search params into a safe, canonical catalogue query.
 *
 * Everything the listing page can be asked to do lives in the URL, so it is
 * shareable and the back button behaves. This function is the single place that
 * decides what an out-of-range or hostile parameter means.
 *
 * @param params - Raw `searchParams` from the route
 * @returns A clamped, canonical query
 */
export function parseCatalogueQuery(
  params: Record<string, string | string[] | undefined>,
): CatalogueQuery {
  const first = (key: string): string => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw.trim() : '';
  };

  const sortRaw = first('sort') as SortKey;
  const pageRaw = Number.parseInt(first('page'), 10);
  const sizeRaw = Number.parseInt(first('size'), 10);

  return {
    search: first('q').slice(0, 100),
    category: first('category').slice(0, 255),
    sort: SORT_KEYS.includes(sortRaw) ? sortRaw : 'featured',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 1000) : 1,
    pageSize: Number.isFinite(sizeRaw)
      ? Math.min(Math.max(sizeRaw, MIN_PAGE_SIZE), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Run a catalogue query: search, category filter, sort and pagination.
 *
 * Search matches name, SKU and short description. It is deliberately a simple
 * `ILIKE` rather than full-text: a shopper typing half a product name expects a
 * substring match, and `to_tsvector` would miss "keyboa".
 *
 * @param storeId - The store being browsed
 * @param query - A query already through {@link parseCatalogueQuery}
 * @returns The page of products plus pagination metadata
 */
export async function queryProducts(
  storeId: string,
  query: CatalogueQuery,
): Promise<ProductQueryResult> {
  const conditions = ['p.store_id = $1', 'p.is_active = true'];
  const params: unknown[] = [storeId];

  if (query.search) {
    params.push(`%${query.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const i = params.length;
    conditions.push(
      `(COALESCE(p.override_name, p.name) ILIKE $${i} OR p.sku ILIKE $${i} OR COALESCE(p.short_description, '') ILIKE $${i})`,
    );
  }

  if (query.category) {
    params.push(query.category);
    conditions.push(`c.slug = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await runQuery<{ total: string }>(
    `SELECT COUNT(*)::text AS total ${PRODUCT_FROM} ${where}`,
    params,
  );
  const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10) || 0;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const offset = (page - 1) * query.pageSize;

  const result = await runQuery<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} ${where}
      ORDER BY ${SORT_SQL[query.sort]}, p.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.pageSize, offset],
  );

  return {
    products: result.rows.map(toProduct),
    total,
    page,
    pageSize: query.pageSize,
    totalPages,
  };
}

/**
 * Fetch products for a home-page section.
 *
 * Hand-picked ids win over a collection, which wins over "whatever is featured",
 * which falls back to the newest products — so a freshly-seeded shop with
 * nothing marked featured still renders a full grid rather than an empty band.
 *
 * @param storeId - The store being rendered
 * @param options - Optional hand-picked ids, a category slug, and a limit
 * @returns Up to `limit` products
 */
export async function getSectionProducts(
  storeId: string,
  options: { productIds?: string[]; collection?: string; limit?: number } = {},
): Promise<ProductRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 24);
  const ids = (options.productIds ?? []).filter(
    (id) => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id),
  );

  if (ids.length > 0) {
    const result = await runQuery<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
        WHERE p.store_id = $1 AND p.is_active = true AND p.id = ANY($2::uuid[])
        LIMIT $3`,
      [storeId, ids, limit],
    );
    // Preserve the merchant's hand-picked order rather than the database's.
    const byId = new Map(result.rows.map((row) => [row.id, toProduct(row)]));
    return ids.map((id) => byId.get(id)).filter((p): p is ProductRecord => Boolean(p));
  }

  if (options.collection) {
    const result = await runQuery<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
        WHERE p.store_id = $1 AND p.is_active = true AND c.slug = $2
        ORDER BY p.is_featured DESC, p.created_at DESC
        LIMIT $3`,
      [storeId, options.collection, limit],
    );
    if (result.rows.length > 0) return result.rows.map(toProduct);
  }

  const result = await runQuery<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.is_featured DESC, p.created_at DESC
      LIMIT $2`,
    [storeId, limit],
  );
  return result.rows.map(toProduct);
}

/**
 * Fetch one product, by id or by slug.
 *
 * The route segment is called `productId` for historical reasons but merchants
 * link to slugs, so both are accepted: a UUID matches on id, anything else on
 * slug. That keeps every existing `/product/<uuid>` link alive.
 *
 * @param storeId - The store that must own the product
 * @param idOrSlug - A UUID or a product slug
 * @returns The product, or null
 */
export async function getProduct(
  storeId: string,
  idOrSlug: string,
): Promise<ProductRecord | null> {
  if (!idOrSlug || idOrSlug.length > 255) return null;

  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    idOrSlug,
  );

  const result = await runQuery<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
      WHERE p.store_id = $1 AND p.is_active = true
        AND ${isUuid ? 'p.id = $2::uuid' : 'p.slug = $2'}
      LIMIT 1`,
    [storeId, idOrSlug],
  );

  const row = result.rows[0];
  return row ? toProduct(row) : null;
}

/**
 * Products to show alongside a product being viewed.
 *
 * Same category first, then anything else from the shop, so the rail is never
 * short on a small catalogue.
 *
 * @param product - The product being viewed
 * @param limit - How many to return
 * @returns Related products, excluding the one being viewed
 */
export async function getRelatedProducts(
  product: ProductRecord,
  limit = 4,
): Promise<ProductRecord[]> {
  const result = await runQuery<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
      WHERE p.store_id = $1 AND p.is_active = true AND p.id <> $2::uuid
      ORDER BY (p.category_id IS NOT DISTINCT FROM $3::uuid) DESC,
               p.is_featured DESC,
               p.created_at DESC
      LIMIT $4`,
    [product.storeId, product.id, product.categoryId, Math.min(Math.max(limit, 1), 12)],
  );
  return result.rows.map(toProduct);
}

/**
 * Re-price a set of product ids straight from the database.
 *
 * This is what makes a localStorage cart safe: the browser's stored price is
 * only ever a hint, and the authoritative number comes from here on every load.
 *
 * @param storeId - The store the cart belongs to
 * @param productIds - Ids from the stored cart
 * @returns The matching live products
 */
export async function getProductsForCart(
  storeId: string,
  productIds: string[],
): Promise<ProductRecord[]> {
  const ids = productIds.filter(
    (id) => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id),
  );
  if (ids.length === 0) return [];

  const result = await runQuery<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM}
      WHERE p.store_id = $1 AND p.is_active = true AND p.id = ANY($2::uuid[])
      LIMIT 100`,
    [storeId, ids.slice(0, 100)],
  );
  return result.rows.map(toProduct);
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

interface CategoryRow extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  product_count: string;
  sample_image_url: string | null;
}

/**
 * List a store's categories with live product counts.
 *
 * Empty categories are excluded: a tile that leads to "no products" is worse
 * than no tile. The count comes from the same `is_active` filter the listing
 * page uses, so the number on the tile matches what the shopper then sees.
 *
 * @param storeId - The store being rendered
 * @param limit - Maximum tiles to return
 * @returns Non-empty categories in sort order
 */
export async function getCategories(storeId: string, limit = 12): Promise<CategoryRecord[]> {
  const result = await runQuery<CategoryRow>(
    `SELECT c.id, c.name, c.slug, c.description, c.image_url,
            COUNT(p.id)::text AS product_count,
            (ARRAY_REMOVE(ARRAY_AGG(p.featured_image_url ORDER BY p.is_featured DESC, p.created_at DESC), NULL))[1] AS sample_image_url
       FROM categories c
       JOIN products p ON p.category_id = c.id AND p.is_active = true
      WHERE c.store_id = $1 AND c.is_active = true
      GROUP BY c.id, c.name, c.slug, c.description, c.image_url, c.sort_order
     HAVING COUNT(p.id) > 0
      ORDER BY c.sort_order ASC, c.name ASC
      LIMIT $2`,
    [storeId, Math.min(Math.max(limit, 1), 24)],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: renderableImageUrl(row.image_url),
    productCount: Number.parseInt(row.product_count, 10) || 0,
    sampleImageUrl: renderableImageUrl(row.sample_image_url),
  }));
}

/* ------------------------------------------------------------------ *
 * Blog
 * ------------------------------------------------------------------ */

/** A published post, as the home page's blog band shows it. */
export interface BlogPostRecord {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImageUrl: string | null;
  publishedAt: Date | null;
}

interface BlogRow extends Record<string, unknown> {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  published_at: Date | null;
}

/**
 * Recent published posts for a store.
 *
 * Scheduled and draft posts are excluded, and a post whose `published_at` is in
 * the future is not published yet however its status column reads.
 *
 * @param storeId - The store being rendered
 * @param limit - How many posts to return
 * @returns Published posts, newest first
 */
export async function getBlogPosts(storeId: string, limit = 3): Promise<BlogPostRecord[]> {
  const result = await runQuery<BlogRow>(
    `SELECT id, title, slug, excerpt, featured_image_url, published_at
       FROM blog_posts
      WHERE store_id = $1
        AND status = 'published'
        AND (published_at IS NULL OR published_at <= NOW())
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [storeId, Math.min(Math.max(limit, 1), 9)],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    featuredImageUrl: renderableImageUrl(row.featured_image_url),
    publishedAt: row.published_at,
  }));
}

/**
 * Count a store's purchasable products.
 * Used to decide between the catalogue and the "your shop is empty" state.
 * @param storeId - The store being rendered
 * @returns The number of active products
 */
export async function countActiveProducts(storeId: string): Promise<number> {
  const result = await runQuery<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM products WHERE store_id = $1 AND is_active = true`,
    [storeId],
  );
  return Number.parseInt(result.rows[0]?.total ?? '0', 10) || 0;
}
