/**
 * Catalog list query building: sorting, filtering and search.
 *
 * This module exists because `ORDER BY ${sortBy}` in the list route was a live SQL injection.
 * `sort_by` arrived from the query string, was *cast* to a union type — which erases at runtime and
 * checks nothing — and was interpolated straight into the statement. A request for
 * `?sort_by=(SELECT CAST((SELECT email FROM users LIMIT 1) AS INT))` returned the first user's
 * email address inside the Postgres error, and the route echoed `error.message` to the caller. Any
 * signed-in merchant could read every other tenant's rows a character at a time. In a multi-tenant
 * platform that is the worst possible defect, so the fix is structural rather than a patch: a
 * sort key is a *lookup* into a frozen map of SQL fragments, never a string that reaches SQL.
 *
 * Everything else here is a filter predicate, all parameterised. The one rule for adding to this
 * file: no caller-supplied value may ever be concatenated into the returned SQL. Values go in the
 * params array; only fragments this module itself authored go in the string.
 */

/** A sort key the catalogue list accepts, mapped to the SQL that orders by it. */
export const PRODUCT_SORT_SQL = {
  name: 'p.name',
  sku: 'p.sku',
  /* Sorting by "price" means the price a shopper pays, which is the sale price when one is set. */
  price: 'COALESCE(p.sale_price, p.base_price)',
  cost: 'p.cost_price',
  stock: 'p.stock_quantity',
  /* Inventory value at cost — what the shelf is worth, the number a CFO asks for. */
  inventory_value: 'p.stock_quantity * COALESCE(p.cost_price, 0)',
  created_at: 'p.created_at',
  updated_at: 'p.updated_at',
  published_at: 'p.published_at',
  /* Revenue and units come from the lateral join in the list query. */
  revenue: 's.total_revenue',
  units_sold: 's.total_sales',
  last_sale: 's.last_sale_date',
  /* Margin percent. NULLIF keeps a zero price from dividing by zero. */
  margin: `(COALESCE(p.sale_price, p.base_price) - COALESCE(p.cost_price, 0))
           / NULLIF(COALESCE(p.sale_price, p.base_price), 0)`,
  completeness: 'p.completeness_score'
} as const;

export type ProductSortKey = keyof typeof PRODUCT_SORT_SQL;

const SORT_KEYS = Object.keys(PRODUCT_SORT_SQL) as ProductSortKey[];

/**
 * Resolve a caller-supplied sort key to a known one.
 *
 * @param value - Raw `sort_by` from the query string, or null.
 * @param fallback - The key to use when `value` is absent or unrecognised.
 * @returns A key that is guaranteed to be present in {@link PRODUCT_SORT_SQL}.
 */
export function resolveSortKey(
  value: string | null | undefined,
  fallback: ProductSortKey = 'updated_at'
): ProductSortKey {
  return SORT_KEYS.includes(value as ProductSortKey) ? (value as ProductSortKey) : fallback;
}

/**
 * Resolve a caller-supplied sort direction.
 *
 * @param value - Raw `sort_order` from the query string, or null.
 * @param fallback - Direction to use when `value` is absent or unrecognised.
 * @returns Literally `'ASC'` or `'DESC'` — never caller text.
 */
export function resolveSortDirection(
  value: string | null | undefined,
  fallback: 'ASC' | 'DESC' = 'DESC'
): 'ASC' | 'DESC' {
  const upper = String(value ?? '').toUpperCase();
  return upper === 'ASC' ? 'ASC' : upper === 'DESC' ? 'DESC' : fallback;
}

/**
 * Build the `ORDER BY` clause for the catalogue list.
 *
 * A stable tiebreaker on `p.id` is appended because keyset-free pagination over a non-unique sort
 * column (every product sharing a price, say) otherwise lets Postgres return the same row on two
 * pages and skip another — the classic "row 21 is missing" pagination bug.
 *
 * @param key - A key already narrowed by {@link resolveSortKey}.
 * @param direction - A direction already narrowed by {@link resolveSortDirection}.
 * @returns SQL beginning with `ORDER BY`, containing no caller-supplied text.
 */
export function buildOrderBy(key: ProductSortKey, direction: 'ASC' | 'DESC'): string {
  /* NULLS LAST on descending sorts keeps un-costed or never-sold products from crowding the top,
   * which is what a merchant sorting by "best selling" means by "top". */
  const nulls = direction === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
  return `ORDER BY ${PRODUCT_SORT_SQL[key]} ${direction} ${nulls}, p.id ASC`;
}

/** Stock states the list can filter to. Derived, not stored — see {@link STOCK_STATUS_SQL}. */
export const STOCK_STATUS_SQL = {
  not_tracked: 'p.track_inventory = false',
  out_of_stock: 'p.track_inventory = true AND p.stock_quantity <= 0',
  low_stock:
    'p.track_inventory = true AND p.stock_quantity > 0 ' +
    'AND p.stock_quantity <= COALESCE(p.low_stock_threshold, 0)',
  in_stock:
    'p.track_inventory = true AND p.stock_quantity > COALESCE(p.low_stock_threshold, 0)'
} as const;

export type StockStatus = keyof typeof STOCK_STATUS_SQL;

const STOCK_STATUSES = Object.keys(STOCK_STATUS_SQL) as StockStatus[];

/**
 * Narrow a caller-supplied stock status to a known one.
 *
 * @param value - Raw `stock_status` from the query string.
 * @returns The matching status, or undefined when absent or unrecognised.
 */
export function resolveStockStatus(value: string | null | undefined): StockStatus | undefined {
  return STOCK_STATUSES.includes(value as StockStatus) ? (value as StockStatus) : undefined;
}

/** The catalogue-hygiene problems the list can filter to, as SQL predicates. */
export const ISSUE_SQL = {
  missing_image: "p.featured_image_url IS NULL OR p.featured_image_url = ''",
  missing_description:
    "COALESCE(NULLIF(TRIM(p.long_description), ''), NULLIF(TRIM(p.short_description), '')) IS NULL",
  missing_price: 'p.base_price IS NULL OR p.base_price <= 0',
  missing_cost: 'p.cost_price IS NULL OR p.cost_price <= 0',
  missing_category: 'p.category_id IS NULL',
  missing_weight: 'p.weight IS NULL OR p.weight <= 0',
  missing_seo: "COALESCE(NULLIF(TRIM(p.meta_title), ''), NULLIF(TRIM(p.meta_description), '')) IS NULL",
  /* A price at or below cost. Silent margin leaks are the expensive kind. */
  negative_margin: 'p.cost_price IS NOT NULL AND COALESCE(p.sale_price, p.base_price) <= p.cost_price',
  /*
   * Materially incomplete: no image, no words, or no price. Deliberately narrower than
   * `completeness_score < 8`, which counts SEO fields and tags — on a freshly imported catalogue
   * that flags *every* product, and a signal that fires on everything is not a signal. These three
   * are the ones that stop a listing from selling.
   */
  incomplete:
    "p.featured_image_url IS NULL OR p.featured_image_url = ''" +
    " OR COALESCE(NULLIF(TRIM(p.long_description), ''), NULLIF(TRIM(p.short_description), '')) IS NULL" +
    ' OR p.base_price IS NULL OR p.base_price <= 0'
} as const;

export type ProductIssue = keyof typeof ISSUE_SQL;

const ISSUES = Object.keys(ISSUE_SQL) as ProductIssue[];

/**
 * Narrow a caller-supplied catalogue-issue filter to a known one.
 *
 * @param value - Raw `issue` from the query string.
 * @returns The matching issue key, or undefined when absent or unrecognised.
 */
export function resolveIssue(value: string | null | undefined): ProductIssue | undefined {
  return ISSUES.includes(value as ProductIssue) ? (value as ProductIssue) : undefined;
}

/** A `WHERE` clause and the ordered parameters it refers to. */
export interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Everything the catalogue list can be narrowed by. All values are parameterised. */
export interface ProductListFilters {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  stockStatus?: StockStatus;
  issue?: ProductIssue;
  tags?: string[];
  vendor?: string;
}

/**
 * Build the shared `WHERE` clause for catalogue list, count and export queries.
 *
 * Search covers SKU and barcode as well as prose, because a merchant with a scanner in one hand
 * types an identifier far more often than a product name. It is a prefix/substring match rather
 * than full-text so that a partial SKU (`BCA-DSK`) finds its family — full-text tokenisation drops
 * the hyphens and would not.
 *
 * @param storeId - The tenant. Always the first parameter; never optional.
 * @param filters - Caller-supplied narrowing.
 * @returns The clause and its parameters, ready to splice into a query.
 */
export function buildProductWhere(storeId: string, filters: ProductListFilters): WhereClause {
  const conditions = ['p.store_id = $1'];
  const params: unknown[] = [storeId];
  const next = () => `$${params.length + 1}`;

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    /*
     * One placeholder, referenced six times, rather than six placeholders holding the same value.
     * The obvious version — calling `next()` once per column inside a template literal — is a trap:
     * every call is evaluated before any value is pushed, so all six render as the *same* number
     * while six values go into the array. Postgres then reports "could not determine data type of
     * parameter $4" for the ones nothing references. Binding once is both correct and cheaper.
     */
    params.push(term);
    const t = `$${params.length}`;
    conditions.push(
      `(p.name ILIKE ${t} OR p.sku ILIKE ${t} OR COALESCE(p.barcode, '') ILIKE ${t}` +
        ` OR COALESCE(p.short_description, '') ILIKE ${t}` +
        ` OR COALESCE(p.long_description, '') ILIKE ${t}` +
        ` OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.tags, '{}')) t WHERE t ILIKE ${t}))`
    );
  }

  if (filters.categoryId) {
    conditions.push(`p.category_id = ${next()}`);
    params.push(filters.categoryId);
  }

  if (filters.isActive !== undefined) {
    conditions.push(`p.is_active = ${next()}`);
    params.push(filters.isActive);
  }

  if (filters.isFeatured !== undefined) {
    conditions.push(`p.is_featured = ${next()}`);
    params.push(filters.isFeatured);
  }

  /* Price filters compare the price a shopper actually pays. Filtering on `base_price` while the
   * grid displays the sale price would show rows that contradict the filter. */
  if (filters.minPrice !== undefined && Number.isFinite(filters.minPrice)) {
    conditions.push(`COALESCE(p.sale_price, p.base_price) >= ${next()}`);
    params.push(filters.minPrice);
  }

  if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) {
    conditions.push(`COALESCE(p.sale_price, p.base_price) <= ${next()}`);
    params.push(filters.maxPrice);
  }

  if (filters.stockStatus) {
    conditions.push(`(${STOCK_STATUS_SQL[filters.stockStatus]})`);
  }

  if (filters.issue) {
    conditions.push(`(${ISSUE_SQL[filters.issue]})`);
  }

  if (filters.tags?.length) {
    /* `&&` is array overlap: match a product carrying any of the requested tags. */
    conditions.push(`p.tags && ${next()}::text[]`);
    params.push(filters.tags);
  }

  if (filters.vendor) {
    conditions.push(`p.vendor = ${next()}`);
    params.push(filters.vendor);
  }

  return { sql: `WHERE ${conditions.join(' AND ')}`, params };
}
