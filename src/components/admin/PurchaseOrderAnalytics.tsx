'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  SimpleGrid,
  Text,
  Group,
  Stack,
  Progress,
  Badge,
  Table,
  ThemeIcon,
  rem,
  Loader,
  Select
} from '@mantine/core';
import {
  IconPackage,
  IconTruck,
  IconChartBar,
  IconCurrencyDollar
} from '@tabler/icons-react';

interface AnalyticsData {
  totalPOs: number;
  totalSpend: number;
  averageOrderValue: number;
  onTimeDeliveryRate: number;
  topSuppliers: Array<{
    name: string;
    orderCount: number;
    totalSpend: number;
    onTimeRate: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    orderCount: number;
    totalSpend: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
}

interface PurchaseOrderAnalyticsProps {
  purchaseOrders: Array<{
    id: string;
    status: string;
    total_cost: number;
    supplier_name?: string;
    supplier?: string;
    created_at?: string;
    order_date: string;
    expected_delivery?: string;
    actual_delivery?: string;
  }>;
}

export default function PurchaseOrderAnalytics({ purchaseOrders }: PurchaseOrderAnalyticsProps) {
  const [loading] = useState(false);
  const [timeRange, setTimeRange] = useState('30');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    calculateAnalytics();
  }, [purchaseOrders, timeRange]);

  const calculateAnalytics = () => {
    if (!purchaseOrders || purchaseOrders.length === 0) {
      setAnalytics(null);
      return;
    }

    // Filter by time range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
    
    const filteredPOs = purchaseOrders.filter(po => 
      new Date(po.created_at || po.order_date) >= cutoffDate
    );

    // Calculate basic metrics
    const totalPOs = filteredPOs.length;
    const totalSpend = filteredPOs.reduce((sum, po) => sum + (po.total_cost || 0), 0);
    const averageOrderValue = totalPOs > 0 ? totalSpend / totalPOs : 0;

    // Calculate on-time delivery rate
    const deliveredPOs = filteredPOs.filter(po => 
      po.status === 'delivered' && po.expected_delivery && po.actual_delivery
    );
    const onTimePOs = deliveredPOs.filter(po => 
      new Date(po.actual_delivery) <= new Date(po.expected_delivery)
    );
    const onTimeDeliveryRate = deliveredPOs.length > 0 ? 
      (onTimePOs.length / deliveredPOs.length) * 100 : 0;

    // Calculate supplier performance
    const supplierStats: Record<string, {
      name: string;
      orderCount: number;
      totalSpend: number;
      onTimeDeliveries: number;
      totalDeliveries: number;
    }> = {};
    filteredPOs.forEach(po => {
      const supplier = po.supplier_name || po.supplier || 'Unknown';
      if (!supplierStats[supplier]) {
        supplierStats[supplier] = {
          name: supplier,
          orderCount: 0,
          totalSpend: 0,
          onTimeDeliveries: 0,
          totalDeliveries: 0
        };
      }
      
      supplierStats[supplier].orderCount++;
      supplierStats[supplier].totalSpend += po.total_cost || 0;
      
      if (po.status === 'delivered' && po.expected_delivery && po.actual_delivery) {
        supplierStats[supplier].totalDeliveries++;
        if (new Date(po.actual_delivery) <= new Date(po.expected_delivery)) {
          supplierStats[supplier].onTimeDeliveries++;
        }
      }
    });

    const topSuppliers = Object.values(supplierStats)
      .map((supplier) => ({
        ...supplier,
        onTimeRate: supplier.totalDeliveries > 0 ? 
          (supplier.onTimeDeliveries / supplier.totalDeliveries) * 100 : 0
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    // Calculate status breakdown
    const statusCounts: Record<string, number> = {};
    filteredPOs.forEach(po => {
      const status = po.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: (count / totalPOs) * 100
    }));

    // Calculate monthly trends (simplified)
    const monthlyTrends = getMonthlyTrends(filteredPOs);

    setAnalytics({
      totalPOs,
      totalSpend,
      averageOrderValue,
      onTimeDeliveryRate,
      topSuppliers,
      monthlyTrends,
      statusBreakdown
    });
  };

  const getMonthlyTrends = (pos: Array<{ created_at?: string; order_date: string; total_cost: number }>) => {
    const monthly: Record<string, { orderCount: number; totalSpend: number }> = {};
    
    pos.forEach(po => {
      const date = new Date(po.created_at || po.order_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthly[monthKey]) {
        monthly[monthKey] = { orderCount: 0, totalSpend: 0 };
      }
      
      monthly[monthKey].orderCount++;
      monthly[monthKey].totalSpend += po.total_cost || 0;
    });

    return Object.entries(monthly)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Last 6 months
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'yellow';
      case 'approved': return 'blue';
      case 'shipped': return 'cyan';
      case 'delivered': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  if (loading) {
    return (
      <Card withBorder>
        <Group>
          <Loader size="sm" />
          <Text>Loading analytics...</Text>
        </Group>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card withBorder>
        <Text c="dimmed">No purchase order data available for analysis.</Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {/* Time Range Selector */}
      <Group justify="space-between">
        <Text fw={500} size="lg">Purchase Order Analytics</Text>
        <Select
          value={timeRange}
          onChange={(value) => setTimeRange(value || '30')}
          data={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
            { value: '365', label: 'Last year' }
          ]}
          style={{ width: 150 }}
        />
      </Group>

      {/* Key Metrics */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Card withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Total Purchase Orders</Text>
              <Text size="xl" fw={700}>{analytics.totalPOs}</Text>
            </div>
            <ThemeIcon color="blue" variant="light" size="lg">
              <IconPackage style={{ width: rem(20), height: rem(20) }} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Total Spend</Text>
              <Text size="xl" fw={700}>${analytics.totalSpend.toLocaleString()}</Text>
            </div>
            <ThemeIcon color="green" variant="light" size="lg">
              <IconCurrencyDollar style={{ width: rem(20), height: rem(20) }} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Average Order Value</Text>
              <Text size="xl" fw={700}>${analytics.averageOrderValue.toLocaleString()}</Text>
            </div>
            <ThemeIcon color="cyan" variant="light" size="lg">
              <IconChartBar style={{ width: rem(20), height: rem(20) }} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">On-Time Delivery</Text>
              <Text size="xl" fw={700}>{analytics.onTimeDeliveryRate.toFixed(1)}%</Text>
            </div>
            <ThemeIcon color={analytics.onTimeDeliveryRate >= 90 ? 'green' : 'orange'} variant="light" size="lg">
              <IconTruck style={{ width: rem(20), height: rem(20) }} />
            </ThemeIcon>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Status Breakdown */}
      <Card withBorder>
        <Text fw={500} mb="md">Order Status Breakdown</Text>
        <Stack gap="xs">
          {analytics.statusBreakdown.map((status) => (
            <Group key={status.status} justify="space-between">
              <Group gap="xs">
                <Badge color={getStatusColor(status.status)} variant="light">
                  {status.status}
                </Badge>
                <Text size="sm">{status.count} orders</Text>
              </Group>
              <Group gap="xs">
                <Progress 
                  value={status.percentage} 
                  style={{ width: 100 }}
                  color={getStatusColor(status.status)}
                />
                <Text size="sm">{status.percentage.toFixed(1)}%</Text>
              </Group>
            </Group>
          ))}
        </Stack>
      </Card>

      {/* Top Suppliers */}
      <Card withBorder>
        <Text fw={500} mb="md">Top Suppliers</Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Supplier</Table.Th>
              <Table.Th>Orders</Table.Th>
              <Table.Th>Total Spend</Table.Th>
              <Table.Th>On-Time Rate</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {analytics.topSuppliers.map((supplier, index) => (
              <Table.Tr key={index}>
                <Table.Td>
                  <Text fw={500}>{supplier.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Text>{supplier.orderCount}</Text>
                </Table.Td>
                <Table.Td>
                  <Text>${supplier.totalSpend.toLocaleString()}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge 
                    color={supplier.onTimeRate >= 90 ? 'green' : supplier.onTimeRate >= 75 ? 'yellow' : 'red'}
                    variant="light"
                  >
                    {supplier.onTimeRate.toFixed(1)}%
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Monthly Trends */}
      {analytics.monthlyTrends.length > 1 && (
        <Card withBorder>
          <Text fw={500} mb="md">Monthly Trends</Text>
          <Stack gap="xs">
            {analytics.monthlyTrends.map((trend) => (
              <Group key={trend.month} justify="space-between">
                <Text size="sm">{trend.month}</Text>
                <Group gap="md">
                  <Text size="sm">{trend.orderCount} orders</Text>
                  <Text size="sm" fw={500}>${trend.totalSpend.toLocaleString()}</Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}