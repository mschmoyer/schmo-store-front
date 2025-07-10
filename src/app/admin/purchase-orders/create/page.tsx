'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Title,
  Table,
  Button,
  TextInput,
  Group,
  Text,
  Stack,
  Flex,
  Alert,
  Card,
  SimpleGrid,
  NumberInput,
  Textarea,
  Modal,
  ActionIcon,
  Badge,
  Avatar,
  Container,
  Divider,
  Combobox,
  useCombobox,
  Input,
  InputBase
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconSearch,
  IconCheck,
  IconX,
  IconPackage,
  IconAlertTriangle
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { useRouter } from 'next/navigation';

// Types
interface Product {
  id: string;
  name: string;
  sku: string;
  base_price: number;
  stock_quantity: number;
  featured_image_url: string;
}

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

interface CreatePurchaseOrderForm {
  supplier: string;
  order_date: Date | null;
  expected_delivery: Date | null;
  notes: string;
  items: PurchaseOrderItem[];
}

/**
 * Purchase Order Creation Page Component
 * 
 * Allows users to create new purchase orders by:
 * - Selecting supplier and dates
 * - Adding products with quantities and unit costs
 * - Calculating totals automatically
 * - Submitting the purchase order
 * 
 * @returns JSX.Element
 */
export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { session, isAuthenticated } = useAdmin();
  
  // State management
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [form, setForm] = useState<CreatePurchaseOrderForm>({
    supplier: '',
    order_date: new Date(),
    expected_delivery: null,
    notes: '',
    items: []
  });
  
  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  
  // Modals
  const [productModalOpened, { open: openProductModal, close: closeProductModal }] = useDisclosure(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemUnitCost, setItemUnitCost] = useState(0);
  
  // Combobox for product selection
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  
  /**
   * Fetch products for selection
   */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/products?limit=100', {
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
      
      const productList = result.data.products || [];
      setProducts(productList);
      setFilteredProducts(productList);
      
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [session?.sessionToken]);
  
  /**
   * Filter products based on search query
   */
  useEffect(() => {
    if (productSearch) {
      const filtered = products.filter(product =>
        product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        product.sku.toLowerCase().includes(productSearch.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [productSearch, products]);
  
  /**
   * Add item to purchase order
   */
  const addItemToPurchaseOrder = (product: Product, quantity: number, unitCost: number) => {
    const existingItemIndex = form.items.findIndex(item => item.product_id === product.id);
    
    if (existingItemIndex >= 0) {
      // Update existing item
      const updatedItems = [...form.items];
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity: updatedItems[existingItemIndex].quantity + quantity,
        unit_cost: unitCost,
        total_cost: (updatedItems[existingItemIndex].quantity + quantity) * unitCost
      };
      setForm(prev => ({ ...prev, items: updatedItems }));
    } else {
      // Add new item
      const newItem: PurchaseOrderItem = {
        id: `temp-${Date.now()}`,
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity,
        unit_cost: unitCost,
        total_cost: quantity * unitCost
      };
      setForm(prev => ({ ...prev, items: [...prev.items, newItem] }));
    }
    
    // Reset modal state
    setSelectedProduct(null);
    setItemQuantity(1);
    setItemUnitCost(0);
    closeProductModal();
  };
  
  /**
   * Remove item from purchase order
   */
  const removeItem = (itemId: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };
  
  /**
   * Update item quantity or unit cost
   */
  const updateItem = (itemId: string, field: 'quantity' | 'unit_cost', value: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          updatedItem.total_cost = updatedItem.quantity * updatedItem.unit_cost;
          return updatedItem;
        }
        return item;
      })
    }));
  };
  
  /**
   * Calculate totals
   */
  const calculateTotals = () => {
    const subtotal = form.items.reduce((sum, item) => sum + item.total_cost, 0);
    const taxAmount = 0; // TODO: Calculate tax if needed
    const shippingAmount = 0; // TODO: Calculate shipping if needed
    const total = subtotal + taxAmount + shippingAmount;
    
    return { subtotal, taxAmount, shippingAmount, total };
  };
  
  /**
   * Submit purchase order
   */
  const submitPurchaseOrder = async () => {
    // Validation
    if (!form.supplier.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Supplier is required',
        color: 'red'
      });
      return;
    }
    
    if (!form.order_date) {
      notifications.show({
        title: 'Validation Error',
        message: 'Order date is required',
        color: 'red'
      });
      return;
    }
    
    if (form.items.length === 0) {
      notifications.show({
        title: 'Validation Error',
        message: 'At least one item is required',
        color: 'red'
      });
      return;
    }
    
    setSubmitting(true);
    
    try {
      if (!session?.sessionToken) {
        throw new Error('No authentication token available');
      }

      const requestBody = {
        supplier: form.supplier,
        order_date: form.order_date.toISOString().split('T')[0],
        expected_delivery: form.expected_delivery ? form.expected_delivery.toISOString().split('T')[0] : undefined,
        notes: form.notes,
        items: form.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost
        }))
      };

      const response = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create purchase order');
      }
      
      notifications.show({
        title: 'Success',
        message: 'Purchase order created successfully',
        color: 'green'
      });
      
      // Redirect to purchase order detail page
      router.push(`/admin/purchase-orders/${result.data.purchase_order.id}`);
      
    } catch (err) {
      console.error('Error creating purchase order:', err);
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to create purchase order',
        color: 'red'
      });
    } finally {
      setSubmitting(false);
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
  
  // Fetch products on component mount
  useEffect(() => {
    if (isAuthenticated && session?.sessionToken) {
      fetchProducts();
    }
  }, [isAuthenticated, session?.sessionToken, fetchProducts]);
  
  const totals = calculateTotals();
  
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
              Create Purchase Order
            </Title>
            <Text c="dimmed" size="sm">
              Create a new purchase order to track inventory restocking
            </Text>
          </Box>
        </Group>
        
        <Group>
          <Button
            variant="light"
            leftSection={<IconX size={16} />}
            onClick={() => router.push('/admin/purchase-orders')}
          >
            Cancel
          </Button>
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={submitPurchaseOrder}
            loading={submitting}
            disabled={form.items.length === 0 || !form.supplier || !form.order_date}
          >
            Create Purchase Order
          </Button>
        </Group>
      </Flex>
      
      {error && (
        <Alert 
          icon={<IconAlertTriangle size={16} />} 
          title="Error" 
          color="red" 
          variant="light"
          mb="md"
        >
          {error}
        </Alert>
      )}
      
      {/* Form */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="xl">
        <Card withBorder p="lg">
          <Stack>
            <Title order={3} mb="md">Purchase Order Details</Title>
            
            <TextInput
              label="Supplier"
              placeholder="Enter supplier name"
              value={form.supplier}
              onChange={(e) => setForm(prev => ({ ...prev, supplier: e.target.value }))}
              required
            />
            
            <DateInput
              label="Order Date"
              placeholder="Select order date"
              value={form.order_date}
              onChange={(date) => setForm(prev => ({ ...prev, order_date: date }))}
              required
            />
            
            <DateInput
              label="Expected Delivery"
              placeholder="Select expected delivery date"
              value={form.expected_delivery}
              onChange={(date) => setForm(prev => ({ ...prev, expected_delivery: date }))}
            />
            
            <Textarea
              label="Notes"
              placeholder="Add any notes about this purchase order..."
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              minRows={3}
            />
          </Stack>
        </Card>
        
        <Card withBorder p="lg">
          <Stack>
            <Title order={3} mb="md">Order Summary</Title>
            
            <Group justify="space-between">
              <Text fw={500}>Subtotal:</Text>
              <Text>{formatCurrency(totals.subtotal)}</Text>
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Tax:</Text>
              <Text>{formatCurrency(totals.taxAmount)}</Text>
            </Group>
            
            <Group justify="space-between">
              <Text fw={500}>Shipping:</Text>
              <Text>{formatCurrency(totals.shippingAmount)}</Text>
            </Group>
            
            <Divider />
            
            <Group justify="space-between">
              <Text fw={700} size="lg">Total:</Text>
              <Text fw={700} size="lg">{formatCurrency(totals.total)}</Text>
            </Group>
            
            <Divider />
            
            <Group justify="space-between">
              <Text fw={500}>Items:</Text>
              <Text>{form.items.length} items</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
      
      {/* Items Section */}
      <Card withBorder p="lg" mb="xl">
        <Group justify="space-between" mb="md">
          <Title order={3}>Items</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openProductModal}
            disabled={loading}
          >
            Add Product
          </Button>
        </Group>
        
        {form.items.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th>Quantity</Table.Th>
                <Table.Th>Unit Cost</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Stack gap="xs">
                      <Text fw={500}>{item.product_name}</Text>
                      <Text size="sm" c="dimmed" ff="monospace">
                        SKU: {item.product_sku}
                      </Text>
                    </Stack>
                  </Table.Td>
                  
                  <Table.Td>
                    <NumberInput
                      value={item.quantity}
                      onChange={(value) => updateItem(item.id, 'quantity', Number(value) || 0)}
                      min={1}
                      size="sm"
                      style={{ width: 80 }}
                    />
                  </Table.Td>
                  
                  <Table.Td>
                    <NumberInput
                      value={item.unit_cost}
                      onChange={(value) => updateItem(item.id, 'unit_cost', Number(value) || 0)}
                      min={0}
                      step={0.01}
                      decimalScale={2}
                      fixedDecimalScale
                      prefix="$"
                      size="sm"
                      style={{ width: 120 }}
                    />
                  </Table.Td>
                  
                  <Table.Td>
                    <Text fw={500}>{formatCurrency(item.total_cost)}</Text>
                  </Table.Td>
                  
                  <Table.Td>
                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() => removeItem(item.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Box ta="center" py="xl">
            <Stack align="center">
              <IconPackage size={48} color="var(--mantine-color-gray-4)" />
              <Text size="lg" c="dimmed">No items added yet</Text>
              <Text size="sm" c="dimmed">
                Click &quot;Add Product&quot; to start building your purchase order
              </Text>
            </Stack>
          </Box>
        )}
      </Card>
      
      {/* Product Selection Modal */}
      <Modal 
        opened={productModalOpened} 
        onClose={closeProductModal} 
        title="Add Product to Purchase Order"
        size="lg"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Search and select a product to add to your purchase order
          </Text>
          
          <Combobox
            store={combobox}
            onOptionSubmit={(val) => {
              const product = products.find(p => p.id === val);
              if (product) {
                setSelectedProduct(product);
                setItemUnitCost(product.base_price);
                combobox.closeDropdown();
              }
            }}
          >
            <Combobox.Target>
              <InputBase
                component="button"
                type="button"
                pointer
                rightSection={<IconSearch size={16} />}
                onClick={() => combobox.toggleDropdown()}
                rightSectionPointerEvents="none"
                multiline
              >
                {selectedProduct ? (
                  <Group gap="sm">
                    <Avatar src={selectedProduct.featured_image_url} size="sm" radius="sm">
                      <IconPackage size={16} />
                    </Avatar>
                    <Stack gap={0}>
                      <Text fw={500} size="sm">{selectedProduct.name}</Text>
                      <Text size="xs" c="dimmed">SKU: {selectedProduct.sku}</Text>
                    </Stack>
                  </Group>
                ) : (
                  <Input.Placeholder>Search products...</Input.Placeholder>
                )}
              </InputBase>
            </Combobox.Target>
            
            <Combobox.Dropdown>
              <Combobox.Search
                value={productSearch}
                onChange={(event) => setProductSearch(event.currentTarget.value)}
                placeholder="Search products..."
              />
              <Combobox.Options>
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <Combobox.Option value={product.id} key={product.id}>
                      <Group gap="sm">
                        <Avatar src={product.featured_image_url} size="sm" radius="sm">
                          <IconPackage size={16} />
                        </Avatar>
                        <Stack gap={0}>
                          <Text fw={500} size="sm">{product.name}</Text>
                          <Text size="xs" c="dimmed">
                            SKU: {product.sku} • Stock: {product.stock_quantity} • ${product.base_price}
                          </Text>
                        </Stack>
                      </Group>
                    </Combobox.Option>
                  ))
                ) : (
                  <Combobox.Empty>No products found</Combobox.Empty>
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
          
          {selectedProduct && (
            <Stack gap="sm">
              <Divider />
              <Group justify="space-between">
                <Text fw={500}>Selected Product:</Text>
                <Badge variant="light">{selectedProduct.name}</Badge>
              </Group>
              
              <SimpleGrid cols={2}>
                <NumberInput
                  label="Quantity"
                  value={itemQuantity}
                  onChange={(value) => setItemQuantity(Number(value) || 1)}
                  min={1}
                />
                
                <NumberInput
                  label="Unit Cost"
                  value={itemUnitCost}
                  onChange={(value) => setItemUnitCost(Number(value) || 0)}
                  min={0}
                  step={0.01}
                  decimalScale={2}
                  fixedDecimalScale
                  prefix="$"
                />
              </SimpleGrid>
              
              <Group justify="space-between">
                <Text fw={500}>Total Cost:</Text>
                <Text fw={700} size="lg">{formatCurrency(itemQuantity * itemUnitCost)}</Text>
              </Group>
            </Stack>
          )}
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeProductModal}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedProduct) {
                  addItemToPurchaseOrder(selectedProduct, itemQuantity, itemUnitCost);
                }
              }}
              disabled={!selectedProduct || itemQuantity <= 0 || itemUnitCost <= 0}
            >
              Add to Purchase Order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}