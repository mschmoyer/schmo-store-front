'use client';

import React, { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Card,
  Group,
  Text,
  Button,
  Badge,
  Table,
  Loader,
  Alert,
  Pagination,
  Select,
  TextInput,
  Stack,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconSearch, IconEye, IconDownload, IconFilter } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PurchaseOrder } from '@/lib/types/database';
import Link from 'next/link';

interface PurchaseOrderListItem extends PurchaseOrder {
  supplier_name: string;
  supplier_contact: string;
  items_count: number;
}

/**
 * Purchase Orders List Page
 * 
 * Displays a list of purchase orders with:
 * - Filtering and search capabilities
 * - Pagination
 * - Status indicators
 * - Quick actions (view, download PDF)
 * - Link to create new purchase orders
 */
export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [page, statusFilter, searchTerm]);

  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // For now, we'll create mock data since the database tables don't exist yet
      // In a real implementation, this would fetch from the API
      const mockPurchaseOrders: PurchaseOrderListItem[] = [
        {
          id: 'po-1',
          store_id: '12345',
          supplier_id: '67890',
          purchase_order_number: 'PO-001',
          status: 'approved',
          order_date: new Date('2024-01-15'),
          expected_delivery_date: new Date('2024-01-30'),
          received_date: null,
          subtotal: 2500.00,
          tax_amount: 200.00,
          shipping_amount: 50.00,
          total_amount: 2750.00,
          currency: 'USD',
          payment_status: 'pending',
          payment_terms: 'Net 30',
          notes: 'Rush order - please expedite shipping',
          created_at: new Date('2024-01-15'),
          updated_at: new Date('2024-01-15'),
          supplier_name: 'ABC Supply Co.',
          supplier_contact: 'John Smith',
          items_count: 2,
        },
        {
          id: 'po-2',
          store_id: '12345',
          supplier_id: '67891',
          purchase_order_number: 'PO-002',
          status: 'sent',
          order_date: new Date('2024-01-20'),
          expected_delivery_date: new Date('2024-02-05'),
          received_date: null,
          subtotal: 1800.00,
          tax_amount: 144.00,
          shipping_amount: 35.00,
          total_amount: 1979.00,
          currency: 'USD',
          payment_status: 'pending',
          payment_terms: 'Net 30',
          notes: 'Standard delivery acceptable',
          created_at: new Date('2024-01-20'),
          updated_at: new Date('2024-01-20'),
          supplier_name: 'XYZ Components',
          supplier_contact: 'Sarah Johnson',
          items_count: 5,
        },
        {
          id: 'po-3',
          store_id: '12345',
          supplier_id: '67892',
          purchase_order_number: 'PO-003',
          status: 'received',
          order_date: new Date('2024-01-10'),
          expected_delivery_date: new Date('2024-01-25'),
          received_date: new Date('2024-01-24'),
          subtotal: 3200.00,
          tax_amount: 256.00,
          shipping_amount: 75.00,
          total_amount: 3531.00,
          currency: 'USD',
          payment_status: 'paid',
          payment_terms: 'Net 15',
          notes: 'Order completed successfully',
          created_at: new Date('2024-01-10'),
          updated_at: new Date('2024-01-24'),
          supplier_name: 'Global Parts Ltd.',
          supplier_contact: 'Michael Chen',
          items_count: 8,
        },
      ];

      setPurchaseOrders(mockPurchaseOrders);
      setTotalPages(1);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      setError('Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (purchaseOrderId: string, orderNumber: string) => {
    try {
      setPdfLoading(purchaseOrderId);
      
      const response = await fetch(`/api/admin/purchase-orders/${purchaseOrderId}/pdf`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Create blob from response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchase-order-${orderNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);
      
      notifications.show({
        title: 'PDF Downloaded',
        message: 'Purchase order PDF has been downloaded successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      notifications.show({
        title: 'Download Failed',
        message: 'Failed to download purchase order PDF',
        color: 'red',
      });
    } finally {
      setPdfLoading(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'gray';
      case 'pending': return 'yellow';
      case 'approved': return 'green';
      case 'sent': return 'blue';
      case 'received': return 'green';
      case 'partially_received': return 'orange';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'yellow';
      case 'paid': return 'green';
      case 'partial': return 'orange';
      case 'overdue': return 'red';
      default: return 'gray';
    }
  };

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'sent', label: 'Sent' },
    { value: 'received', label: 'Received' },
    { value: 'partially_received', label: 'Partially Received' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Group justify="center">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack spacing="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Purchase Orders</Title>
            <Text color="dimmed" size="sm">
              Manage your purchase orders and generate PDFs
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} color="blue">
            New Purchase Order
          </Button>
        </Group>

        {/* Filters */}
        <Card>
          <Group>
            <TextInput
              placeholder="Search purchase orders..."
              leftSection={<IconSearch size={16} />}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="Filter by status"
              data={statusOptions}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value || '')}
              clearable
              leftSection={<IconFilter size={16} />}
              w={200}
            />
          </Group>
        </Card>

        {/* Purchase Orders Table */}
        <Card>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>PO Number</Table.Th>
                <Table.Th>Supplier</Table.Th>
                <Table.Th>Order Date</Table.Th>
                <Table.Th>Expected Delivery</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Payment Status</Table.Th>
                <Table.Th>Total Amount</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {purchaseOrders.map((po) => (
                <Table.Tr key={po.id}>
                  <Table.Td>
                    <Link href={`/admin/purchase-orders/${po.id}`} style={{ textDecoration: 'none' }}>
                      <Text fw={500} c="blue">
                        {po.purchase_order_number}
                      </Text>
                    </Link>
                  </Table.Td>
                  <Table.Td>
                    <div>
                      <Text fw={500}>{po.supplier_name}</Text>
                      <Text size="sm" c="dimmed">{po.supplier_contact}</Text>
                    </div>
                  </Table.Td>
                  <Table.Td>{formatDate(po.order_date)}</Table.Td>
                  <Table.Td>
                    {po.expected_delivery_date ? formatDate(po.expected_delivery_date) : 'N/A'}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getStatusColor(po.status)} variant="light">
                      {po.status.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getPaymentStatusColor(po.payment_status)} variant="light">
                      {po.payment_status.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatCurrency(po.total_amount)}</Table.Td>
                  <Table.Td>
                    <Badge variant="outline" color="gray">
                      {po.items_count} items
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="View Details">
                        <Link href={`/admin/purchase-orders/${po.id}`} passHref>
                          <ActionIcon variant="light" color="blue" size="sm">
                            <IconEye size={14} />
                          </ActionIcon>
                        </Link>
                      </Tooltip>
                      <Tooltip label="Download PDF">
                        <ActionIcon
                          variant="light"
                          color="green"
                          size="sm"
                          onClick={() => handleDownloadPDF(po.id, po.purchase_order_number)}
                          loading={pdfLoading === po.id}
                        >
                          <IconDownload size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {purchaseOrders.length === 0 && (
            <Group justify="center" p="xl">
              <Text c="dimmed">No purchase orders found</Text>
            </Group>
          )}
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <Group justify="center">
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              size="sm"
            />
          </Group>
        )}
      </Stack>
    </Container>
  );
}