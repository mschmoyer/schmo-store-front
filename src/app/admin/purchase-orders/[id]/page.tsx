'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Title,
  Table,
  Button,
  TextInput,
  Select,
  Badge,
  Group,
  Text,
  Stack,
  Flex,
  Alert,
  Skeleton,
  Card,
  SimpleGrid,
  NumberInput,
  Textarea,
  Modal,
  Divider,
  ActionIcon,
  Progress,
  Container
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconPackage,
  IconAlertTriangle,
  IconRefresh
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { useRouter } from 'next/navigation';
import table from '@/components/admin/adminTable.module.css';

// Types
/*
 * Every status the database allows.
 *
 * Three were missing — `draft`, `partially_received` and `closed` — and the omissions were not
 * cosmetic. Receiving 7 of 10 units sets `partially_received`, which had no label and no colour, so
 * the header rendered an **empty status pill** and the list page showed the raw enum. Worse, the
 * Receive button was gated on `status === 'shipped'`, so it disappeared the moment a partial
 * receipt happened and the outstanding 3 units could never be received: the order was trapped.
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'shipped'
  | 'partially_received'
  | 'delivered'
  | 'closed'
  | 'cancelled';

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  received_quantity: number;
  current_product?: {
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
    base_price: number;
  };
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  /* The API returns `supplier_name`. This declared `supplier`, so the Supplier row on the detail
   * page rendered empty while the list page — reading the right field — showed the name. */
  supplier_name: string;
  supplier_id: string | null;
  order_date: string;
  expected_delivery: string;
  actual_delivery: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  /* The column is `total_cost`. Reading `total_amount` rendered the order total as **$NaN** beside
   * a correct subtotal. */
  total_cost: number;
  notes: string;
  created_at: string;
  updated_at: string;
  items: PurchaseOrderItem[];
}

/**
 * Statuses an order can still be received against.
 *
 * Deliberately includes `partially_received`: a part-delivered order is the one most likely to have
 * another box arrive.
 */
const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  'draft',
  'pending',
  'approved',
  'shipped',
  'partially_received'
];

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  draft: 'gray',
  pending: 'yellow',
  approved: 'blue',
  shipped: 'cyan',
  partially_received: 'orange',
  delivered: 'green',
  closed: 'gray',
  cancelled: 'red'
};

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  shipped: 'Shipped',
  /* Named, because "some of it arrived" is a different situation from both "nothing has" and
   * "everything has", and it is the one that needs action. */
  partially_received: 'Partly received',
  delivered: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

/**
 * Purchase Order Detail/Edit Page Component
 * 
 * Displays purchase order details and allows editing of:
 * - Basic purchase order information
 * - Status updates
 * - Item receiving functionality
 * - Notes and tracking
 * 
 * @param props - Route props; `params` is a promise in the App Router, which
 *   this page previously typed as a plain object. Next's generated route
 *   validator rejects that, so the page failed type-checking on any build that
 *   had produced `.next/types`.
 * @returns JSX.Element
 */
export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: purchaseOrderId } = React.use(params);
  const router = useRouter();
  const { session, isAuthenticated } = useAdmin();
  
  // State management
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  /* Identifies one delivery across retries, so a double-click cannot book it twice. */
  const receiptKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    supplier: '',
    order_date: '',
    expected_delivery: '',
    notes: ''
  });
  
  // Modals
  const [statusModalOpened, { open: openStatusModal, close: closeStatusModal }] = useDisclosure(false);
  const [receiveModalOpened, { open: openReceiveModal, close: closeReceiveModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  
  // Modal state
  const [newStatus, setNewStatus] = useState<PurchaseOrderStatus>('pending');
  const [receivingData, setReceivingData] = useState<Record<string, number>>({});
  
  /**
   * Fetch purchase order details
   */
  const fetchPurchaseOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrderId}`, {
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Purchase order not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch purchase order');
      }
      
      const po = result.data.purchase_order;
      setPurchaseOrder(po);
      
      // Initialize form data
      setFormData({
        supplier: po.supplier || '',
        order_date: po.order_date || '',
        expected_delivery: po.expected_delivery || '',
        notes: po.notes || ''
      });
      
      // Initialize receiving data
      const initialReceivingData: Record<string, number> = {};
      po.items.forEach((item: PurchaseOrderItem) => {
        initialReceivingData[item.id] = 0;
      });
      setReceivingData(initialReceivingData);
      
    } catch (err) {
      console.error('Error fetching purchase order:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch purchase order');
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId, session?.sessionToken]);
  
  /**
   * Update purchase order
   */
  const updatePurchaseOrder = async () => {
    if (!purchaseOrder) return;
    
    setSaving(true);
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update purchase order');
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update purchase order');
      }
      
      setPurchaseOrder(result.data.purchase_order);
      setEditing(false);
      
      notifications.show({
        title: 'Success',
        message: 'Purchase order updated successfully',
        color: 'green'
      });
      
    } catch (err) {
      console.error('Error updating purchase order:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to update purchase order',
        color: 'red'
      });
    } finally {
      setSaving(false);
    }
  };
  
  /**
   * Update purchase order status
   */
  const updateStatus = async (status: PurchaseOrderStatus) => {
    if (!purchaseOrder) return;
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrder.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update status');
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update status');
      }
      
      setPurchaseOrder(prev => prev ? { ...prev, status } : null);
      
      notifications.show({
        title: 'Success',
        message: `Status updated to ${STATUS_LABELS[status]}`,
        color: 'green'
      });
      
    } catch (err) {
      console.error('Error updating status:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to update status',
        color: 'red'
      });
    }
  };
  
  /**
   * Receive items
   */
  const receiveItems = async () => {
    if (!purchaseOrder) return;
    
    const itemsToReceive = Object.entries(receivingData)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({
        purchase_order_item_id: itemId,
        quantity_received: quantity
      }));
    
    if (itemsToReceive.length === 0) {
      notifications.show({
        title: 'Warning',
        message: 'Please enter quantities to receive',
        color: 'yellow'
      });
      return;
    }
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      /*
       * The real receive endpoint, which posts to the stock ledger.
       *
       * This posted `action: 'receive_items'` to the PATCH handler, which referenced a column named
       * `received_quantity` that does not exist — the column is `quantity_received` — so the button
       * returned 500 for every shape of request, including an empty one. That dead path also wrote
       * `stock_quantity` directly, outside the ledger, and ran `BEGIN` on the pool rather than on a
       * checked-out client. It has been deleted; this is the endpoint the receiving modal already
       * used.
       */
      if (!receiptKeyRef.current) {
        receiptKeyRef.current = `${purchaseOrder.id}-${crypto.randomUUID()}`;
      }

      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrder.id}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          items: itemsToReceive,
          idempotency_key: receiptKeyRef.current
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Could not receive the delivery (${response.status})`);
      }
      
      /* The endpoint's own sentence, which says whether the order is now complete and how many
       * units are still outstanding. */
      notifications.show({
        title: result.replayed ? 'Already recorded' : 'Received',
        message: result.message ?? result.data?.message ?? 'The delivery was recorded.',
        color: 'green'
      });

      const warnings: string[] = result.data?.warnings ?? [];
      if (warnings.length > 0) {
        notifications.show({
          title: 'Worth checking',
          message: warnings.join('. '),
          color: 'yellow',
          autoClose: 12000
        });
      }

      receiptKeyRef.current = null;
      
      // Reset receiving data
      const resetReceivingData: Record<string, number> = {};
      purchaseOrder.items.forEach((item: PurchaseOrderItem) => {
        resetReceivingData[item.id] = 0;
      });
      setReceivingData(resetReceivingData);
      
      // Refresh purchase order data
      fetchPurchaseOrder();
      closeReceiveModal();
      
    } catch (err) {
      console.error('Error receiving items:', err);
      notifications.show({
        title: 'Could not receive',
        /* The reason, not a generic sentence: an over-receipt refusal and a lost connection need
         * different responses from the merchant. */
        message: err instanceof Error ? err.message : 'Failed to receive items',
        color: 'red'
      });
    }
  };
  
  /**
   * Delete purchase order
   */
  const deletePurchaseOrder = async () => {
    if (!purchaseOrder) return;
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrder.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete purchase order');
      }
      
      notifications.show({
        title: 'Success',
        message: 'Purchase order deleted successfully',
        color: 'green'
      });
      
      router.push('/admin/purchase-orders');
      
    } catch (err) {
      console.error('Error deleting purchase order:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete purchase order',
        color: 'red'
      });
    }
  };
  
  /**
   * Format currency values
   */
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };
  
  /**
   * Format date values
   */
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };
  
  /**
   * Calculate receiving progress for an item
   */
  const getReceivingProgress = (item: PurchaseOrderItem) => {
    const percentage = (item.received_quantity / item.quantity) * 100;
    return Math.min(percentage, 100);
  };
  
  // Fetch data on component mount
  useEffect(() => {
    if (isAuthenticated && session?.sessionToken) {
      fetchPurchaseOrder();
    }
  }, [isAuthenticated, session?.sessionToken, fetchPurchaseOrder]);
  
  if (loading) {
    return (
      <Container size="lg">
        <Skeleton height={60} mb="md" />
        <Skeleton height={400} />
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container size="lg">
        <Alert 
          icon={<IconAlertTriangle size={16} />} 
          title="Error" 
          color="red" 
          variant="light"
          mb="md"
        >
          {error}
          <Button 
            variant="light" 
            size="sm" 
            mt="sm" 
            onClick={fetchPurchaseOrder}
          >
            Try Again
          </Button>
        </Alert>
      </Container>
    );
  }
  
  if (!purchaseOrder) {
    return (
      <Container size="lg">
        <Alert 
          icon={<IconAlertTriangle size={16} />} 
          title="Not Found" 
          color="yellow" 
          variant="light"
        >
          Purchase order not found.
        </Alert>
      </Container>
    );
  }

  /* What is still to arrive. Drives whether receiving is offered at all, and says how much is
   * outstanding on the button itself so the merchant does not have to add it up from the table. */
  const unitsOutstanding = purchaseOrder.items.reduce(
    (total, item) => total + Math.max(0, item.quantity - (item.received_quantity ?? 0)),
    0
  );

  return (
    <Container size="lg">
      {/* Header */}
      <Flex justify="space-between" align="center" mb="xl">
        <Group>
          <ActionIcon
            variant="light"
            size="lg"
            onClick={() => router.push('/admin/purchase-orders')}
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Box>
            <Title order={1} mb="xs">
              Purchase Order {purchaseOrder.po_number}
            </Title>
            <Group gap="xs">
              <Badge
                color={STATUS_COLORS[purchaseOrder.status]}
                variant="light"
                size="lg"
              >
                {STATUS_LABELS[purchaseOrder.status]}
              </Badge>
              <Text c="dimmed" size="sm">
                Created {formatDate(purchaseOrder.created_at)}
              </Text>
            </Group>
          </Box>
        </Group>
        
        <Group>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={fetchPurchaseOrder}
          >
            Refresh
          </Button>
          
          {!editing && (
            <Button
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
          
          {editing && (
            <Group>
              <Button
                variant="light"
                leftSection={<IconX size={16} />}
                onClick={() => {
                  setEditing(false);
                  setFormData({
                    supplier: purchaseOrder.supplier_name || '',
                    order_date: purchaseOrder.order_date || '',
                    expected_delivery: purchaseOrder.expected_delivery || '',
                    notes: purchaseOrder.notes || ''
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={updatePurchaseOrder}
                loading={saving}
              >
                Save Changes
              </Button>
            </Group>
          )}
        </Group>
      </Flex>
      
      {/* Purchase Order Details */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="xl">
        <Card withBorder p="lg">
          <Stack>
            <Group justify="space-between" mb="md">
              <Title order={3}>Purchase Order Details</Title>
              <Group>
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconCheck size={14} />}
                  onClick={() => {
                    setNewStatus(purchaseOrder.status);
                    openStatusModal();
                  }}
                >
                  Update Status
                </Button>
              </Group>
            </Group>
            
            <Divider />
            
            <Group justify="space-between">
              <Text fw={500}>Supplier:</Text>
              {editing ? (
                <TextInput
                  value={formData.supplier}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                  style={{ flex: 1, maxWidth: 200 }}
                />
              ) : (
                <Text>{purchaseOrder.supplier_name}</Text>
              )}
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Order Date:</Text>
              {editing ? (
                <DateInput
                  value={formData.order_date || null}
                  onChange={(date) => setFormData(prev => ({
                    ...prev,
                    order_date: date ?? ''
                  }))}
                  style={{ flex: 1, maxWidth: 200 }}
                />
              ) : (
                <Text>{formatDate(purchaseOrder.order_date)}</Text>
              )}
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Expected Delivery:</Text>
              {editing ? (
                <DateInput
                  value={formData.expected_delivery || null}
                  onChange={(date) => setFormData(prev => ({
                    ...prev,
                    expected_delivery: date ?? ''
                  }))}
                  style={{ flex: 1, maxWidth: 200 }}
                />
              ) : (
                <Text>{formatDate(purchaseOrder.expected_delivery)}</Text>
              )}
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Actual Delivery:</Text>
              <Text>{formatDate(purchaseOrder.actual_delivery)}</Text>
            </Group>
            
            <Divider />
            
            <Stack gap="xs">
              <Text fw={500}>Notes:</Text>
              {editing ? (
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add notes..."
                  minRows={3}
                />
              ) : (
                <Text size="sm" c={purchaseOrder.notes ? 'black' : 'dimmed'}>
                  {purchaseOrder.notes || 'No notes'}
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
        
        <Card withBorder p="lg">
          <Stack>
            <Title order={3} mb="md">Order Summary</Title>
            <Divider />
            
            <Group justify="space-between">
              <Text fw={500}>Subtotal:</Text>
              <Text>{formatCurrency(purchaseOrder.subtotal)}</Text>
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Tax:</Text>
              <Text>{formatCurrency(purchaseOrder.tax_amount)}</Text>
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Shipping:</Text>
              <Text>{formatCurrency(purchaseOrder.shipping_amount)}</Text>
            </Group>
            
            <Divider />
            
            <Group justify="space-between">
              <Text fw={700} size="lg">Total:</Text>
              <Text fw={700} size="lg">{formatCurrency(purchaseOrder.total_cost)}</Text>
            </Group>
            
            <Divider />
            
            <Group justify="space-between">
              <Text fw={500}>Items:</Text>
              <Text>{purchaseOrder.items.length} items</Text>
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Last Updated:</Text>
              <Text size="sm">{formatDate(purchaseOrder.updated_at)}</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
      
      {/* Items Section */}
      <Card withBorder p="lg" mb="xl">
        <Group justify="space-between" mb="md">
          <Title order={3}>Items</Title>
          {/*
            * Receivable whenever the order is open and something is still outstanding.
            *
            * This was gated on `status === 'shipped'` alone, so receiving 7 of 10 units flipped the
            * order to `partially_received` and the button vanished — the remaining 3 could never be
            * received and the order was stuck there permanently. A merchant also routinely receives
            * against an order still marked `approved`, because deliveries arrive before anyone
            * updates a status field.
            */}
          {RECEIVABLE_STATUSES.includes(purchaseOrder.status) && unitsOutstanding > 0 && (
            <Button
              leftSection={<IconPackage size={16} />}
              onClick={openReceiveModal}
            >
              Receive items
              <Text span size="xs" ml={6} c="var(--mantine-color-white)">
                ({unitsOutstanding} outstanding)
              </Text>
            </Button>
          )}
        </Group>
        
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Product</Table.Th>
              <Table.Th className={table.numeric}>Quantity</Table.Th>
              <Table.Th className={table.numeric}>Unit cost</Table.Th>
              <Table.Th className={table.numeric}>Total</Table.Th>
              <Table.Th className={table.numeric}>Received</Table.Th>
              <Table.Th>Progress</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {purchaseOrder.items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Stack gap="xs">
                    <Text fw={500}>{item.product_name}</Text>
                    <Text component="span" className={table.code}>{item.product_sku}</Text>
                  </Stack>
                </Table.Td>
                
                <Table.Td className={table.numeric}>
                  <Text fw={500}>{item.quantity}</Text>
                </Table.Td>
                
                <Table.Td className={table.numeric}>
                  <Text>{formatCurrency(item.unit_cost)}</Text>
                </Table.Td>
                
                <Table.Td className={table.numeric}>
                  <Text fw={500}>{formatCurrency(item.total_cost)}</Text>
                </Table.Td>
                
                <Table.Td className={table.numeric}>
                  {/* Fully received is a success (§2 permits the signal);
                      partially received is not a warning, it is just progress. */}
                  <Badge color={item.received_quantity === item.quantity ? 'green' : 'gray'}>
                    {item.received_quantity}/{item.quantity}
                  </Badge>
                </Table.Td>
                
                <Table.Td>
                  <Stack gap="xs">
                    <Progress
                      value={getReceivingProgress(item)}
                      color={item.received_quantity === item.quantity ? 'green' : 'ink'}
                      size="sm"
                    />
                    <Text size="xs" c="dimmed">
                      {getReceivingProgress(item).toFixed(0)}%
                    </Text>
                  </Stack>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      
      {/* Actions */}
      <Card withBorder p="lg">
        <Group justify="space-between">
          <Title order={3}>Actions</Title>
          <Group>
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={openDeleteModal}
              disabled={purchaseOrder.status === 'delivered'}
            >
              Delete Purchase Order
            </Button>
          </Group>
        </Group>
      </Card>
      
      {/* Status Update Modal */}
      <Modal opened={statusModalOpened} onClose={closeStatusModal} title="Update Status">
        <Stack>
          <Text size="sm" c="dimmed">
            Update the status of purchase order {purchaseOrder.po_number}
          </Text>
          
          {/*
            * Only the statuses a person sets by hand.
            *
            * `partially_received` and `delivered` are *derived* from the receipts — the receive
            * endpoint sets them, and migration 035 refuses `delivered` on an order nothing has been
            * received against. Offering them here would let a merchant assert a delivery the
            * receipts do not support, and their units would then count as incoming forever.
            *
            * The list also had no current value selected, so opening the dialog and pressing Update
            * silently discarded a partial state.
            */}
          <Select
            label="New status"
            description="Received and Partly received are set by receiving the delivery, not here."
            data={[
              { value: 'draft', label: 'Draft' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'shipped', label: 'Shipped' },
              { value: 'closed', label: 'Closed — no more is coming' },
              { value: 'cancelled', label: 'Cancelled' }
            ]}
            value={newStatus || purchaseOrder.status}
            onChange={(value) => setNewStatus(value as PurchaseOrderStatus)}
            allowDeselect={false}
          />
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeStatusModal}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateStatus(newStatus);
                closeStatusModal();
              }}
            >
              Update Status
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Receive Items Modal */}
      <Modal opened={receiveModalOpened} onClose={closeReceiveModal} title="Receive Items" size="lg">
        <Stack>
          <Text size="sm" c="dimmed">
            Enter the quantities received for each item. This will update your inventory.
          </Text>
          
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th className={table.numeric}>Ordered</Table.Th>
                <Table.Th className={table.numeric}>Already received</Table.Th>
                <Table.Th className={table.numeric}>Receive now</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {purchaseOrder.items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Stack gap="xs">
                      <Text fw={500} size="sm">{item.product_name}</Text>
                      <Text component="span" className={table.code}>{item.product_sku}</Text>
                    </Stack>
                  </Table.Td>
                  
                  <Table.Td className={table.numeric}>
                    <Text fw={500}>{item.quantity}</Text>
                  </Table.Td>
                  
                  <Table.Td className={table.numeric}>
                    <Text>{item.received_quantity}</Text>
                  </Table.Td>
                  
                  <Table.Td>
                    <NumberInput
                      value={receivingData[item.id] || 0}
                      onChange={(value) => setReceivingData(prev => ({ 
                        ...prev, 
                        [item.id]: Number(value) || 0 
                      }))}
                      min={0}
                      max={item.quantity - item.received_quantity}
                      size="sm"
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeReceiveModal}>
              Cancel
            </Button>
            <Button
              onClick={receiveItems}
              leftSection={<IconCheck size={16} />}
            >
              Receive Items
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Delete Modal */}
      <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Delete Purchase Order">
        <Stack>
          <Text size="sm">
            Are you sure you want to delete purchase order <strong>{purchaseOrder.po_number}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone.
          </Text>
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                deletePurchaseOrder();
                closeDeleteModal();
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}