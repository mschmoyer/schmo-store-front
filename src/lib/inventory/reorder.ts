/**
 * When to reorder, and how much.
 *
 * One definition, because there were two and they disagreed on screen. The inventory grid computed
 * `demand over the lead time + safety stock`, documenting that formula and the reason for it, while
 * the purchase-order recommendations screen next door used `forecast over 30 days + 5` — the exact
 * formula the grid's own comment describes as wrong — and ignored `reorder_point`, `lead_time_days`
 * and `safety_stock` entirely.
 *
 * The result an adversarial review reproduced: a merchant sets a 60-day lead time and a reorder
 * point of 50 on a SKU, the grid flags it "low stock, needs reordering", and the screen that turns
 * that into a purchase order recalculates the point as `max(3 + 5, 8) = 8`, decides the SKU is
 * fine, and never mentions it. The merchant is told to reorder by one screen and not by the screen
 * that does the reordering.
 */

/**
 * Default lead time when neither the product nor its supplier records one.
 *
 * Two weeks is a guess, and it is labelled as one wherever it is used rather than presented as a
 * measurement. It exists because the alternative — refusing to suggest anything until every
 * supplier has a lead time on file — makes the feature useless on day one.
 */
export const DEFAULT_LEAD_TIME_DAYS = 14;

/** What the reorder maths needs to know about a product. */
export interface ReorderInputs {
  /** Units sold per day, measured over 90 days where there is 90 days of history. */
  dailyDemand: number;
  /** The merchant's own reorder point, when they have set one. */
  reorderPoint?: number | null;
  /** The merchant's own order size, when they have agreed one with the supplier. */
  reorderQuantity?: number | null;
  /** Days from placing an order to it arriving, from the product or its supplier. */
  leadTimeDays?: number | null;
  /** Buffer against demand and lead time both running long. */
  safetyStock?: number | null;
  /** The fallback threshold every product has. */
  lowStockThreshold?: number | null;
}

/**
 * Suggest a reorder point from measured demand.
 *
 * `demand over the lead time + safety stock`. The question a reorder point answers is "will this
 * run out before a replacement can arrive", which cannot be answered without the lead time — so a
 * formula that hardcodes thirty days is answering a different question for every supplier who is
 * not thirty days away.
 *
 * @param inputs - {@link ReorderInputs}.
 * @returns The suggested point in units, or null when nothing has sold. A suggestion derived from
 *   no demand data is a guess wearing a number's clothes, and the caller should say "not enough
 *   sales history" rather than print it.
 */
export function suggestReorderPoint(inputs: ReorderInputs): number | null {
  const dailyDemand = Number(inputs.dailyDemand) || 0;
  if (dailyDemand <= 0) return null;

  const leadTime = Number(inputs.leadTimeDays) || DEFAULT_LEAD_TIME_DAYS;
  /* A week of demand, when the merchant has not chosen a buffer. Explicitly not zero: a reorder
   * point with no safety stock stocks out on the first day demand runs above average. */
  const safetyStock = Number(inputs.safetyStock) || Math.ceil(dailyDemand * 7);

  return Math.ceil(dailyDemand * leadTime + safetyStock);
}

/**
 * The reorder point to actually act on.
 *
 * The merchant's own setting wins over anything computed. They know things the sales history does
 * not — a supplier going on holiday, a promotion next month, a component on allocation — and a
 * screen that silently recomputes a number the merchant typed is not a recommendation, it is an
 * override.
 *
 * @param inputs - {@link ReorderInputs}.
 * @returns The point in units, always a number so it can be compared against stock.
 */
export function effectiveReorderPoint(inputs: ReorderInputs): number {
  const explicit = Number(inputs.reorderPoint);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const suggested = suggestReorderPoint(inputs);
  const threshold = Number(inputs.lowStockThreshold) || 0;

  return Math.max(suggested ?? 0, threshold);
}
