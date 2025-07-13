'use client';

import React from 'react';
import {
  Card,
  Text,
  Title,
  Group,
  ThemeIcon,
  Stack,
  Divider,
  Alert,
  Badge
} from '@mantine/core';
import {
  IconBriefcase,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle
} from '@tabler/icons-react';

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
  overallScore: number;
  focusAreas: string[];
}

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData;
  loading?: boolean;
}

export default function ExecutiveSummary({ data, loading = false }: ExecutiveSummaryProps) {
  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group mb="md">
          <ThemeIcon size="lg" variant="light" color="blue">
            <IconBriefcase size="1.2rem" />
          </ThemeIcon>
          <Title order={3}>Executive Summary</Title>
        </Group>
        <Text c="dimmed">Loading executive summary...</Text>
      </Card>
    );
  }

  const formatTrend = (trend: number) => {
    const isPositive = trend > 0;
    const isNegative = trend < 0;
    const color = isPositive ? 'green' : isNegative ? 'red' : 'gray';
    const icon = isPositive ? <IconTrendingUp size="0.8rem" /> : <IconTrendingDown size="0.8rem" />;
    
    return (
      <Group gap="xs">
        <ThemeIcon size="sm" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        <Text size="sm" c={color} fw={500}>
          {isPositive ? '+' : ''}{trend.toFixed(1)}%
        </Text>
      </Group>
    );
  };

  const generateSummaryText = () => {
    // Check if we have any meaningful data
    const hasSearchData = data.totalSearches > 0;
    const hasVisitorData = data.uniqueVisitors > 0;
    const hasData = hasSearchData || hasVisitorData;
    
    if (!hasData) {
      return `Your store analytics are ready to start tracking! Over the ${data.period}, no search or visitor data has been recorded yet. This is normal for new stores or stores that haven't implemented tracking yet. Once customers start visiting and searching your store, this summary will provide valuable insights into their behavior and help you optimize your store performance.`;
    }
    
    const searchTrendText = data.searchTrend > 0 ? 'increased' : data.searchTrend < 0 ? 'decreased' : 'remained stable';
    const visitorTrendText = data.visitorTrend > 0 ? 'grew' : data.visitorTrend < 0 ? 'declined' : 'remained steady';
    
    let summaryText = `Over the ${data.period}, your store recorded `;
    
    if (hasSearchData) {
      summaryText += `${data.totalSearches.toLocaleString()} total searches`;
    } else {
      summaryText += `no searches yet`;
    }
    
    if (hasVisitorData) {
      summaryText += ` from ${data.uniqueVisitors.toLocaleString()} unique visitors`;
    } else {
      summaryText += ` and no visitors yet`;
    }
    
    summaryText += `.`;
    
    if (hasSearchData && Math.abs(data.searchTrend) > 0) {
      summaryText += ` Search activity ${searchTrendText} by ${Math.abs(data.searchTrend).toFixed(1)}%.`;
    }
    
    if (hasVisitorData && Math.abs(data.visitorTrend) > 0) {
      summaryText += ` Visitor traffic ${visitorTrendText} by ${Math.abs(data.visitorTrend).toFixed(1)}%.`;
    }
    
    if (hasSearchData && data.topSearchCount > 0 && data.topSearchTerm !== 'No search data available') {
      summaryText += ` The most popular search term was "${data.topSearchTerm}" with ${data.topSearchCount} searches.`;
    }
    
    if (hasVisitorData && data.bounceRate > 0) {
      summaryText += ` Your current bounce rate is ${data.bounceRate.toFixed(1)}% with an average session duration of ${Math.floor(data.avgSessionDuration / 60)} minutes ${data.avgSessionDuration % 60} seconds, indicating ${data.bounceRate < 40 ? 'good' : data.bounceRate < 60 ? 'moderate' : 'poor'} user engagement levels.`;
    }
    
    return summaryText;
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group mb="md">
        <ThemeIcon size="lg" variant="light" color="blue">
          <IconBriefcase size="1.2rem" />
        </ThemeIcon>
        <div>
          <Title order={3}>AI Business Insights</Title>
          <Text size="sm" c="dimmed">
            {data.period} Performance Overview
          </Text>
        </div>
        {data.overallScore !== undefined && (
          <div style={{ marginLeft: 'auto' }}>
            <Text size="xs" c="dimmed" ta="center">Business Score</Text>
            <Text size="xl" fw={700} ta="center" c={
              data.overallScore >= 80 ? 'green' : 
              data.overallScore >= 60 ? 'blue' : 
              data.overallScore >= 40 ? 'orange' : 'red'
            }>
              {data.overallScore}/100
            </Text>
          </div>
        )}
      </Group>

      {/* Key Metrics Summary */}
      <Text mb="md" style={{ lineHeight: 1.6 }}>
        {generateSummaryText()}
      </Text>

      <Divider mb="md" />

      {/* Key Performance Indicators */}
      <Group mb="md" gap="lg">
        <div>
          <Group gap="xs" mb="xs">
            <Text size="sm" fw={500}>Search Activity</Text>
            {data.totalSearches > 0 ? formatTrend(data.searchTrend) : null}
          </Group>
          <Text size="lg" fw={700} c={data.totalSearches > 0 ? "blue" : "gray"}>
            {data.totalSearches > 0 ? data.totalSearches.toLocaleString() : '0'}
          </Text>
          <Text size="xs" c="dimmed">total searches</Text>
        </div>

        <div>
          <Group gap="xs" mb="xs">
            <Text size="sm" fw={500}>Visitor Growth</Text>
            {data.uniqueVisitors > 0 ? formatTrend(data.visitorTrend) : null}
          </Group>
          <Text size="lg" fw={700} c={data.uniqueVisitors > 0 ? "green" : "gray"}>
            {data.uniqueVisitors > 0 ? data.uniqueVisitors.toLocaleString() : '0'}
          </Text>
          <Text size="xs" c="dimmed">unique visitors</Text>
        </div>

        <div>
          <Text size="sm" fw={500} mb="xs">Top Search</Text>
          <Text size="lg" fw={700} c={data.topSearchCount > 0 ? "purple" : "gray"}>
            {data.topSearchCount > 0 ? data.topSearchTerm : 'None yet'}
          </Text>
          <Text size="xs" c="dimmed">
            {data.topSearchCount > 0 ? `${data.topSearchCount} searches` : 'waiting for data'}
          </Text>
        </div>

        <div>
          <Text size="sm" fw={500} mb="xs">Bounce Rate</Text>
          <Text size="lg" fw={700} c={data.uniqueVisitors > 0 ? (data.bounceRate < 40 ? 'green' : data.bounceRate < 60 ? 'yellow' : 'red') : 'gray'}>
            {data.uniqueVisitors > 0 ? `${data.bounceRate.toFixed(1)}%` : 'N/A'}
          </Text>
          <Text size="xs" c="dimmed">
            {data.uniqueVisitors > 0 ? (data.bounceRate < 40 ? 'excellent' : data.bounceRate < 60 ? 'good' : 'needs improvement') : 'no data yet'}
          </Text>
        </div>
      </Group>

      {/* Focus Areas */}
      {data.focusAreas && data.focusAreas.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <Text size="sm" fw={500} mb="xs">Focus Areas</Text>
          <Group gap="xs">
            {data.focusAreas.map((area, index) => (
              <Badge key={index} variant="light" color="blue">
                {area}
              </Badge>
            ))}
          </Group>
        </div>
      )}

      {/* AI-Generated Insights and Alerts */}
      <Stack gap="sm">
        {data.alerts.length > 0 && (
          <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" variant="light">
            <Text fw={500} size="sm" mb="xs">🚨 Business Alerts</Text>
            {data.alerts.map((alert, index) => (
              <Text key={index} size="sm" style={{ lineHeight: 1.5 }}>• {alert}</Text>
            ))}
          </Alert>
        )}

        {data.keyInsights.length > 0 && (
          <Alert icon={<IconInfoCircle size="1rem" />} color="blue" variant="light">
            <Text fw={500} size="sm" mb="xs">💡 AI Insights</Text>
            {data.keyInsights.map((insight, index) => (
              <Text key={index} size="sm" style={{ lineHeight: 1.5 }}>• {insight}</Text>
            ))}
          </Alert>
        )}

        {data.recommendations.length > 0 && (
          <Alert icon={<IconCheck size="1rem" />} color="green" variant="light">
            <Text fw={500} size="sm" mb="xs">🎯 AI Recommendations</Text>
            {data.recommendations.map((rec, index) => (
              <Text key={index} size="sm" style={{ lineHeight: 1.5 }}>• {rec}</Text>
            ))}
          </Alert>
        )}
      </Stack>

      <Divider mt="md" />
      <Text size="xs" c="dimmed" mt="sm">
        This AI-powered business analysis is generated based on your store&apos;s analytics data for the selected time period. 
        Insights and recommendations are tailored to your specific business metrics and growth stage.
      </Text>
    </Card>
  );
}