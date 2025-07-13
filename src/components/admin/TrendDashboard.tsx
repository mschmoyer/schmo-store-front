'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Group,
  Select,
  Button,
  SimpleGrid,
  Card,
  Text,
  Title,
  ThemeIcon,
  rem,
  ActionIcon,
  Alert,
  Loader,
  Badge,
  Modal,
  Divider
} from '@mantine/core';
import {
  IconCalendar,
  IconRefresh,
  IconDownload,
  IconChartLine,
  IconSearch,
  IconUsers,
  IconEye,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertTriangle
} from '@tabler/icons-react';
import TrendChart from './TrendChart';
import ExecutiveSummary from './ExecutiveSummary';
import { format, parseISO } from 'date-fns';

interface TrendData {
  date: string;
  search_count?: number;
  visitor_count?: number;
  page_views?: number;
}

interface TrendStats {
  totalSearches: number;
  uniqueVisitors: number;
  avgSessionDuration: number;
  bounceRate: number;
  trendsData: {
    searchTrends: TrendData[];
    visitorTrends: TrendData[];
  };
}

interface ExecutiveSummaryData {
  period: string;
  totalSearches: number;
  uniqueVisitors: number;
  searchTrend: number;
  visitorTrend: number;
  topSearchTerm: string;
  topSearchCount: number;
  bounceRate: number;
  avgSessionDuration: number;
  keyInsights: string[];
  alerts: string[];
  recommendations: string[];
}

interface TrendDashboardProps {
  dateRange: string;
  onDateRangeChange: (range: string) => void;
}

export default function TrendDashboard({ dateRange, onDateRangeChange }: TrendDashboardProps) {
  const [data, setData] = useState<TrendStats | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customDateRange, setCustomDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv');

  const fetchExecutiveSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const token = localStorage.getItem('admin_token');
      if (!token) {
        return;
      }

      const params = new URLSearchParams();
      params.append('days', dateRange);
      
      if (customDateRange && startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const response = await fetch(`/api/admin/analytics/executive-summary?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setExecutiveSummary(result.data);
        }
      }
    } catch (err) {
      console.error('Executive summary error:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange, customDateRange, startDate, endDate]);

  const fetchTrendData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      if (!token) {
        setError('Authentication required');
        return;
      }

      const params = new URLSearchParams();
      params.append('days', dateRange);
      
      if (customDateRange && startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const response = await fetch(`/api/admin/analytics/trends?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error || 'Failed to load trend data');
        }
      } else {
        setError('Failed to load trend data');
      }
    } catch (err) {
      setError('An error occurred while loading trend data');
      console.error('Trend data error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, customDateRange, startDate, endDate]);

  useEffect(() => {
    fetchTrendData();
    fetchExecutiveSummary();
  }, [dateRange, customDateRange, startDate, endDate, fetchTrendData, fetchExecutiveSummary]);

  const handleDateRangeChange = (value: string | null) => {
    if (value) {
      setCustomDateRange(value === 'custom');
      onDateRangeChange(value);
    }
  };

  const handleExport = () => {
    switch (exportFormat) {
      case 'csv':
        exportAllToCsv();
        break;
      case 'json':
        exportAllToJson();
        break;
      case 'pdf':
        exportToPdf();
        break;
    }
    setExportModalOpen(false);
  };

  const exportAllToCsv = () => {
    if (!data) return;
    
    const csvContent = [
      ['Date', 'Search Count', 'Visitor Count', 'Page Views'],
      ...data.trendsData.searchTrends.map((item, index) => [
        format(parseISO(item.date), 'yyyy-MM-dd'),
        item.search_count || 0,
        data.trendsData.visitorTrends[index]?.visitor_count || 0,
        data.trendsData.visitorTrends[index]?.page_views || 0
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-trends-${dateRange}days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllToJson = () => {
    if (!data) return;
    
    const jsonData = {
      dateRange,
      exportedAt: new Date().toISOString(),
      stats: {
        totalSearches: data.totalSearches,
        uniqueVisitors: data.uniqueVisitors,
        avgSessionDuration: data.avgSessionDuration,
        bounceRate: data.bounceRate
      },
      trends: data.trendsData
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-trends-${dateRange}days.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPdf = () => {
    alert('PDF export functionality coming soon!');
  };

  // Calculate trend percentages
  const calculateTrend = (values: number[]) => {
    if (values.length < 2) return null;
    
    const recent = values.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const previous = values.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    
    if (previous === 0) return null;
    
    return ((recent - previous) / previous) * 100;
  };

  const searchTrend = data ? calculateTrend(data.trendsData.searchTrends.map(d => d.search_count || 0)) : null;
  const visitorTrend = data ? calculateTrend(data.trendsData.visitorTrends.map(d => d.visitor_count || 0)) : null;

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading trend data...
        </Text>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert
        icon={<IconAlertTriangle size="1rem" />}
        color="red"
        variant="light"
        mb="md"
      >
        {error}
        <Button variant="light" size="sm" mt="sm" onClick={fetchTrendData}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {/* Controls */}
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} mb="xs">
              Analytics Trends
            </Title>
            <Text c="dimmed">
              Visualize search patterns and visitor behavior over time
            </Text>
          </div>
          
          <Group>
            <Select
              value={dateRange}
              onChange={handleDateRangeChange}
              data={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
                { value: '180', label: 'Last 6 months' },
                { value: '365', label: 'Last year' },
                { value: 'custom', label: 'Custom range' }
              ]}
              leftSection={<IconCalendar size="1rem" />}
              style={{ minWidth: 150 }}
            />
            
            {customDateRange && (
              <Group>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </Group>
            )}
            
            <ActionIcon variant="light" onClick={() => {
              fetchTrendData();
              fetchExecutiveSummary();
            }} loading={loading}>
              <IconRefresh size="1rem" />
            </ActionIcon>
            
            <ActionIcon variant="light" onClick={() => setExportModalOpen(true)}>
              <IconDownload size="1rem" />
            </ActionIcon>
          </Group>
        </Group>
      </Card>

      {/* Executive Summary */}
      {executiveSummary && (
        <ExecutiveSummary 
          data={executiveSummary}
          loading={summaryLoading}
        />
      )}

      {/* Stats Cards */}
      {data && (
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed" fw={500}>
                Total Searches
              </Text>
              <ThemeIcon color="blue" variant="light" size="lg">
                <IconSearch style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
            </Group>
            
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>
                {data.totalSearches.toLocaleString()}
              </Text>
              <Text size="sm" c="dimmed">
                {dateRange} days
              </Text>
            </Group>
            
            {searchTrend !== null && (
              <Group gap="xs" mt="sm">
                <ThemeIcon 
                  size="sm" 
                  variant="light" 
                  color={searchTrend > 0 ? 'green' : searchTrend < 0 ? 'red' : 'gray'}
                >
                  {searchTrend > 0 ? <IconTrendingUp size="0.8rem" /> : <IconTrendingDown size="0.8rem" />}
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {searchTrend > 0 ? '+' : ''}{searchTrend.toFixed(1)}% vs last period
                </Text>
              </Group>
            )}
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed" fw={500}>
                Unique Visitors
              </Text>
              <ThemeIcon color="green" variant="light" size="lg">
                <IconUsers style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
            </Group>
            
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>
                {data.uniqueVisitors.toLocaleString()}
              </Text>
              <Text size="sm" c="dimmed">
                unique users
              </Text>
            </Group>
            
            {visitorTrend !== null && (
              <Group gap="xs" mt="sm">
                <ThemeIcon 
                  size="sm" 
                  variant="light" 
                  color={visitorTrend > 0 ? 'green' : visitorTrend < 0 ? 'red' : 'gray'}
                >
                  {visitorTrend > 0 ? <IconTrendingUp size="0.8rem" /> : <IconTrendingDown size="0.8rem" />}
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {visitorTrend > 0 ? '+' : ''}{visitorTrend.toFixed(1)}% vs last period
                </Text>
              </Group>
            )}
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed" fw={500}>
                Avg Session Duration
              </Text>
              <ThemeIcon color="cyan" variant="light" size="lg">
                <IconEye style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
            </Group>
            
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>
                {Math.floor(data.avgSessionDuration / 60)}m {data.avgSessionDuration % 60}s
              </Text>
            </Group>
            
            <Group gap="xs" mt="sm">
              <ThemeIcon 
                size="sm" 
                variant="light" 
                color="gray"
              >
                <IconTrendingUp size="0.8rem" />
              </ThemeIcon>
              <Text size="xs" c="dimmed">
                vs last period
              </Text>
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed" fw={500}>
                Bounce Rate
              </Text>
              <ThemeIcon color="orange" variant="light" size="lg">
                <IconChartLine style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
            </Group>
            
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>
                {data.bounceRate.toFixed(1)}%
              </Text>
            </Group>
            
            <Group gap="xs" mt="sm">
              <ThemeIcon 
                size="sm" 
                variant="light" 
                color="green"
              >
                <IconTrendingDown size="0.8rem" />
              </ThemeIcon>
              <Text size="xs" c="dimmed">
                Lower is better
              </Text>
            </Group>
          </Card>
        </SimpleGrid>
      )}

      {/* Charts */}
      {data && (
        <Stack gap="lg">
          <TrendChart
            title="Search Volume Trends"
            data={data.trendsData.searchTrends}
            dataKey="search_count"
            color="#3498db"
            dateRange={dateRange}
            onRefresh={fetchTrendData}
            loading={loading}
            error={error}
          />
          
          <TrendChart
            title="Visitor Patterns"
            data={data.trendsData.visitorTrends}
            dataKey="visitor_count"
            color="#2ecc71"
            dateRange={dateRange}
            onRefresh={fetchTrendData}
            loading={loading}
            error={error}
          />
        </Stack>
      )}

      {/* Export Modal */}
      <Modal
        opened={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Analytics Data"
        size="sm"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Choose the format to export your analytics data:
          </Text>
          
          <Stack gap="sm">
            <Card 
              padding="md" 
              style={{ 
                cursor: 'pointer',
                border: exportFormat === 'csv' ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)'
              }}
              onClick={() => setExportFormat('csv')}
            >
              <Group justify="space-between">
                <div>
                  <Text fw={500}>CSV</Text>
                  <Text size="sm" c="dimmed">Export raw data as comma-separated values</Text>
                </div>
                {exportFormat === 'csv' && <Badge color="blue">Selected</Badge>}
              </Group>
            </Card>
            
            <Card 
              padding="md" 
              style={{ 
                cursor: 'pointer',
                border: exportFormat === 'json' ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)'
              }}
              onClick={() => setExportFormat('json')}
            >
              <Group justify="space-between">
                <div>
                  <Text fw={500}>JSON</Text>
                  <Text size="sm" c="dimmed">Export data as JSON format</Text>
                </div>
                {exportFormat === 'json' && <Badge color="blue">Selected</Badge>}
              </Group>
            </Card>
            
            <Card 
              padding="md" 
              style={{ 
                cursor: 'pointer',
                border: exportFormat === 'pdf' ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)'
              }}
              onClick={() => setExportFormat('pdf')}
            >
              <Group justify="space-between">
                <div>
                  <Text fw={500}>PDF Report</Text>
                  <Text size="sm" c="dimmed">Generate a comprehensive PDF report</Text>
                </div>
                {exportFormat === 'pdf' && <Badge color="blue">Selected</Badge>}
              </Group>
            </Card>
          </Stack>
          
          <Divider />
          
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setExportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              Export
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}