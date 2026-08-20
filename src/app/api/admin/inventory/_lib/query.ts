/**
 * The inventory grid's query: what it selects, how it filters, how it sorts.
 *
 * Shared with the CSV export so the file a merchant downloads is the view they were looking at.
 * The previous export ran its own copy of the query, which had already drifted.
 *
 * Same rule as the catalogue's builder: caller-supplied values are parameters, never text spliced
 * into SQL. Sort keys are a lookup into a frozen map.
 */

/** Sort keys the inventory grid offers, mapped to the SQL that orders by them. */
export const INVENTORY_SORT_SQL = {
  name: 'p.name',
  sku: 'p.sku',
  on_hand: 'lv.on_hand',
  available: 'lv.available',
  committed: 'lv.committed',
  incoming: 'lv.incoming',
  /* What the shelf is worth at cost — the number that goes on an insurance schedule. */
  value_at_cost: 'lv.on_hand * COALESCE(p.cost_price, 0)',
  unit_cost: 'p.cost_price',
  /* NULLS grouped by the direction, so "which have no reorder policy" is one click. */
  reorder_point: 'COALESCE(p.reorder_point, p.low_stock_threshold)',
  /* Demand over the last 90 days, the basis for everything downstream. */
  velocity: 'sv.units_90d',
  /* How long the shelf lasts at that rate. The single most useful ordering on this screen: it puts
   * whatever runs out first at the top, which is the question a restock review is asking. */
  days_of_cover: `CASE WHEN COALESCE(sv.units_90d, 0) > 0
                       THEN lv.available / (sv.units_90d / 90.0)
                       ELSE NULL END`,
  last_movement: 'lv.last_movement_at',
  last_sale: 'sv.last_sale_date'
} as const;

export type InventorySortKey = keyof typeof INVENTORY_SORT_SQL;

const SORT_KEYS = Object.keys(INVENTORY_SORT_SQL) as InventorySortKey[];

/**
 * Resolve a caller-supplied sort key to a known one.
 *
 * @param value - Raw `sort_by` from the query string.
 * @param fallback - Used when the value is absent or unrecognised.
 * @returns A key guaranteed present in {@link INVENTORY_SORT_SQL}.
 */
export function resolveInventorySort(
  value: string | null | undefined,
  fallback: InventorySortKey = 'days_of_cover'
): InventorySortKey {
  return SORT_KEYS.includes(value as InventorySortKey) ? (value as InventorySortKey) : fallback;
}

/**
 * Resolve a caller-supplied sort direction to a literal.
 *
 * @param value - Raw `sort_order` from the query string.
 * @param fallback - Used when the value is absent or unrecognised.
 * @returns `'ASC'` or `'DESC'`.
 */
export function resolveDirection(
  value: string | null | undefined,
  fallback: 'ASC' | 'DESC' = 'ASC'
): 'ASC' | 'DESC' {
  const upper = String(value ?? '').toUpperCase();
  return upper === 'ASC' ? 'ASC' : upper === 'DESC' ? 'DESC' : fallback;
}

/** The states the grid can filter to, as SQL predicates over the joined level row. */
export const INVENTORY_STATE_SQL = {
  /* Sold more than we hold. Previously impossible to see, because the balance was clamped at 0. */
  oversold: 'lv.available < 0',
  out_of_stock: 'lv.available = 0',
  low_stock:
    'lv.available > 0 AND lv.available <= COALESCE(p.reorder_point, p.low_stock_threshold, 0)',
  in_stock:
    'lv.available > COALESCE(p.reorder_point, p.low_stock_threshold, 0)',
  /* Below the reorder point with nothing on order — the actual restock worklist. */
  needs_reorder:
    'lv.available <= COALESCE(p.reorder_point, p.low_stock_threshold, 0) AND lv.incoming = 0',
  /* Held stock that has not sold in three months. Cash sitting on a shelf. */
  dead_stock:
    "lv.on_hand > 0 AND (sv.last_sale_date IS NULL OR sv.last_sale_date < NOW() - INTERVAL '90 days')",
  /* Present but not saleable — damaged, quarantined, awaiting inspection. */
  unavailable: 'lv.unavailable > 0',
  incoming: 'lv.incoming > 0',
  /* Stock with no cost recorded. These are the SKUs that make a valuation report a guess. */
  uncosted: 'lv.on_hand > 0 AND (p.cost_price IS NULL OR p.cost_price <= 0)',
  not_tracked: 'p.track_inventory = false'
} as const;

export type InventoryState = keyof typeof INVENTORY_STATE_SQL;

const STATES = Object.keys(INVENTORY_STATE_SQL) as InventoryState[];

/**
 * Narrow a caller-supplied state filter to a known one.
 *
 * @param value - Raw `state` from the query string.
 * @returns The matching state, or undefined.
 */
export function resolveInventoryState(value: string | null | undefined): InventoryState | undefined {
  return STATES.includes(value as InventoryState) ? (value as InventoryState) : undefined;
}

/** Everything the inventory grid can be narrowed by. */
export interface InventoryFilters {
  search?: string;
  state?: InventoryState;
  categoryId?: string;
  supplierId?: string;
  locationId?: string;
  vendor?: string;
}

/**
 * The FROM and JOIN clauses every inventory read shares.
 *
 * Three things about the shape are deliberate.
 *
 * `inventory_levels` is *aggregated* in a subquery rather than joined directly. A product stocked
 * in three locations has three level rows, and a plain join put it in the grid three times and
 * inflated every total — which is exactly the fan-out defect this file's neighbours document having
 * fixed once already for `inventory_logs`. When a specific location is selected the aggregate is
 * over that one location, so the same query serves both the roll-up and the per-location view.
 *
 * Sales velocity is one aggregate over `order_items` for the whole store, joined by product, rather
 * than a correlated subquery per row. The windows key off the *order's* date, never the line item's
 * insert timestamp — keying off the latter made every window return the same number for an imported
 * catalogue, because every line was inserted on import day.
 *
 * `incoming` comes from open purchase orders rather than a stored column, so it cannot go stale.
 */
export const INVENTORY_FROM = `
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
  LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.store_id = p.store_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(l.on_hand), 0)::int      AS on_hand,
      COALESCE(SUM(l.committed), 0)::int    AS committed,
      COALESCE(SUM(l.reserved), 0)::int     AS reserved,
      COALESCE(SUM(l.unavailable), 0)::int  AS unavailable,
      COALESCE(SUM(l.available), 0)::int    AS available,
      COALESCE((
        SELECT SUM(poi.quantity_pending)::int
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.purchase_order_id
         WHERE po.store_id = p.store_id
           AND poi.product_sku = p.sku
           AND po.status NOT IN ('cancelled', 'closed', 'draft')
           AND poi.quantity_pending > 0
      ), 0)                                 AS incoming,
      MAX(l.updated_at)                     AS last_movement_at,
      COUNT(*)                              AS location_count
    FROM inventory_levels l
    WHERE l.product_id = p.id AND l.store_id = p.store_id
      AND ($LOCATION$::uuid IS NULL OR l.location_id = $LOCATION$::uuid)
  ) lv ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      SUM(oi.quantity)::int                                                                 AS units_all,
      SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::int        AS units_30d,
      SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '90 days')::int        AS units_90d,
      SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '365 days')::int       AS units_365d,
      MAX(o.created_at)                                                                      AS last_sale_date
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
  ) sv ON TRUE
`;

/** A `WHERE` clause and the parameters it refers to. */
export interface WhereClause {
  sql: string;
  params: unknown[];
  /** The 1-based position of the location parameter, for splicing into {@link INVENTORY_FROM}. */
  locationParam: string;
}

/**
 * Build the inventory grid's `WHERE` clause, and the location placeholder its FROM needs.
 *
 * The location parameter is added first and unconditionally (as NULL when no location is chosen)
 * because it appears inside the lateral join, which is textually before the `WHERE`.
 *
 * @param storeId - The tenant.
 * @param filters - Caller-supplied narrowing.
 * @returns The clause, its parameters, and the placeholder to substitute into the FROM.
 */
export function buildInventoryWhere(storeId: string, filters: InventoryFilters): WhereClause {
  const params: unknown[] = [storeId, filters.locationId ?? null];
  const locationParam = '$2';
  const conditions = ['p.store_id = $1'];
  const next = () => `$${params.length + 1}`;

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    /* Bound once and referenced three times — see the note in the catalogue's builder for why
     * calling `next()` per column silently produces unreferenced parameters. */
    params.push(term);
    const t = `$${params.length}`;
    conditions.push(`(p.name ILIKE ${t} OR p.sku ILIKE ${t} OR COALESCE(p.barcode, '') ILIKE ${t})`);
  }

  if (filters.categoryId) {
    conditions.push(`p.category_id = ${next()}`);
    params.push(filters.categoryId);
  }

  if (filters.supplierId) {
    conditions.push(`p.supplier_id = ${next()}`);
    params.push(filters.supplierId);
  }

  if (filters.vendor) {
    conditions.push(`p.vendor = ${next()}`);
    params.push(filters.vendor);
  }

  if (filters.state) {
    conditions.push(`(${INVENTORY_STATE_SQL[filters.state]})`);
  }

  return { sql: `WHERE ${conditions.join(' AND ')}`, params, locationParam };
}

/**
 * Substitute the location placeholder into the shared FROM clause.
 *
 * @param locationParam - The placeholder from {@link buildInventoryWhere}.
 * @returns The FROM clause with its location predicate bound.
 */
export function inventoryFrom(locationParam: string): string {
  return INVENTORY_FROM.replaceAll('$LOCATION$', locationParam);
}

/**
 * Build the `ORDER BY` clause.
 *
 * `days_of_cover` sorts NULLs last ascending, which is the opposite of Postgres's default and is
 * what the merchant means: a product with no demand signal has no urgency, so it belongs at the
 * bottom of "what runs out first", not the top.
 *
 * @param key - A key already narrowed by {@link resolveInventorySort}.
 * @param direction - A direction already narrowed by {@link resolveDirection}.
 * @returns SQL beginning with `ORDER BY`, containing no caller text.
 */
export function buildInventoryOrderBy(key: InventorySortKey, direction: 'ASC' | 'DESC'): string {
  const nulls = key === 'days_of_cover' ? 'NULLS LAST' : direction === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
  return `ORDER BY ${INVENTORY_SORT_SQL[key]} ${direction} ${nulls}, p.id ASC`;
}

/** The columns every inventory read returns, so the grid and the CSV cannot drift apart. */
export const INVENTORY_SELECT = `
  p.id                                            AS product_id,
  p.sku,
  p.name,
  p.barcode,
  p.featured_image_url,
  p.track_inventory,
  p.status,
  p.base_price,
  p.sale_price,
  p.cost_price                                    AS unit_cost,
  p.low_stock_threshold,
  p.reorder_point,
  p.reorder_quantity,
  p.lead_time_days,
  p.safety_stock,
  p.vendor,
  c.name                                          AS category_name,
  p.supplier_id,
  sup.name                                        AS supplier_name,
  sup.payment_terms                               AS supplier_terms,
  COALESCE(lv.on_hand, 0)                         AS on_hand,
  COALESCE(lv.committed, 0)                       AS committed,
  COALESCE(lv.reserved, 0)                        AS reserved,
  COALESCE(lv.unavailable, 0)                     AS unavailable,
  COALESCE(lv.available, 0)                       AS available,
  COALESCE(lv.incoming, 0)                        AS incoming,
  COALESCE(lv.location_count, 0)                  AS location_count,
  lv.last_movement_at,
  COALESCE(sv.units_30d, 0)                       AS units_30d,
  COALESCE(sv.units_90d, 0)                       AS units_90d,
  COALESCE(sv.units_365d, 0)                      AS units_365d,
  COALESCE(sv.units_all, 0)                       AS units_all,
  sv.last_sale_date,
  /* Demand per day over 90 days. One rate, derived once, so nothing downstream can compute a
   * slightly different version of it and contradict the column beside it. */
  ROUND(COALESCE(sv.units_90d, 0) / 90.0, 4)      AS daily_demand,
  COALESCE(lv.on_hand, 0) * COALESCE(p.cost_price, 0)  AS value_at_cost,
  COALESCE(lv.on_hand, 0) * COALESCE(p.sale_price, p.base_price) AS value_at_retail,
  /* Days of cover at the 90-day rate. NULL when nothing has sold: "never runs out" and "no demand
   * signal" are different answers and the grid must not conflate them. */
  CASE WHEN COALESCE(sv.units_90d, 0) > 0
       THEN ROUND(COALESCE(lv.available, 0) / (sv.units_90d / 90.0), 1)
       ELSE NULL END                              AS days_of_cover,
  CASE
    WHEN p.track_inventory = false THEN 'not_tracked'
    WHEN COALESCE(lv.available, 0) < 0 THEN 'oversold'
    WHEN COALESCE(lv.available, 0) = 0 THEN 'out_of_stock'
    WHEN COALESCE(lv.available, 0) <= COALESCE(p.reorder_point, p.low_stock_threshold, 0) THEN 'low_stock'
    ELSE 'in_stock'
  END                                             AS state
`;
