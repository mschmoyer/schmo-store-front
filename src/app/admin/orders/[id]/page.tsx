'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Anchor,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { Badge, Price } from '@/components/ui';
import table from '@/components/admin/adminTable.module.css';
import styles from '../orders.module.css';

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status: string | null;
  fulfillment_status: string | null;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string | null;
  subtotal: string;
  tax_amount: string | null;
  shipping_amount: string | null;
  discount_amount: string | null;
  total_amount: string;
  refunded_amount: string;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  shipping_method: string | null;
  created_at: string;
  shipped_at: string | null;
  age_days: number;
  is_ageing: boolean;
  ageing_threshold_days: number;
  notes: string | null;
}

interface OrderLine {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  unitCost: number | null;
  quantity: number;
  lineTotal: number;
  lineProfit: number | null;
  marginPct: number | null;
}

interface OrderProfit {
  revenue: number;
  grossProfit: number;
  marginPct: number;
  partial: boolean;
}

const STATUS_TONE: Record<string, 'neutral' | 'mint' | 'amber' | 'rose'> = {
  pending: 'amber',
  processing: 'amber',
  shipped: 'neutral',
  completed: 'mint',
  cancelled: 'rose',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/**
 * One order.
 *
 * The list answers "what is stuck"; this answers "where is this customer's
 * package" and "did this order make money". The second question is why the
 * lines carry a cost and a margin column: gross profit per order is
 * computable from `order_items.unit_cost` (snapshotted at order time by
 * migration 023) and appeared nowhere in the product before.
 *
 * @returns The order detail route.
 */
export default function OrderDetailPage(): React.ReactElement {
  const { session } = useAdmin();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderLine[]>([]);
  const [profit, setProfit] = useState<OrderProfit | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!session?.sessionToken || !orderId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${session.sessionToken}` },
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || result?.error || `Request failed with status ${response.status}`
        );
      }

      setOrder(result.data.order);
      setItems(result.data.items);
      setProfit(result.data.profit);
      setCoupon(result.data.coupon);
    } catch (err) {
      console.error('Error fetching order:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [session?.sessionToken, orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={38} width={280} />
        <Skeleton height={116} radius="var(--radius-lg)" />
        <Skeleton height={260} radius="var(--radius-lg)" />
      </Stack>
    );
  }

  if (error || !order) {
    return (
      <Stack gap="lg">
        <Anchor component={Link} href="/admin/orders" size="sm">
          <Group gap={4} component="span">
            <IconArrowLeft size={14} /> All orders
          </Group>
        </Anchor>
        <Alert color="red" variant="light" title="Could not load this order">
          {error || 'Order not found.'}
        </Alert>
      </Stack>
    );
  }

  const customerName = `${order.customer_first_name} ${order.customer_last_name}`.trim();

  return (
    <Stack gap="lg">
      <Anchor component={Link} href="/admin/orders" size="sm">
        <Group gap={4} component="span">
          <IconArrowLeft size={14} /> All orders
        </Group>
      </Anchor>

      <AdminPageHeader
        title={order.order_number}
        description={
          <>
            Placed {new Date(order.created_at).toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            by {customerName}
          </>
        }
        actions={
          <Group gap="xs">
            <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
              {order.status}
            </Badge>
            {order.payment_status ? (
              <Badge tone={order.payment_status === 'paid' ? 'mint' : 'neutral'}>
                payment {order.payment_status}
              </Badge>
            ) : null}
          </Group>
        }
      />

      {order.is_ageing ? (
        <Alert
          icon={<IconAlertTriangle size={18} />}
          color="red"
          variant="light"
          title={`Unshipped for ${order.age_days} days`}
          className={styles.ageingAlert}
        >
          <Text size="sm">
            This order has been paid and sitting in <strong>{order.status}</strong> well past the{' '}
            {order.ageing_threshold_days}-day mark. Nothing has been dispatched and no tracking
            number is on file.
          </Text>
        </Alert>
      ) : null}

      <StatGrid min={200}>
        <StatCard label="Order total" value={parseFloat(order.total_amount)} format="currency" />
        {/*
         * Gross profit for this order = SUM(qty * (unit_price - unit_cost))
         * over its lines, with unit_cost snapshotted at order time. Margin
         * divides by revenue, never by cost.
         */}
        <StatCard
          label="Gross profit"
          value={profit?.grossProfit ?? 0}
          format="currency"
          meta={
            profit?.partial
              ? 'Some lines have no cost on file'
              : `${(profit?.marginPct ?? 0).toFixed(1)}% margin on revenue`
          }
          tone={(profit?.grossProfit ?? 0) > 0 ? 'signal' : 'neutral'}
        />
        <StatCard
          label="Items"
          value={items.reduce((sum, line) => sum + line.quantity, 0)}
          meta={`${items.length} product${items.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Tracking"
          value={order.tracking_number ? 'On file' : 'None'}
          format="raw"
          meta={
            order.tracking_number
              ? `${order.carrier || 'Carrier'} · ${order.tracking_number}`
              : 'No tracking number recorded'
          }
          tone={order.tracking_number ? 'neutral' : 'warning'}
        />
      </StatGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper className={styles.tableCard} p="md">
          <Text component="h2" fw={600} mb="xs">
            Customer
          </Text>
          <Stack gap={2}>
            <Text size="sm">{customerName}</Text>
            <Text size="sm" c="dimmed">
              {order.customer_email}
            </Text>
            {order.customer_phone ? (
              <Text size="sm" c="dimmed">
                {order.customer_phone}
              </Text>
            ) : null}
          </Stack>
        </Paper>

        <Paper className={styles.tableCard} p="md">
          <Text component="h2" fw={600} mb="xs">
            Ship to
          </Text>
          <Stack gap={2}>
            <Text size="sm">
              {order.shipping_first_name} {order.shipping_last_name}
            </Text>
            <Text size="sm" c="dimmed">
              {order.shipping_address_line1}
              {order.shipping_address_line2 ? `, ${order.shipping_address_line2}` : ''}
            </Text>
            <Text size="sm" c="dimmed">
              {order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}{' '}
              {order.shipping_country}
            </Text>
            {order.shipping_method ? (
              <Text size="xs" c="dimmed" mt={4}>
                {order.shipping_method}
              </Text>
            ) : null}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper className={styles.tableCard}>
        <Table.ScrollContainer minWidth={720}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th className={table.numeric}>Qty</Table.Th>
                <Table.Th className={table.numeric}>Price</Table.Th>
                <Table.Th className={table.numeric}>Unit cost</Table.Th>
                <Table.Th className={table.numeric}>Line total</Table.Th>
                <Table.Th className={table.numeric}>Margin</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((line) => (
                <Table.Tr key={line.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {line.name}
                    </Text>
                    <Text className={table.code}>{line.sku}</Text>
                  </Table.Td>
                  <Table.Td className={table.numeric}>{line.quantity}</Table.Td>
                  <Table.Td className={table.numeric}>{money(line.unitPrice)}</Table.Td>
                  <Table.Td className={table.numeric}>
                    {line.unitCost === null ? '—' : money(line.unitCost)}
                  </Table.Td>
                  <Table.Td className={table.numeric}>
                    <Price value={line.lineTotal} size="sm" />
                  </Table.Td>
                  <Table.Td className={table.numeric}>
                    {line.marginPct === null ? (
                      '—'
                    ) : (
                      <div className={table.stacked}>
                        <span>{line.marginPct.toFixed(1)}%</span>
                        <span className={table.sub}>{money(line.lineProfit ?? 0)}</span>
                      </div>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={4}>Subtotal</Table.Th>
                <Table.Th className={table.numeric} colSpan={2}>
                  {money(parseFloat(order.subtotal))}
                </Table.Th>
              </Table.Tr>
              {coupon ? (
                <Table.Tr>
                  <Table.Th colSpan={4}>Coupon {coupon.code}</Table.Th>
                  <Table.Th className={table.numeric} colSpan={2}>
                    −{money(coupon.discountAmount)}
                  </Table.Th>
                </Table.Tr>
              ) : parseFloat(order.discount_amount || '0') > 0 ? (
                <Table.Tr>
                  <Table.Th colSpan={4}>Discount</Table.Th>
                  <Table.Th className={table.numeric} colSpan={2}>
                    −{money(parseFloat(order.discount_amount || '0'))}
                  </Table.Th>
                </Table.Tr>
              ) : null}
              <Table.Tr>
                <Table.Th colSpan={4}>Shipping</Table.Th>
                <Table.Th className={table.numeric} colSpan={2}>
                  {money(parseFloat(order.shipping_amount || '0'))}
                </Table.Th>
              </Table.Tr>
              <Table.Tr>
                <Table.Th colSpan={4}>Tax</Table.Th>
                <Table.Th className={table.numeric} colSpan={2}>
                  {money(parseFloat(order.tax_amount || '0'))}
                </Table.Th>
              </Table.Tr>
              <Table.Tr>
                <Table.Th colSpan={4}>Total</Table.Th>
                <Table.Th className={table.numeric} colSpan={2}>
                  {money(parseFloat(order.total_amount))}
                </Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {order.notes ? (
        <Paper className={styles.tableCard} p="md">
          <Text component="h2" fw={600} mb="xs">
            Notes
          </Text>
          <Text size="sm">{order.notes}</Text>
        </Paper>
      ) : null}
    </Stack>
  );
}
