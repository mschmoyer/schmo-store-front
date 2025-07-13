'use client';

import React, { useState } from 'react';
import {
  Card,
  Title,
  Group,
  Button,
  Select,
  Stack,
  Text,
  Loader,
  ActionIcon,
  Modal,
  Badge,
  ThemeIcon,
  Divider
} from '@mantine/core';
import {
  IconChartLine,
  IconChartBar,
  IconChartArea,
  IconDownload,
  IconRefresh,
  IconAlertTriangle,
  IconTrendingUp,
  IconTrendingDown
} from '@tabler/icons-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler
);

interface TrendData {
  date: string;
  search_count?: number;
  visitor_count?: number;
  page_views?: number;
}

interface TrendChartProps {
  title: string;
  data: TrendData[];
  dataKey: keyof TrendData;
  color?: string;
  dateRange: string;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string | null;
}

export default function TrendChart({
  title,
  data,
  dataKey,
  color = '#3498db',
  dateRange,
  onRefresh,
  loading = false,
  error = null
}: TrendChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'png'>('csv');

  // Process data based on granularity
  const processedData = React.useMemo(() => {
    if (!data || data.length === 0) return { labels: [], values: [] };

    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (granularity === 'day') {
      return {
        labels: sortedData.map(item => format(parseISO(item.date), 'MMM dd')),
        values: sortedData.map(item => item[dataKey] as number || 0)
      };
    }

    // For week/month aggregation, we'd need more complex logic
    // For now, return daily data
    return {
      labels: sortedData.map(item => format(parseISO(item.date), 'MMM dd')),
      values: sortedData.map(item => item[dataKey] as number || 0)
    };
  }, [data, dataKey, granularity]);

  const chartData = {
    labels: processedData.labels,
    datasets: [
      {
        label: title,
        data: processedData.values,
        borderColor: color,
        backgroundColor: chartType === 'area' ? 
          color.replace(')', ', 0.1)').replace('rgb', 'rgba') : 
          chartType === 'bar' ? color : 'transparent',
        fill: chartType === 'area',
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
      }
    ]
  };

  const chartOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: color,
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxTicksLimit: 8
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0,0,0,0.1)'
        },
        ticks: {
          callback: (value) => {
            if (typeof value === 'number') {
              return value.toLocaleString();
            }
            return value;
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  const handleExport = () => {
    switch (exportFormat) {
      case 'csv':
        exportToCsv();
        break;
      case 'json':
        exportToJson();
        break;
      case 'png':
        exportToPng();
        break;
    }
    setExportModalOpen(false);
  };

  const exportToCsv = () => {
    const csvContent = [
      ['Date', title],
      ...processedData.labels.map((label, index) => [
        label,
        processedData.values[index]
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-trends.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJson = () => {
    const jsonData = {
      title,
      dateRange,
      data: processedData.labels.map((label, index) => ({
        date: label,
        value: processedData.values[index]
      }))
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-trends.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPng = () => {
    // This would require canvas-to-blob functionality
    // For now, we'll just show a message
    alert('PNG export functionality coming soon!');
  };

  // Calculate trend percentage
  const trendPercentage = React.useMemo(() => {
    if (processedData.values.length < 2) return null;
    
    const recent = processedData.values.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const previous = processedData.values.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    
    if (previous === 0) return null;
    
    return ((recent - previous) / previous) * 100;
  }, [processedData.values]);

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader size="lg" />
          <Text mt="md" c="dimmed">
            Loading chart data...
          </Text>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <ThemeIcon size="xl" color="red" variant="light" mb="md">
            <IconAlertTriangle size="1.5rem" />
          </ThemeIcon>
          <Text mb="md" c="red">
            Failed to load chart data
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {error}
          </Text>
          {onRefresh && (
            <Button variant="light" onClick={onRefresh}>
              Retry
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={3}>{title}</Title>
        </Group>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Text size="xl" mb="md">📊</Text>
          <Text mb="md" c="dimmed">
            No data available
          </Text>
          <Text size="sm" c="dimmed">
            There&apos;s no data for the selected time range.
          </Text>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>{title}</Title>
            {trendPercentage !== null && (
              <Group gap="xs" mt="xs">
                <ThemeIcon 
                  size="sm" 
                  variant="light" 
                  color={trendPercentage > 0 ? 'green' : trendPercentage < 0 ? 'red' : 'gray'}
                >
                  {trendPercentage > 0 ? <IconTrendingUp size="0.8rem" /> : <IconTrendingDown size="0.8rem" />}
                </ThemeIcon>
                <Text size="sm" c="dimmed">
                  {trendPercentage > 0 ? '+' : ''}{trendPercentage.toFixed(1)}% vs last week
                </Text>
              </Group>
            )}
          </div>
          
          <Group gap="xs">
            <Select
              value={granularity}
              onChange={(value) => setGranularity(value as 'day' | 'week' | 'month')}
              data={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
                { value: 'month', label: 'Monthly' }
              ]}
              size="sm"
              w={100}
            />
            
            <Group gap={0} style={{ 
              border: '1px solid var(--mantine-color-gray-3)', 
              borderRadius: '6px',
              overflow: 'hidden'
            }}>
              <Button
                variant={chartType === 'line' ? 'filled' : 'subtle'}
                size="sm"
                style={{ borderRadius: 0 }}
                onClick={() => setChartType('line')}
              >
                <IconChartLine size="1rem" />
              </Button>
              <Button
                variant={chartType === 'bar' ? 'filled' : 'subtle'}
                size="sm"
                style={{ borderRadius: 0 }}
                onClick={() => setChartType('bar')}
              >
                <IconChartBar size="1rem" />
              </Button>
              <Button
                variant={chartType === 'area' ? 'filled' : 'subtle'}
                size="sm"
                style={{ borderRadius: 0 }}
                onClick={() => setChartType('area')}
              >
                <IconChartArea size="1rem" />
              </Button>
            </Group>
            
            <ActionIcon variant="light" onClick={() => setExportModalOpen(true)}>
              <IconDownload size="1rem" />
            </ActionIcon>
            
            {onRefresh && (
              <ActionIcon variant="light" onClick={onRefresh}>
                <IconRefresh size="1rem" />
              </ActionIcon>
            )}
          </Group>
        </Group>
        
        <div style={{ height: '400px' }}>
          {chartType === 'bar' ? (
            <Bar data={chartData} options={chartOptions} />
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </Card>

      <Modal
        opened={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Chart Data"
        size="sm"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Choose the format to export your chart data:
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
                border: exportFormat === 'png' ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)'
              }}
              onClick={() => setExportFormat('png')}
            >
              <Group justify="space-between">
                <div>
                  <Text fw={500}>PNG</Text>
                  <Text size="sm" c="dimmed">Export chart as PNG image</Text>
                </div>
                {exportFormat === 'png' && <Badge color="blue">Selected</Badge>}
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
    </>
  );
}