'use client';

import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Stack, 
  Group, 
  Button, 
  NumberInput, 
  Textarea, 
  Select, 
  Alert, 
  Text,
  Divider,
  Badge,
  Avatar
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { 
  IconAlertCircle, 
  IconCheck, 
  IconShoppingCart,
  IconEdit,
  IconCurrency,
  IconTruckDelivery,
  IconPackage
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_cost: number;
  base_price: number;
  featured_image_url: string | null;
  category: string;
  supplier: string;
  last_restocked: string;
  forecast_30_days: number;
  forecast_90_days: number;
  avg_monthly_sales: number;
  reorder_point: number;
  reorder_quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';
}

interface InventoryEditModalProps {
  opened: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onSuccess: (updatedItem: InventoryItem) => void;
}

interface FormValues {
  stock_quantity: number;
  adjustment_quantity: number;
  adjustment_type: 'add' | 'subtract' | 'set';
  low_stock_threshold: number;
  unit_cost: number;
  reorder_point: number;
  reorder_quantity: number;
  supplier: string;
  adjustment_notes: string;
}

/**
 * Inventory Edit Modal Component
 * 
 * @param opened - Whether the modal is open
 * @param onClose - Function to close the modal
 * @param item - The inventory item to edit
 * @param onSuccess - Function called when edit is successful
 */
export default function InventoryEditModal({ 
  opened, 
  onClose, 
  item, 
  onSuccess 
}: InventoryEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    initialValues: {
      stock_quantity: 0,
      adjustment_quantity: 0,
      adjustment_type: 'add',
      low_stock_threshold: 10,
      unit_cost: 0,
      reorder_point: 0,
      reorder_quantity: 0,
      supplier: '',
      adjustment_notes: ''
    },
    validate: {
      low_stock_threshold: (value) => value < 0 ? 'Low stock threshold must be non-negative' : null,
      unit_cost: (value) => value < 0 ? 'Unit cost must be non-negative' : null,
      reorder_point: (value) => value < 0 ? 'Reorder point must be non-negative' : null,
      reorder_quantity: (value) => value < 1 ? 'Reorder quantity must be at least 1' : null,
      adjustment_quantity: (value, values) => {
        if (values.adjustment_type === 'subtract' && value > values.stock_quantity) {
          return 'Cannot subtract more than current stock';
        }
        return null;
      }
    }
  });

  // Update form when item changes
  useEffect(() => {
    if (item) {
      form.setValues({
        stock_quantity: item.stock_quantity,
        adjustment_quantity: 0,
        adjustment_type: 'add',
        low_stock_threshold: item.low_stock_threshold,
        unit_cost: item.unit_cost,
        reorder_point: item.reorder_point,
        reorder_quantity: item.reorder_quantity,
        supplier: item.supplier,
        adjustment_notes: ''
      });
      setError(null);
    }
  }, [item, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!item) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Calculate the new stock quantity based on adjustment
      let newStockQuantity = values.stock_quantity;
      let quantityChange = 0;

      if (values.adjustment_type === 'add') {
        newStockQuantity = values.stock_quantity + values.adjustment_quantity;
        quantityChange = values.adjustment_quantity;
      } else if (values.adjustment_type === 'subtract') {
        newStockQuantity = Math.max(0, values.stock_quantity - values.adjustment_quantity);
        quantityChange = -values.adjustment_quantity;
      } else if (values.adjustment_type === 'set') {
        newStockQuantity = values.adjustment_quantity;
        quantityChange = values.adjustment_quantity - values.stock_quantity;
      }

      // Prepare the update payload
      const updateData = {
        stock_quantity: newStockQuantity,
        low_stock_threshold: values.low_stock_threshold,
        unit_cost: values.unit_cost,
        reorder_point: values.reorder_point,
        reorder_quantity: values.reorder_quantity,
        supplier: values.supplier,
        adjustment_notes: values.adjustment_notes,
        quantity_change: quantityChange
      };

      const response = await fetch(`/api/admin/inventory/${item.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update inventory item');
      }

      const result = await response.json();
      
      if (result.success) {
        notifications.show({
          title: 'Inventory Updated',
          message: `Successfully updated ${item.name}`,
          color: 'green',
          icon: <IconCheck size="1rem" />
        });

        // Call the success callback with updated item
        onSuccess(result.data);
        onClose();
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (error) {
      console.error('Error updating inventory:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while updating inventory');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_stock': return 'green';
      case 'low_stock': return 'yellow';
      case 'out_of_stock': return 'red';
      case 'discontinued': return 'gray';
      default: return 'gray';
    }
  };

  const calculateNewStock = () => {
    const values = form.values;
    if (values.adjustment_type === 'add') {
      return values.stock_quantity + values.adjustment_quantity;
    } else if (values.adjustment_type === 'subtract') {
      return Math.max(0, values.stock_quantity - values.adjustment_quantity);
    } else if (values.adjustment_type === 'set') {
      return values.adjustment_quantity;
    }
    return values.stock_quantity;
  };

  const suppliers = [
    { value: 'ShipStation', label: 'ShipStation' },
    { value: 'TechCorp', label: 'TechCorp' },
    { value: 'HomeGoods Inc', label: 'HomeGoods Inc' },
    { value: 'Custom Supplier', label: 'Custom Supplier' }
  ];

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title={
        <Group>
          <IconEdit size="1.2rem" />
          <Text size="lg" fw={600}>Edit Inventory Item</Text>
        </Group>
      }
      size="lg"
      centered
    >
      {item && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            {/* Item Header */}
            <Group gap="sm" mb="md">
              <Avatar 
                src={item.featured_image_url} 
                size="md" 
                radius="sm"
              >
                <IconShoppingCart size="1.2rem" />
              </Avatar>
              <div style={{ flex: 1 }}>
                <Text size="lg" fw={600}>{item.name}</Text>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">SKU: {item.sku}</Text>
                  <Badge 
                    color={getStatusColor(item.status)}
                    variant="light"
                    size="sm"
                  >
                    {item.status.replace('_', ' ')}
                  </Badge>
                </Group>
              </div>
            </Group>

            {error && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="red"
                variant="light"
                title="Error"
              >
                {error}
              </Alert>
            )}

            {/* Stock Adjustment Section */}
            <div>
              <Text size="sm" fw={500} mb="xs">
                <IconPackage size="1rem" style={{ display: 'inline', marginRight: '0.5rem' }} />
                Stock Adjustment
              </Text>
              <Group align="flex-end">
                <Select
                  label="Adjustment Type"
                  data={[
                    { value: 'add', label: 'Add to Stock' },
                    { value: 'subtract', label: 'Remove from Stock' },
                    { value: 'set', label: 'Set Stock To' }
                  ]}
                  {...form.getInputProps('adjustment_type')}
                  style={{ flex: 1 }}
                />
                <NumberInput
                  label="Quantity"
                  min={0}
                  {...form.getInputProps('adjustment_quantity')}
                  style={{ flex: 1 }}
                />
                <div style={{ flex: 1 }}>
                  <Text size="xs" c="dimmed" mb="xs">Current Stock</Text>
                  <Text size="lg" fw={600}>{item.stock_quantity}</Text>
                </div>
                <div style={{ flex: 1 }}>
                  <Text size="xs" c="dimmed" mb="xs">New Stock</Text>
                  <Text size="lg" fw={600} c={calculateNewStock() < form.values.low_stock_threshold ? 'red' : 'green'}>
                    {calculateNewStock()}
                  </Text>
                </div>
              </Group>
            </div>

            <Textarea
              label="Adjustment Notes"
              placeholder="Reason for stock adjustment..."
              {...form.getInputProps('adjustment_notes')}
              minRows={2}
            />

            <Divider />

            {/* Inventory Settings */}
            <Text size="sm" fw={500} mb="xs">
              <IconCurrency size="1rem" style={{ display: 'inline', marginRight: '0.5rem' }} />
              Inventory Settings
            </Text>

            <Group>
              <NumberInput
                label="Low Stock Threshold"
                min={0}
                {...form.getInputProps('low_stock_threshold')}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Unit Cost ($)"
                min={0}
                precision={2}
                {...form.getInputProps('unit_cost')}
                style={{ flex: 1 }}
              />
            </Group>

            <Group>
              <NumberInput
                label="Reorder Point"
                min={0}
                {...form.getInputProps('reorder_point')}
                style={{ flex: 1 }}
              />
              <NumberInput
                label="Reorder Quantity"
                min={1}
                {...form.getInputProps('reorder_quantity')}
                style={{ flex: 1 }}
              />
            </Group>

            <Select
              label="Supplier"
              data={suppliers}
              {...form.getInputProps('supplier')}
              searchable
              creatable
              getCreateLabel={(query) => `+ Create "${query}"`}
              onCreate={(query) => {
                const newSupplier = { value: query, label: query };
                return newSupplier;
              }}
              leftSection={<IconTruckDelivery size="1rem" />}
            />

            {/* Forecasting Info */}
            <div>
              <Text size="sm" fw={500} mb="xs">Forecasting Information</Text>
              <Group>
                <div>
                  <Text size="xs" c="dimmed">30-Day Forecast</Text>
                  <Text size="sm" fw={500}>{item.forecast_30_days}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">90-Day Forecast</Text>
                  <Text size="sm" fw={500}>{item.forecast_90_days}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Avg Monthly Sales</Text>
                  <Text size="sm" fw={500}>{item.avg_monthly_sales}</Text>
                </div>
              </Group>
            </div>

            {/* Action Buttons */}
            <Group justify="flex-end" mt="md">
              <Button 
                variant="outline" 
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                loading={loading}
                leftSection={<IconCheck size="1rem" />}
              >
                {loading ? 'Updating...' : 'Update Inventory'}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}