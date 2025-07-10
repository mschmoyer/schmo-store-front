'use client';

import React, { useState } from 'react';
import { 
  Card, 
  Button, 
  Group, 
  Stack, 
  Text, 
  Code, 
  Alert,
  Badge
} from '@mantine/core';
import { IconEdit, IconInfoCircle } from '@tabler/icons-react';
import InventoryEditModal from '@/components/admin/InventoryEditModal';

/**
 * Demo Component for Inventory Edit Modal
 * 
 * This component demonstrates the inventory edit functionality
 * with sample data for testing purposes.
 */
export default function InventoryEditDemo() {
  const [modalOpened, setModalOpened] = useState(false);
  
  // Sample inventory item for demo
  const sampleInventoryItem = {
    id: 'demo-item-001',
    name: 'Demo Product - Wireless Headphones',
    sku: 'WH-001',
    stock_quantity: 25,
    low_stock_threshold: 10,
    unit_cost: 45.99,
    base_price: 89.99,
    featured_image_url: null,
    category: 'Electronics',
    supplier: 'TechCorp',
    last_restocked: '2024-01-15T10:30:00Z',
    forecast_30_days: 15,
    forecast_90_days: 45,
    avg_monthly_sales: 12,
    reorder_point: 15,
    reorder_quantity: 50,
    status: 'in_stock' as const
  };

  const handleEditSuccess = (updatedItem: { id: string; name: string; [key: string]: unknown }) => {
    console.log('Item updated successfully:', updatedItem);
    // In real implementation, this would update the inventory list
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="lg" fw={600}>Inventory Edit Modal Demo</Text>
          <Badge color="blue" variant="light">Demo Component</Badge>
        </Group>

        <Alert
          icon={<IconInfoCircle size="1rem" />}
          color="blue"
          variant="light"
          title="Demo Information"
        >
          This is a demonstration of the inventory edit modal functionality.
          Click the &quot;Edit Item&quot; button to open the modal with sample data.
        </Alert>

        <div>
          <Text size="sm" fw={500} mb="xs">Sample Item Data:</Text>
          <Code block>
            {JSON.stringify(sampleInventoryItem, null, 2)}
          </Code>
        </div>

        <Group justify="center">
          <Button 
            leftSection={<IconEdit size="1rem" />}
            onClick={() => setModalOpened(true)}
          >
            Edit Item
          </Button>
        </Group>

        <InventoryEditModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          item={sampleInventoryItem}
          onSuccess={handleEditSuccess}
        />
      </Stack>
    </Card>
  );
}