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
  Select,
  LoadingOverlay,
  Alert,
  ActionIcon,
  Tooltip,
  Progress,
  SimpleGrid,
  ThemeIcon,
  TextInput,
  SegmentedControl,
  ScrollArea,
  Box
} from '@mantine/core';
import { useAdmin } from '@/contexts/AdminContext';
import { DatePickerInput } from '@mantine/dates';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconDownload,
  IconRefresh,
  IconAlertCircle,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconPackage,
  IconClock
} from '@tabler/icons-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  ChartOptions
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
  Legend
);

interface TurnoverData {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  total_sales_quantity: number;
  total_sales_revenue: number;
  average_inventory: number;
  current_inventory: number;
  cost_of_goods_sold: number;
  turnover_ratio: number;
  days_to_sell: number;
  velocity_category: 'fast' | 'medium' | 'slow' | 'dead';
  last_sale_date: string | null;
  trend_data: Array<{
    date: string;
    sales: number;
    inventory: number;
  }>;
}

interface TurnoverStats {
  total_products: number;
  average_turnover_ratio: number;
  fast_moving_count: number;
  slow_moving_count: number;
  dead_stock_count: number;
  total_inventory_value: number;
  total_sales_revenue: number;
}

interface InventoryTurnoverReportProps {
  storeId?: string;
}

/**
 * Inventory Turnover Report Component
 * 
 * Displays comprehensive inventory turnover metrics including:
 * - Turnover ratios for each product
 * - Days to sell calculations
 * - Fast vs slow moving item identification
 * - Seasonal trends visualization
 * - Export functionality
 * 
 * @param props - InventoryTurnoverReportProps
 * @returns JSX.Element
 */
export default function InventoryTurnoverReport({ }: InventoryTurnoverReportProps) {
  const { session } = useAdmin();
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startOfDay(subDays(new Date(), 30)),
    endOfDay(new Date())
  ]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TurnoverData[]>([]);
  const [stats, setStats] = useState<TurnoverStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof TurnoverData>('turnover_ratio');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [velocityFilter, setVelocityFilter] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<TurnoverData | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Fetch turnover data
  const fetchTurnoverData = useCallback(async (isRefresh = false) => {
    if (!dateRange[0] || !dateRange[1]) return;
    if (!session?.sessionToken) return;

    setLoading(!isRefresh);
    setRefreshing(isRefresh);
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate: format(dateRange[0], 'yyyy-MM-dd'),
        endDate: format(dateRange[1], 'yyyy-MM-dd')
      });

      const response = await fetch(`/api/admin/inventory/reports/turnover?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch turnover data');
      }

      const result = await response.json();
      
      if (result.success) {
        setData(result.data.turnover || []);
        setStats(result.data.stats || null);
      } else {
        throw new Error(result.error || 'Failed to fetch turnover data');
      }
    } catch (err) {
      console.error('Error fetching turnover data:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, session?.sessionToken]);

  // Initial load
  useEffect(() => {
    if (dateRange[0] && dateRange[1] && session?.sessionToken) {
      fetchTurnoverData();
    }
  }, [dateRange, fetchTurnoverData, session?.sessionToken]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    }

    // Apply velocity filter
    if (velocityFilter !== 'all') {
      filtered = filtered.filter(item => item.velocity_category === velocityFilter);
    }

    // Sort data
    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
  }, [data, searchQuery, velocityFilter, sortField, sortDirection]);

  // Export to CSV
  const exportToCSV = () => {
    const csvHeaders = [
      'SKU',
      'Product Name',
      'Category',
      'Turnover Ratio',
      'Days to Sell',
      'Total Sales Qty',
      'Sales Revenue',
      'Average Inventory',
      'Current Inventory',
      'COGS',
      'Velocity Category',
      'Last Sale Date'
    ];

    const csvData = filteredAndSortedData.map(item => [
      item.sku,
      item.name,
      item.category,
      item.turnover_ratio.toFixed(2),
      item.days_to_sell.toFixed(0),
      item.total_sales_quantity,
      item.total_sales_revenue.toFixed(2),
      item.average_inventory.toFixed(0),
      item.current_inventory,
      item.cost_of_goods_sold.toFixed(2),
      item.velocity_category,
      item.last_sale_date ? format(new Date(item.last_sale_date), 'yyyy-MM-dd') : 'Never'
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-turnover-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sort handler
  const handleSort = (field: keyof TurnoverData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Velocity category badge color
  const getVelocityBadgeColor = (category: string) => {
    switch (category) {
      case 'fast': return 'green';
      case 'medium': return 'blue';
      case 'slow': return 'orange';
      case 'dead': return 'red';
      default: return 'gray';
    }
  };

  // Velocity category label
  const getVelocityLabel = (category: string) => {
    switch (category) {
      case 'fast': return 'Fast Moving';
      case 'medium': return 'Medium';
      case 'slow': return 'Slow Moving';
      case 'dead': return 'Dead Stock';
      default: return 'Unknown';
    }
  };

  // Chart data for selected product
  const selectedProductChartData = useMemo(() => {
    if (!selectedProduct || !selectedProduct.trend_data) {
      return null;
    }

    return {
      labels: selectedProduct.trend_data.map(d => format(new Date(d.date), 'MMM dd')),
      datasets: [
        {
          label: 'Daily Sales',
          data: selectedProduct.trend_data.map(d => d.sales),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          yAxisID: 'y-sales',
        },
        {
          label: 'Inventory Level',
          data: selectedProduct.trend_data.map(d => d.inventory),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          yAxisID: 'y-inventory',
        }
      ]
    };
  }, [selectedProduct]);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      'y-sales': {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Sales Quantity'
        }
      },
      'y-inventory': {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Inventory Level'
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder style={{ position: 'relative' }}>
        <LoadingOverlay visible={loading} />
        <Stack h={400} align="center" justify="center">
          <Text size="lg" c="dimmed">Loading turnover data...</Text>
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
              <Title order={2}>Inventory Turnover Report</Title>
              <Text c="dimmed" size="sm" mt="xs">
                Analyze product movement and identify optimization opportunities
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label="Refresh data">
                <ActionIcon
                  variant="light"
                  loading={refreshing}
                  onClick={() => fetchTurnoverData(true)}
                >
                  <IconRefresh size={18} />
                </ActionIcon>
              </Tooltip>
              <Button
                leftSection={<IconDownload size={16} />}
                variant="light"
                onClick={exportToCSV}
                disabled={filteredAndSortedData.length === 0}
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
            <TextInput
              placeholder="Search products..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1, maxWidth: 300 }}
            />
            <Select
              label="Velocity Category"
              placeholder="All categories"
              value={velocityFilter}
              onChange={(value) => setVelocityFilter(value || 'all')}
              data={[
                { value: 'all', label: 'All Categories' },
                { value: 'fast', label: 'Fast Moving' },
                { value: 'medium', label: 'Medium' },
                { value: 'slow', label: 'Slow Moving' },
                { value: 'dead', label: 'Dead Stock' }
              ]}
              style={{ width: 150 }}
            />
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'grid')}
              data={[
                { label: 'Table', value: 'table' },
                { label: 'Grid', value: 'grid' }
              ]}
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

      {/* Summary Stats */}
      {stats && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Products
                </Text>
                <Text fw={700} size="xl">
                  {stats.total_products}
                </Text>
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
                  Avg Turnover
                </Text>
                <Text fw={700} size="xl">
                  {stats.average_turnover_ratio.toFixed(2)}x
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
                  Fast Moving
                </Text>
                <Text fw={700} size="xl" c="green">
                  {stats.fast_moving_count}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="green">
                <IconTrendingUp size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Slow Moving
                </Text>
                <Text fw={700} size="xl" c="orange">
                  {stats.slow_moving_count}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="orange">
                <IconTrendingDown size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Dead Stock
                </Text>
                <Text fw={700} size="xl" c="red">
                  {stats.dead_stock_count}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="red">
                <IconAlertCircle size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Inventory Value
                </Text>
                <Text fw={700} size="xl">
                  ${stats.total_inventory_value.toLocaleString()}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="violet">
                <IconClock size={20} />
              </ThemeIcon>
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Data Display */}
      {viewMode === 'table' ? (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <ScrollArea>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('sku')}>
                      SKU
                      {sortField === 'sku' && (
                        sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                      )}
                    </Group>
                  </Table.Th>
                  <Table.Th>
                    <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                      Product
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                      )}
                    </Group>
                  </Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>
                    <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('turnover_ratio')}>
                      Turnover Ratio
                      {sortField === 'turnover_ratio' && (
                        sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                      )}
                    </Group>
                  </Table.Th>
                  <Table.Th>
                    <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('days_to_sell')}>
                      Days to Sell
                      {sortField === 'days_to_sell' && (
                        sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                      )}
                    </Group>
                  </Table.Th>
                  <Table.Th>Sales Qty</Table.Th>
                  <Table.Th>Avg Inventory</Table.Th>
                  <Table.Th>Current Stock</Table.Th>
                  <Table.Th>Velocity</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredAndSortedData.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={10}>
                      <Text ta="center" c="dimmed" py="lg">
                        No products found matching your criteria
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredAndSortedData.map((item) => (
                    <Table.Tr key={item.product_id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{item.sku}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{item.category}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm" fw={500}>
                            {item.turnover_ratio.toFixed(2)}x
                          </Text>
                          {item.turnover_ratio > 6 && (
                            <ThemeIcon size="xs" color="green" variant="light">
                              <IconTrendingUp size={12} />
                            </ThemeIcon>
                          )}
                          {item.turnover_ratio < 2 && (
                            <ThemeIcon size="xs" color="red" variant="light">
                              <IconTrendingDown size={12} />
                            </ThemeIcon>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {item.days_to_sell === 999999 ? '∞' : Math.round(item.days_to_sell)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.total_sales_quantity}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{Math.round(item.average_inventory)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm">{item.current_inventory}</Text>
                          {item.current_inventory === 0 && (
                            <Badge size="xs" color="red">Out</Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={getVelocityBadgeColor(item.velocity_category)}
                          variant="light"
                        >
                          {getVelocityLabel(item.velocity_category)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => setSelectedProduct(item)}
                        >
                          View Trend
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
          {filteredAndSortedData.map((item) => (
            <Card key={item.product_id} shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="sm">
                <div>
                  <Text size="sm" c="dimmed">{item.sku}</Text>
                  <Text fw={500}>{item.name}</Text>
                  <Text size="sm" c="dimmed">{item.category}</Text>
                </div>

                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed">Turnover Ratio</Text>
                    <Text size="lg" fw={700}>{item.turnover_ratio.toFixed(2)}x</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Days to Sell</Text>
                    <Text size="lg" fw={700}>
                      {item.days_to_sell === 999999 ? '∞' : Math.round(item.days_to_sell)}
                    </Text>
                  </div>
                </Group>

                <Progress
                  value={(item.turnover_ratio / 10) * 100}
                  color={item.turnover_ratio > 6 ? 'green' : item.turnover_ratio > 3 ? 'blue' : 'orange'}
                  size="md"
                />

                <Group justify="space-between">
                  <Badge
                    size="sm"
                    color={getVelocityBadgeColor(item.velocity_category)}
                    variant="light"
                  >
                    {getVelocityLabel(item.velocity_category)}
                  </Badge>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => setSelectedProduct(item)}
                  >
                    View Trend
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Trend Chart Modal */}
      {selectedProduct && selectedProductChartData && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Title order={3}>Trend Analysis: {selectedProduct.name}</Title>
                <Text c="dimmed" size="sm">SKU: {selectedProduct.sku}</Text>
              </div>
              <Button
                variant="subtle"
                onClick={() => setSelectedProduct(null)}
              >
                Close
              </Button>
            </Group>
            
            <div style={{ height: '400px' }}>
              <Line data={selectedProductChartData} options={chartOptions} />
            </div>

            <SimpleGrid cols={4}>
              <div>
                <Text size="xs" c="dimmed">Total Sales</Text>
                <Text fw={500}>{selectedProduct.total_sales_quantity} units</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Revenue</Text>
                <Text fw={500}>${selectedProduct.total_sales_revenue.toLocaleString()}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">COGS</Text>
                <Text fw={500}>${selectedProduct.cost_of_goods_sold.toLocaleString()}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Last Sale</Text>
                <Text fw={500}>
                  {selectedProduct.last_sale_date 
                    ? format(new Date(selectedProduct.last_sale_date), 'MMM dd, yyyy')
                    : 'Never'}
                </Text>
              </div>
            </SimpleGrid>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}