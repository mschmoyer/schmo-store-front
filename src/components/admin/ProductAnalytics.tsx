'use client';

import { useState } from 'react';
import {
  Box,
  Stack,
  Group,
  Text,
  Card,
  SimpleGrid,
  Progress,
  Badge,
  Timeline,
  Tooltip,
  Select,
  Skeleton,
  Center,
  ActionIcon,
  Alert
} from '@mantine/core';
import {
  IconTrendingUp,
  IconEye,
  IconShoppingCart,
  IconCurrencyDollar,
  IconPackage,
  IconRefresh,
  IconAlertCircle
} from '@tabler/icons-react';

interface SalesData {
  total_sales: number;
  total_revenue: number;
  total_orders: number;
  avg_sale_price: number;
  first_sale_date?: Date;
  last_sale_date?: Date;
}

interface ProductAnalyticsData {
  views: number;
  cart_adds: number;
  cart_abandons: number;
  conversion_rate: number;
  bounce_rate: number;
  avg_time_on_page: number;
}

interface InventoryChange {
  change_type: string;
  quantity_change: number;
  quantity_after: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_at: Date;
}

interface ProductAnalyticsProps {
  productId: string;
  salesData: SalesData;
  analytics: ProductAnalyticsData;
  inventoryHistory: InventoryChange[];
  needsAttention: string[];
  loading?: boolean;
}

/**
 * Product Analytics Component
 * 
 * Displays comprehensive analytics for a product including:
 * - Sales performance metrics
 * - Inventory history and changes
 * - Customer behavior analytics
 * - Performance indicators and alerts
 * 
 * @param props - ProductAnalyticsProps
 * @returns JSX.Element
 */
export default function ProductAnalytics({
  salesData,
  analytics,
  inventoryHistory,
  needsAttention,
  loading = false
}: ProductAnalyticsProps) {
  const [timeRange, setTimeRange] = useState('30d');
  const [refreshing, setRefreshing] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  // Utility functions for future use
  // const getChangeIcon = (change: number) => {
  //   if (change > 0) return <IconArrowUpRight size={16} color="green" />;
  //   if (change < 0) return <IconArrowDownRight size={16} color="red" />;
  //   return null;
  // };

  // const getChangeColor = (change: number) => {
  //   if (change > 0) return 'green';
  //   if (change < 0) return 'red';
  //   return 'gray';
  // };

  const getInventoryChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'restock':
        return <IconPackage size={16} color="green" />;
      case 'sale':
        return <IconShoppingCart size={16} color="blue" />;
      case 'adjustment':
        return <IconRefresh size={16} color="orange" />;
      case 'return':
        return <IconTrendingUp size={16} color="teal" />;
      default:
        return <IconPackage size={16} color="gray" />;
    }
  };

  const getInventoryChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'restock':
        return 'green';
      case 'sale':
        return 'blue';
      case 'adjustment':
        return 'orange';
      case 'return':
        return 'teal';
      default:
        return 'gray';
    }
  };

  const refreshAnalytics = async () => {
    setRefreshing(true);
    // In a real app, this would make an API call to refresh the data
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={200} />
        <Skeleton height={300} />
        <Skeleton height={250} />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Box>
          <Text size="lg" fw={600}>Performance Analytics</Text>
          <Text size="sm" c="dimmed">
            Sales and engagement metrics for the last {timeRange}
          </Text>
        </Box>
        <Group>
          <Select
            value={timeRange}
            onChange={(value) => setTimeRange(value || '30d')}
            data={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: '1y', label: 'Last year' }
            ]}
            size="sm"
          />
          <Tooltip label="Refresh data">
            <ActionIcon
              variant="light"
              loading={refreshing}
              onClick={refreshAnalytics}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Attention Alerts */}
      {needsAttention.length > 0 && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Needs Attention"
          color="orange"
          variant="light"
        >
          <Stack gap="xs">
            {needsAttention.map((issue, index) => (
              <Text key={index} size="sm">
                • {issue.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Sales Performance Cards */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total Sales
              </Text>
              <Text fw={700} size="xl">
                {salesData.total_sales}
              </Text>
              <Text size="xs" c="dimmed">
                {salesData.total_orders} orders
              </Text>
            </Box>
            <IconShoppingCart size={32} color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Revenue
              </Text>
              <Text fw={700} size="xl">
                {formatCurrency(salesData.total_revenue)}
              </Text>
              <Text size="xs" c="dimmed">
                Avg: {formatCurrency(salesData.avg_sale_price)}
              </Text>
            </Box>
            <IconCurrencyDollar size={32} color="var(--mantine-color-green-6)" />
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Page Views
              </Text>
              <Text fw={700} size="xl">
                {analytics.views}
              </Text>
              <Text size="xs" c="dimmed">
                Avg time: {Math.round(analytics.avg_time_on_page / 60)}min
              </Text>
            </Box>
            <IconEye size={32} color="var(--mantine-color-purple-6)" />
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Conversion Rate
              </Text>
              <Text fw={700} size="xl">
                {(analytics.conversion_rate * 100).toFixed(1)}%
              </Text>
              <Text size="xs" c="dimmed">
                {analytics.cart_adds} cart adds
              </Text>
            </Box>
            <IconTrendingUp size={32} color="var(--mantine-color-teal-6)" />
          </Group>
        </Card>
      </SimpleGrid>

      {/* Performance Indicators */}
      <Card withBorder p="md">
        <Text size="md" fw={600} mb="md">Performance Indicators</Text>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm">Conversion Rate</Text>
              <Text size="sm" fw={500}>
                {(analytics.conversion_rate * 100).toFixed(1)}%
              </Text>
            </Group>
            <Progress
              value={analytics.conversion_rate * 100}
              color={analytics.conversion_rate > 0.02 ? 'green' : analytics.conversion_rate > 0.01 ? 'orange' : 'red'}
              size="md"
            />
            <Text size="xs" c="dimmed" mt="xs">
              {analytics.conversion_rate > 0.02 ? 'Excellent' : analytics.conversion_rate > 0.01 ? 'Good' : 'Needs improvement'}
            </Text>
          </Box>

          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm">Cart Abandonment</Text>
              <Text size="sm" fw={500}>
                {((analytics.cart_abandons / (analytics.cart_adds + analytics.cart_abandons)) * 100).toFixed(1)}%
              </Text>
            </Group>
            <Progress
              value={(analytics.cart_abandons / (analytics.cart_adds + analytics.cart_abandons)) * 100}
              color="red"
              size="md"
            />
            <Text size="xs" c="dimmed" mt="xs">
              {analytics.cart_abandons} abandoned carts
            </Text>
          </Box>

          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm">Bounce Rate</Text>
              <Text size="sm" fw={500}>
                {(analytics.bounce_rate * 100).toFixed(1)}%
              </Text>
            </Group>
            <Progress
              value={analytics.bounce_rate * 100}
              color={analytics.bounce_rate < 0.5 ? 'green' : analytics.bounce_rate < 0.7 ? 'orange' : 'red'}
              size="md"
            />
            <Text size="xs" c="dimmed" mt="xs">
              {analytics.bounce_rate < 0.5 ? 'Low' : analytics.bounce_rate < 0.7 ? 'Moderate' : 'High'}
            </Text>
          </Box>
        </SimpleGrid>
      </Card>

      {/* Sales Timeline */}
      <Card withBorder p="md">
        <Text size="md" fw={600} mb="md">Sales Timeline</Text>
        <Group justify="space-between" mb="md">
          <Text size="sm" c="dimmed">
            First Sale: {formatDate(salesData.first_sale_date)}
          </Text>
          <Text size="sm" c="dimmed">
            Last Sale: {formatDate(salesData.last_sale_date)}
          </Text>
        </Group>
        <Box style={{ height: 100, backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
          <Center h={100}>
            <Text size="sm" c="dimmed">
              Sales chart visualization would go here
            </Text>
          </Center>
        </Box>
      </Card>

      {/* Inventory History */}
      <Card withBorder p="md">
        <Text size="md" fw={600} mb="md">Recent Inventory Changes</Text>
        {inventoryHistory.length > 0 ? (
          <Timeline active={inventoryHistory.length - 1} bulletSize={20} lineWidth={2}>
            {inventoryHistory.slice(0, 10).map((change, index) => (
              <Timeline.Item
                key={index}
                bullet={getInventoryChangeIcon(change.change_type)}
                title={
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {change.change_type.charAt(0).toUpperCase() + change.change_type.slice(1)}
                    </Text>
                    <Badge
                      size="xs"
                      color={getInventoryChangeColor(change.change_type)}
                      variant="light"
                    >
                      {change.quantity_change > 0 ? '+' : ''}{change.quantity_change}
                    </Badge>
                  </Group>
                }
              >
                <Text size="xs" c="dimmed">
                  Quantity after: {change.quantity_after}
                </Text>
                {change.notes && (
                  <Text size="xs" c="dimmed" mt="xs">
                    {change.notes}
                  </Text>
                )}
                <Text size="xs" c="dimmed" mt="xs">
                  {formatDate(change.created_at)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        ) : (
          <Text size="sm" c="dimmed">
            No inventory changes recorded yet
          </Text>
        )}
      </Card>
    </Stack>
  );
}