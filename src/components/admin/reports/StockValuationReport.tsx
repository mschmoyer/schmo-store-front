'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Title,
  Group,
  Button,
  Stack,
  Text,
  Badge,
  Table,
  LoadingOverlay,
  Alert,
  ActionIcon,
  Tooltip,
  SimpleGrid,
  ThemeIcon,
  SegmentedControl,
  ScrollArea,
  Box,
  Switch,
  NumberFormatter,
  Paper
} from '@mantine/core';
import { useAdmin } from '@/contexts/AdminContext';
import { DatePickerInput } from '@mantine/dates';
import {
  IconTrendingUp,
  IconDownload,
  IconRefresh,
  IconAlertCircle,
  IconPackage,
  IconCurrencyDollar,
  IconChartPie,
  IconArrowUpRight,
  IconArrowDownRight,
  IconEqual
} from '@tabler/icons-react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  ChartOptions,
  ArcElement
} from 'chart.js';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  ArcElement
);

interface ValuationSummary {
  total_cost_value: number;
  total_retail_value: number;
  total_quantity: number;
  total_products: number;
  average_margin_percentage: number;
  total_potential_profit: number;
}

interface CategoryBreakdown {
  category: string;
  cost_value: number;
  retail_value: number;
  quantity: number;
  product_count: number;
  margin_percentage: number;
}

interface SupplierBreakdown {
  supplier_id: string;
  supplier_name: string;
  cost_value: number;
  retail_value: number;
  quantity: number;
  product_count: number;
  margin_percentage: number;
}

interface WarehouseBreakdown {
  warehouse_id: string;
  warehouse_name: string;
  cost_value: number;
  retail_value: number;
  quantity: number;
  product_count: number;
}

interface TopProduct {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number;
  retail_price: number;
  total_cost_value: number;
  total_retail_value: number;
  margin_percentage: number;
}

interface HistoricalPoint {
  date: string;
  total_cost_value: number;
  total_retail_value: number;
  total_quantity: number;
  product_count: number;
}

interface PeriodComparison {
  current_period: ValuationSummary;
  previous_period: ValuationSummary;
  cost_value_change: number;
  cost_value_change_percentage: number;
  retail_value_change: number;
  retail_value_change_percentage: number;
  quantity_change: number;
  quantity_change_percentage: number;
}

interface ValuationData {
  summary: ValuationSummary;
  by_category: CategoryBreakdown[];
  by_supplier: SupplierBreakdown[];
  by_warehouse: WarehouseBreakdown[];
  top_products: TopProduct[];
  historical_trend: HistoricalPoint[];
  period_comparison: PeriodComparison | null;
}

interface StockValuationReportProps {
  storeId?: string;
}

/**
 * Stock Valuation Report Component
 * 
 * Displays comprehensive inventory valuation metrics including:
 * - Current total inventory value (cost and retail)
 * - Value breakdown by category, supplier, and warehouse
 * - Historical value trends
 * - Top products by value
 * - Margin analysis
 * - Period comparison
 * 
 * @param props - StockValuationReportProps
 * @returns JSX.Element
 */
export default function StockValuationReport({ }: StockValuationReportProps) {
  const { session } = useAdmin();
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startOfDay(subDays(new Date(), 30)),
    endOfDay(new Date())
  ]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ValuationData | null>(null);
  const [breakdownView, setBreakdownView] = useState<'category' | 'supplier' | 'warehouse'>('category');
  const [comparePrevious, setComparePrevious] = useState(false);

  // Fetch valuation data
  const fetchValuationData = useCallback(async (isRefresh = false) => {
    if (!dateRange[0] || !dateRange[1]) return;
    if (!session?.sessionToken) return;

    setLoading(!isRefresh);
    setRefreshing(isRefresh);
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate: format(dateRange[0], 'yyyy-MM-dd'),
        endDate: format(dateRange[1], 'yyyy-MM-dd'),
        comparePrevious: comparePrevious.toString()
      });

      const response = await fetch(`/api/admin/inventory/reports/valuation?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch valuation data');
      }

      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch valuation data');
      }
    } catch (err) {
      console.error('Error fetching valuation data:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, comparePrevious, session?.sessionToken]);

  // Initial load
  useEffect(() => {
    if (dateRange[0] && dateRange[1] && session?.sessionToken) {
      fetchValuationData();
    }
  }, [dateRange, comparePrevious, fetchValuationData, session?.sessionToken]);

  // Export to CSV
  const exportToCSV = () => {
    if (!data) return;

    const csvHeaders = [
      'Category',
      'Type',
      'Name',
      'Quantity',
      'Cost Value',
      'Retail Value',
      'Margin %',
      'Product Count'
    ];

    const csvData: string[][] = [];

    // Add summary
    csvData.push(['Summary', 'Total', 'All Products', 
      data.summary.total_quantity.toString(),
      data.summary.total_cost_value.toFixed(2),
      data.summary.total_retail_value.toFixed(2),
      data.summary.average_margin_percentage.toFixed(2),
      data.summary.total_products.toString()
    ]);

    // Add categories
    data.by_category.forEach(cat => {
      csvData.push(['Category', 'Category', cat.category,
        cat.quantity.toString(),
        cat.cost_value.toFixed(2),
        cat.retail_value.toFixed(2),
        cat.margin_percentage.toFixed(2),
        cat.product_count.toString()
      ]);
    });

    // Add suppliers
    data.by_supplier.forEach(sup => {
      csvData.push(['Supplier', 'Supplier', sup.supplier_name,
        sup.quantity.toString(),
        sup.cost_value.toFixed(2),
        sup.retail_value.toFixed(2),
        sup.margin_percentage.toFixed(2),
        sup.product_count.toString()
      ]);
    });

    // Add warehouses
    data.by_warehouse.forEach(wh => {
      csvData.push(['Warehouse', 'Warehouse', wh.warehouse_name,
        wh.quantity.toString(),
        wh.cost_value.toFixed(2),
        wh.retail_value.toFixed(2),
        '0',
        wh.product_count.toString()
      ]);
    });

    // Add top products
    csvData.push(['']); // Empty row
    csvData.push(['Top Products by Value']);
    csvData.push(['SKU', 'Product Name', 'Category', 'Quantity', 'Cost Price', 'Retail Price', 'Total Cost', 'Total Retail', 'Margin %']);
    
    data.top_products.forEach(product => {
      csvData.push([
        product.sku,
        product.name,
        product.category,
        product.quantity.toString(),
        product.cost_price.toFixed(2),
        product.retail_price.toFixed(2),
        product.total_cost_value.toFixed(2),
        product.total_retail_value.toFixed(2),
        product.margin_percentage.toFixed(2)
      ]);
    });

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-valuation-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get breakdown data based on selected view
  const breakdownData = useMemo(() => {
    if (!data) return [];
    
    switch (breakdownView) {
      case 'category':
        return data.by_category;
      case 'supplier':
        return data.by_supplier;
      case 'warehouse':
        return data.by_warehouse;
      default:
        return data.by_category;
    }
  }, [data, breakdownView]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    if (!breakdownData.length) return null;

    const sortedData = [...breakdownData]
      .sort((a, b) => b.cost_value - a.cost_value)
      .slice(0, 6);

    const labels = sortedData.map(item => 
      'category' in item ? item.category : 
      'supplier_name' in item ? item.supplier_name : 
      'warehouse_name' in item ? item.warehouse_name : 
      'Unknown'
    );

    const values = sortedData.map(item => item.cost_value);
    const colors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)'
    ];

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 1
      }]
    };
  }, [breakdownData]);

  // Historical trend chart data
  const trendChartData = useMemo(() => {
    if (!data || !data.historical_trend.length) return null;

    return {
      labels: data.historical_trend.map(point => format(new Date(point.date), 'MMM dd')),
      datasets: [
        {
          label: 'Cost Value',
          data: data.historical_trend.map(point => point.total_cost_value),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.3
        },
        {
          label: 'Retail Value',
          data: data.historical_trend.map(point => point.total_retail_value),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          tension: 0.3
        }
      ]
    };
  }, [data]);

  const lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: $${value.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `$${Number(value).toLocaleString()}`
        }
      }
    }
  };

  const pieChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed;
            const percentage = ((value / context.dataset.data.reduce((a: number, b: number) => a + b, 0)) * 100).toFixed(1);
            return `${label}: $${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Get trend icon
  const getTrendIcon = (change: number) => {
    if (change > 0) return <IconArrowUpRight size={16} />;
    if (change < 0) return <IconArrowDownRight size={16} />;
    return <IconEqual size={16} />;
  };

  // Get trend color
  const getTrendColor = (change: number, positive = true) => {
    if (change === 0) return 'gray';
    if (positive) return change > 0 ? 'green' : 'red';
    return change < 0 ? 'green' : 'red';
  };

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder style={{ position: 'relative' }}>
        <LoadingOverlay visible={loading} />
        <Stack h={400} align="center" justify="center">
          <Text size="lg" c="dimmed">Loading valuation data...</Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {/* Header */}
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>Stock Valuation Report</Title>
              <Text c="dimmed" size="sm" mt="xs">
                Comprehensive analysis of inventory value and profitability
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label="Refresh data">
                <ActionIcon
                  variant="light"
                  loading={refreshing}
                  onClick={() => fetchValuationData(true)}
                >
                  <IconRefresh size={18} />
                </ActionIcon>
              </Tooltip>
              <Button
                leftSection={<IconDownload size={16} />}
                variant="light"
                onClick={exportToCSV}
                disabled={!data}
              >
                Export CSV
              </Button>
            </Group>
          </Group>

          {/* Filters */}
          <Group align="flex-end">
            <DatePickerInput
              type="range"
              label="Date Range"
              placeholder="Select date range"
              value={dateRange}
              onChange={setDateRange}
              maxDate={new Date()}
              style={{ flex: 1, maxWidth: 300 }}
            />
            <Switch
              label="Compare with previous period"
              checked={comparePrevious}
              onChange={(event) => setComparePrevious(event.currentTarget.checked)}
            />
          </Group>
        </Stack>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      {data && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Cost Value
                </Text>
                <Text fw={700} size="xl">
                  <NumberFormatter 
                    value={data.summary.total_cost_value} 
                    prefix="$" 
                    thousandSeparator 
                    decimalScale={0}
                  />
                </Text>
                {data.period_comparison && (
                  <Group gap={4}>
                    {getTrendIcon(data.period_comparison.cost_value_change)}
                    <Text size="xs" c={getTrendColor(data.period_comparison.cost_value_change)}>
                      {Math.abs(data.period_comparison.cost_value_change_percentage).toFixed(1)}%
                    </Text>
                  </Group>
                )}
              </Box>
              <ThemeIcon size="lg" variant="light" color="red">
                <IconCurrencyDollar size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Retail Value
                </Text>
                <Text fw={700} size="xl">
                  <NumberFormatter 
                    value={data.summary.total_retail_value} 
                    prefix="$" 
                    thousandSeparator 
                    decimalScale={0}
                  />
                </Text>
                {data.period_comparison && (
                  <Group gap={4}>
                    {getTrendIcon(data.period_comparison.retail_value_change)}
                    <Text size="xs" c={getTrendColor(data.period_comparison.retail_value_change)}>
                      {Math.abs(data.period_comparison.retail_value_change_percentage).toFixed(1)}%
                    </Text>
                  </Group>
                )}
              </Box>
              <ThemeIcon size="lg" variant="light" color="green">
                <IconCurrencyDollar size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Potential Profit
                </Text>
                <Text fw={700} size="xl">
                  <NumberFormatter 
                    value={data.summary.total_potential_profit} 
                    prefix="$" 
                    thousandSeparator 
                    decimalScale={0}
                  />
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="teal">
                <IconTrendingUp size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Avg Margin
                </Text>
                <Text fw={700} size="xl">
                  {data.summary.average_margin_percentage.toFixed(1)}%
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="violet">
                <IconChartPie size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Quantity
                </Text>
                <Text fw={700} size="xl">
                  <NumberFormatter 
                    value={data.summary.total_quantity} 
                    thousandSeparator 
                    decimalScale={0}
                  />
                </Text>
                {data.period_comparison && (
                  <Group gap={4}>
                    {getTrendIcon(data.period_comparison.quantity_change)}
                    <Text size="xs" c={getTrendColor(data.period_comparison.quantity_change)}>
                      {Math.abs(data.period_comparison.quantity_change_percentage).toFixed(1)}%
                    </Text>
                  </Group>
                )}
              </Box>
              <ThemeIcon size="lg" variant="light" color="blue">
                <IconPackage size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Products
                </Text>
                <Text fw={700} size="xl">
                  {data.summary.total_products}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="orange">
                <IconPackage size={20} />
              </ThemeIcon>
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Value Breakdown */}
      {data && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {/* Pie Chart */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3}>Value Breakdown</Title>
                <SegmentedControl
                  value={breakdownView}
                  onChange={(value) => setBreakdownView(value as typeof breakdownView)}
                  data={[
                    { label: 'Category', value: 'category' },
                    { label: 'Supplier', value: 'supplier' },
                    { label: 'Warehouse', value: 'warehouse' }
                  ]}
                />
              </Group>
              
              {pieChartData && (
                <div style={{ height: '300px' }}>
                  <Doughnut data={pieChartData} options={pieChartOptions} />
                </div>
              )}
            </Stack>
          </Card>

          {/* Breakdown Table */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Title order={3}>
                {breakdownView === 'category' ? 'Categories' : 
                 breakdownView === 'supplier' ? 'Suppliers' : 'Warehouses'}
              </Title>
              
              <ScrollArea h={300}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Products</Table.Th>
                      <Table.Th>Quantity</Table.Th>
                      <Table.Th>Cost Value</Table.Th>
                      {breakdownView !== 'warehouse' && <Table.Th>Margin</Table.Th>}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {breakdownData.map((item, index) => {
                      const name = 'category' in item ? item.category : 
                                   'supplier_name' in item ? item.supplier_name : 
                                   'warehouse_name' in item ? item.warehouse_name : 
                                   'Unknown';
                      
                      return (
                        <Table.Tr key={index}>
                          <Table.Td>
                            <Text size="sm" fw={500}>{name}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{item.product_count}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              <NumberFormatter 
                                value={item.quantity} 
                                thousandSeparator 
                                decimalScale={0}
                              />
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              <NumberFormatter 
                                value={item.cost_value} 
                                prefix="$" 
                                thousandSeparator 
                                decimalScale={0}
                              />
                            </Text>
                          </Table.Td>
                          {breakdownView !== 'warehouse' && (
                            <Table.Td>
                              <Badge 
                                size="sm" 
                                color={
                                  'margin_percentage' in item && item.margin_percentage > 50 ? 'green' : 
                                  'margin_percentage' in item && item.margin_percentage > 30 ? 'blue' : 
                                  'orange'
                                }
                                variant="light"
                              >
                                {'margin_percentage' in item ? `${item.margin_percentage.toFixed(1)}%` : 'N/A'}
                              </Badge>
                            </Table.Td>
                          )}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </SimpleGrid>
      )}

      {/* Historical Trend */}
      {data && trendChartData && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Historical Value Trend</Title>
            <div style={{ height: '300px' }}>
              <Line data={trendChartData} options={lineChartOptions} />
            </div>
          </Stack>
        </Card>
      )}

      {/* Top Products */}
      {data && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Top 10 Most Valuable Products</Title>
            
            <ScrollArea>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Product Name</Table.Th>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Unit Cost</Table.Th>
                    <Table.Th>Unit Retail</Table.Th>
                    <Table.Th>Total Cost</Table.Th>
                    <Table.Th>Total Retail</Table.Th>
                    <Table.Th>Margin</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.top_products.map((product) => (
                    <Table.Tr key={product.product_id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{product.sku}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{product.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{product.category}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{product.quantity}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          <NumberFormatter 
                            value={product.cost_price} 
                            prefix="$" 
                            decimalScale={2}
                          />
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          <NumberFormatter 
                            value={product.retail_price} 
                            prefix="$" 
                            decimalScale={2}
                          />
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          <NumberFormatter 
                            value={product.total_cost_value} 
                            prefix="$" 
                            thousandSeparator 
                            decimalScale={0}
                          />
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          <NumberFormatter 
                            value={product.total_retail_value} 
                            prefix="$" 
                            thousandSeparator 
                            decimalScale={0}
                          />
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          size="sm" 
                          color={
                            product.margin_percentage > 50 ? 'green' : 
                            product.margin_percentage > 30 ? 'blue' : 
                            'orange'
                          }
                          variant="light"
                        >
                          {product.margin_percentage.toFixed(1)}%
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>
      )}

      {/* Period Comparison */}
      {data && data.period_comparison && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Period Comparison</Title>
            
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Paper p="md" withBorder>
                <Stack gap="sm">
                  <Text size="sm" fw={600} c="dimmed">Current Period</Text>
                  <Group justify="space-between">
                    <Text size="sm">Cost Value:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.current_period.total_cost_value} 
                        prefix="$" 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Retail Value:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.current_period.total_retail_value} 
                        prefix="$" 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Quantity:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.current_period.total_quantity} 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Margin:</Text>
                    <Text size="sm" fw={500}>
                      {data.period_comparison.current_period.average_margin_percentage.toFixed(1)}%
                    </Text>
                  </Group>
                </Stack>
              </Paper>

              <Paper p="md" withBorder>
                <Stack gap="sm">
                  <Text size="sm" fw={600} c="dimmed">Previous Period</Text>
                  <Group justify="space-between">
                    <Text size="sm">Cost Value:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.previous_period.total_cost_value} 
                        prefix="$" 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Retail Value:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.previous_period.total_retail_value} 
                        prefix="$" 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Quantity:</Text>
                    <Text size="sm" fw={500}>
                      <NumberFormatter 
                        value={data.period_comparison.previous_period.total_quantity} 
                        thousandSeparator 
                        decimalScale={0}
                      />
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Margin:</Text>
                    <Text size="sm" fw={500}>
                      {data.period_comparison.previous_period.average_margin_percentage.toFixed(1)}%
                    </Text>
                  </Group>
                </Stack>
              </Paper>
            </SimpleGrid>

            <Paper p="md" withBorder bg="gray.0">
              <Stack gap="xs">
                <Text size="sm" fw={600} c="dimmed">Changes</Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <Group justify="space-between">
                    <Text size="sm">Cost Value:</Text>
                    <Group gap={4}>
                      {getTrendIcon(data.period_comparison.cost_value_change)}
                      <Text size="sm" fw={500} c={getTrendColor(data.period_comparison.cost_value_change)}>
                        {data.period_comparison.cost_value_change_percentage > 0 ? '+' : ''}
                        {data.period_comparison.cost_value_change_percentage.toFixed(1)}%
                      </Text>
                    </Group>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Retail Value:</Text>
                    <Group gap={4}>
                      {getTrendIcon(data.period_comparison.retail_value_change)}
                      <Text size="sm" fw={500} c={getTrendColor(data.period_comparison.retail_value_change)}>
                        {data.period_comparison.retail_value_change_percentage > 0 ? '+' : ''}
                        {data.period_comparison.retail_value_change_percentage.toFixed(1)}%
                      </Text>
                    </Group>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Quantity:</Text>
                    <Group gap={4}>
                      {getTrendIcon(data.period_comparison.quantity_change)}
                      <Text size="sm" fw={500} c={getTrendColor(data.period_comparison.quantity_change)}>
                        {data.period_comparison.quantity_change_percentage > 0 ? '+' : ''}
                        {data.period_comparison.quantity_change_percentage.toFixed(1)}%
                      </Text>
                    </Group>
                  </Group>
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}