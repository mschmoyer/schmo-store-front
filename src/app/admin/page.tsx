'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArticle,
  IconCheck,
  IconCurrencyDollar,
  IconEye,
  IconLock,
  IconPlug,
  IconShoppingCart,
  IconTrendingUp,
  IconTruckDelivery,
  IconUsers,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { AdminDashboardStats } from '@/lib/types/admin';
import { notifications } from '@mantine/notifications';
import { EmptyState, Price, ProductImage } from '@/components/ui';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { PanelSkeleton, StatGridSkeleton } from '@/components/admin/AdminSkeletons';
import { CouponNotices } from '@/components/admin/CouponNotices';
import styles from './dashboard.module.css';

interface Product {
  name: string;
  base_price: number;
  stock_quantity: number;
  featured_image_url: string | null;
  sales_count?: number;
  gross_profit?: number | string;
}

interface ProfitPeriod {
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  orderCount: number;
  units: number;
}

interface DashboardData {
  stats: AdminDashboardStats & {
    store: {
      name: string;
      isPublic: boolean;
      createdAt: string;
    };
    siteVisitors: number;
    siteVisitorsAllTime: number;
    lowStockCount: number;
    outOfStockCount: number;
    revenue: {
      totalRevenue: number;
      monthlyRevenue: number;
      totalOrders: number;
      monthlyOrders: number;
    };
    profit: {
      windowDays: number;
      allTime: ProfitPeriod;
      window: ProfitPeriod;
      prior: ProfitPeriod;
      delta: {
        revenue: number | null;
        grossProfit: number | null;
        marginPoints: number | null;
        orderCount: number | null;
      };
    };
    orders: {
      unshippedCount: number;
      unshippedValue: number;
      ageingCount: number;
      ageingValue: number;
      oldestUnshippedDays: number;
      ageingThresholdDays: number;
    };
  };
  recentActivity: unknown[];
  topProducts: Product[];
  lowStockProducts: Product[];
}

const ICON = { size: 18, stroke: 1.6 } as const;

/** Pluralises a count into "1 order" / "3 orders". */
const orders = (count: number) => `${count.toLocaleString('en-US')} ${count === 1 ? 'order' : 'orders'}`;

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/**
 * Renders a period-over-period change as a signed percentage.
 *
 * A number with nothing to compare it to cannot tell you whether the month was
 * good, which is why every headline figure on this page now carries one. When
 * the prior period was zero the API sends `null` rather than an infinity
 * dressed up as `+100%`, and this renders the honest version of that.
 *
 * @param delta - Percentage change, or `null` when there is no baseline.
 * @param label - What the comparison is against.
 * @returns The meta line for a stat card.
 */
function deltaLine(delta: number | null, label: string): string {
  if (delta === null) return `No ${label} to compare against`;
  const sign = delta >= 0 ? '+' : '−';
  return `${sign}${Math.abs(delta).toFixed(1)}% vs ${label}`;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const router = useRouter();

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/dashboard', { credentials: 'include' });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to load dashboard data');
        }
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      setError('An error occurred while loading dashboard data');
      console.error('Dashboard data error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleVisibilityToggle = async () => {
    if (!data) return;

    setUpdatingVisibility(true);
    try {
      const response = await fetch('/api/admin/store/visibility', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPublic: !data.stats.store.isPublic }),
      });

      const result = await response.json();
      if (result.success) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                stats: {
                  ...prev.stats,
                  store: { ...prev.stats.store, isPublic: result.data.isPublic },
                },
              }
            : null
        );

        notifications.show({
          title: 'Store visibility updated',
          message: result.data.message,
          color: 'green',
          icon: <IconCheck size="1rem" />,
        });
      } else {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to update store visibility',
          color: 'red',
          icon: <IconX size="1rem" />,
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'An error occurred while updating store visibility',
        color: 'red',
        icon: <IconX size="1rem" />,
      });
    } finally {
      setUpdatingVisibility(false);
      setVisibilityModalOpen(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <Stack gap="lg">
        <AdminPageHeader title="Dashboard" description="Loading your store's numbers." />
        <StatGridSkeleton count={6} />
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <PanelSkeleton label="Loading top products" />
          <PanelSkeleton label="Loading stock alerts" />
        </SimpleGrid>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="lg">
        <AdminPageHeader title="Dashboard" />
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="We couldn’t load your numbers">
          {error}
        </Alert>
        <div>
          <Button onClick={() => { setLoading(true); setError(null); fetchDashboardData(); }}>
            Try again
          </Button>
        </div>
      </Stack>
    );
  }

  if (!data) {
    return (
      <Stack gap="lg">
        <AdminPageHeader title="Dashboard" />
        <EmptyState
          title="Nothing to report yet"
          description="Once your catalog syncs and your first order lands, this screen fills with revenue, stock and traffic."
          action={<Button onClick={() => router.push('/admin/integrations')}>Connect ShipStation</Button>}
        />
      </Stack>
    );
  }

  const { stats } = data;

  const productVisibilityProgress =
    stats.totalProducts > 0 ? (stats.visibleProducts / stats.totalProducts) * 100 : 0;
  const blogPublishedProgress =
    stats.totalBlogPosts > 0 ? (stats.publishedBlogPosts / stats.totalBlogPosts) * 100 : 0;

  const gettingStarted = [
    { done: stats.integrations.shipstation, label: 'Connect ShipStation' },
    { done: stats.integrations.stripe, label: 'Set up Stripe payments' },
    { done: stats.totalProducts > 0, label: 'Add products to your store' },
    { done: stats.publishedBlogPosts > 0, label: 'Publish your first post' },
    { done: stats.store.isPublic, label: 'Make the store public' },
  ];

  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Dashboard"
        description={`${stats.store.name} — revenue, stock and traffic at a glance.`}
        actions={
          <div className={styles.visibility}>
            <div>
              <Text size="sm" fw={600}>
                {stats.store.isPublic ? 'Public store' : 'Private store'}
              </Text>
              <Text size="xs" c="dimmed">
                {stats.store.isPublic ? 'Visible to everyone' : 'Only you can view it'}
              </Text>
            </div>
            <Switch
              checked={stats.store.isPublic}
              onChange={() => setVisibilityModalOpen(true)}
              aria-label="Store visibility"
            />
          </div>
        }
      />

      {/*
       * PHASE 7: THE COUPON ALERT LADDER (`docs/plans/platform-coupons.md` §5, §4D).
       *
       * Self-fetching and self-deciding: `CouponNotices` reads `GET /api/billing/coupon/notice`
       * and renders whichever of the two clocks applies (§5.1's "Two clocks, not one") — a
       * reservation banner, a free-window alert, or nothing when there is no live claim. Placed
       * above the ageing-orders alert because a lapsing no-card offer is the one thing on this
       * page that can silently cost the merchant their whole storefront's billing, not just a
       * shipment.
       */}
      <CouponNotices />

      <Modal
        opened={visibilityModalOpen}
        onClose={() => setVisibilityModalOpen(false)}
        title="Change store visibility"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to make your store{' '}
            <Text span fw={600}>
              {stats.store.isPublic ? 'private' : 'public'}
            </Text>
            ?
          </Text>

          <Alert
            icon={stats.store.isPublic ? <IconLock size="1rem" /> : <IconWorld size="1rem" />}
            color={stats.store.isPublic ? 'orange' : 'green'}
          >
            {stats.store.isPublic
              ? 'A private store is hidden from shoppers. Only you can reach it.'
              : 'A public store is visible to everyone on the internet.'}
          </Alert>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setVisibilityModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={updatingVisibility} onClick={handleVisibilityToggle}>
              {stats.store.isPublic ? 'Make private' : 'Make public'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/*
       * THE REVENUE CARD BUG.
       *
       * This card used to read "Total Revenue / 874" with "$873.98" beside it,
       * as if a store had both 874 of something and $873.98 of something else.
       * It was one number rendered twice: `DashboardCard` typed `value` as
       * `number` and set it as the headline, so the caller passed
       * `Math.round(totalRevenue)` to make it fit, then smuggled the true
       * figure into `subtitle` as `$${totalRevenue.toLocaleString()}`. The
       * rounding was a workaround for a type that could not carry a currency
       * string, and the workaround became a second, wrong figure sitting next
       * to the right one.
       *
       * `StatCard` takes the amount in major units and formats it once, through
       * `Price`. There is no second copy of the number to disagree with, and
       * `format="currency"` means no caller has to reach for `Math.round` to
       * make money fit a number-shaped hole again.
       */}
      {/*
       * WHAT IS STUCK.
       *
       * Placed above the tiles because it is the only thing on this page that
       * is losing the merchant a customer right now. The number existed in the
       * database the whole time; the closest the admin came to showing it was
       * an Inventory tile reading "Pending orders / 5 / Awaiting delivery",
       * which a merchant reads as five restocks arriving, not as five people
       * who have been waiting two months for something they paid for.
       */}
      {stats.orders.ageingCount > 0 ? (
        <Alert
          icon={<IconAlertTriangle size="1rem" />}
          color="red"
          variant="light"
          title={`${stats.orders.ageingCount} order${stats.orders.ageingCount === 1 ? '' : 's'} unshipped for more than ${stats.orders.ageingThresholdDays} days`}
        >
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text size="sm">
              {money(stats.orders.ageingValue)} is paid for and has not left the building. The
              oldest has been waiting <strong>{stats.orders.oldestUnshippedDays} days</strong>.
            </Text>
            <Button size="xs" onClick={() => router.push('/admin/orders?status=unshipped')}>
              Open orders
            </Button>
          </Group>
        </Alert>
      ) : null}

      {/*
       * THE PROFIT ROW.
       *
       * "Track your profits" was not a true claim: the word *profit* appeared
       * in exactly one place in the whole admin, on the valuation report, where
       * it meant unrealised spread on unsold stock and divided by the wrong
       * denominator. Everything needed was already in the database —
       * `cost_price` on all 36 products, `unit_price` on every line — and is
       * now four tiles.
       *
       * Each carries a prior-period comparison because a number with no
       * comparison cannot answer "was this a good month".
       */}
      <StatGrid min={172}>
        <StatCard
          label={`Revenue, last ${stats.profit.windowDays} days`}
          value={stats.profit.window.revenue}
          format="currency"
          meta={deltaLine(stats.profit.delta.revenue, `prior ${stats.profit.windowDays} days`)}
          icon={<IconCurrencyDollar {...ICON} />}
          href="/admin/orders"
        />
        <StatCard
          label={`Gross profit, last ${stats.profit.windowDays} days`}
          value={stats.profit.window.grossProfit}
          format="currency"
          meta={`${money(stats.profit.window.cogs)} cost of goods`}
          tone={stats.profit.window.grossProfit > 0 ? 'signal' : 'neutral'}
          icon={<IconTrendingUp {...ICON} />}
        />
        <StatCard
          label="Gross margin"
          value={`${stats.profit.window.marginPct.toFixed(1)}%`}
          format="raw"
          meta={
            stats.profit.delta.marginPoints === null
              ? 'Share of revenue kept after cost of goods'
              : `${stats.profit.delta.marginPoints >= 0 ? '+' : '−'}${Math.abs(stats.profit.delta.marginPoints).toFixed(1)} points vs prior period`
          }
        />
        <StatCard
          label="Needs shipping"
          value={stats.orders.unshippedCount}
          meta={`${money(stats.orders.unshippedValue)} paid, nothing dispatched`}
          tone={stats.orders.ageingCount > 0 ? 'danger' : stats.orders.unshippedCount > 0 ? 'warning' : 'neutral'}
          icon={<IconTruckDelivery {...ICON} />}
          href="/admin/orders?status=unshipped"
        />
      </StatGrid>

      <StatGrid min={172}>
        <StatCard
          label="Booked revenue, all time"
          value={stats.revenue.totalRevenue}
          format="currency"
          meta={`${orders(stats.revenue.totalOrders)}, cancellations excluded`}
        />
        <StatCard
          label="Gross profit, all time"
          value={stats.profit.allTime.grossProfit}
          format="currency"
          meta={`${stats.profit.allTime.marginPct.toFixed(1)}% margin on ${money(stats.profit.allTime.revenue)} of goods`}
        />
        <StatCard
          label="Site visitors"
          value={stats.siteVisitors}
          meta={`Last ${stats.profit.windowDays} days · ${stats.siteVisitorsAllTime.toLocaleString('en-US')} all time`}
          icon={<IconUsers {...ICON} />}
        />
        <StatCard
          label="Products"
          value={stats.totalProducts}
          meta={`${stats.visibleProducts} visible in the store`}
          progress={productVisibilityProgress}
          icon={<IconShoppingCart {...ICON} />}
          href="/admin/products"
        />
        <StatCard
          label="Low stock"
          value={stats.lowStockCount}
          /* Tone tracks the number, not the card's position in the row. */
          tone={stats.lowStockCount > 0 ? 'warning' : 'neutral'}
          meta={
            stats.outOfStockCount > 0
              ? `Below their reorder point · ${stats.outOfStockCount} out of stock`
              : stats.lowStockCount > 0
                ? 'Below their reorder point'
                : 'Everything is above its reorder point'
          }
          icon={<IconAlertTriangle {...ICON} />}
          href="/admin/inventory"
        />
        <StatCard
          label="Blog posts"
          value={stats.totalBlogPosts}
          meta={`${stats.publishedBlogPosts} published`}
          progress={blogPublishedProgress}
          icon={<IconArticle {...ICON} />}
          href="/admin/blog"
        />
      </StatGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card padding="lg">
            <Title order={3} mb="md" fz="1.125rem">
              Top products
            </Title>

            {data.topProducts.length > 0 ? (
              <Table.ScrollContainer minWidth={420}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th className={styles.numeric}>Sold</Table.Th>
                      {/* Best-selling and most-profitable are different lists,
                          and the merchant needs to see both in one glance. */}
                      <Table.Th className={styles.numeric}>Gross profit</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.topProducts.map((product, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            <ProductImage
                              src={product.featured_image_url}
                              name={product.name}
                              alt=""
                              rounded="sm"
                              className={styles.thumb}
                            />
                            <Text size="sm" fw={500} lineClamp={1}>
                              {product.name}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td className={styles.numeric}>{product.sales_count || 0}</Table.Td>
                        <Table.Td className={styles.numeric}>
                          <Price value={Number(product.gross_profit ?? 0)} size="sm" />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <EmptyState
                compact
                titleAs="p"
                title="No sales yet"
                description="Your best sellers appear here once orders start arriving."
              />
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card padding="lg">
            <Title order={3} mb="md" fz="1.125rem">
              Low stock
            </Title>

            {data.lowStockProducts.length > 0 ? (
              <>
                {/* Reads out the same split as the tile. Saying "3 products
                    running low" beside a tile reading 2 is the kind of
                    two-numbers-for-one-thing this pass is removing. */}
                <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" mb="md">
                  {stats.outOfStockCount > 0
                    ? `${stats.outOfStockCount} out of stock, ${stats.lowStockCount} below their reorder point.`
                    : `${stats.lowStockCount} product${stats.lowStockCount === 1 ? '' : 's'} below the reorder point.`}
                </Alert>
                <Table.ScrollContainer minWidth={380}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Product</Table.Th>
                        <Table.Th className={styles.numeric}>Price</Table.Th>
                        <Table.Th className={styles.numeric}>Stock</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.lowStockProducts.map((product, index) => (
                        <Table.Tr key={index}>
                          <Table.Td>
                            <Group gap="sm" wrap="nowrap">
                              <ProductImage
                                src={product.featured_image_url}
                                name={product.name}
                                alt=""
                                rounded="sm"
                                className={styles.thumb}
                              />
                              <Text size="sm" fw={500} lineClamp={1}>
                                {product.name}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td className={styles.numeric}>
                            <Price value={Number(product.base_price)} size="sm" />
                          </Table.Td>
                          <Table.Td className={styles.numeric}>
                            {/* §7: colour is never the sole signal — the badge
                                carries the words too. */}
                            <Badge color={product.stock_quantity === 0 ? 'red' : 'orange'}>
                              {product.stock_quantity === 0
                                ? 'Out of stock'
                                : `${product.stock_quantity} left`}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </>
            ) : (
              <EmptyState
                compact
                titleAs="p"
                title="Everything is stocked"
                description="Nothing has fallen below its reorder point."
              />
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Card padding="lg">
        <Title order={3} mb="md" fz="1.125rem">
          Integrations
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {[
            {
              name: 'ShipStation',
              detail: 'Products and inventory',
              active: stats.integrations.shipstation,
            },
            { name: 'Stripe', detail: 'Payment processing', active: stats.integrations.stripe },
          ].map((integration) => (
            <Group key={integration.name} justify="space-between" className={styles.well}>
              <Group gap="sm" wrap="nowrap">
                <IconPlug {...ICON} className={styles.wellIcon} />
                <div>
                  <Text fw={600} size="sm">
                    {integration.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {integration.detail}
                  </Text>
                </div>
              </Group>
              <Badge
                color={integration.active ? 'green' : 'gray'}
                leftSection={
                  integration.active ? <IconCheck size={12} /> : <IconX size={12} />
                }
              >
                {integration.active ? 'Connected' : 'Not connected'}
              </Badge>
            </Group>
          ))}
        </SimpleGrid>
      </Card>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card padding="lg">
            <Title order={3} mb="md" fz="1.125rem">
              Quick actions
            </Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {[
                {
                  icon: <IconShoppingCart {...ICON} />,
                  title: 'Manage products',
                  detail: 'Edit descriptions and set discounts',
                  href: '/admin/products',
                },
                {
                  icon: <IconArticle {...ICON} />,
                  title: 'Write a blog post',
                  detail: 'Create new content for your store',
                  href: '/admin/blog/create',
                },
                {
                  icon: <IconEye {...ICON} />,
                  title: 'Customise design',
                  detail: 'Change the theme and storefront layout',
                  href: '/admin/design',
                },
                {
                  icon: <IconPlug {...ICON} />,
                  title: 'Set up integrations',
                  detail: 'Connect ShipStation and Stripe',
                  href: '/admin/integrations',
                },
              ].map((action) => (
                <button
                  key={action.href}
                  type="button"
                  className={styles.action}
                  onClick={() => router.push(action.href)}
                >
                  <span className={styles.actionIcon} aria-hidden="true">
                    {action.icon}
                  </span>
                  <span>
                    <span className={styles.actionTitle}>{action.title}</span>
                    <span className={styles.actionDetail}>{action.detail}</span>
                  </span>
                </button>
              ))}
            </SimpleGrid>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card padding="lg">
            <Title order={3} mb="md" fz="1.125rem">
              Getting started
            </Title>
            <ul className={styles.checklist}>
              {gettingStarted.map((step) => (
                <li key={step.label} className={styles.checkRow} data-done={step.done || undefined}>
                  <span className={styles.checkMark} aria-hidden="true">
                    {step.done ? <IconCheck size={13} stroke={2.4} /> : null}
                  </span>
                  <span className={styles.checkLabel}>{step.label}</span>
                  <span className={styles.checkState}>{step.done ? 'Done' : 'To do'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
