'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Stack, 
  Title, 
  Card, 
  Text, 
  Button, 
  Group, 
  Badge, 
  Table, 
  ActionIcon, 
  NumberInput, 
  Modal, 
  TextInput,
  Select,
  Alert,
  Loader,
  ThemeIcon,
  rem,
  Tabs,
  SimpleGrid,
  Switch,
  Avatar,
  Tooltip
} from '@mantine/core';
import { 
  IconPackage, 
  IconTruckDelivery, 
  IconAlertTriangle, 
  IconRefresh, 
  IconPlus,
  IconFileText,
  IconEdit,
  IconTrash,
  IconSearch,
  IconDownload,
  IconChartBar,
  IconShoppingCart,
  IconBell,
  IconCheck,
  IconAlertCircle,
  IconExclamationMark,
  IconX
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import InventoryEditModal from '@/components/admin/InventoryEditModal';
import { FORECAST_PERIODS, ForecastPeriod, ForecastResult, calculateClientSideForecast } from '@/lib/inventory-forecasting-types';
import PurchaseOrderModal from '@/components/admin/PurchaseOrderModal';
import ReceivingModal from '@/components/admin/ReceivingModal';
import SupplierModal from '@/components/admin/SupplierModal';
import SmartReorderWidget from '@/components/admin/SmartReorderWidget';
import PurchaseOrderAnalytics from '@/components/admin/PurchaseOrderAnalytics';
import SuppliersManagement from '@/components/admin/SuppliersManagement';

interface SalesVelocity {
  total_sales: number;
  total_orders: number;
  avg_order_quantity: number;
  last_sale_date: string | null;
  sales_last_7_days: number;
  sales_last_14_days: number;
  sales_last_30_days: number;
  sales_last_60_days: number;
  sales_last_90_days: number;
  sales_last_180_days: number;
  sales_last_365_days: number;
  avg_monthly_sales: number;
}

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
  sales_velocity: SalesVelocity;
  forecast?: ForecastResult;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  order_date: string;
  expected_delivery: string;
  status: 'pending' | 'approved' | 'shipped' | 'delivered' | 'cancelled';
  total_cost: number;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  purchase_order_items?: {
    id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    quantity_received: number;
    quantity_pending: number;
    unit_cost: number;
    total_cost: number;
  }[];
}

interface InventoryStats {
  total_products: number;
  total_value: number;
  low_stock_items: number;
  out_of_stock_items: number;
  pending_orders: number;
  this_month_restocked: number;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<string>('all');
  
  const [reorderModalOpened, { open: openReorderModal, close: closeReorderModal }] = useDisclosure(false);
  const [purchaseOrderModalOpened, { open: openPurchaseOrderModal, close: closePurchaseOrderModal }] = useDisclosure(false);
  const [receivingModalOpened, { open: openReceivingModal, close: closeReceivingModal }] = useDisclosure(false);
  const [supplierModalOpened, { close: closeSupplierModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [reorderQuantity, setReorderQuantity] = useState(0);
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>(30);
  const [forecastData, setForecastData] = useState<Record<string, ForecastResult>>({});
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [prefilledPOItems, setPrefilledPOItems] = useState<Array<{product_id: string; product_name: string; product_sku: string; recommended_quantity: number; unit_cost: number; supplier: string}>>([]);

  const fetchInventoryData = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        return;
      }

      const response = await fetch('/api/admin/inventory', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setInventory(result.data.inventory);
          setStats(result.data.stats);
          
          // Fetch real purchase orders
          fetchPurchaseOrders();
        }
      }
    } catch (error) {
      console.error('Failed to fetch inventory data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  const handleReorder = (item: InventoryItem) => {
    setSelectedItem(item);
    setReorderQuantity(item.reorder_quantity);
    openReorderModal();
  };

  const handleEditItem = (item: InventoryItem) => {
    setSelectedItem(item);
    openEditModal();
  };

  const handleEditSuccess = (updatedItem: InventoryItem) => {
    // Update the inventory list with the updated item
    setInventory(prev => 
      prev.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    );
    
    // Refresh the stats
    fetchInventoryData();
  };

  const fetchPurchaseOrders = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const response = await fetch('/api/admin/purchase-orders?limit=20', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPurchaseOrders(result.data.purchaseOrders || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch purchase orders:', error);
    }
  };

  const handleCreatePurchaseOrder = (prefilledItems?: Array<{product_id: string; product_name: string; product_sku: string; recommended_quantity: number; unit_cost: number; supplier: string}>) => {
    if (prefilledItems) {
      setPrefilledPOItems(prefilledItems);
    } else {
      setPrefilledPOItems([]);
    }
    openPurchaseOrderModal();
  };

  const handleQuickReorder = (item: InventoryItem) => {
    const poItem = {
      product_id: item.id,
      product_sku: item.sku,
      product_name: item.name,
      quantity: item.reorder_quantity || 1,
      unit_cost: item.unit_cost,
      total_cost: (item.reorder_quantity || 1) * item.unit_cost
    };
    handleCreatePurchaseOrder([poItem]);
  };

  const handleReceivePO = (po: PurchaseOrder) => {
    setSelectedPO(po);
    openReceivingModal();
  };

  const handlePOSuccess = () => {
    fetchInventoryData();
    fetchPurchaseOrders();
  };

  const handleReceivingSuccess = () => {
    fetchInventoryData();
    fetchPurchaseOrders();
    closeReceivingModal();
  };

  const handleForecastPeriodChange = (period: ForecastPeriod) => {
    setForecastPeriod(period);
    updateForecastData(period);
  };

  const updateForecastData = useCallback((period: ForecastPeriod) => {
    if (inventory.length === 0) return;
    
    setLoadingForecast(true);
    try {
      const newForecastData: Record<string, ForecastResult> = {};
      
      inventory.forEach(item => {
        // Use the sales velocity data to calculate forecasts on the frontend
        const forecast = calculateClientSideForecast(item.sales_velocity, period);
        newForecastData[item.id] = forecast;
      });
      
      setForecastData(newForecastData);
    } catch (error) {
      console.error('Failed to calculate forecasts:', error);
      notifications.show({
        title: 'Forecast Error',
        message: 'Failed to calculate forecasts. Using existing data.',
        color: 'red'
      });
    } finally {
      setLoadingForecast(false);
    }
  }, [inventory]);

  // Update forecasts when inventory data changes
  useEffect(() => {
    if (inventory.length > 0) {
      updateForecastData(forecastPeriod);
    }
  }, [inventory, forecastPeriod, updateForecastData]);

  const handleSyncShipStation = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const response = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'sync_shipstation' })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          notifications.show({
            title: 'Sync Successful',
            message: `Synced ${result.synced_items} items from ShipStation`,
            color: 'green',
            icon: <IconCheck size="1rem" />
          });
          fetchInventoryData(); // Refresh data
        }
      } else {
        notifications.show({
          title: 'Sync Failed',
          message: 'Failed to sync with ShipStation. Check your integration settings.',
          color: 'red',
          icon: <IconAlertCircle size="1rem" />
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      notifications.show({
        title: 'Sync Error',
        message: 'An error occurred while syncing with ShipStation',
        color: 'red',
        icon: <IconAlertCircle size="1rem" />
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        notifications.show({
          title: 'Authentication Error',
          message: 'Please log in to export data',
          color: 'red',
          icon: <IconAlertCircle size="1rem" />
        });
        return;
      }

      // Show loading notification
      notifications.show({
        id: 'export-loading',
        title: 'Exporting Data',
        message: 'Generating CSV file...',
        color: 'blue',
        loading: true,
        autoClose: false
      });

      const response = await fetch('/api/admin/inventory/export?format=csv', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Get the filename from the response headers
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'inventory_export.csv';
        
        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Hide loading notification and show success
        notifications.hide('export-loading');
        notifications.show({
          title: 'Export Successful',
          message: `Inventory data exported as ${filename}`,
          color: 'green',
          icon: <IconCheck size="1rem" />
        });
      } else {
        const result = await response.json();
        notifications.hide('export-loading');
        notifications.show({
          title: 'Export Failed',
          message: result.error || 'Failed to export inventory data',
          color: 'red',
          icon: <IconAlertCircle size="1rem" />
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      notifications.hide('export-loading');
      notifications.show({
        title: 'Export Error',
        message: 'An error occurred while exporting data',
        color: 'red',
        icon: <IconAlertCircle size="1rem" />
      });
    }
  };

  const processReorder = () => {
    if (selectedItem && reorderQuantity > 0) {
      notifications.show({
        title: 'Reorder Initiated',
        message: `Created purchase order for ${reorderQuantity} units of ${selectedItem.name}`,
        color: 'green',
        icon: <IconCheck size="1rem" />
      });
      closeReorderModal();
    }
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = selectedSupplier === '' || item.supplier === selectedSupplier;
    const matchesStock = stockFilter === 'all' || item.status === stockFilter;
    
    return matchesSearch && matchesSupplier && matchesStock;
  });

  const getStockStatusIcon = (status: string) => {
    switch (status) {
      case 'out_of_stock': return <IconX size="1rem" color="red" />;
      case 'low_stock': return <IconExclamationMark size="1rem" color="orange" />;
      case 'discontinued': return <IconX size="1rem" color="gray" />;
      default: return null;
    }
  };

  const getStockStatusTooltip = (status: string) => {
    switch (status) {
      case 'out_of_stock': return 'Out of stock';
      case 'low_stock': return 'Low stock';
      case 'discontinued': return 'Discontinued';
      default: return '';
    }
  };

  const getPurchaseOrderStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'yellow';
      case 'approved': return 'blue';
      case 'shipped': return 'cyan';
      case 'delivered': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading inventory data...
        </Text>
      </div>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} mb="xs">
            Inventory Management
          </Title>
          <Text c="dimmed">
            Manage your stock levels, forecasting, and purchase orders
          </Text>
        </div>
        <Button leftSection={<IconRefresh size="1rem" />} variant="outline" onClick={handleSyncShipStation}>
          Sync ShipStation
        </Button>
      </Group>

      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 2, md: 6 }} spacing="md">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Total Products</Text>
            <ThemeIcon color="blue" variant="light" size="sm">
              <IconPackage style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>{stats?.total_products}</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Total Value</Text>
            <ThemeIcon color="green" variant="light" size="sm">
              <IconChartBar style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>${stats?.total_value.toLocaleString()}</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Low Stock</Text>
            <ThemeIcon color="yellow" variant="light" size="sm">
              <IconAlertTriangle style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>{stats?.low_stock_items}</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Out of Stock</Text>
            <ThemeIcon color="red" variant="light" size="sm">
              <IconAlertCircle style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>{stats?.out_of_stock_items}</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Pending Orders</Text>
            <ThemeIcon color="cyan" variant="light" size="sm">
              <IconTruckDelivery style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>{stats?.pending_orders}</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Restocked This Month</Text>
            <ThemeIcon color="teal" variant="light" size="sm">
              <IconRefresh style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
          </Group>
          <Text size="xl" fw={700}>{stats?.this_month_restocked}</Text>
        </Card>
      </SimpleGrid>

      {/* Smart AI Recommendations Widget */}
      <SmartReorderWidget 
        onCreatePO={handleCreatePurchaseOrder}
        onQuickReorder={(rec) => {
          const poItem = {
            product_id: rec.product_id,
            product_sku: rec.product_sku,
            product_name: rec.product_name,
            quantity: rec.recommended_quantity,
            unit_cost: rec.unit_cost,
            total_cost: rec.recommended_quantity * rec.unit_cost
          };
          handleCreatePurchaseOrder([poItem]);
        }}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'inventory')}>
        <Tabs.List>
          <Tabs.Tab value="inventory" leftSection={<IconPackage size="1rem" />}>
            Inventory Grid
          </Tabs.Tab>
          <Tabs.Tab value="purchase-orders" leftSection={<IconFileText size="1rem" />}>
            Purchase Orders
          </Tabs.Tab>
          <Tabs.Tab value="suppliers" leftSection={<IconTruckDelivery size="1rem" />}>
            Suppliers
          </Tabs.Tab>
          <Tabs.Tab value="reports" leftSection={<IconChartBar size="1rem" />}>
            Reports
          </Tabs.Tab>
          <Tabs.Tab value="alerts" leftSection={<IconBell size="1rem" />}>
            Alerts & Notifications
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="inventory" pt="md">
          <Stack gap="md">
            {/* Filters */}
            <Card shadow="sm" padding="md" radius="md" withBorder>
              <Group>
                <TextInput
                  placeholder="Search by name or SKU..."
                  leftSection={<IconSearch size="1rem" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Select
                  placeholder="Filter by supplier"
                  data={[
                    { value: '', label: 'All Suppliers' },
                    ...Array.from(new Set(inventory.map(item => item.supplier)))
                      .map(supplier => ({ value: supplier, label: supplier }))
                  ]}
                  value={selectedSupplier}
                  onChange={(value) => setSelectedSupplier(value || '')}
                  style={{ minWidth: 200 }}
                />
                <Select
                  placeholder="Stock status"
                  data={[
                    { value: 'all', label: 'All Items' },
                    { value: 'in_stock', label: 'In Stock' },
                    { value: 'low_stock', label: 'Low Stock' },
                    { value: 'out_of_stock', label: 'Out of Stock' }
                  ]}
                  value={stockFilter}
                  onChange={(value) => setStockFilter(value || 'all')}
                  style={{ minWidth: 150 }}
                />
                <Button leftSection={<IconDownload size="1rem" />} variant="outline" onClick={handleExportCSV}>
                  Export
                </Button>
              </Group>
            </Card>

            {/* Inventory Grid */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Stock</Table.Th>
                    <Table.Th>
                      <Group gap="xs">
                        <Text size="sm" component="span">Forecast</Text>
                        <Select
                          size="xs"
                          data={FORECAST_PERIODS.map(p => ({ value: p.value.toString(), label: p.label }))}
                          value={forecastPeriod.toString()}
                          onChange={(value) => handleForecastPeriodChange(parseInt(value || '30') as ForecastPeriod)}
                          style={{ minWidth: 80 }}
                        />
                        {loadingForecast && <Loader size="xs" />}
                      </Group>
                    </Table.Th>
                    <Table.Th>Reorder Point</Table.Th>
                    <Table.Th>Unit Cost</Table.Th>
                    <Table.Th>Total Value</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredInventory.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Group gap="sm">
                          <Avatar 
                            src={item.featured_image_url} 
                            size="sm" 
                            radius="sm"
                          >
                            <IconShoppingCart size="1rem" />
                          </Avatar>
                          <div>
                            <Text size="sm" fw={500}>{item.name}</Text>
                            <Text size="xs" c="dimmed">{item.sku}</Text>
                            <Text size="xs" c="dimmed">{item.category}</Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm" fw={500}>{item.stock_quantity}</Text>
                          {getStockStatusIcon(item.status) && (
                            <Tooltip label={getStockStatusTooltip(item.status)}>
                              {getStockStatusIcon(item.status)}
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm">
                            {forecastData[item.id]?.forecastValue || 
                             (forecastPeriod <= 30 ? item.forecast_30_days : item.forecast_90_days)}
                          </Text>
                          {forecastData[item.id] && (
                            <Badge 
                              size="xs" 
                              color={
                                forecastData[item.id].confidence === 'high' ? 'green' :
                                forecastData[item.id].confidence === 'medium' ? 'yellow' : 'red'
                              }
                              variant="light"
                            >
                              {forecastData[item.id].confidence}
                            </Badge>
                          )}
                          {(forecastData[item.id]?.forecastValue || 
                            (forecastPeriod <= 30 ? item.forecast_30_days : item.forecast_90_days)) 
                            > item.stock_quantity && (
                            <IconAlertTriangle size="1rem" color="orange" />
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.reorder_point}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">${item.unit_cost.toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          ${(item.stock_quantity * item.unit_cost).toFixed(2)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon 
                            size="sm" 
                            variant="subtle"
                            onClick={() => handleReorder(item)}
                            title="Quick Reorder"
                          >
                            <IconRefresh size="1rem" />
                          </ActionIcon>
                          <ActionIcon 
                            size="sm" 
                            variant="subtle"
                            color="blue"
                            onClick={() => handleQuickReorder(item)}
                            title="Add to Purchase Order"
                          >
                            <IconShoppingCart size="1rem" />
                          </ActionIcon>
                          <ActionIcon 
                            size="sm" 
                            variant="subtle"
                            onClick={() => handleEditItem(item)}
                          >
                            <IconEdit size="1rem" />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="purchase-orders" pt="md">
          <Stack gap="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3}>Purchase Orders</Title>
                <Button leftSection={<IconPlus size="1rem" />} onClick={() => handleCreatePurchaseOrder()}>
                  Create New Order
                </Button>
              </Group>
              
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Order ID</Table.Th>
                    <Table.Th>Supplier</Table.Th>
                    <Table.Th>Order Date</Table.Th>
                    <Table.Th>Expected Delivery</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Total Cost</Table.Th>
                    <Table.Th>Items</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {purchaseOrders.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{order.po_number || order.id}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{order.supplier_name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{order.order_date}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{order.expected_delivery}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          color={getPurchaseOrderStatusColor(order.status)}
                          variant="light"
                        >
                          {order.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>${order.total_cost.toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{order.purchase_order_items?.length || 0} items</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon 
                            size="sm" 
                            variant="subtle"
                            onClick={() => {
                              // View PO details
                              console.log('View PO:', order.id);
                            }}
                          >
                            <IconEdit size="1rem" />
                          </ActionIcon>
                          {(order.status === 'shipped' || order.status === 'approved') && (
                            <ActionIcon 
                              size="sm" 
                              variant="subtle"
                              color="green"
                              onClick={() => handleReceivePO(order)}
                            >
                              <IconTruckDelivery size="1rem" />
                            </ActionIcon>
                          )}
                          {order.status === 'pending' && (
                            <ActionIcon size="sm" variant="subtle" color="red">
                              <IconTrash size="1rem" />
                            </ActionIcon>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="suppliers" pt="md">
          <SuppliersManagement />
        </Tabs.Panel>

        <Tabs.Panel value="reports" pt="md">
          <Stack gap="xl">
            {/* Purchase Order Analytics */}
            <PurchaseOrderAnalytics purchaseOrders={purchaseOrders} />
            
            {/* Inventory Reports */}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Inventory Turnover</Title>
                <Text c="dimmed" mb="md">Track how quickly inventory is sold and replaced</Text>
                <Button variant="outline" fullWidth>
                  Generate Report
                </Button>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Stock Valuation</Title>
                <Text c="dimmed" mb="md">Current value of all inventory items</Text>
                <Button variant="outline" fullWidth>
                  Generate Report
                </Button>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Dead Stock Analysis</Title>
                <Text c="dimmed" mb="md">Identify slow-moving inventory</Text>
                <Button variant="outline" fullWidth>
                  Generate Report
                </Button>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Supplier Performance</Title>
                <Text c="dimmed" mb="md">Analyze supplier delivery times and quality</Text>
                <Button variant="outline" fullWidth>
                  Generate Report
                </Button>
              </Card>
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="alerts" pt="md">
          <Stack gap="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={3} mb="md">Alert Settings</Title>
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>Low Stock Notifications</Text>
                    <Text size="sm" c="dimmed">Get notified when items reach reorder point</Text>
                  </div>
                  <Switch defaultChecked />
                </Group>
                
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>Out of Stock Alerts</Text>
                    <Text size="sm" c="dimmed">Immediate alerts for zero stock items</Text>
                  </div>
                  <Switch defaultChecked />
                </Group>
                
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>Forecast Warnings</Text>
                    <Text size="sm" c="dimmed">Alert when forecast exceeds current stock</Text>
                  </div>
                  <Switch defaultChecked />
                </Group>
              </Stack>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={3} mb="md">Active Alerts</Title>
              <Stack gap="md">
                {inventory.filter(item => item.status === 'low_stock' || item.status === 'out_of_stock').map(item => (
                  <Alert
                    key={item.id}
                    icon={<IconAlertTriangle size="1rem" />}
                    color={item.status === 'out_of_stock' ? 'red' : 'yellow'}
                    variant="light"
                  >
                    <Group justify="space-between">
                      <div>
                        <Text fw={500}>{item.name}</Text>
                        <Text size="sm">
                          {item.status === 'out_of_stock' ? 'Out of stock' : `Low stock: ${item.stock_quantity} remaining`}
                        </Text>
                      </div>
                      <Button size="xs" onClick={() => handleReorder(item)}>
                        Reorder
                      </Button>
                    </Group>
                  </Alert>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Reorder Modal */}
      <Modal opened={reorderModalOpened} onClose={closeReorderModal} title="Reorder Item">
        {selectedItem && (
          <Stack gap="md">
            <Text>
              Reorder <strong>{selectedItem.name}</strong> (SKU: {selectedItem.sku})
            </Text>
            <NumberInput
              label="Quantity to order"
              value={reorderQuantity}
              onChange={(value) => setReorderQuantity(Number(value))}
              min={1}
            />
            <Text size="sm" c="dimmed">
              Estimated cost: ${(reorderQuantity * selectedItem.unit_cost).toFixed(2)}
            </Text>
            <Group justify="flex-end">
              <Button variant="outline" onClick={closeReorderModal}>
                Cancel
              </Button>
              <Button onClick={processReorder}>
                Create Purchase Order
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Purchase Order Modal */}
      <PurchaseOrderModal
        opened={purchaseOrderModalOpened}
        onClose={() => {
          closePurchaseOrderModal();
          setPrefilledPOItems([]);
        }}
        onSuccess={handlePOSuccess}
        prefilledItems={prefilledPOItems}
      />

      {/* Receiving Modal */}
      <ReceivingModal
        opened={receivingModalOpened}
        onClose={closeReceivingModal}
        purchaseOrder={selectedPO}
        onSuccess={handleReceivingSuccess}
      />

      {/* Supplier Modal */}
      <SupplierModal
        opened={supplierModalOpened}
        onClose={closeSupplierModal}
        onSuccess={() => {
          // Refresh suppliers if needed
          closeSupplierModal();
        }}
      />

      {/* Inventory Edit Modal */}
      <InventoryEditModal
        opened={editModalOpened}
        onClose={closeEditModal}
        item={selectedItem}
        onSuccess={handleEditSuccess}
      />
    </Stack>
  );
}