'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Title,
  Paper,
  Table,
  Button,
  TextInput,
  Select,
  Badge,
  ActionIcon,
  Group,
  Text,
  Avatar,
  Checkbox,
  Pagination,
  Menu,
  Stack,
  Flex,
  NumberInput,
  Alert,
  Skeleton,
  Tooltip,
  Modal,
  FileInput,
  Card,
  SimpleGrid,
  Center
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconSearch,
  IconPlus,
  IconEye,
  IconEyeOff,
  IconEdit,
  IconTrash,
  IconDots,
  IconSortAscending,
  IconSortDescending,
  IconRefresh,
  IconPackage,
  IconAlertTriangle,
  IconCheck,
  IconFileExport,
  IconFileImport,
  IconChevronDown,
  IconAdjustments,
  IconCurrencyDollar,
  IconShoppingCart
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { Product, ProductFilters } from '@/types/database';

// Enhanced Product interface with sales data
interface ProductWithSales extends Product {
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  sales_data: {
    total_sales: number;
    total_revenue: number;
    total_orders: number;
    last_sale_date?: Date;
  };
  recent_inventory_changes: Array<{
    change_type: string;
    quantity_change: number;
    created_at: Date;
  }>;
}

interface ProductsResponse {
  products: ProductWithSales[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  statistics: {
    total: number;
    active: number;
    inStock: number;
    outOfStock: number;
    lowStock: number;
    totalValue: number;
  };
}

const STOCK_STATUS_COLORS = {
  in_stock: 'green',
  low_stock: 'yellow',
  out_of_stock: 'red',
  not_tracked: 'gray'
} as const;

const STOCK_STATUS_LABELS = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  not_tracked: 'Not Tracked'
} as const;

/**
 * Products Admin Page Component
 * 
 * Comprehensive product management interface with:
 * - Product listing with search, filters, and sorting
 * - Quick actions (list/delist, view details, stock indicators)
 * - Bulk operations and export/import functionality
 * - Responsive design with loading states and error handling
 * 
 * @returns JSX.Element
 */
export default function ProductsAdminPage() {
  const { session, isAuthenticated } = useAdmin();
  
  // State management
  const [products, setProducts] = useState<ProductWithSales[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Statistics state
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inStock: 0,
    outOfStock: 0,
    lowStock: 0,
    totalValue: 0
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  
  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'created_at' | 'updated_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // Modal states
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [bulkActionsOpened, { open: openBulkActions, close: closeBulkActions }] = useDisclosure(false);
  const [exportModalOpened, { open: openExportModal, close: closeExportModal }] = useDisclosure(false);
  const [importModalOpened, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);
  
  // Export/Import state
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProcessing, setImportProcessing] = useState(false);
  
  // Categories for filtering (would be fetched from API)
  const [categories] = useState<Array<{ id: string; name: string }>>([]);
  
  /**
   * Fetch products from API with current filters and pagination
   */
  const fetchProducts = useCallback(async (page: number = currentPage, refresh: boolean = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    setError(null);
    
    try {
      const filters: ProductFilters = {
        search: searchQuery || undefined,
        category_id: categoryFilter || undefined,
        is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
        in_stock: stockFilter === 'in_stock' ? true : stockFilter === 'out_of_stock' ? false : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        limit: itemsPerPage,
        offset: (page - 1) * itemsPerPage
      };
      
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
      
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/products?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch products');
      }
      
      const data: ProductsResponse = result.data;
      
      setProducts(data.products);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.page);
      setStatistics(data.statistics);
      
      // Reset selection when data changes
      setSelectedProducts(new Set());
      setSelectAll(false);
      
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
      notifications.show({
        title: 'Error',
        message: 'Failed to load products. Please try again.',
        color: 'red'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, categoryFilter, statusFilter, stockFilter, sortBy, sortOrder, session?.sessionToken]);
  
  /**
   * Toggle product active status
   */
  const toggleProductStatus = async (productId: string, currentStatus: boolean) => {
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          is_active: !currentStatus
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update product status');
      }
      
      // Update local state
      setProducts(prev => prev.map(product => 
        product.id === productId 
          ? { ...product, is_active: !currentStatus }
          : product
      ));
      
      notifications.show({
        title: 'Success',
        message: `Product ${!currentStatus ? 'listed' : 'unlisted'} successfully`,
        color: 'green'
      });
      
    } catch (err) {
      console.error('Error updating product status:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to update product status',
        color: 'red'
      });
    }
  };
  
  /**
   * Handle bulk actions for selected products
   */
  const handleBulkAction = async (action: 'list' | 'unlist' | 'delete') => {
    if (selectedProducts.size === 0) {
      notifications.show({
        title: 'Warning',
        message: 'Please select products to perform bulk actions',
        color: 'yellow'
      });
      return;
    }
    
    try {
      const productIds = Array.from(selectedProducts);
      
      if (action === 'delete') {
        // Confirmation for delete action
        if (!confirm(`Are you sure you want to delete ${productIds.length} product(s)? This action cannot be undone.`)) {
          return;
        }
      }
      
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          action,
          product_ids: productIds
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform bulk action');
      }
      
      // Refresh products list
      await fetchProducts(currentPage, true);
      
      notifications.show({
        title: 'Success',
        message: `Bulk action completed for ${productIds.length} product(s)`,
        color: 'green'
      });
      
      closeBulkActions();
      
    } catch (err) {
      console.error('Error performing bulk action:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to perform bulk action',
        color: 'red'
      });
    }
  };
  
  /**
   * Handle product export
   */
  const handleExport = async () => {
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/products/export?format=${exportFormat}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to export products');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      notifications.show({
        title: 'Success',
        message: 'Products exported successfully',
        color: 'green'
      });
      
      closeExportModal();
      
    } catch (err) {
      console.error('Error exporting products:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to export products',
        color: 'red'
      });
    }
  };
  
  /**
   * Handle product import
   */
  const handleImport = async () => {
    if (!importFile) {
      notifications.show({
        title: 'Warning',
        message: 'Please select a file to import',
        color: 'yellow'
      });
      return;
    }
    
    setImportProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to import products');
      }
      
      const result = await response.json();
      
      notifications.show({
        title: 'Success',
        message: `Import completed: ${result.imported} products imported, ${result.updated} updated`,
        color: 'green'
      });
      
      // Refresh products list
      await fetchProducts(1, true);
      
      closeImportModal();
      setImportFile(null);
      
    } catch (err) {
      console.error('Error importing products:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to import products',
        color: 'red'
      });
    } finally {
      setImportProcessing(false);
    }
  };
  
  /**
   * Handle selection changes
   */
  const handleSelectProduct = (productId: string, checked: boolean) => {
    const newSelected = new Set(selectedProducts);
    if (checked) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedProducts(newSelected);
    setSelectAll(newSelected.size === products.length);
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(products.map(p => p.id)));
      setSelectAll(true);
    } else {
      setSelectedProducts(new Set());
      setSelectAll(false);
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
   * Apply filters and refresh data
   */
  const applyFilters = () => {
    setCurrentPage(1);
    fetchProducts(1);
    closeFilters();
  };
  
  /**
   * Reset all filters
   */
  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setStatusFilter('');
    setStockFilter('');
    setSortBy('created_at');
    setSortOrder('desc');
    setCurrentPage(1);
    fetchProducts(1);
    closeFilters();
  };
  
  // Fetch data on component mount and when filters change
  useEffect(() => {
    if (isAuthenticated && session?.sessionToken) {
      fetchProducts(currentPage);
    }
  }, [fetchProducts, currentPage, isAuthenticated, session?.sessionToken]);
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== '' && isAuthenticated && session?.sessionToken) {
        setCurrentPage(1);
        fetchProducts(1);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [searchQuery, fetchProducts, isAuthenticated, session?.sessionToken]);
  
  
  if (loading && !refreshing) {
    return (
      <Box>
        <Skeleton height={60} mb="md" />
        <Skeleton height={400} />
      </Box>
    );
  }
  
  if (error) {
    return (
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
          onClick={() => fetchProducts(currentPage)}
        >
          Try Again
        </Button>
      </Alert>
    );
  }
  
  return (
    <Box>
      {/* Header Section */}
      <Flex justify="space-between" align="center" mb="xl">
        <Box>
          <Title order={1} mb="xs">Products</Title>
          <Text c="dimmed">
            {statistics.total} product{statistics.total !== 1 ? 's' : ''} total
            {statistics.active > 0 && ` • ${statistics.active} active`}
            {selectedProducts.size > 0 && ` • ${selectedProducts.size} selected`}
          </Text>
        </Box>
        
        <Group>
          <Button 
            variant="light" 
            leftSection={<IconRefresh size={16} />}
            onClick={() => fetchProducts(currentPage, true)}
            loading={refreshing}
          >
            Refresh
          </Button>
          
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Button 
                variant="light" 
                leftSection={<IconDots size={16} />}
                rightSection={<IconChevronDown size={16} />}
              >
                Actions
              </Button>
            </Menu.Target>
            
            <Menu.Dropdown>
              <Menu.Item 
                leftSection={<IconFileExport size={16} />}
                onClick={openExportModal}
              >
                Export Products
              </Menu.Item>
              <Menu.Item 
                leftSection={<IconFileImport size={16} />}
                onClick={openImportModal}
              >
                Import Products
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item 
                leftSection={<IconEdit size={16} />}
                onClick={openBulkActions}
                disabled={selectedProducts.size === 0}
              >
                Bulk Actions ({selectedProducts.size})
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          
          <Button 
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              // Navigate to add product page
              window.location.href = '/admin/products/add';
            }}
          >
            Add Product
          </Button>
        </Group>
      </Flex>
      
      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} mb="xl">
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total Products
              </Text>
              <Text fw={700} size="xl">{statistics.total}</Text>
            </Box>
            <IconPackage size={32} color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>
        
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Active
              </Text>
              <Text fw={700} size="xl" c="green">{statistics.active}</Text>
            </Box>
            <IconCheck size={32} color="var(--mantine-color-green-6)" />
          </Group>
        </Card>
        
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                In Stock
              </Text>
              <Text fw={700} size="xl" c="green">{statistics.inStock}</Text>
            </Box>
            <IconShoppingCart size={32} color="var(--mantine-color-green-6)" />
          </Group>
        </Card>
        
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Out of Stock
              </Text>
              <Text fw={700} size="xl" c="red">{statistics.outOfStock}</Text>
            </Box>
            <IconAlertTriangle size={32} color="var(--mantine-color-yellow-6)" />
          </Group>
        </Card>
        
        <Card withBorder p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Inventory Value
              </Text>
              <Text fw={700} size="xl" c="blue">{formatCurrency(statistics.totalValue)}</Text>
            </Box>
            <IconCurrencyDollar size={32} color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>
      </SimpleGrid>
      
      {/* Search and Filters */}
      <Paper withBorder p="md" mb="md">
        <Group justify="space-between" mb="md">
          <Group>
            <TextInput
              placeholder="Search products..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              style={{ minWidth: 300 }}
            />
            
            <Select
              placeholder="Status"
              data={[
                { value: '', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value || '')}
              clearable
            />
            
            <Select
              placeholder="Stock"
              data={[
                { value: '', label: 'All Stock' },
                { value: 'in_stock', label: 'In Stock' },
                { value: 'low_stock', label: 'Low Stock' },
                { value: 'out_of_stock', label: 'Out of Stock' }
              ]}
              value={stockFilter}
              onChange={(value) => setStockFilter(value || '')}
              clearable
            />
          </Group>
          
          <Group>
            <Button 
              variant="light" 
              leftSection={<IconAdjustments size={16} />}
              onClick={openFilters}
            >
              Advanced Filters
            </Button>
            
            <Select
              placeholder="Sort by"
              data={[
                { value: 'created_at', label: 'Date Created' },
                { value: 'updated_at', label: 'Last Updated' },
                { value: 'name', label: 'Name' },
                { value: 'price', label: 'Price' }
              ]}
              value={sortBy}
              onChange={(value) => setSortBy(value as 'name' | 'price' | 'created_at' | 'updated_at')}
            />
            
            <ActionIcon
              variant="light"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />}
            </ActionIcon>
          </Group>
        </Group>
      </Paper>
      
      {/* Products Table */}
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <Checkbox
                  checked={selectAll}
                  indeterminate={selectedProducts.size > 0 && !selectAll}
                  onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                />
              </Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Stock</Table.Th>
              <Table.Th>Sales</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {products.map((product) => (
              <Table.Tr key={product.id}>
                <Table.Td>
                  <Checkbox
                    checked={selectedProducts.has(product.id)}
                    onChange={(event) => handleSelectProduct(product.id, event.currentTarget.checked)}
                  />
                </Table.Td>
                
                <Table.Td>
                  <Group gap="sm">
                    <Avatar
                      src={product.featured_image_url}
                      alt={product.name}
                      size="sm"
                      radius="sm"
                    >
                      <IconPackage size={16} />
                    </Avatar>
                    <Box>
                      <Text fw={500} lineClamp={1}>
                        {product.name}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        SKU: {product.sku}
                      </Text>
                    </Box>
                  </Group>
                </Table.Td>
                
                <Table.Td>
                  <Group gap="xs">
                    <Text fw={500}>
                      {formatCurrency(product.base_price)}
                    </Text>
                    {product.sale_price && (
                      <Text size="xs" c="dimmed" td="line-through">
                        {formatCurrency(product.sale_price)}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                
                <Table.Td>
                  <Group gap="xs">
                    <Badge
                      color={STOCK_STATUS_COLORS[product.stock_status]}
                      variant="light"
                      size="sm"
                    >
                      {STOCK_STATUS_LABELS[product.stock_status]}
                    </Badge>
                    {product.track_inventory && (
                      <Text size="xs" c="dimmed">
                        {product.stock_quantity}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                
                <Table.Td>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {product.sales_data.total_sales}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatCurrency(product.sales_data.total_revenue)}
                    </Text>
                  </Group>
                </Table.Td>
                
                <Table.Td>
                  <Badge
                    color={product.is_active ? 'green' : 'gray'}
                    variant="light"
                    size="sm"
                  >
                    {product.is_active ? 'Listed' : 'Unlisted'}
                  </Badge>
                </Table.Td>
                
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="View Details">
                      <ActionIcon
                        variant="light"
                        size="md"
                        onClick={() => {
                          window.location.href = `/admin/products/${product.id}`;
                        }}
                      >
                        <IconEye size={18} />
                      </ActionIcon>
                    </Tooltip>
                    
                    <Tooltip label="Edit Product">
                      <ActionIcon
                        variant="light"
                        size="md"
                        onClick={() => {
                          window.location.href = `/admin/products/${product.id}`;
                        }}
                      >
                        <IconEdit size={18} />
                      </ActionIcon>
                    </Tooltip>
                    
                    <Menu shadow="md" width={200} position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="light" size="md">
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={product.is_active ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                          onClick={() => toggleProductStatus(product.id, product.is_active)}
                        >
                          {product.is_active ? 'Unlist' : 'List'} Product
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size={16} />}
                          onClick={() => {
                            window.location.href = `/admin/products/${product.id}`;
                          }}
                        >
                          Edit Product
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={16} />}
                          color="red"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this product?')) {
                              // Handle delete
                            }
                          }}
                        >
                          Delete Product
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        
        {products.length === 0 && !loading && (
          <Center py="xl">
            <Stack align="center">
              <IconPackage size={48} color="var(--mantine-color-gray-4)" />
              <Text size="lg" c="dimmed">No products found</Text>
              <Text size="sm" c="dimmed">
                {searchQuery || statusFilter || stockFilter ? 
                  'Try adjusting your filters' : 
                  'Create your first product to get started'
                }
              </Text>
              {(!searchQuery && !statusFilter && !stockFilter) && (
                <Button 
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    window.location.href = '/admin/products/add';
                  }}
                >
                  Add Your First Product
                </Button>
              )}
            </Stack>
          </Center>
        )}
      </Paper>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination
            value={currentPage}
            onChange={setCurrentPage}
            total={totalPages}
            siblings={2}
            boundaries={1}
          />
        </Group>
      )}
      
      {/* Advanced Filters Modal */}
      <Modal opened={filtersOpened} onClose={closeFilters} title="Advanced Filters">
        <Stack>
          <TextInput
            label="Search in name or description"
            placeholder="Enter keywords..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
          
          <Select
            label="Category"
            placeholder="Select category"
            data={categories.map(cat => ({ value: cat.id, label: cat.name }))}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value || '')}
            clearable
          />
          
          <Group grow>
            <NumberInput
              label="Min Price"
              placeholder="0.00"
              min={0}
              step={0.01}
              leftSection="$"
            />
            <NumberInput
              label="Max Price"
              placeholder="999.99"
              min={0}
              step={0.01}
              leftSection="$"
            />
          </Group>
          
          <Group grow>
            <Select
              label="Sort By"
              data={[
                { value: 'created_at', label: 'Date Created' },
                { value: 'updated_at', label: 'Last Updated' },
                { value: 'name', label: 'Name' },
                { value: 'price', label: 'Price' }
              ]}
              value={sortBy}
              onChange={(value) => setSortBy(value as 'name' | 'price' | 'created_at' | 'updated_at')}
            />
            <Select
              label="Order"
              data={[
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' }
              ]}
              value={sortOrder}
              onChange={(value) => setSortOrder(value as 'asc' | 'desc')}
            />
          </Group>
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={resetFilters}>
              Reset Filters
            </Button>
            <Button onClick={applyFilters}>
              Apply Filters
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Bulk Actions Modal */}
      <Modal opened={bulkActionsOpened} onClose={closeBulkActions} title="Bulk Actions">
        <Stack>
          <Text size="sm" c="dimmed">
            {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
          </Text>
          
          <Group>
            <Button 
              variant="light" 
              color="green"
              onClick={() => handleBulkAction('list')}
            >
              List Products
            </Button>
            <Button 
              variant="light" 
              color="yellow"
              onClick={() => handleBulkAction('unlist')}
            >
              Unlist Products
            </Button>
            <Button 
              variant="light" 
              color="red"
              onClick={() => handleBulkAction('delete')}
            >
              Delete Products
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Export Modal */}
      <Modal opened={exportModalOpened} onClose={closeExportModal} title="Export Products">
        <Stack>
          <Select
            label="Export Format"
            data={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
              { value: 'xlsx', label: 'Excel' }
            ]}
            value={exportFormat}
            onChange={(value) => setExportFormat(value as 'csv' | 'json' | 'xlsx')}
          />
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeExportModal}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              Export
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Import Modal */}
      <Modal opened={importModalOpened} onClose={closeImportModal} title="Import Products">
        <Stack>
          <FileInput
            label="Select file"
            placeholder="Choose CSV, JSON, or Excel file"
            accept=".csv,.json,.xlsx"
            value={importFile}
            onChange={setImportFile}
          />
          
          <Text size="sm" c="dimmed">
            Supported formats: CSV, JSON, Excel (.xlsx)
          </Text>
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeImportModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleImport}
              loading={importProcessing}
              disabled={!importFile}
            >
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}