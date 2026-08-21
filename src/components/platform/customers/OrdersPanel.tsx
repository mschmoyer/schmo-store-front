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
 */

import React, { useState } from 'react';
import { Table, Text } from '@mantine/core';
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
}

/**
 * Renders the orders panel: headline figures plus a paged recent-orders table.
 *
 * @param props - {@link OrdersPanelProps}
 * @returns The orders panel.
 */
export function OrdersPanel({ storeId, stats }: OrdersPanelProps): React.ReactElement {
  const [page, setPage] = useState(1);
  const { data, error, loading } = usePlatformFetch<PlatformOrdersPayload>(
    `/api/platform/customers/${storeId}/orders?page=${page}&pageSize=${PAGE_SIZE}`
  );

  /* The detail payload's `recent` is the fallback, and it is only honest as one
     while the operator has not asked for a later page. */
  const usingFallback = Boolean(error) && page === 1;
  const rows: PlatformOrderRow[] = data?.orders ?? (usingFallback ? stats.recent : []);

  const fulfillment =
    stats.received > 0 ? Math.round((stats.shipped / stats.received) * 100) : null;

  return (
    <Panel
      title="Orders"
      description={
        stats.received === 0
          ? 'This merchant has never received an order.'
          : `${formatCount(stats.last30d.received)} received in the last 30 days.`
      }
    >
      <Metrics
        items={[
          { label: 'Received', value: formatCount(stats.received) },
          {
            label: 'Shipped',
            value: formatCount(stats.shipped),
            hint: fulfillment === null ? undefined : `${fulfillment}% of received`,
          },
          { label: 'Delivered', value: formatCount(stats.delivered) },
          {
            label: 'Cancelled',
            value: formatCount(stats.cancelled),
            tone: stats.cancelled > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Refunded',
            value: formatCount(stats.refundedCount),
            hint:
              stats.refundedCents > 0 ? (
                <Price value={centsToPrice(stats.refundedCents)} size="sm" />
              ) : undefined,
            tone: stats.refundedCount > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'GMV',
            value: <Price value={centsToPrice(stats.gmvCents)} size="lg" />,
            hint: 'Paid orders only',
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
          },
          {
            label: 'Time to ship',
            value: formatHours(stats.avgHoursToShip),
            hint: stats.avgHoursToShip === null ? 'Nothing shipped yet' : 'Mean, order to dispatch',
            tone:
              stats.avgHoursToShip !== null && stats.avgHoursToShip > 72 ? 'warning' : 'neutral',
          },
        ]}
      />

      <div className={styles.tableBlock}>
        <h3 className={styles.subhead}>Recent orders</h3>

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
