'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Stack, 
  Title, 
  Grid, 
  Card, 
  Text, 
  Group, 
  Badge, 
  Table, 
  Alert,
  Loader,
  ThemeIcon,
  rem,
  Tabs,
  SimpleGrid,
  Select,
  ActionIcon
} from '@mantine/core';
import { 
  IconSearch, 
  IconEye, 
  IconTrendingUp, 
  IconUsers,
  IconChartBar,
  IconAlertTriangle,
  IconRefresh,
  IconCalendar,
  IconListSearch,
  IconWorldWww,
  IconCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import TrendDashboard from '@/components/admin/TrendDashboard';

interface SearchAnalytics {
  totalSearches: number;
  uniqueSearches: number;
  averageResultsPerSearch: number;
  mostPopularSearches: {
    search_query: string;
    search_count: number;
    avg_results: number;
    last_searched: string;
  }[];
  searchTrends: {
    date: string;
    search_count: number;
  }[];
  zeroResultSearches: {
    search_query: string;
    search_count: number;
    last_searched: string;
  }[];
}

interface VisitorAnalytics {
  totalVisitors: number;
  uniqueVisitors: number;
  totalPageViews: number;
  averageSessionDuration: number;
  topPages: {
    page_path: string;
    view_count: number;
    unique_visitors: number;
  }[];
  visitorTrends: {
    date: string;
    visitor_count: number;
    page_views: number;
  }[];
}

interface AnalyticsData {
  searchAnalytics: SearchAnalytics;
  visitorAnalytics: VisitorAnalytics;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  color, 
  trend 
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>
          {title}
        </Text>
        <ThemeIcon color={color} variant="light" size="lg">
          {icon}
        </ThemeIcon>
      </Group>
      
      <Group align="flex-end" gap="xs">
        <Text size="xl" fw={700}>
          {value}
        </Text>
        {subtitle && (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Group>
      
      {trend && (
        <Group gap="xs" mt="sm">
          <ThemeIcon 
            size="sm" 
            variant="light" 
            color={trend === 'up' ? 'green' : trend === 'down' ? 'red' : 'gray'}
          >
            <IconTrendingUp size="0.8rem" />
          </ThemeIcon>
          <Text size="xs" c="dimmed">
            vs last period
          </Text>
        </Group>
      )}
    </Card>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [meta, setMeta] = useState<{
    searchTrackingAvailable: boolean;
    visitorTrackingAvailable: boolean;
    dateRange: string;
  } | null>(null);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      if (!token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(`/api/admin/analytics?days=${dateRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
          setMeta(result.meta);
          setError(null);
        } else {
          setError(result.error || 'Failed to load analytics data');
        }
      } else {
        setError('Failed to load analytics data');
      }
    } catch (err) {
      setError('An error occurred while loading analytics data');
      console.error('Analytics data error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange, fetchAnalyticsData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };


  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading analytics...
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size="1rem" />}
        color="red"
        variant="light"
        mb="md"
      >
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert
        icon={<IconAlertCircle size="1rem" />}
        color="yellow"
        variant="light"
        mb="md"
      >
        No analytics data available
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} mb="xs">
            Store Analytics
          </Title>
          <Text c="dimmed">
            Track search behavior, visitor patterns, and store performance
          </Text>
        </div>
        
        <Group>
          <Select
            value={dateRange}
            onChange={(value) => setDateRange(value || '30')}
            data={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' }
            ]}
            leftSection={<IconCalendar size="1rem" />}
            style={{ minWidth: 150 }}
          />
          <ActionIcon variant="outline" onClick={fetchAnalyticsData}>
            <IconRefresh size="1rem" />
          </ActionIcon>
        </Group>
      </Group>

      {/* Data Availability Alerts */}
      {meta && (
        <Stack gap="sm">
          {!meta.searchTrackingAvailable && (
            <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" variant="light">
              Search tracking is not yet available. The search_tracking table needs to be created in the database.
            </Alert>
          )}
          {!meta.visitorTrackingAvailable && (
            <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" variant="light">
              Visitor tracking data may be limited. The visitors table is being used for analytics.
            </Alert>
          )}
        </Stack>
      )}

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconChartBar size="1rem" />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="search" leftSection={<IconSearch size="1rem" />}>
            Search Analytics
          </Tabs.Tab>
          <Tabs.Tab value="visitors" leftSection={<IconUsers size="1rem" />}>
            Visitor Analytics
          </Tabs.Tab>
          <Tabs.Tab value="trends" leftSection={<IconTrendingUp size="1rem" />}>
            Trends
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            {/* Overview Stats */}
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
              <StatCard
                title="Total Searches"
                value={data.searchAnalytics.totalSearches.toLocaleString()}
                subtitle={`${dateRange} days`}
                icon={<IconSearch style={{ width: rem(20), height: rem(20) }} />}
                color="blue"
              />
              
              <StatCard
                title="Unique Visitors"
                value={data.visitorAnalytics.uniqueVisitors.toLocaleString()}
                subtitle={`${dateRange} days`}
                icon={<IconUsers style={{ width: rem(20), height: rem(20) }} />}
                color="green"
              />
              
              <StatCard
                title="Page Views"
                value={data.visitorAnalytics.totalPageViews.toLocaleString()}
                subtitle="total views"
                icon={<IconEye style={{ width: rem(20), height: rem(20) }} />}
                color="cyan"
              />
              
              <StatCard
                title="Avg Results/Search"
                value={data.searchAnalytics.averageResultsPerSearch.toFixed(1)}
                subtitle="products found"
                icon={<IconListSearch style={{ width: rem(20), height: rem(20) }} />}
                color="purple"
              />
            </SimpleGrid>

            {/* Quick Insights */}
            <Grid>
              <Grid.Col span={{ base: 12, lg: 6 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="md">
                    <Title order={3}>Top Search Terms</Title>
                    <ThemeIcon color="blue" variant="light" size="sm">
                      <IconSearch style={{ width: rem(16), height: rem(16) }} />
                    </ThemeIcon>
                  </Group>
                  
                  {data.searchAnalytics.mostPopularSearches.length > 0 ? (
                    <Stack gap="sm">
                      {data.searchAnalytics.mostPopularSearches.slice(0, 5).map((search, index) => (
                        <Group key={index} justify="space-between">
                          <Text size="sm">{search.search_query}</Text>
                          <Badge variant="light" color="blue">
                            {search.search_count} searches
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" ta="center" py="xl">
                      No search data available yet
                    </Text>
                  )}
                </Card>
              </Grid.Col>

              <Grid.Col span={{ base: 12, lg: 6 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="md">
                    <Title order={3}>Top Pages</Title>
                    <ThemeIcon color="green" variant="light" size="sm">
                      <IconWorldWww style={{ width: rem(16), height: rem(16) }} />
                    </ThemeIcon>
                  </Group>
                  
                  {data.visitorAnalytics.topPages.length > 0 ? (
                    <Stack gap="sm">
                      {data.visitorAnalytics.topPages.slice(0, 5).map((page, index) => (
                        <Group key={index} justify="space-between">
                          <Text size="sm" truncate style={{ maxWidth: 200 }}>
                            {page.page_path}
                          </Text>
                          <Badge variant="light" color="green">
                            {page.view_count} views
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text c="dimmed" ta="center" py="xl">
                      No visitor data available yet
                    </Text>
                  )}
                </Card>
              </Grid.Col>
            </Grid>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="search" pt="md">
          <Stack gap="md">
            {/* Search Stats */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <StatCard
                title="Total Searches"
                value={data.searchAnalytics.totalSearches.toLocaleString()}
                subtitle={`in ${dateRange} days`}
                icon={<IconSearch style={{ width: rem(20), height: rem(20) }} />}
                color="blue"
              />
              
              <StatCard
                title="Unique Search Terms"
                value={data.searchAnalytics.uniqueSearches.toLocaleString()}
                subtitle="different queries"
                icon={<IconListSearch style={{ width: rem(20), height: rem(20) }} />}
                color="cyan"
              />
              
              <StatCard
                title="Zero Results"
                value={data.searchAnalytics.zeroResultSearches.length.toLocaleString()}
                subtitle="improvement opportunities"
                icon={<IconAlertTriangle style={{ width: rem(20), height: rem(20) }} />}
                color="orange"
              />
            </SimpleGrid>

            <Grid>
              {/* Popular Searches */}
              <Grid.Col span={{ base: 12, lg: 6 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={3} mb="md">Most Popular Searches</Title>
                  
                  {data.searchAnalytics.mostPopularSearches.length > 0 ? (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Search Term</Table.Th>
                          <Table.Th>Count</Table.Th>
                          <Table.Th>Avg Results</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data.searchAnalytics.mostPopularSearches.map((search, index) => (
                          <Table.Tr key={index}>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {search.search_query}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="blue">
                                {search.search_count}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">
                                {search.avg_results.toFixed(1)}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text c="dimmed" ta="center" py="xl">
                      No search data available yet
                    </Text>
                  )}
                </Card>
              </Grid.Col>

              {/* Zero Result Searches */}
              <Grid.Col span={{ base: 12, lg: 6 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={3} mb="md">Zero Result Searches</Title>
                  
                  {data.searchAnalytics.zeroResultSearches.length > 0 ? (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Search Term</Table.Th>
                          <Table.Th>Count</Table.Th>
                          <Table.Th>Last Searched</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data.searchAnalytics.zeroResultSearches.map((search, index) => (
                          <Table.Tr key={index}>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {search.search_query}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="orange">
                                {search.search_count}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {formatDate(search.last_searched)}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Alert icon={<IconCheck size="1rem" />} color="green" variant="light">
                      Great! No searches returned zero results.
                    </Alert>
                  )}
                </Card>
              </Grid.Col>
            </Grid>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="visitors" pt="md">
          <Stack gap="md">
            {/* Visitor Stats */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <StatCard
                title="Total Visitors"
                value={data.visitorAnalytics.totalVisitors.toLocaleString()}
                subtitle={`in ${dateRange} days`}
                icon={<IconUsers style={{ width: rem(20), height: rem(20) }} />}
                color="green"
              />
              
              <StatCard
                title="Unique Visitors"
                value={data.visitorAnalytics.uniqueVisitors.toLocaleString()}
                subtitle="distinct users"
                icon={<IconEye style={{ width: rem(20), height: rem(20) }} />}
                color="blue"
              />
              
              <StatCard
                title="Page Views"
                value={data.visitorAnalytics.totalPageViews.toLocaleString()}
                subtitle="total views"
                icon={<IconWorldWww style={{ width: rem(20), height: rem(20) }} />}
                color="cyan"
              />
            </SimpleGrid>

            {/* Top Pages */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={3} mb="md">Most Viewed Pages</Title>
              
              {data.visitorAnalytics.topPages.length > 0 ? (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Page Path</Table.Th>
                      <Table.Th>Total Views</Table.Th>
                      <Table.Th>Unique Visitors</Table.Th>
                      <Table.Th>Views per Visitor</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.visitorAnalytics.topPages.map((page, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {page.page_path}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="blue">
                            {page.view_count}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="green">
                            {page.unique_visitors}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {(page.view_count / page.unique_visitors).toFixed(1)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="dimmed" ta="center" py="xl">
                  No visitor data available yet
                </Text>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="trends" pt="md">
          <TrendDashboard 
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}