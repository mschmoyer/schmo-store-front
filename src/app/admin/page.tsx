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
import styles from './dashboard.module.css';

interface Product {
  name: string;
  base_price: number;
  stock_quantity: number;
  featured_image_url: string | null;
  sales_count?: number;
}

interface DashboardData {
  stats: AdminDashboardStats & {
    store: {
      name: string;
      isPublic: boolean;
      createdAt: string;
    };
    siteVisitors: number;
    lowStockCount: number;
    revenue: {
      totalRevenue: number;
      monthlyRevenue: number;
      totalOrders: number;
      monthlyOrders: number;
    };
  };
  recentActivity: unknown[];
  topProducts: Product[];
  lowStockProducts: Product[];
}

const ICON = { size: 18, stroke: 1.6 } as const;

/** Pluralises a count into "1 order" / "3 orders". */
const orders = (count: number) => `${count.toLocaleString('en-US')} ${count === 1 ? 'order' : 'orders'}`;

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const router = useRouter();

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

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
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/store/visibility', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
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
      <StatGrid min={172}>
        <StatCard
          label="Total revenue"
          value={stats.revenue.totalRevenue}
          format="currency"
          meta={`${orders(stats.revenue.totalOrders)} all time`}
          icon={<IconCurrencyDollar {...ICON} />}
        />
        <StatCard
          label="Revenue this month"
          value={stats.revenue.monthlyRevenue}
          format="currency"
          meta={`${orders(stats.revenue.monthlyOrders)} this month`}
          icon={<IconTrendingUp {...ICON} />}
        />
        <StatCard
          label="Site visitors"
          value={stats.siteVisitors}
          meta="This month"
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
          meta={stats.lowStockCount > 0 ? 'Products need restocking' : 'Everything is stocked'}
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
              <Table.ScrollContainer minWidth={380}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th className={styles.numeric}>Price</Table.Th>
                      <Table.Th className={styles.numeric}>Sold</Table.Th>
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
                        <Table.Td className={styles.numeric}>
                          <Price value={Number(product.base_price)} size="sm" />
                        </Table.Td>
                        <Table.Td className={styles.numeric}>{product.sales_count || 0}</Table.Td>
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
                <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" mb="md">
                  {data.lowStockProducts.length} product
                  {data.lowStockProducts.length === 1 ? '' : 's'} running low.
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
