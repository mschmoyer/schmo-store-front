'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  NumberInput,
  Textarea,
  Table,
  Select,
  Text,
  Card,
  Badge,
  Alert,
  Switch
} from '@mantine/core';
import {
  IconPackage,
  IconAlertTriangle,
  IconCheck,
  IconCamera
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface ReceivingItem {
  id: string;
  product_sku: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_pending: number;
  unit_cost: number;
  receiving_quantity: number;
  quality_status: 'pending' | 'approved' | 'rejected';
  quality_notes: string;
  damaged_quantity: number;
  damage_notes: string;
}

interface ReceivingModalProps {
  opened: boolean;
  onClose: () => void;
  purchaseOrder: {
    id: string;
    po_number: string;
    supplier_name: string;
    status: string;
    expected_delivery?: string;
    total_cost: number;
    purchase_order_items?: Array<{
      id: string;
      product_sku: string;
      product_name: string;
      quantity: number;
      quantity_received?: number;
      quantity_pending?: number;
      unit_cost: number;
    }>;
  } | null;
  onSuccess?: () => void;
}

export default function ReceivingModal({ 
  opened, 
  onClose, 
  purchaseOrder, 
  onSuccess 
}: ReceivingModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [warehouseLocation, setWarehouseLocation] = useState('MAIN');
  const [notes, setNotes] = useState('');
  const [partialReceiving, setPartialReceiving] = useState(false);

  useEffect(() => {
    if (opened && purchaseOrder) {
      initializeItems();
    }
  }, [opened, purchaseOrder]);

  const initializeItems = () => {
    if (!purchaseOrder?.purchase_order_items) return;

    const receivingItems: ReceivingItem[] = purchaseOrder.purchase_order_items.map((item) => ({
      id: item.id,
      product_sku: item.product_sku,
      product_name: item.product_name,
      quantity_ordered: item.quantity,
      quantity_received: item.quantity_received || 0,
      quantity_pending: item.quantity_pending || (item.quantity - (item.quantity_received || 0)),
      unit_cost: item.unit_cost,
      receiving_quantity: item.quantity_pending || (item.quantity - (item.quantity_received || 0)),
      quality_status: 'approved',
      quality_notes: '',
      damaged_quantity: 0,
      damage_notes: ''
    }));

    setItems(receivingItems);
  };

  const updateItem = (index: number, field: keyof ReceivingItem, value: string | number) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // Validate receiving quantity
      if (field === 'receiving_quantity') {
        const maxQuantity = newItems[index].quantity_pending;
        if (value > maxQuantity) {
          newItems[index].receiving_quantity = maxQuantity;
        }
      }
      
      // Validate damaged quantity
      if (field === 'damaged_quantity') {
        const maxDamaged = newItems[index].receiving_quantity;
        if (value > maxDamaged) {
          newItems[index].damaged_quantity = maxDamaged;
        }
      }
      
      return newItems;
    });
  };

  const handleReceiveAll = () => {
    setItems(prev =>
      prev.map(item => ({
        ...item,
        receiving_quantity: item.quantity_pending,
        quality_status: 'approved' as const
      }))
    );
  };

  const handleSubmit = async () => {
    // Validate at least one item is being received
    const receivingItems = items.filter(item => item.receiving_quantity > 0);
    if (receivingItems.length === 0) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please specify quantities to receive for at least one item',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrder.id}/receive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: receivingItems.map(item => ({
            purchase_order_item_id: item.id,
            quantity_received: item.receiving_quantity,
            quality_status: item.quality_status,
            quality_notes: item.quality_notes,
            damaged_quantity: item.damaged_quantity,
            damage_notes: item.damage_notes
          })),
          warehouse_location: warehouseLocation,
          notes
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          notifications.show({
            title: 'Success',
            message: `Successfully received ${result.data.received_items} items`,
            color: 'green',
            icon: <IconCheck size="1rem" />
          });
          
          if (onSuccess) {
            onSuccess();
          }
          
          handleClose();
        } else {
          if (result.partial_success) {
            notifications.show({
              title: 'Partial Success',
              message: `Received ${result.received_items} items. Some items had errors.`,
              color: 'yellow'
            });
          } else {
            throw new Error(result.errors?.join(', ') || 'Failed to receive items');
          }
        }
      } else {
        throw new Error('Failed to receive items');
      }
    } catch (error) {
      console.error('Error receiving items:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to receive items',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setItems([]);
    setWarehouseLocation('MAIN');
    setNotes('');
    setPartialReceiving(false);
    onClose();
  };


  const totalReceiving = items.reduce((sum, item) => sum + item.receiving_quantity, 0);
  const totalDamaged = items.reduce((sum, item) => sum + item.damaged_quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.receiving_quantity * item.unit_cost), 0);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Receive Items - ${purchaseOrder?.po_number}`}
      size="xl"
      centered
    >
      <Stack gap="md">
        {/* Purchase Order Info */}
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Purchase Order Details</Text>
            <Badge color="blue">{purchaseOrder?.status}</Badge>
          </Group>
          <Group>
            <Text size="sm">Supplier: <strong>{purchaseOrder?.supplier_name}</strong></Text>
            <Text size="sm">Expected Delivery: <strong>{purchaseOrder?.expected_delivery}</strong></Text>
            <Text size="sm">Total Cost: <strong>${purchaseOrder?.total_cost?.toFixed(2)}</strong></Text>
          </Group>
        </Card>

        {/* Quick Actions */}
        <Group>
          <Button
            variant="light"
            leftSection={<IconCheck size="1rem" />}
            onClick={handleReceiveAll}
          >
            Receive All
          </Button>
          <Switch
            label="Partial Receiving"
            checked={partialReceiving}
            onChange={(event) => setPartialReceiving(event.currentTarget.checked)}
          />
        </Group>

        {/* Receiving Settings */}
        <Group grow>
          <Select
            label="Warehouse Location"
            value={warehouseLocation}
            onChange={(value) => setWarehouseLocation(value || 'MAIN')}
            data={[
              { value: 'MAIN', label: 'Main Warehouse' },
              { value: 'SECONDARY', label: 'Secondary Storage' },
              { value: 'OVERFLOW', label: 'Overflow Area' }
            ]}
          />
        </Group>

        {/* Items Table */}
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Product</Table.Th>
              <Table.Th>Ordered</Table.Th>
              <Table.Th>Pending</Table.Th>
              <Table.Th>Receiving</Table.Th>
              <Table.Th>Quality</Table.Th>
              <Table.Th>Damaged</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item, index) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <div>
                    <Text size="sm" fw={500}>{item.product_name}</Text>
                    <Text size="xs" c="dimmed">{item.product_sku}</Text>
                  </div>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{item.quantity_ordered}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>{item.quantity_pending}</Text>
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.receiving_quantity}
                    onChange={(value) => updateItem(index, 'receiving_quantity', value || 0)}
                    min={0}
                    max={item.quantity_pending}
                    size="sm"
                    style={{ width: 80 }}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={item.quality_status}
                    onChange={(value) => updateItem(index, 'quality_status', value || 'approved')}
                    data={[
                      { value: 'approved', label: 'Approved' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'rejected', label: 'Rejected' }
                    ]}
                    size="sm"
                    style={{ width: 120 }}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={item.damaged_quantity}
                    onChange={(value) => updateItem(index, 'damaged_quantity', value || 0)}
                    min={0}
                    max={item.receiving_quantity}
                    size="sm"
                    style={{ width: 80 }}
                  />
                </Table.Td>
                <Table.Td>
                  <Textarea
                    placeholder="Notes..."
                    value={item.quality_notes}
                    onChange={(e) => updateItem(index, 'quality_notes', e.target.value)}
                    size="sm"
                    minRows={1}
                    autosize
                    style={{ minWidth: 120 }}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {/* Summary */}
        <Card withBorder>
          <Text fw={500} mb="sm">Receiving Summary</Text>
          <Group justify="space-between">
            <Text>Total Items Receiving:</Text>
            <Text fw={500}>{totalReceiving}</Text>
          </Group>
          <Group justify="space-between">
            <Text>Damaged Items:</Text>
            <Text fw={500} c={totalDamaged > 0 ? 'red' : undefined}>
              {totalDamaged}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text>Total Value:</Text>
            <Text fw={500}>${totalValue.toFixed(2)}</Text>
          </Group>
        </Card>

        {/* General Notes */}
        <Textarea
          label="Receiving Notes"
          placeholder="Add any notes about this receiving..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          minRows={3}
        />

        {/* Validation Alerts */}
        {totalReceiving === 0 && (
          <Alert icon={<IconAlertTriangle size="1rem" />} color="yellow">
            No items selected for receiving. Please specify quantities to receive.
          </Alert>
        )}

        {totalDamaged > 0 && (
          <Alert icon={<IconAlertTriangle size="1rem" />} color="orange">
            {totalDamaged} damaged items detected. These will not be added to inventory.
          </Alert>
        )}

        {/* Action Buttons */}
        <Group justify="space-between" mt="xl">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          
          <Group>
            <Button
              variant="light"
              leftSection={<IconCamera size="1rem" />}
              disabled
            >
              Scan Barcode
            </Button>
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={totalReceiving === 0}
              leftSection={<IconPackage size="1rem" />}
            >
              Receive Items
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}