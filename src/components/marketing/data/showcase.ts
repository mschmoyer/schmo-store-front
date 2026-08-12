import { query } from '@/lib/database/connection';
import { DEMO_STORE_SLUGS } from './routes';

/**
 * Reads the three seeded demo storefronts straight out of Postgres so that the
 * marketing site never invents a product. Anything shown in the hero, the
 * storefront showcase or on /demo-stores is a row a visitor can go and click.
 *
 * If the database is unreachable the loaders return an empty list rather than
 * throwing — the marketing pages degrade to their copy, which is the correct
 * failure mode for a page whose job is to be readable.
 */

/** A product as the marketing site needs it. */
export interface ShowcaseProduct {
  sku: string;
  name: string;
  slug: string;
  /** Live price in dollars — the sale price when one is set. */
  price: number;
  /** Was-price in dollars, or null when the product is not on sale. */
  compareAt: number | null;
  /** On-hand quantity, exactly as the storefront reports it. */
  stock: number;
  /** Path to the product art under `public/`, or null. */
  image: string | null;
  blurb: string | null;
  featured: boolean;
}

/** A demo storefront as the marketing site needs it. */
export interface ShowcaseStore {
  slug: string;
  name: string;
  description: string;
  heroTitle: string;
  heroDescription: string;
  theme: string;
  /** Store logo mark under `public/`, or null. */
  logo: string | null;
  /** Generated hero artwork for the store, under `public/`. */
  hero: string;
  products: ShowcaseProduct[];
  /** Count of active products in the store. */
  productCount: number;
  /** Count of products currently showing zero on hand. */
  outOfStockCount: number;
}

interface StoreRow extends Record<string, unknown> {
  store_slug: string;
  store_name: string;
  store_description: string | null;
  hero_title: string | null;
  hero_description: string | null;
  theme_name: string | null;
  logo_url: string | null;
}

interface ProductRow extends Record<string, unknown> {
  store_slug: string;
  sku: string;
  name: string;
  slug: string;
  base_price: string;
  sale_price: string | null;
  stock_quantity: number | null;
  featured_image_url: string | null;
  short_description: string | null;
  is_featured: boolean | null;
}

/**
 * Turns a Postgres `numeric` (which the driver hands back as a string) into a
 * number without losing cents.
 *
 * @param value - The raw column value.
 * @returns The amount in dollars, or null when the column was null.
 */
function toAmount(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Loads the seeded demo storefronts and their catalogs.
 *
 * @returns The stores in the order given by `DEMO_STORE_SLUGS`, or `[]` when
 * the database cannot be reached.
 */
export async function loadShowcaseStores(): Promise<ShowcaseStore[]> {
  const slugs = [...DEMO_STORE_SLUGS];

  try {
    const [storeResult, productResult] = await Promise.all([
      query<StoreRow>(
        `select store_slug, store_name, store_description, hero_title,
                hero_description, theme_name, logo_url
           from stores
          where store_slug = any($1::text[]) and is_active = true`,
        [slugs]
      ),
      query<ProductRow>(
        `select s.store_slug, p.sku, p.name, p.slug, p.base_price, p.sale_price,
                p.stock_quantity, p.featured_image_url, p.short_description, p.is_featured
           from products p
           join stores s on s.id = p.store_id
          where s.store_slug = any($1::text[]) and p.is_active = true
          order by p.is_featured desc, p.sku asc`,
        [slugs]
      ),
    ]);

    const byStore = new Map<string, ShowcaseProduct[]>();
    for (const row of productResult.rows) {
      const base = toAmount(row.base_price) ?? 0;
      const sale = toAmount(row.sale_price);
      const onSale = sale !== null && sale < base;
      const list = byStore.get(row.store_slug) ?? [];
      list.push({
        sku: row.sku,
        name: row.name,
        slug: row.slug,
        price: onSale ? (sale as number) : base,
        compareAt: onSale ? base : null,
        stock: row.stock_quantity ?? 0,
        image: row.featured_image_url,
        blurb: row.short_description,
        featured: Boolean(row.is_featured),
      });
      byStore.set(row.store_slug, list);
    }

    const stores = storeResult.rows.map((row): ShowcaseStore => {
      const products = byStore.get(row.store_slug) ?? [];
      return {
        slug: row.store_slug,
        name: row.store_name,
        description: row.store_description ?? '',
        heroTitle: row.hero_title ?? row.store_name,
        heroDescription: row.hero_description ?? '',
        theme: row.theme_name ?? 'default',
        logo: row.logo_url,
        hero: `/demo/hero/${row.store_slug}.svg`,
        products,
        productCount: products.length,
        outOfStockCount: products.filter((p) => p.stock === 0).length,
      };
    });

    return slugs
      .map((slug) => stores.find((s) => s.slug === slug))
      .filter((s): s is ShowcaseStore => Boolean(s));
  } catch {
    // A marketing page must still render when the database is asleep.
    return [];
  }
}

/**
 * Picks the products used for the storefront showcase grid, interleaving the
 * three stores so the band reads as a catalog rather than one vertical.
 *
 * @param stores - Loaded showcase stores.
 * @param limit - Maximum number of products to return.
 * @returns Products paired with the store they belong to.
 */
export function interleaveProducts(
  stores: ShowcaseStore[],
  limit: number
): Array<{ product: ShowcaseProduct; store: ShowcaseStore }> {
  const out: Array<{ product: ShowcaseProduct; store: ShowcaseStore }> = [];
  const depth = Math.max(0, ...stores.map((s) => s.products.length));

  for (let i = 0; i < depth && out.length < limit; i += 1) {
    for (const store of stores) {
      const product = store.products[i];
      if (product && out.length < limit) out.push({ product, store });
    }
  }

  return out;
}

/**
 * Chooses the single product the hero transforms from a ShipStation row into a
 * storefront card. Prefers a well-stocked, on-sale, illustrated product so both
 * panels have something real to show.
 *
 * @param stores - Loaded showcase stores.
 * @returns The chosen product and its store, or null when nothing is loaded.
 */
export function pickHeroProduct(
  stores: ShowcaseStore[]
): { product: ShowcaseProduct; store: ShowcaseStore } | null {
  for (const store of stores) {
    const match = store.products.find((p) => p.image && p.stock > 0 && p.compareAt !== null);
    if (match) return { product: match, store };
  }
  for (const store of stores) {
    const match = store.products.find((p) => p.image);
    if (match) return { product: match, store };
  }
  return null;
}
