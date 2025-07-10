'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Table,
  ActionIcon,
  Text,
  Divider,
  Card,
  Badge,
  Alert,
  Loader,
  Stepper,
  Autocomplete
} from '@mantine/core';
import {
  IconTrash,
  IconPlus,
  IconSearch,
  IconAlertCircle,
  IconCheck,
  IconBrain,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface PurchaseOrderItem {
  id?: string;
  product_id?: string;
  product_sku: string;
  product_name: string;
  product_description?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes?: string;
}

interface PurchaseOrderModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: (purchaseOrder: PurchaseOrderItem[]) => void;
  prefilledItems?: PurchaseOrderItem[];
}

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_terms?: string;
}

interface AIRecommendation {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  recommended_quantity: number;
  unit_cost: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
}

export default function PurchaseOrderModal({ 
  opened, 
  onClose, 
  onSuccess, 
  prefilledItems = [] 
}: PurchaseOrderModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  
  // Form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [shippingMethod, setShippingMethod] = useState('Standard');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseOrderItem[]>(prefilledItems);
  
  // AI recommendations
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  // Product search
  const [productSearchValue, setProductSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{id: string; name: string; sku: string; cost: number}>>([]);
  
  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  useEffect(() => {
    if (opened) {
      loadSuppliers();
      loadRecommendations();
      setActiveStep(0);
    }
  }, [opened]);

  const loadSuppliers = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/suppliers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSuppliers(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const loadRecommendations = async () => {
    setLoadingRecommendations(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/purchase-orders/recommendations?limit=10', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setRecommendations(result.data.recommendations);
          setShowRecommendations(result.data.recommendations.length > 0);
        }
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const searchProducts = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/products/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSearchResults(result.data);
        }
      }
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  const handleSupplierChange = (value: string | null) => {
    if (!value) return;
    
    const supplier = suppliers.find(s => s.name === value);
    if (supplier) {
      setSupplierName(supplier.name);
      setSupplierEmail(supplier.email || '');
      setSupplierPhone(supplier.phone || '');
      setSupplierAddress(supplier.address || '');
      setPaymentTerms(supplier.payment_terms || 'Net 30');
    } else {
      setSupplierName(value);
    }
  };

  const addRecommendationToOrder = (recommendation: AIRecommendation) => {
    const newItem: PurchaseOrderItem = {
      product_id: recommendation.product_id,
      product_sku: recommendation.product_sku,
      product_name: recommendation.product_name,
      quantity: recommendation.recommended_quantity,
      unit_cost: recommendation.unit_cost,
      total_cost: recommendation.recommended_quantity * recommendation.unit_cost
    };
    
    setItems(prev => [...prev, newItem]);
    setShowRecommendations(false);
  };

  const addProductToOrder = (product: {id: string; name: string; sku: string; cost_price?: number}) => {
    const newItem: PurchaseOrderItem = {
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.name,
      quantity: 1,
      unit_cost: product.cost_price || 0,
      total_cost: product.cost_price || 0
    };
    
    setItems(prev => [...prev, newItem]);
    setProductSearchValue('');
    setSearchResults([]);
  };

  const updateItem = (index: number, field: keyof PurchaseOrderItem, value: string | number) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // Recalculate total cost
      if (field === 'quantity' || field === 'unit_cost') {
        newItems[index].total_cost = newItems[index].quantity * newItems[index].unit_cost;
      }
      
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addEmptyItem = () => {
    const newItem: PurchaseOrderItem = {
      product_sku: '',
      product_name: '',
      quantity: 1,
      unit_cost: 0,
      total_cost: 0
    };
    setItems(prev => [...prev, newItem]);
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.total_cost, 0);
    const taxRate = 0.08; // 8% tax
    const taxAmount = subtotal * taxRate;
    const shippingAmount = subtotal > 100 ? 0 : 25; // Free shipping over $100
    const totalCost = subtotal + taxAmount + shippingAmount;
    
    return { subtotal, taxAmount, shippingAmount, totalCost };
  };

  const handleSubmit = async () => {
    if (!supplierName || items.length === 0) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please select a supplier and add at least one item',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          supplier_name: supplierName,
          supplier_email: supplierEmail,
          supplier_phone: supplierPhone,
          supplier_address: supplierAddress,
          expected_delivery: expectedDelivery,
          payment_terms: paymentTerms,
          shipping_method: shippingMethod,
          notes,
          items
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          notifications.show({
            title: 'Success',
            message: `Purchase order ${result.data.po_number} created successfully!`,
            color: 'green',
            icon: <IconCheck size="1rem" />
          });
          
          if (onSuccess) {
            onSuccess(result.data);
          }
          
          handleClose();
        } else {
          throw new Error(result.error || 'Failed to create purchase order');
        }
      } else {
        throw new Error('Failed to create purchase order');
      }
    } catch (error) {
      console.error('Error creating purchase order:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create purchase order',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setSupplierName('');
    setSupplierEmail('');
    setSupplierPhone('');
    setSupplierAddress('');
    setExpectedDelivery('');
    setPaymentTerms('Net 30');
    setShippingMethod('Standard');
    setNotes('');
    setItems([]);
    setActiveStep(0);
    setShowRecommendations(false);
    setProductSearchValue('');
    setSearchResults([]);
    
    onClose();
  };

  const { subtotal, taxAmount, shippingAmount, totalCost } = calculateTotals();

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create Purchase Order"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Stepper active={activeStep} onStepClick={setActiveStep} breakpoint="sm">
          <Stepper.Step label="Supplier" description="Choose supplier">
            <Stack gap="md" mt="md">
              <Autocomplete
                label="Supplier Name"
                placeholder="Search or enter supplier name"
                value={supplierName}
                onChange={setSupplierName}
                data={suppliers.map(s => s.name)}
                onOptionSubmit={handleSupplierChange}
                required
              />
              
              <Group grow>
                <TextInput
                  label="Email"
                  placeholder="supplier@example.com"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                />
                <TextInput
                  label="Phone"
                  placeholder="(555) 123-4567"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                />
              </Group>
              
              <Textarea
                label="Address"
                placeholder="Supplier address"
                value={supplierAddress}
                onChange={(e) => setSupplierAddress(e.target.value)}
                minRows={2}
              />
              
              <Group grow>
                <TextInput
                  label="Expected Delivery"
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
                <Select
                  label="Payment Terms"
                  value={paymentTerms}
                  onChange={(value) => setPaymentTerms(value || 'Net 30')}
                  data={[
                    { value: 'Net 30', label: 'Net 30' },
                    { value: 'Net 15', label: 'Net 15' },
                    { value: 'Cash on Delivery', label: 'Cash on Delivery' },
                    { value: 'Due on Receipt', label: 'Due on Receipt' }
                  ]}
                />
              </Group>
            </Stack>
          </Stepper.Step>
          
          <Stepper.Step label="Items" description="Add products">
            <Stack gap="md" mt="md">
              {/* AI Recommendations */}
              {showRecommendations && recommendations.length > 0 && (
                <Card withBorder>
                  <Group justify="space-between" mb="md">
                    <Group>
                      <IconBrain size="1.2rem" />
                      <Text fw={500}>AI Recommendations</Text>
                    </Group>
                    {loadingRecommendations && <Loader size="sm" />}
                  </Group>
                  
                  <Stack gap="xs">
                    {recommendations.slice(0, 3).map((rec, index) => (
                      <Group key={index} justify="space-between" p="xs" style={{ border: '1px solid #e9ecef', borderRadius: '4px' }}>
                        <div>
                          <Text size="sm" fw={500}>{rec.product_name}</Text>
                          <Text size="xs" c="dimmed">
                            {rec.reason} • {rec.recommended_quantity} units • ${(rec.recommended_quantity * rec.unit_cost).toFixed(2)}
                          </Text>
                        </div>
                        <Group gap="xs">
                          <Badge
                            color={rec.priority === 'urgent' ? 'red' : rec.priority === 'high' ? 'orange' : 'blue'}
                            size="xs"
                          >
                            {rec.priority}
                          </Badge>
                          <Button
                            size="xs"
                            onClick={() => addRecommendationToOrder(rec)}
                          >
                            Add
                          </Button>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                  
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => setShowRecommendations(false)}
                    mt="sm"
                  >
                    Hide Recommendations
                  </Button>
                </Card>
              )}

              {/* Product Search */}
              <Autocomplete
                label="Add Product"
                placeholder="Search products by name or SKU"
                value={productSearchValue}
                onChange={(value) => {
                  setProductSearchValue(value);
                  searchProducts(value);
                }}
                data={searchResults.map(p => ({
                  value: p.name,
                  label: `${p.name} (${p.sku})`
                }))}
                onOptionSubmit={(value) => {
                  const product = searchResults.find(p => p.name === value);
                  if (product) {
                    addProductToOrder(product);
                  }
                }}
                leftSection={<IconSearch size="1rem" />}
              />

              {/* Items Table */}
              {items.length > 0 && (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th>SKU</Table.Th>
                      <Table.Th>Quantity</Table.Th>
                      <Table.Th>Unit Cost</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>
                          <TextInput
                            placeholder="Product name"
                            value={item.product_name}
                            onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                            size="sm"
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            placeholder="SKU"
                            value={item.product_sku}
                            onChange={(e) => updateItem(index, 'product_sku', e.target.value)}
                            size="sm"
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            value={item.quantity}
                            onChange={(value) => updateItem(index, 'quantity', value || 1)}
                            min={1}
                            size="sm"
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            value={item.unit_cost}
                            onChange={(value) => updateItem(index, 'unit_cost', value || 0)}
                            min={0}
                            decimalScale={2}
                            prefix="$"
                            size="sm"
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text fw={500}>${item.total_cost.toFixed(2)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            onClick={() => removeItem(index)}
                            size="sm"
                          >
                            <IconTrash size="1rem" />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}

              <Button
                leftSection={<IconPlus size="1rem" />}
                variant="light"
                onClick={addEmptyItem}
              >
                Add Item
              </Button>
            </Stack>
          </Stepper.Step>
          
          <Stepper.Step label="Review" description="Confirm order">
            <Stack gap="md" mt="md">
              <Card withBorder>
                <Text fw={500} mb="sm">Order Summary</Text>
                <Group justify="space-between">
                  <Text>Subtotal:</Text>
                  <Text>${subtotal.toFixed(2)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text>Tax (8%):</Text>
                  <Text>${taxAmount.toFixed(2)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text>Shipping:</Text>
                  <Text>${shippingAmount.toFixed(2)}</Text>
                </Group>
                <Divider my="sm" />
                <Group justify="space-between">
                  <Text fw={500} size="lg">Total:</Text>
                  <Text fw={500} size="lg">${totalCost.toFixed(2)}</Text>
                </Group>
              </Card>
              
              <Textarea
                label="Notes"
                placeholder="Additional notes for this purchase order"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                minRows={3}
              />
              
              {items.length === 0 && (
                <Alert icon={<IconAlertCircle size="1rem" />} color="red">
                  Please add at least one item to create a purchase order.
                </Alert>
              )}
            </Stack>
          </Stepper.Step>
        </Stepper>

        <Group justify="space-between" mt="xl">
          <Button
            variant="outline"
            onClick={activeStep === 0 ? handleClose : () => setActiveStep(activeStep - 1)}
          >
            {activeStep === 0 ? 'Cancel' : 'Back'}
          </Button>
          
          {activeStep < 2 ? (
            <Button
              onClick={() => setActiveStep(activeStep + 1)}
              disabled={
                (activeStep === 0 && !supplierName) ||
                (activeStep === 1 && items.length === 0)
              }
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!supplierName || items.length === 0}
            >
              Create Purchase Order
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}