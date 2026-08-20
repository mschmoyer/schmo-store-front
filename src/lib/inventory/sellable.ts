/**
 * One definition of "how many of this can a shopper actually buy".
 *
 * There were two, and they disagreed. The storefront was repointed at `inventory_levels` — the
 * ledger's projection, which subtracts units committed to orders already placed and units held back
 * as damaged or awaiting inspection, and ignores locations the merchant has closed or marked
 * unfulfillable. The cart and the checkout stock gate went on reading `inventory`, the table the
 * ShipStation sync mirrors into, keyed on SKU.
 *
 * Nothing built in migrations 027 through 038 — the ledger, locations, quarantine, holds, receiving
 * — writes `inventory`. So the payment gate was blind to all of it, in both directions: quarantine
 * twenty units and the shop correctly offers twenty-two while checkout would still sell forty-two;
 * receive a delivery and the units are visible on the shelf and unbuyable at the till.
 *
 * A shared SQL fragment rather than two careful copies, because two careful copies is what produced
 * the divergence. Anything that decides whether a shopper may have a unit builds its query from
 * here.
 */

/**
 * A lateral join yielding `sellable`, the units a shopper may buy right now.
 *
 * Emits a `LEFT JOIN LATERAL ... ON TRUE` producing one column, `sellable`, which is NULL when the
 * product has no `inventory_levels` rows at all — which is what an untracked product looks like, and
 * why callers coalesce to `products.stock_quantity`. Pair it with {@link sellableStockExpression}.
 *
 * @param productAlias - The alias the surrounding query gives the `products` table.
 * @param lateralAlias - The alias to give this lateral, referenced by the emitted `sellable` column.
 * @returns A SQL fragment for the `FROM` clause. Contains no user input.
 */
export function sellableStockLateral(productAlias = 'p', lateralAlias = 'sellable_stock'): string {
  return `LEFT JOIN LATERAL (
    SELECT SUM(l.available)::int AS sellable
      FROM inventory_levels l
      JOIN inventory_locations loc
        ON loc.id = l.location_id AND loc.store_id = l.store_id
     WHERE l.product_id = ${productAlias}.id
       AND l.store_id = ${productAlias}.store_id
       -- A returns bay, a quarantine shelf or a closed location holds real stock that cannot be
       -- sold from. Counting it is how a storefront promises what it cannot ship.
       AND loc.is_fulfillable
       AND loc.is_active
  ) ${lateralAlias} ON TRUE`;
}

/**
 * The sellable-units expression to select, with its fallback.
 *
 * @param productAlias - The alias the surrounding query gives the `products` table.
 * @param lateralAlias - The alias given to {@link sellableStockLateral}.
 * @returns A SQL expression. Contains no user input.
 */
export function sellableStockExpression(
  productAlias = 'p',
  lateralAlias = 'sellable_stock'
): string {
  return `COALESCE(${lateralAlias}.sellable, ${productAlias}.stock_quantity)`;
}

/**
 * The same quantity as a correlated scalar subquery, for a query with no room for a lateral.
 *
 * `assertStockAvailable` locks one product row with `FOR UPDATE OF p` and needs the number in the
 * same statement; a lateral over `inventory_levels` there would widen the lock to rows the gate has
 * no business locking.
 *
 * @param productAlias - The alias the surrounding query gives the `products` table.
 * @returns A SQL scalar subquery. Contains no user input.
 */
export function sellableStockSubquery(productAlias = 'p'): string {
  return `(SELECT SUM(l.available)::int
             FROM inventory_levels l
             JOIN inventory_locations loc
               ON loc.id = l.location_id AND loc.store_id = l.store_id
            WHERE l.product_id = ${productAlias}.id
              AND l.store_id = ${productAlias}.store_id
              AND loc.is_fulfillable
              AND loc.is_active)`;
}
