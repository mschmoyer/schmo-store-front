/**
 * Where a number on the console takes you.
 *
 * Three drill-throughs, and deliberately only three. "Make every number clickable" produces a
 * screen where nothing looks clickable, because a link that leads to a page the reader could have
 * reached anyway teaches them that the links are decoration. These are the three places where the
 * next question after reading a figure has one obvious answer:
 *
 * - **Unshipped for over 48 hours → that store's orders.** The count is a workload; the orders are
 *   the work.
 * - **A store-scoped alert → that store's order list**, alongside the alert's own link to the
 *   store, rather than dumping the operator on an overview they have to navigate out of.
 * - **A not-connected count → the filtered merchant list.** "0 of 3 merchants can take a payment"
 *   is only actionable if the console can then name the three.
 *
 * ## The honest gap in the first two
 *
 * `GET /api/platform/customers/[storeId]/orders` filters on a single `orders.status` value. There
 * is no `unshipped` status: the backlog is "settled, not cancelled, `shipped_at IS NULL`, older
 * than 48 hours", which is a predicate across three columns. `processing` is the status those
 * orders actually carry and is the closest filter the endpoint offers — but it is a **superset**,
 * because a paid order that arrived an hour ago is also `processing`. Every screen that follows one
 * of these links says so in words rather than letting the operator assume the filtered list and the
 * backlog are the same set. If the orders endpoint ever grows a real `unshipped` filter, this
 * constant is the single place that changes.
 */

import type { CustomerFilterKey } from './customers/types';

/**
 * The `orders.status` value that stands in for "paid but not dispatched".
 *
 * Exported so the copy explaining the approximation and the link that creates it cannot drift
 * apart: a screen that names a different status than the one it filtered by is a small lie.
 */
export const UNSHIPPED_ORDER_STATUS = 'processing';

/**
 * The console route for one merchant's order list.
 *
 * @param storeId - The store's UUID.
 * @param status - An `orders.status` value to pre-filter by. Defaults to
 *   {@link UNSHIPPED_ORDER_STATUS}; pass `null` for the unfiltered list.
 * @returns A `/platform/customers/[storeId]` URL carrying the filter and an anchor onto the orders
 *   panel, so the operator lands on the table rather than at the top of the page.
 */
export function storeOrdersHref(
  storeId: string,
  status: string | null = UNSHIPPED_ORDER_STATUS
): string {
  const base = `/platform/customers/${encodeURIComponent(storeId)}`;
  const query = status === null ? '' : `?orders=${encodeURIComponent(status)}`;
  return `${base}${query}#orders`;
}

/**
 * The console route for the merchant list, narrowed to one named subset.
 *
 * @param filter - A {@link CustomerFilterKey} the list screen understands. Anything else would be
 *   silently reset to `all` by the list's own parameter validation, which reads as a broken link.
 * @returns A `/platform/customers` URL carrying the filter.
 */
export function customersFilterHref(filter: CustomerFilterKey): string {
  return filter === 'all'
    ? '/platform/customers'
    : `/platform/customers?filter=${encodeURIComponent(filter)}`;
}
