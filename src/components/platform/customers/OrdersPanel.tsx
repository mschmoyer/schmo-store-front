'use client';

/**
 * One merchant's order history.
 *
 * The headline figures and the table answer different questions and both are
 * needed: the figures say whether this merchant is working, the rows say which
 * order the customer on the phone is asking about. The tracking number is a
 * column rather than a detail-page field for the same reason — it is the single
 * value a support conversation most often needs to read back.
 *
 * The table pages against `/orders?page=`. When that endpoint is unavailable
 * the panel falls back to the `recent` array the detail payload already
 * carried, and **says so** rather than presenting ten rows as if they were the
 * whole history. Silently showing a truncated list as a complete one is the
 * dishonest-result failure this codebase has shipped before.
 *
 * ## The status filter is in the URL
 *
 * The console's stuck-order alerts drill through to this panel with a status
 * already applied, so the filter has to be addressable — a link that says
 * "these four orders" and lands on an unfiltered list of forty has not
 * answered the question. It lives in the page's query string beside the
 * anchor, which also makes the filtered view bookmarkable and undoable with
 * the Back button.
 *
 * ## Received, cancelled and refunded do not add up
 *
 * `received` counts **every** order this merchant has taken, cancellations
 * included. `cancelled` and `refunded` are subsets of it, and they can be the
 * same orders — a refund is very often issued on the order that was cancelled.
 * Rendered as a plain row of counters, "Received 27 · Cancelled 3 · Refunded 3"
 * reads as six bad orders out of twenty-seven, which is up to twice the truth.
 * The note under the figures says what the sets are, because there is no field
 * in the payload from which the overlap could be computed and printed.
 */

import React, { useState } from 'react';
import { Select, Table, Text } from '@mantine/core';
import { Badge, EmptyState, Price } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Panel, Metrics } from './Panel';
import { PaginationBar } from './PaginationBar';
import { RelativeDate } from './RelativeDate';
import { usePlatformFetch } from './usePlatformFetch';
import { centsToPrice, formatCount, formatHours, humanizeStatus, NOT_SET } from './format';
import type { PlatformOrderRow, PlatformOrderStats, PlatformOrdersPayload } from './types';
import styles from './detailTables.module.css';

/** Rows per page in the orders table. Small: this is a panel, not a list screen. */
const PAGE_SIZE = 10;

/**
 * The statuses the filter offers.
 *
 * These are `orders.status` values, passed to the API verbatim as a bound parameter. There is
 * deliberately no "unshipped" entry: the backlog the console alerts on is a predicate across three
 * columns (settled, no `shipped_at`, older than 48 hours) and the endpoint filters on one column.
 * `Processing` is the closest available answer and a superset of it, and the caption says so rather
 * than letting the label imply an equivalence the query cannot deliver.
 */
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** The `<Select>` value that means "no filter". Mantine cannot carry `null` as an option value. */
const ANY_STATUS = 'all';

/** Status pill tone. Only a genuinely bad state earns a warm colour (§2). */
const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'amber',
  processing: 'amber',
  shipped: 'neutral',
  delivered: 'mint',
  completed: 'mint',
  cancelled: 'rose',
  refunded: 'rose',
};

export interface OrdersPanelProps {
  /** Which merchant's orders to page through. */
  storeId: string;
  /** Counters and money from the detail payload. */
  stats: PlatformOrderStats;
  /** The `orders.status` currently filtered to, from the URL, or `null` for every status. */
  status?: string | null;
  /** Writes a new status to the URL. Omitted when the host screen has no query string to write. */
  onStatusChange?: (status: string | null) => void;
}

/**
 * Renders the orders panel: headline figures plus a paged recent-orders table.
 *
 * @param props - {@link OrdersPanelProps}
 * @returns The orders panel.
 */
export function OrdersPanel({
  storeId,
  stats,
  status = null,
  onStatusChange,
}: OrdersPanelProps): React.ReactElement {
  const [page, setPage] = useState(1);

  /* The status lives in the URL, so it can change under this component without it re-mounting.
     Resetting the page during render (rather than in an effect) keeps the request that fires from
     ever being "page 4 of the previous filter" — React's adjust-state-during-render pattern, the
     same one `CustomerToolbar` uses for its search draft. */
  const [syncedStatus, setSyncedStatus] = useState(status);
  if (status !== syncedStatus) {
    setSyncedStatus(status);
    setPage(1);
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);

  const { data, error, loading } = usePlatformFetch<PlatformOrdersPayload>(
    `/api/platform/customers/${storeId}/orders?${query.toString()}`
  );

  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label ?? null;

  /* The detail payload's `recent` is the fallback, and it is only honest as one
     while the operator has not asked for a later page. */
  const usingFallback = Boolean(error) && page === 1;
  const rows: PlatformOrderRow[] = data?.orders ?? (usingFallback ? stats.recent : []);

  /* The API's rate, not a second division performed here. Three screens used to compute their own
     from three different populations and print three different percentages for one platform. */
  const fulfillment =
    stats.fulfillmentRatePct === undefined
      ? stats.received > 0
        ? Math.round((stats.shipped / stats.received) * 100)
        : null
      : stats.fulfillmentRatePct;

  /* How many of the refunds sat on an order that was also cancelled. The API publishes the overlap
     rather than leaving the reader to guess whether the two counters describe the same orders. */
  const overlap = stats.refundedCancelledCount;

  return (
    <Panel
      title="Orders"
      description={
        stats.received === 0
          ? 'This merchant has never received an order.'
          : `${formatCount(stats.last30d.received)} received in the last 30 days.`
      }
      actions={
        onStatusChange ? (
          <Select
            size="xs"
            label="Order status"
            allowDeselect={false}
            value={status ?? ANY_STATUS}
            data={[
              { value: ANY_STATUS, label: 'Every status' },
              ...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
            ]}
            onChange={(value) =>
              onStatusChange(value === null || value === ANY_STATUS ? null : value)
            }
          />
        ) : undefined
      }
    >
      <Metrics
        items={[
          { label: 'Received', value: formatCount(stats.received) },
          {
            label: 'Shipped',
            value: formatCount(stats.shipped),
            hint: fulfillment === null ? 'nothing received yet' : `${Math.round(fulfillment)}% of received`,
          },
          { label: 'Delivered', value: formatCount(stats.delivered) },
          {
            label: 'Cancelled',
            value: formatCount(stats.cancelled),
            hint: `of the ${formatCount(stats.received)} received`,
            tone: stats.cancelled > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Refunded',
            value: formatCount(stats.refundedCount),
            hint:
              stats.refundedCount === 0 ? (
                'nothing refunded'
              ) : (
                <>
                  <Price value={centsToPrice(stats.refundedCents)} size="sm" />
                  {overlap === undefined
                    ? null
                    : ` · ${formatCount(overlap)} of these ${overlap === 1 ? 'is' : 'are'} also in Cancelled`}
                </>
              ),
            tone: stats.refundedCount > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'GMV',
            value: <Price value={centsToPrice(stats.gmvCents)} size="lg" />,
            hint:
              stats.settledOrders === undefined
                ? 'Paid orders only'
                : `${formatCount(stats.settledOrders)} settled orders`,
          },
          {
            /* The complement of GMV. Booked, not cancelled, never paid — a
               checkout or capture problem, and the console is exactly where
               someone should notice it. */
            label: 'Unsettled',
            value: <Price value={centsToPrice(stats.unsettledCents)} size="lg" />,
            hint:
              stats.unsettledOrders > 0
                ? `${formatCount(stats.unsettledOrders)} orders never paid`
                : 'Every order was paid',
            tone: stats.unsettledCents > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Average order',
            value: <Price value={centsToPrice(stats.aovCents)} size="lg" />,
            hint: 'Settled GMV over settled orders',
          },
          {
            /* Same name and same unit as the overview's fulfilment panel. The two used to read
               "Time to ship 1.2 days" and "Average time to ship 33.6 hours" for one metric. */
            label: 'Average time to ship',
            value: formatHours(stats.avgHoursToShip),
            hint: stats.avgHoursToShip === null ? 'Nothing shipped yet' : 'Mean, order to dispatch',
            tone:
              stats.avgHoursToShip !== null && stats.avgHoursToShip > 72 ? 'warning' : 'neutral',
          },
        ]}
      />

      <p className={styles.notice} data-tone="quiet">
        Received counts every order this merchant has taken, cancellations included. Cancelled and
        Refunded are subsets of it, and{' '}
        {overlap === undefined
          ? 'they overlap — a refund is usually issued on the order that was cancelled'
          : overlap === 0
            ? 'on this merchant they do not overlap: no refunded order was cancelled'
            : `${formatCount(overlap)} order${overlap === 1 ? '' : 's'} ${overlap === 1 ? 'appears' : 'appear'} in both`}
        . They do not add together and they do not subtract from Received.
      </p>

      <div className={styles.tableBlock} id="orders">
        <h3 className={styles.subhead}>
          {statusLabel ? `Orders with status “${statusLabel}”` : 'Recent orders'}
        </h3>

        {status === 'processing' ? (
          <p className={styles.notice} data-tone="quiet">
            Processing is the closest status to &ldquo;paid but not dispatched&rdquo; that the orders
            endpoint can filter on, and it is a superset of the over-48-hours backlog: orders paid in
            the last two days are in this list too.
          </p>
        ) : null}

        {usingFallback ? (
          <p className={styles.notice} role="status">
            Paging is unavailable for this merchant right now, so this is the most recent{' '}
            {formatCount(stats.recent.length)} orders from the store summary, not the full history.
          </p>
        ) : null}

        {loading ? (
          <TableSkeleton rows={5} columns={6} label="Loading orders" />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title="No orders"
            description="Nothing has been bought from this storefront yet."
          />
        ) : (
          <>
            <Table.ScrollContainer minWidth={760}>
              <Table highlightOnHover verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th scope="col">Order</Table.Th>
                    <Table.Th scope="col">Placed</Table.Th>
                    <Table.Th scope="col">Customer</Table.Th>
                    <Table.Th scope="col">Status</Table.Th>
                    <Table.Th scope="col">Tracking</Table.Th>
                    <Table.Th scope="col" className={styles.numeric}>
                      Total
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Th scope="row" className={styles.rowHead}>
                        {order.orderNumber}
                      </Table.Th>
                      <Table.Td>
                        <RelativeDate value={order.createdAt} />
                      </Table.Td>
                      <Table.Td>{order.customerName || NOT_SET}</Table.Td>
                      <Table.Td>
                        <Badge tone={STATUS_TONE[order.status?.toLowerCase()] ?? 'neutral'} size="sm" dot>
                          {humanizeStatus(order.status, 'Unknown')}
                        </Badge>
                        {order.fulfillmentStatus &&
                        order.fulfillmentStatus.toLowerCase() !== order.status?.toLowerCase() ? (
                          <Text size="xs" c="dimmed">
                            {humanizeStatus(order.fulfillmentStatus)}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        {order.trackingNumber ? (
                          <>
                            <span className={styles.code}>{order.trackingNumber}</span>
                            {order.carrier ? (
                              <Text size="xs" c="dimmed">
                                {order.carrier}
                              </Text>
                            ) : null}
                          </>
                        ) : (
                          <Text size="xs" c="dimmed">
                            {NOT_SET}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td className={styles.numeric}>
                        <Price value={centsToPrice(order.totalCents)} size="sm" />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {data ? (
              <PaginationBar
                pagination={data.pagination}
                onPageChange={setPage}
                noun="orders"
              />
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
