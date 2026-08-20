/**
 * Shared shapes for the shopper-facing storefront.
 *
 * These are the *renderer's* view of the data — deliberately narrower than the
 * admin's product model. Anything a shopper must not see (cost price, supplier,
 * internal overrides) never makes it into these types, which keeps it from
 * leaking into a server-rendered payload by accident.
 */

/** A merchant's shop, as a shopper sees it. */
export interface StoreRecord {
  id: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string | null;
  heroTitle: string | null;
  heroDescription: string | null;
  /**
   * The shop's own hero art, from `store_config.hero_image_url`.
   *
   * Sections carry their own `image` setting, but a merchant sets their hero
   * photograph once in store settings and expects it to appear — and every
   * preset ships with a blank hero image so that it can. Same-origin paths
   * only; see `safeImagePath` in `queries.ts`.
   */
  heroImageUrl: string | null;
  /** Legacy `stores.theme_name`, mapped onto a preset when no theme row exists. */
  themeName: string | null;
  logoUrl: string | null;
  currency: string;
  isActive: boolean;
  isPublic: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Why a storefront could not be rendered. Drives which designed state we show. */
export type StoreUnavailableReason = 'not-found' | 'private' | 'inactive';

/** The result of looking up a store: either it renders, or we know why not. */
export type StoreLookup =
  | { ok: true; store: StoreRecord }
  | { ok: false; reason: StoreUnavailableReason };

/** A product tile / detail row. Prices are already resolved to what we charge. */
export interface ProductRecord {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  longDescription: string | null;
  descriptionHtml: string | null;
  /** What the shopper actually pays. */
  price: number;
  /** The struck-through was-price, or null when the item is not discounted. */
  compareAtPrice: number | null;
  trackInventory: boolean;
  stockQuantity: number;
  /** Brand, for `schema.org` and Merchant Center. */
  vendor: string | null;
  /** GTIN/EAN/UPC, the product identifier a shopping feed needs. */
  barcode: string | null;
  lowStockThreshold: number;
  allowBackorder: boolean;
  weight: number | null;
  weightUnit: string;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensionUnit: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  galleryImages: string[];
  isFeatured: boolean;
  requiresShipping: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** A category, with the number of purchasable products in it. */
export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
  /** A representative product image, used when the category has no art of its own. */
  sampleImageUrl: string | null;
}

/** Stock state as a discrete, non-color-dependent status. */
export type StockState = 'in-stock' | 'low-stock' | 'out-of-stock' | 'backorder' | 'untracked';

/** A page of catalogue results plus everything the UI needs to draw controls. */
export interface ProductQueryResult {
  products: ProductRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Normalised, URL-driven catalogue query. Every field round-trips to the query string. */
export interface CatalogueQuery {
  search: string;
  category: string;
  sort: SortKey;
  page: number;
  pageSize: number;
}

export const SORT_KEYS = [
  'featured',
  'newest',
  'price-asc',
  'price-desc',
  'name-asc',
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'name-asc': 'Name: A to Z',
};
