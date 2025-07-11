'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Button,
  Text,
  Badge,
  Loader,
  ActionIcon,
  Collapse
} from '@mantine/core';
import {
  IconBrain,
  IconChevronDown,
  IconChevronUp,
  IconShoppingCart,
  IconAlertTriangle,
  IconPackage,
  IconRefresh,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface RecommendationItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  recommended_quantity: number;
  unit_cost: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  days_until_stockout: number;
  sales_velocity?: {
    daily_velocity: number;
    weekly_velocity: number;
    monthly_velocity: number;
    velocity_trend: 'increasing' | 'stable' | 'decreasing';
  };
}

interface SmartReorderWidgetProps {
  onCreatePO?: (items: Array<{
    product_id: string;
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
  }>) => void;
  onQuickReorder?: (item: RecommendationItem) => void;
}

export default function SmartReorderWidget({ 
  onCreatePO, 
  onQuickReorder 
}: SmartReorderWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [summary, setSummary] = useState<{
    total_recommendations: number;
    urgent_items: number;
    high_priority_items: number;
    estimated_cost: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/purchase-orders/recommendations?limit=8', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setRecommendations(result.data.recommendations);
          setSummary(result.data.summary);
        }
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (productId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleCreatePOFromSelected = () => {
    const selectedRecommendations = recommendations.filter(rec => 
      selectedItems.has(rec.product_id)
    );
    
    if (selectedRecommendations.length === 0) {
      notifications.show({
        title: 'No Items Selected',
        message: 'Please select items to add to the purchase order',
        color: 'yellow'
      });
      return;
    }

    const poItems = selectedRecommendations.map(rec => ({
      product_id: rec.product_id,
      product_sku: rec.product_sku,
      product_name: rec.product_name,
      quantity: rec.recommended_quantity,
      unit_cost: rec.unit_cost,
      total_cost: rec.recommended_quantity * rec.unit_cost
    }));

    if (onCreatePO) {
      onCreatePO(poItems);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'blue';
      case 'low': return 'gray';
      default: return 'gray';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'green';
      case 'medium': return 'yellow';
      case 'low': return 'red';
      default: return 'gray';
    }
  };

  const getTrendIcon = (trend: 'increasing' | 'stable' | 'decreasing') => {
    switch (trend) {
      case 'increasing': return <IconTrendingUp size="0.8rem" color="green" />;
      case 'decreasing': return <IconTrendingDown size="0.8rem" color="red" />;
      case 'stable': return <IconMinus size="0.8rem" color="gray" />;
    }
  };

  const formatVelocity = (velocity: number) => {
    if (velocity === 0) return '0';
    if (velocity < 1) return velocity.toFixed(1);
    return Math.round(velocity).toString();
  };

  const urgentCount = recommendations.filter(r => r.priority === 'urgent').length;
  const highCount = recommendations.filter(r => r.priority === 'high').length;
  const totalEstimatedCost = recommendations
    .filter(r => selectedItems.has(r.product_id))
    .reduce((sum, r) => sum + (r.recommended_quantity * r.unit_cost), 0);

  if (loading) {
    return (
      <Card withBorder>
        <Group>
          <Loader size="sm" />
          <Text>Loading AI recommendations...</Text>
        </Group>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card withBorder>
        <Group justify="space-between">
          <Group>
            <IconBrain size="1.2rem" color="green" />
            <Text fw={500}>AI Recommendations</Text>
          </Group>
          <Button
            variant="light"
            size="xs"
            onClick={loadRecommendations}
            leftSection={<IconRefresh size="0.8rem" />}
          >
            Refresh
          </Button>
        </Group>
        <Text size="sm" c="dimmed" mt="sm">
          No reorder recommendations at this time. Your inventory levels look good!
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder>
      {/* Header */}
      <Group justify="space-between" mb="sm">
        <Group>
          <IconBrain size="1.2rem" color="blue" />
          <Text fw={500}>Smart Reorder Recommendations</Text>
          {urgentCount > 0 && (
            <Badge color="red" size="sm">
              {urgentCount} urgent
            </Badge>
          )}
        </Group>
        
        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            onClick={loadRecommendations}
            leftSection={<IconRefresh size="0.8rem" />}
          >
            Refresh
          </Button>
          <ActionIcon
            variant="light"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconChevronUp size="1rem" /> : <IconChevronDown size="1rem" />}
          </ActionIcon>
        </Group>
      </Group>

      {/* Summary */}
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">
          {summary?.total_recommendations || recommendations.length} items need attention
        </Text>
        {selectedItems.size > 0 && (
          <Text size="sm" fw={500}>
            Selected: ${totalEstimatedCost.toFixed(2)}
          </Text>
        )}
      </Group>

      {/* Top Recommendations (always visible) */}
      <Stack gap="xs" mb="sm">
        {recommendations.slice(0, expanded ? recommendations.length : 3).map((rec) => (
          <Group
            key={rec.product_id}
            justify="space-between"
            p="xs"
            style={{
              border: '1px solid #e9ecef',
              borderRadius: '6px',
              backgroundColor: selectedItems.has(rec.product_id) ? '#f8f9fa' : 'transparent',
              cursor: 'pointer'
            }}
            onClick={() => handleSelectItem(rec.product_id)}
          >
            <div style={{ flex: 1 }}>
              <Group gap="xs" mb={2}>
                <Text size="sm" fw={500}>{rec.product_name}</Text>
                <Badge
                  color={getPriorityColor(rec.priority)}
                  size="xs"
                >
                  {rec.priority}
                </Badge>
                <Badge
                  color={getConfidenceColor(rec.confidence)}
                  size="xs"
                  variant="outline"
                >
                  {rec.confidence}
                </Badge>
              </Group>
              
              <Text size="xs" c="dimmed" component="div">
                {rec.reason} • {rec.recommended_quantity} units • ${(rec.recommended_quantity * rec.unit_cost).toFixed(2)}
                {rec.sales_velocity && (
                  <>
                    {' • '}
                    <Group gap={4} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {getTrendIcon(rec.sales_velocity.velocity_trend)}
                      <span>
                        {formatVelocity(rec.sales_velocity.daily_velocity)}/day, {formatVelocity(rec.sales_velocity.weekly_velocity)}/week
                      </span>
                    </Group>
                  </>
                )}
              </Text>
              
              {rec.days_until_stockout <= 14 && (
                <Group gap={4} mt={2}>
                  <IconAlertTriangle size="0.8rem" color="orange" />
                  <Text size="xs" c="orange">
                    {rec.days_until_stockout} days until stockout
                  </Text>
                </Group>
              )}
            </div>
            
            <Group gap="xs">
              <ActionIcon
                size="sm"
                variant="light"
                color="blue"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onQuickReorder) {
                    onQuickReorder(rec);
                  }
                }}
              >
                <IconShoppingCart size="0.8rem" />
              </ActionIcon>
            </Group>
          </Group>
        ))}
      </Stack>

      {/* Action Buttons */}
      <Group justify="space-between">
        <Group gap="xs">
          {!expanded && recommendations.length > 3 && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setExpanded(true)}
            >
              View {recommendations.length - 3} more
            </Button>
          )}
        </Group>
        
        <Group gap="xs">
          {selectedItems.size > 0 && (
            <Button
              size="xs"
              onClick={handleCreatePOFromSelected}
              leftSection={<IconPackage size="0.8rem" />}
            >
              Create PO ({selectedItems.size})
            </Button>
          )}
        </Group>
      </Group>

      {/* Expanded Summary */}
      <Collapse in={expanded}>
        <Card withBorder mt="sm" bg="gray.0">
          <Text fw={500} size="sm" mb="xs">Summary</Text>
          <Group justify="space-between" mb="xs">
            <Text size="xs">Total Recommendations:</Text>
            <Text size="xs" fw={500}>{summary?.total_recommendations || recommendations.length}</Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text size="xs">Urgent Items:</Text>
            <Text size="xs" fw={500} c="red">{urgentCount}</Text>
          </Group>
          <Group justify="space-between" mb="xs">
            <Text size="xs">High Priority:</Text>
            <Text size="xs" fw={500} c="orange">{highCount}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs">Estimated Cost:</Text>
            <Text size="xs" fw={500}>${summary?.estimated_cost?.toFixed(2) || '0.00'}</Text>
          </Group>
        </Card>
      </Collapse>
    </Card>
  );
}