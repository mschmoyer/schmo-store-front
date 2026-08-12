/**
 * Pure shapes and selectors for the marketing showcase.
 *
 * Deliberately free of any database import so it can be unit tested (and
 * imported by client components) without dragging the Postgres driver in.
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
