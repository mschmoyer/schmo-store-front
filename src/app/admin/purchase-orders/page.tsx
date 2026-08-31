'use client';

import React, { useCallback, useState, useEffect } from 'react';
import {
  Container,
  Card,
  Group,
  Text,
  Button,
  Badge,
  Table,
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
import Link from 'next/link';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';
import table from '@/components/admin/adminTable.module.css';

/**
 * A purchase order row exactly as `GET /api/admin/purchase-orders` returns it.
 *
 * Declared here rather than extending `PurchaseOrder` from
 * `@/lib/types/database`, because that interface describes a schema the
 * database does not have — `purchase_order_number`, `total_amount`,
 * `expected_delivery_date`, `payment_status`. The real columns are
 * `po_number`, `total_cost`, `expected_delivery`, and there is no payment
 * status on a purchase order at all. Rendering the interface's field names
 * produced a table of `undefined`s; the mock array was hiding that too.
 */
interface PurchaseOrderListItem {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  subtotal: string | number;
  tax_amount: string | number | null;
  shipping_amount: string | number | null;
  total_cost: string | number;
  supplier_name: string;
  supplier_contact: string | null;
  items_count: string | number;
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
  const { session } = useAdmin();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  /**
   * Load purchase orders from the API.
   *
   * This function used to `setPurchaseOrders(mockPurchaseOrders)` — three
   * hardcoded orders from ABC Supply Co., XYZ Components and Global Parts
   * Ltd., dated January 2024 — behind the comment *"the database tables don't
   * exist yet"*. They do: `purchase_orders`, `purchase_order_items`,
   * `purchase_order_receiving`, `purchase_order_status_history` and
   * `suppliers` are all present, and `GET /api/admin/purchase-orders` returns
   * a valid paginated response.
   *
   * The create and receive flows behind this list were always real, which made
   * this worse than a missing feature: a merchant could raise a genuine
   * purchase order, and it would then be invisible forever, replaced on the
   * list by ABC Supply Co. It also violated this repo's own rule in CLAUDE.md
   * — "avoid using mocks unless explicitly requested".
   */
  const fetchPurchaseOrders = useCallback(async () => {
    if (!session || !session?.storeId) return;

    try {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(page),
        limit: '10',
        store_id: session.storeId,
      });
      if (statusFilter) query.set('status', statusFilter);

      const response = await fetch(`/api/admin/purchase-orders?${query.toString()}`, { credentials: 'include' });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || `Request failed with status ${response.status}`);
      }

      const rows: PurchaseOrderListItem[] = result?.data ?? [];

      /*
       * Search is applied client-side: the API has no search parameter, and
       * silently ignoring what the merchant typed would be its own small lie.
       */
      const term = searchTerm.trim().toLowerCase();
      const filtered = term
        ? rows.filter(
            (po) =>
              po.po_number?.toLowerCase().includes(term) ||
              po.supplier_name?.toLowerCase().includes(term)
          )
        : rows;

      setPurchaseOrders(filtered);
      setTotalPages(Math.max(1, result?.pagination?.totalPages ?? 1));
    } catch (err) {
      console.error('Error fetching purchase orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch purchase orders');
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [session, session?.storeId, page, statusFilter, searchTerm]);

  useEffect(() => {
    void fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);


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

  const formatDate = (date: string | null) => {
    if (!date) return '—';
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
      <Stack gap="lg">
        <AdminPageHeader title="Purchase orders" description="Restock orders raised with your suppliers." />
        <TableSkeleton rows={6} columns={6} label="Loading purchase orders" />
      </Stack>
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
      <Stack gap="lg">
        {/* Header */}
        <AdminPageHeader
          title="Purchase orders"
          description="Restock orders raised with your suppliers."
          actions={
            <Button
              component={Link}
              href="/admin/purchase-orders/create"
              leftSection={<IconPlus size={16} />}
            >
              New purchase order
            </Button>
          }
        />

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
                <Table.Th className={table.numeric}>Total</Table.Th>
                <Table.Th className={table.numeric}>Items</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {purchaseOrders.map((po) => (
                <Table.Tr key={po.id}>
                  <Table.Td>
                    <Link href={`/admin/purchase-orders/${po.id}`} style={{ textDecoration: 'none' }}>
                      <Text fw={500} className={table.code}>
                        {po.po_number}
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
                  <Table.Td>{formatDate(po.expected_delivery)}</Table.Td>
                  <Table.Td>
                    <Badge color={getStatusColor(po.status)} variant="light">
                      {po.status.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td className={table.numeric}>{formatCurrency(Number(po.total_cost))}</Table.Td>
                  <Table.Td className={table.numeric}>{po.items_count}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="View Details">
                        <Link href={`/admin/purchase-orders/${po.id}`} passHref>
                          <ActionIcon variant="light" color="ink" size="sm">
                            <IconEye size={14} />
                          </ActionIcon>
                        </Link>
                      </Tooltip>
                      <Tooltip label="Download PDF">
                        <ActionIcon
                          variant="light"
                          size="sm"
                          onClick={() => handleDownloadPDF(po.id, po.po_number)}
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