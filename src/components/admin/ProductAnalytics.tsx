'use client';

/**
 * How one product is performing.
 *
 * The previous version of this panel rendered `NaN%` four times.
 *
 * The route it read from returned `analytics: Promise.resolve({ rows: [] })` behind a `// TODO:
 * Implement analytics` — not merely empty, but the wrong shape entirely. So `analytics.views`
 * rendered nothing, `(analytics.conversion_rate * 100).toFixed(1)` rendered `NaN%`, three progress
 * bars got `value={NaN}`, and a verdict computed from `undefined` told the merchant their product
 * was "Needs improvement" in red. It also shipped a grey box reading "Sales chart visualization
 * would go here", and a time-range selector that changed only the sentence beside it.
 *
 * A fabricated conversion rate is worse than no conversion rate, because a merchant will price and
 * merchandise against it. So this shows what the database can actually answer — units, revenue,
 * margin against cost at the time of sale, and the stock movements behind it — and says plainly
 * where a figure is not measured rather than inventing one.
 */

import React from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Price } from '@/components/ui';
import { StatCard, StatGrid } from './StatCard';
import table from './adminTable.module.css';

/** The sales figures the product route returns. */
export interface ProductSalesData {
  total_sales: number;
  total_revenue: number;
  total_orders: number;
  gross_profit: number;
  avg_sale_price: number;
  units_30d: number;
  units_90d: number;
  first_sale_date: string | null;
  last_sale_date: string | null;
}

/** One stock movement, as the product route returns it. */
export interface ProductMovement {
  id: string;
  reason: string;
  delta: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  location_name: string;
  actor_name: string | null;
}

export interface ProductAnalyticsProps {
  salesData: ProductSalesData;
  movements: ProductMovement[];
  /** Current selling price, for the margin figure. */
  effectivePrice: number;
  /** Recorded cost, or null when there is none. */
  costPrice: number | null;
  /** Available stock, for days of cover. */
  available: number;
}

/** How each movement reason is worded. */
const REASON_LABEL: Record<string, string> = {
  initial_stock: 'Opening balance',
  sale: 'Sold',
  return_to_stock: 'Customer return',
  po_receipt: 'Received',
  transfer_in: 'Transferred in',
  transfer_out: 'Transferred out',
  cycle_count: 'Stock count',
  damage: 'Damaged',
  shrinkage: 'Missing',
  expiry: 'Expired',
  sample: 'Sample',
  write_off: 'Written off',
  correction: 'Correction',
  sync_correction: 'Reconciled with ShipStation'
};

/**
 * The performance panel for one product.
 *
 * @param props - {@link ProductAnalyticsProps}
 * @returns Sales figures, margin, and the stock movements behind them.
 */
export function ProductAnalytics({
  salesData,
  movements,
  effectivePrice,
  costPrice,
  available
}: ProductAnalyticsProps): React.ReactElement {
  const marginPercent =
    costPrice !== null && effectivePrice > 0
      ? Math.round(((effectivePrice - costPrice) / effectivePrice) * 1000) / 10
      : null;

  /* Ninety days rather than thirty: a month of data on a product that sells a few units a week is
   * mostly noise, and the reorder maths downstream uses the same window. */
  const dailyDemand = salesData.units_90d / 90;
  const daysOfCover = dailyDemand > 0 ? Math.round(available / dailyDemand) : null;

  return (
    <Stack gap="lg">
      <StatGrid>
        <StatCard
          label="Units sold"
          value={salesData.total_sales}
          meta={`${salesData.units_90d} in the last 90 days`}
        />
        <StatCard
          label="Revenue"
          value={salesData.total_revenue}
          format="currency"
          meta={`Across ${salesData.total_orders} order${salesData.total_orders === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Gross profit"
          value={salesData.gross_profit}
          format="currency"
          /* Against the cost recorded at the time of each sale, which order lines snapshot —
           * computing it against today's cost would restate history every time a price changed. */
          meta="Against cost at the time of sale"
        />
        <StatCard
          label="Margin"
          value={marginPercent === null ? 'Not known' : `${marginPercent.toFixed(1)}%`}
          format="raw"
          tone={marginPercent !== null && marginPercent < 20 ? 'warning' : 'neutral'}
          meta={
            marginPercent === null
              ? 'Record a cost to calculate it'
              : `${formatMoney(effectivePrice - (costPrice ?? 0))} per unit`
          }
        />
      </StatGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder p="md">
          <Stack gap="sm">
            <Title order={4} size="h5">
              Demand
            </Title>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Last 30 days
              </Text>
              <Text size="sm" fw={600}>
                {salesData.units_30d} units
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Last 90 days
              </Text>
              <Text size="sm" fw={600}>
                {salesData.units_90d} units
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Days of cover
              </Text>
              <Text size="sm" fw={600}>
                {/* Not "∞" and not a sentinel: no demand signal is a different fact from never
                    running out, and only one of them is a reason to do nothing. */}
                {daysOfCover === null ? 'No recent sales' : formatCover(daysOfCover)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Average selling price
              </Text>
              <Text size="sm" fw={600}>
                <Price value={salesData.avg_sale_price} />
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Last sold
              </Text>
              <Text size="sm" fw={600}>
                {salesData.last_sale_date
                  ? new Date(salesData.last_sale_date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })
                  : 'Never'}
              </Text>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="md">
          <Stack gap="sm">
            <Title order={4} size="h5">
              Recent stock movements
            </Title>
            {movements.length === 0 ? (
              <Text size="sm" c="dimmed">
                No stock movements recorded yet.
              </Text>
            ) : (
              <Table>
                <Table.Tbody>
                  {movements.slice(0, 8).map((movement) => (
                    <Table.Tr key={movement.id}>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {new Date(movement.created_at).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="sm">
                          {REASON_LABEL[movement.reason] ?? movement.reason}
                        </Badge>
                      </Table.Td>
                      <Table.Td className={table.numeric}>
                        <Text size="sm" fw={600}>
                          {movement.delta > 0 ? '+' : ''}
                          {movement.delta}
                        </Text>
                      </Table.Td>
                      <Table.Td className={table.numeric}>
                        <Text size="sm" c="dimmed">
                          {movement.balance_after}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      {/*
        * Said out loud rather than filled in with a plausible number. The platform records
        * pageviews but does not yet join them to a product, so there is no conversion rate to
        * show — and one invented for the shape of the panel is a figure a merchant would act on.
        */}
      <Alert icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          Storefront traffic — views, conversion rate and cart abandonment — is not yet measured per
          product, so it is not shown here. Everything above comes from your orders and your stock
          ledger.
        </Text>
      </Alert>
    </Stack>
  );
}

export default ProductAnalytics;

/**
 * Format an amount for the per-unit margin note.
 *
 * @param amount - A value in major units.
 * @returns The amount as currency.
 */
function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Days of cover in the unit a person reasons in, matching the inventory grid.
 *
 * A slow mover can have four thousand days of cover, which is true and carries no decision.
 *
 * @param days - Days of cover.
 * @returns A short label.
 */
function formatCover(days: number): string {
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  const years = days / 365;
  return years >= 5 ? 'over 5 years' : `${years.toFixed(1)} years`;
}
