import type { CatalogueQuery, ProductRecord, StockState } from './types';

/**
 * Pure presentation helpers shared by server and client storefront components.
 *
 * Everything here must be isomorphic: the same input produces the same output
 * on the server and in the browser, so nothing hydrates differently. That rules
 * out `Date.now()`, `Math.random()` and unpinned `Intl` locales.
 */

/* ------------------------------------------------------------------ *
 * Stock
 * ------------------------------------------------------------------ */

/**
 * Classify a product's availability.
 *
 * Returned as a discrete state rather than a color, because the storefront
 * shows stock as a dot **and** a word — color alone fails the accessibility
 * floor in `docs/design-system.md` section 7.
 *
 * @param product - The product to classify
 * @returns Its stock state
 */
export function stockState(product: {
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  allowBackorder: boolean;
}): StockState {
  if (!product.trackInventory) return 'untracked';
  if (product.stockQuantity > 0) {
    const threshold = product.lowStockThreshold > 0 ? product.lowStockThreshold : 5;
    return product.stockQuantity <= threshold ? 'low-stock' : 'in-stock';
  }
  return product.allowBackorder ? 'backorder' : 'out-of-stock';
}

/**
 * Human wording for a stock state.
 * @param state - A stock state
 * @param quantity - Units on hand, used to make "low stock" concrete
 * @returns A short label a shopper can act on
 */
export function stockLabel(state: StockState, quantity = 0): string {
  switch (state) {
    case 'in-stock':
      return 'In stock';
    case 'low-stock':
      return quantity === 1 ? 'Only 1 left' : `Only ${quantity} left`;
    case 'backorder':
      return 'On backorder';
    case 'out-of-stock':
      return 'Out of stock';
    case 'untracked':
    default:
      return 'Available';
  }
}

/**
 * Whether a product can be added to a cart at all.
 * @param product - The product to test
 * @returns True when the shopper may buy it
 */
export function isPurchasable(product: ProductRecord): boolean {
  const state = stockState(product);
  return state !== 'out-of-stock';
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * Format an amount in the store's currency.
 *
 * The locale is pinned to `en-US` on purpose: an unpinned locale formats
 * differently on the server and in the browser and produces a hydration
 * mismatch on the very first paint of every price on the page.
 *
 * @param value - Amount in major units
 * @param currency - ISO 4217 code
 * @returns A formatted currency string
 */
export function formatMoney(value: number, currency = 'USD'): string {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An invalid currency code from the database must not throw mid-render.
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Percentage saved against a compare-at price.
 * @param price - What we charge
 * @param compareAt - The was-price
 * @returns A whole-number percentage, or null when there is no genuine saving
 */
export function savingsPercent(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price || price < 0) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/* ------------------------------------------------------------------ *
 * Shipping facts
 * ------------------------------------------------------------------ */

/**
 * Format a product's shipping weight.
 * @param product - Product carrying `weight` and `weightUnit`
 * @returns A display string, or null when the merchant has not recorded one
 */
export function formatWeight(product: Pick<ProductRecord, 'weight' | 'weightUnit'>): string | null {
  if (product.weight === null || product.weight <= 0) return null;
  const trimmed = Number.parseFloat(product.weight.toFixed(2));
  return `${trimmed} ${product.weightUnit}`;
}

/**
 * Format a product's boxed dimensions.
 * @param product - Product carrying length/width/height and a unit
 * @returns A `L × W × H unit` string, or null when any dimension is missing
 */
export function formatDimensions(
  product: Pick<ProductRecord, 'length' | 'width' | 'height' | 'dimensionUnit'>,
): string | null {
  const { length, width, height, dimensionUnit } = product;
  if (!length || !width || !height) return null;
  const n = (value: number): string => String(Number.parseFloat(value.toFixed(2)));
  return `${n(length)} × ${n(width)} × ${n(height)} ${dimensionUnit}`;
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

/**
 * Build a catalogue URL from a query, omitting anything at its default.
 *
 * Keeping defaults out of the query string is what makes the listing page's
 * URLs shareable and the back button predictable: one state, one URL.
 *
 * @param basePath - The listing route, e.g. `/store/acme/products`
 * @param query - The full query state
 * @param overrides - Fields to change for this particular link
 * @returns A path with a canonical query string
 */
export function catalogueHref(
  basePath: string,
  query: CatalogueQuery,
  overrides: Partial<CatalogueQuery> = {},
): string {
  const next = { ...query, ...overrides };

  // Any change other than paging returns the shopper to page one; staying on
  // page 7 while switching category is how listings show empty results.
  const changedFilter =
    overrides.search !== undefined ||
    overrides.category !== undefined ||
    overrides.sort !== undefined;
  if (changedFilter && overrides.page === undefined) next.page = 1;

  const params = new URLSearchParams();
  if (next.search) params.set('q', next.search);
  if (next.category) params.set('category', next.category);
  if (next.sort && next.sort !== 'featured') params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * The canonical link to a product detail page.
 * @param storeSlug - The store's slug
 * @param product - The product being linked
 * @returns A store-relative product URL
 */
export function productHref(
  storeSlug: string,
  product: Pick<ProductRecord, 'id' | 'slug'>,
): string {
  return `/store/${storeSlug}/product/${product.slug || product.id}`;
}

/**
 * Resolve a merchant-authored link so it can never escape to another origin.
 *
 * Section settings are merchant input. An absolute `http://evil.example` in a
 * hero button would turn a storefront into a redirector, so anything that is
 * not a simple in-store path is rewritten relative to the shop.
 *
 * @param storeSlug - The store's slug
 * @param href - The merchant-supplied link
 * @returns A safe, store-relative URL
 */
export function resolveStoreHref(storeSlug: string, href: unknown): string {
  const base = `/store/${storeSlug}`;
  if (typeof href !== 'string' || href.trim() === '') return `${base}/products`;

  const raw = href.trim();
  // Reject anything with a scheme, a protocol-relative prefix, or a backslash.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith('//') || raw.includes('\\')) {
    return `${base}/products`;
  }
  if (raw.startsWith('#')) return raw;
  if (raw.startsWith(`${base}/`) || raw === base) return raw;
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw}`;
}
