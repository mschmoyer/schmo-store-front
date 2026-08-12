'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Anchor,
  CopyButton,
  Group,
  Pagination,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconSearch,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { StatGridSkeleton, TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Badge, EmptyState, Price } from '@/components/ui';
import type { AdminOrderListItem } from '@/lib/services/orders';
import table from '@/components/admin/adminTable.module.css';
import styles from './orders.module.css';

interface OrdersSummary {
  totalOrders: number;
  bookedValue: number;
  unshippedCount: number;
  unshippedValue: number;
  ageingCount: number;
  ageingValue: number;
  oldestUnshippedDays: number;
  awaitingTracking: number;
  ageingThresholdDays: number;
}

const EMPTY_SUMMARY: OrdersSummary = {
  totalOrders: 0,
  bookedValue: 0,
  unshippedCount: 0,
  unshippedValue: 0,
  ageingCount: 0,
  ageingValue: 0,
  oldestUnshippedDays: 0,
  awaitingTracking: 0,
  ageingThresholdDays: 7,
};

const STATUS_FILTERS = [
  { value: 'unshipped', label: 'Needs shipping' },
  { value: '', label: 'All' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Status pill tone. Only a genuinely bad state earns a warm colour (§2). */
const STATUS_TONE: Record<string, 'neutral' | 'mint' | 'amber' | 'rose'> = {
  pending: 'amber',
  processing: 'amber',
  shipped: 'neutral',
  completed: 'mint',
  cancelled: 'rose',
};

/**
 * Formats an order date as the merchant reads it: the date, plus how long ago.
 *
 * @param iso - ISO timestamp from the API.
 * @returns A short absolute date, e.g. `31 May 2026`.
 */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * The orders list.
 *
 * This screen did not exist. The store's 27 orders, $6,311.79 of booked value
 * and 51 tracking numbers were in the database and on no page in the product,
 * which meant the five orders that had been sitting unshipped for 61 to 73 days
 * were invisible to the person responsible for them.
 *
 * The whole design follows from that: the default filter is **Needs shipping**
 * rather than All, ageing orders sort to the top regardless of filter, an
 * unmissable banner states the count and the money at stake, and every ageing
 * row carries its age in days next to the order number. A merchant who opens
 * this page and reads nothing but the first two inches of it still learns the
 * one thing they needed to know.
 *
 * @returns The orders route.
 */
export default function OrdersPage(): React.ReactElement {
  const { session } = useAdmin();

  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [summary, setSummary] = useState<OrdersSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('unshipped');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    if (!session?.sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ page: String(page), limit: '25' });
      if (status) query.set('status', status);
      if (debouncedSearch) query.set('search', debouncedSearch);

      const response = await fetch(`/api/admin/orders?${query.toString()}`, {
        headers: { Authorization: `Bearer ${session.sessionToken}` },
      });

      const result = await response.json().catch(() => null);

      /*
       * Surface the failure. The coupons page's habit of catching a 500 and
       * rendering "No coupon codes yet" is exactly how a broken API stayed
       * hidden for as long as it did — an empty state is a claim about the
       * data, and it must never be made on the strength of an error.
       */
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || result?.error || `Request failed with status ${response.status}`
        );
      }

      setOrders(result.data.orders);
      setSummary(result.data.summary);
      setTotalPages(Math.max(1, result.data.pagination.totalPages));
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [session?.sessionToken, page, status, debouncedSearch]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const ageingBanner = useMemo(() => {
    if (summary.ageingCount === 0) return null;

    return (
      <Alert
        icon={<IconAlertTriangle size={18} />}
        color="red"
        variant="light"
        title={`${summary.ageingCount} order${summary.ageingCount === 1 ? '' : 's'} unshipped for more than ${summary.ageingThresholdDays} days`}
        className={styles.ageingAlert}
      >
        <Text size="sm">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            summary.ageingValue
          )}{' '}
          of paid orders is waiting to go out, and the oldest has been waiting{' '}
          <strong>{summary.oldestUnshippedDays} days</strong>. These are at the top of the list
          below.
        </Text>
      </Alert>
    );
  }, [summary]);

  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Orders"
        description="Everything customers have bought, oldest unshipped first."
      />

      {ageingBanner}

      {loading && orders.length === 0 ? (
        <StatGridSkeleton count={4} />
      ) : (
        <StatGrid min={210}>
          {/*
           * Booked value = SUM(total_amount) WHERE status <> 'cancelled'.
           * Verified: SELECT SUM(total_amount) FROM orders
           *   WHERE store_id = '650e8400-…0001' AND status <> 'cancelled';
           *   -> 5588.11 across 21 orders (27 total, 6 cancelled at 723.68).
           */}
          <StatCard
            label="Booked value"
            value={summary.bookedValue}
            format="currency"
            meta={`${summary.totalOrders} orders, cancellations excluded`}
          />
          <StatCard
            label="Needs shipping"
            value={summary.unshippedCount}
            meta={
              <>
                <Price value={summary.unshippedValue} size="sm" /> paid, nothing dispatched
              </>
            }
            tone={summary.unshippedCount > 0 ? 'warning' : 'neutral'}
            icon={<IconTruckDelivery size={16} />}
          />
          <StatCard
            label={`Late (over ${summary.ageingThresholdDays} days)`}
            value={summary.ageingCount}
            meta={
              summary.ageingCount > 0
                ? `Oldest has waited ${summary.oldestUnshippedDays} days`
                : 'Nothing overdue'
            }
            tone={summary.ageingCount > 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="Sent without tracking"
            value={summary.awaitingTracking}
            meta="Shipped or completed, no tracking number on file"
            tone={summary.awaitingTracking > 0 ? 'warning' : 'neutral'}
          />
        </StatGrid>
      )}

      <Paper className={styles.controls}>
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <SegmentedControl
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            data={STATUS_FILTERS}
            size="sm"
          />
          <TextInput
            placeholder="Order number, customer, or tracking"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className={styles.search}
            aria-label="Search orders"
          />
        </Group>
      </Paper>

      {error ? (
        <Alert color="red" variant="light" title="Could not load orders" icon={<IconAlertTriangle size={18} />}>
          {error}
        </Alert>
      ) : loading ? (
        <TableSkeleton rows={8} columns={7} label="Loading orders" />
      ) : orders.length === 0 ? (
        <EmptyState
          title={status === 'unshipped' ? 'Nothing waiting to ship' : 'No orders match this view'}
          description={
            status === 'unshipped'
              ? 'Every paid order has been dispatched. Switch to All to see the full history.'
              : 'Try a different status, or clear the search.'
          }
        />
      ) : (
        <Paper className={styles.tableCard}>
          <Table.ScrollContainer minWidth={880}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Order</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Placed</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Tracking</Table.Th>
                  <Table.Th className={table.numeric}>Items</Table.Th>
                  <Table.Th className={table.numeric}>Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {orders.map((order) => (
                  <Table.Tr key={order.id} data-ageing={order.isAgeing ? 'true' : undefined}>
                    <Table.Td>
                      <Anchor component={Link} href={`/admin/orders/${order.id}`} fw={600}>
                        {order.orderNumber}
                      </Anchor>
                      {order.isAgeing ? (
                        <Text className={styles.ageLine}>
                          <IconAlertTriangle size={13} aria-hidden="true" />
                          Waiting {order.ageDays} days
                        </Text>
                      ) : null}
                    </Table.Td>

                    <Table.Td>
                      <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} size="sm" dot>
                        {order.status}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      <Text size="sm">{formatDate(order.createdAt)}</Text>
                      <Text size="xs" c="dimmed">
                        {order.ageDays === 0 ? 'today' : `${order.ageDays}d ago`}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {order.customerName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {order.destination || order.customerEmail}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      {order.trackingNumber ? (
                        <Group gap={6} wrap="nowrap">
                          <Text className={table.code}>{order.trackingNumber}</Text>
                          <CopyButton value={order.trackingNumber} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? 'Copied' : 'Copy tracking number'}>
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  onClick={copy}
                                  aria-label={`Copy tracking number for ${order.orderNumber}`}
                                >
                                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>{order.itemCount}</Table.Td>

                    <Table.Td className={table.numeric}>
                      <Price value={order.totalAmount} size="sm" />
                      {order.refundedAmount > 0 ? (
                        <Text size="xs" c="dimmed">
                          refunded{' '}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(order.refundedAmount)}
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {totalPages > 1 ? (
        <Group justify="center">
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      ) : null}
    </Stack>
  );
}
