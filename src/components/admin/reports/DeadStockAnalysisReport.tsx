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
  Progress,
  SimpleGrid,
  ThemeIcon,
  TextInput,
  Checkbox,
  ScrollArea,
  Box,
  Collapse,
  NumberInput,
  Modal,
  List,
  Divider
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconDownload,
  IconRefresh,
  IconAlertCircle,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconPackage,
  IconCurrencyDollar,
  IconTrendingDown,
  IconCalendarTime,
  IconChevronDown,
  IconChevronRight,
  IconTag,
  IconPackages
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
import { format } from 'date-fns';

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

interface DeadStockItem {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  current_stock: number;
  unit_cost: number;
  total_value: number;
  last_sale_date: string | null;
  last_restock_date: string | null;
  days_since_last_sale: number;
  days_in_stock: number;
  carrying_cost: number;
  risk_score: number;
  suggested_markdown_percent: number;
  liquidation_value: number;
  potential_bundles: string[];
}

interface DeadStockStats {
  total_dead_stock_items: number;
  total_dead_stock_value: number;
  total_carrying_cost: number;
  average_days_dead: number;
  highest_risk_items: number;
  total_liquidation_value: number;
  potential_recovery_value: number;
}

interface DeadStockTrend {
  date: string;
  dead_stock_count: number;
  dead_stock_value: number;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  items?: Array<{
    sku: string;
    name: string;
    action: string;
  }>;
  action?: string;
}

interface DeadStockAnalysisReportProps {
  storeId?: string;
}

/**
 * Dead Stock Analysis Report Component
 * 
 * Comprehensive analysis of dead stock items with:
 * - Configurable age thresholds (90, 180, 365 days)
 * - Risk scoring based on value, age, quantity
 * - Markdown recommendations
 * - Bundle suggestions
 * - Carrying cost calculations
 * - Historical trends
 * - Export functionality
 * 
 * @param props - DeadStockAnalysisReportProps
 * @returns JSX.Element
 */
export default function DeadStockAnalysisReport({ }: DeadStockAnalysisReportProps) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DeadStockItem[]>([]);
  const [stats, setStats] = useState<DeadStockStats | null>(null);
  const [trends, setTrends] = useState<DeadStockTrend[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  
  // Filters and controls
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof DeadStockItem>('risk_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [threshold90Days, setThreshold90Days] = useState(true);
  const [threshold180Days, setThreshold180Days] = useState(false);
  const [threshold365Days, setThreshold365Days] = useState(false);
  const [customThreshold, setCustomThreshold] = useState<number | undefined>(undefined);
  const [selectedItem, setSelectedItem] = useState<DeadStockItem | null>(null);
  const [recommendationsOpen, setRecommendationsOpen] = useState(true);

  // Fetch dead stock data
  const fetchDeadStockData = useCallback(async (isRefresh = false) => {
    setLoading(!isRefresh);
    setRefreshing(isRefresh);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (threshold90Days) params.append('threshold90', 'true');
      if (threshold180Days) params.append('threshold180', 'true');
      if (threshold365Days) params.append('threshold365', 'true');
      if (customThreshold) params.append('customThreshold', customThreshold.toString());

      const response = await fetch(`/api/admin/inventory/reports/dead-stock?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dead stock data');
      }

      const result = await response.json();
      
      if (result.success) {
        setData(result.data.items || []);
        setStats(result.data.stats || null);
        setTrends(result.data.trends || []);
        setRecommendations(result.data.recommendations || []);
      } else {
        throw new Error(result.error || 'Failed to fetch dead stock data');
      }
    } catch (err) {
      console.error('Error fetching dead stock data:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [threshold90Days, threshold180Days, threshold365Days, customThreshold]);

  // Initial load and threshold changes
  useEffect(() => {
    fetchDeadStockData();
  }, [threshold90Days, threshold180Days, threshold365Days, customThreshold, fetchDeadStockData]);

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
  }, [data, searchQuery, sortField, sortDirection]);

  // Export to CSV
  const exportToCSV = () => {
    const csvHeaders = [
      'SKU',
      'Product Name',
      'Category',
      'Current Stock',
      'Unit Cost',
      'Total Value',
      'Days Since Last Sale',
      'Days in Stock',
      'Carrying Cost',
      'Risk Score',
      'Suggested Markdown %',
      'Liquidation Value',
      'Last Sale Date',
      'Last Restock Date',
      'Potential Bundles'
    ];

    const csvData = filteredAndSortedData.map(item => [
      item.sku,
      item.name,
      item.category,
      item.current_stock,
      item.unit_cost.toFixed(2),
      item.total_value.toFixed(2),
      item.days_since_last_sale,
      item.days_in_stock,
      item.carrying_cost.toFixed(2),
      item.risk_score,
      item.suggested_markdown_percent,
      item.liquidation_value.toFixed(2),
      item.last_sale_date || 'Never',
      item.last_restock_date || 'Never',
      item.potential_bundles.join('; ')
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dead-stock-analysis-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sort handler
  const handleSort = (field: keyof DeadStockItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Risk score badge color
  const getRiskBadgeColor = (score: number) => {
    if (score >= 75) return 'red';
    if (score >= 50) return 'orange';
    if (score >= 25) return 'yellow';
    return 'green';
  };

  // Chart data for trends
  const trendChartData = useMemo(() => {
    if (!trends || trends.length === 0) return null;

    return {
      labels: trends.map(t => format(new Date(t.date), 'MMM dd')),
      datasets: [
        {
          label: 'Dead Stock Count',
          data: trends.map(t => t.dead_stock_count),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          yAxisID: 'y-count',
        },
        {
          label: 'Dead Stock Value',
          data: trends.map(t => t.dead_stock_value),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          yAxisID: 'y-value',
        }
      ]
    };
  }, [trends]);

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
            if (context.datasetIndex === 1) {
              return `${label}: $${value.toLocaleString()}`;
            }
            return `${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      'y-count': {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Item Count'
        }
      },
      'y-value': {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Total Value ($)'
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
          <Text size="lg" c="dimmed">Loading dead stock analysis...</Text>
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
              <Title order={2}>Dead Stock Analysis Report</Title>
              <Text c="dimmed" size="sm" mt="xs">
                Identify slow-moving inventory and optimize with actionable recommendations
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label="Refresh data">
                <ActionIcon
                  variant="light"
                  loading={refreshing}
                  onClick={() => fetchDeadStockData(true)}
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

          {/* Threshold Controls */}
          <Group align="flex-end">
            <Text size="sm" fw={500}>Age Thresholds:</Text>
            <Checkbox
              label="90 days"
              checked={threshold90Days}
              onChange={(e) => setThreshold90Days(e.currentTarget.checked)}
            />
            <Checkbox
              label="180 days"
              checked={threshold180Days}
              onChange={(e) => setThreshold180Days(e.currentTarget.checked)}
            />
            <Checkbox
              label="365 days"
              checked={threshold365Days}
              onChange={(e) => setThreshold365Days(e.currentTarget.checked)}
            />
            <NumberInput
              placeholder="Custom days"
              value={customThreshold}
              onChange={(value) => setCustomThreshold(value as number | undefined)}
              min={1}
              max={999}
              style={{ width: 120 }}
            />
            <TextInput
              placeholder="Search products..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1, maxWidth: 300 }}
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
                  Dead Stock Items
                </Text>
                <Text fw={700} size="xl">
                  {stats.total_dead_stock_items}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="red">
                <IconPackage size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Value
                </Text>
                <Text fw={700} size="xl">
                  ${stats.total_dead_stock_value.toLocaleString()}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="violet">
                <IconCurrencyDollar size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Carrying Cost
                </Text>
                <Text fw={700} size="xl" c="orange">
                  ${stats.total_carrying_cost.toLocaleString()}
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
                  Avg Days Dead
                </Text>
                <Text fw={700} size="xl">
                  {Math.round(stats.average_days_dead)}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="blue">
                <IconCalendarTime size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  High Risk Items
                </Text>
                <Text fw={700} size="xl" c="red">
                  {stats.highest_risk_items}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="red">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder p="md">
            <Group justify="space-between">
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Recovery Value
                </Text>
                <Text fw={700} size="xl" c="green">
                  ${stats.potential_recovery_value.toLocaleString()}
                </Text>
              </Box>
              <ThemeIcon size="lg" variant="light" color="green">
                <IconTag size={20} />
              </ThemeIcon>
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Actionable Recommendations</Title>
            <ActionIcon
              variant="subtle"
              onClick={() => setRecommendationsOpen(!recommendationsOpen)}
            >
              {recommendationsOpen ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
            </ActionIcon>
          </Group>
          
          <Collapse in={recommendationsOpen}>
            <Stack gap="md">
              {recommendations.map((rec, index) => (
                <Card key={index} withBorder p="md" bg={
                  rec.priority === 'high' ? 'red.0' : 
                  rec.priority === 'medium' ? 'orange.0' : 'yellow.0'
                }>
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>{rec.title}</Text>
                    <Badge color={
                      rec.priority === 'high' ? 'red' : 
                      rec.priority === 'medium' ? 'orange' : 'yellow'
                    }>
                      {rec.priority} priority
                    </Badge>
                  </Group>
                  
                  <Text size="sm" c="dimmed" mb="sm">{rec.description}</Text>
                  
                  {rec.items && rec.items.length > 0 && (
                    <List size="sm" spacing="xs">
                      {rec.items.map((item, idx) => (
                        <List.Item key={idx}>
                          <Text span fw={500}>{item.sku}</Text> - {item.name}
                          <Text size="xs" c="dimmed">{item.action}</Text>
                        </List.Item>
                      ))}
                    </List>
                  )}
                  
                  {rec.action && (
                    <Text size="sm" c="blue" mt="xs">{rec.action}</Text>
                  )}
                </Card>
              ))}
            </Stack>
          </Collapse>
        </Card>
      )}

      {/* Trends Chart */}
      {trendChartData && trends.length > 0 && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">Dead Stock Trends (Last 30 Days)</Title>
          <div style={{ height: '300px' }}>
            <Line data={trendChartData} options={chartOptions} />
          </div>
        </Card>
      )}

      {/* Data Table */}
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
                <Table.Th>Stock</Table.Th>
                <Table.Th>
                  <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('total_value')}>
                    Value
                    {sortField === 'total_value' && (
                      sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                    )}
                  </Group>
                </Table.Th>
                <Table.Th>
                  <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('days_since_last_sale')}>
                    Days Dead
                    {sortField === 'days_since_last_sale' && (
                      sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                    )}
                  </Group>
                </Table.Th>
                <Table.Th>
                  <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('carrying_cost')}>
                    Carrying Cost
                    {sortField === 'carrying_cost' && (
                      sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                    )}
                  </Group>
                </Table.Th>
                <Table.Th>
                  <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => handleSort('risk_score')}>
                    Risk Score
                    {sortField === 'risk_score' && (
                      sortDirection === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />
                    )}
                  </Group>
                </Table.Th>
                <Table.Th>Markdown</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredAndSortedData.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={10}>
                    <Text ta="center" c="dimmed" py="lg">
                      No dead stock items found matching your criteria
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
                      <Text size="sm">{item.current_stock}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>${item.total_value.toLocaleString()}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text size="sm">
                          {item.days_since_last_sale === 999999 ? '∞' : item.days_since_last_sale}
                        </Text>
                        {item.days_since_last_sale > 365 && (
                          <ThemeIcon size="xs" color="red" variant="light">
                            <IconAlertTriangle size={12} />
                          </ThemeIcon>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="orange">
                        ${item.carrying_cost.toFixed(2)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Progress
                          value={item.risk_score}
                          color={getRiskBadgeColor(item.risk_score)}
                          size="md"
                          style={{ width: 60 }}
                        />
                        <Text size="sm" fw={500}>{item.risk_score}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        {item.suggested_markdown_percent}% off
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => setSelectedItem(item)}
                      >
                        Details
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Item Details Modal */}
      <Modal
        opened={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? `Dead Stock Details: ${selectedItem.name}` : ''}
        size="lg"
      >
        {selectedItem && (
          <Stack gap="md">
            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">SKU</Text>
                <Text fw={500}>{selectedItem.sku}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Category</Text>
                <Text fw={500}>{selectedItem.category}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Current Stock</Text>
                <Text fw={500}>{selectedItem.current_stock} units</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Total Value</Text>
                <Text fw={500}>${selectedItem.total_value.toLocaleString()}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Last Sale</Text>
                <Text fw={500}>
                  {selectedItem.last_sale_date || 'Never'} 
                  ({selectedItem.days_since_last_sale === 999999 ? '∞' : selectedItem.days_since_last_sale} days ago)
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Last Restock</Text>
                <Text fw={500}>{selectedItem.last_restock_date || 'Unknown'}</Text>
              </div>
            </SimpleGrid>

            <Divider />

            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">Carrying Cost</Text>
                <Text fw={500} c="orange">${selectedItem.carrying_cost.toFixed(2)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Risk Score</Text>
                <Badge color={getRiskBadgeColor(selectedItem.risk_score)}>
                  {selectedItem.risk_score}/100
                </Badge>
              </div>
              <div>
                <Text size="xs" c="dimmed">Suggested Markdown</Text>
                <Text fw={500} c="blue">{selectedItem.suggested_markdown_percent}% off</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Liquidation Value</Text>
                <Text fw={500} c="green">${selectedItem.liquidation_value.toFixed(2)}</Text>
              </div>
            </SimpleGrid>

            {selectedItem.potential_bundles.length > 0 && (
              <>
                <Divider />
                <div>
                  <Group gap="xs" mb="sm">
                    <IconPackages size={16} />
                    <Text fw={500}>Bundle Suggestions</Text>
                  </Group>
                  <List size="sm" spacing="xs">
                    {selectedItem.potential_bundles.map((bundle, index) => (
                      <List.Item key={index}>{bundle}</List.Item>
                    ))}
                  </List>
                </div>
              </>
            )}

            <Divider />

            <Alert color="blue" icon={<IconTag size={16} />}>
              <Text size="sm" fw={500}>Recommended Action</Text>
              <Text size="sm">
                Apply a {selectedItem.suggested_markdown_percent}% discount to move this inventory.
                Expected recovery: ${(selectedItem.total_value * (1 - selectedItem.suggested_markdown_percent / 100)).toFixed(2)}
              </Text>
            </Alert>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}