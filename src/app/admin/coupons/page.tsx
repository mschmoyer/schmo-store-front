'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Tabs,
  SimpleGrid,
  Loader,
  Center,
  Collapse,
  Divider,
  Avatar,
  Checkbox,
  Box,
  ScrollArea
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconTicket,
  IconPercentage,
  IconCurrencyDollar,
  IconSearch,
  IconPackage,
  IconCategory,
  IconShoppingCart
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';

interface Discount {
  id: string;
  store_id: string;
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  minimum_order_amount: number;
  maximum_discount_amount?: number;
  is_active: boolean;
  created_at: string;
  coupon_count?: number;
}

interface Coupon {
  id: string;
  store_id: string;
  discount_id: string;
  code: string;
  description: string;
  is_active: boolean;
  max_uses?: number;
  max_uses_per_customer: number;
  current_uses: number;
  created_at: string;
  applies_to?: 'entire_order' | 'specific_products' | 'specific_categories';
  applicable_product_ids?: string[];
  applicable_category_ids?: string[];
  discount?: {
    name: string;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number;
  };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  base_price: number;
  featured_image_url: string | null;
  category_id: string;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  product_count: number;
}

export default function CouponsManagementPage() {
  const [activeTab, setActiveTab] = useState<string>('coupons');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showAdvancedTargeting, setShowAdvancedTargeting] = useState(false);

  // Modal states
  const [couponModalOpened, { open: openCouponModal, close: closeCouponModal }] = useDisclosure(false);
  const [discountModalOpened, { open: openDiscountModal, close: closeDiscountModal }] = useDisclosure(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deleteConfirmOpened, { open: openDeleteConfirm, close: closeDeleteConfirm }] = useDisclosure(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'coupon' | 'discount', id: string, name: string } | null>(null);

  // Form states
  const [couponForm, setCouponForm] = useState(() => ({
    discount_id: '',
    code: '',
    description: '',
    max_uses: '',
    max_uses_per_customer: 1,
    applies_to: 'entire_order' as 'entire_order' | 'specific_products' | 'specific_categories',
    applicable_product_ids: [] as string[],
    applicable_category_ids: [] as string[]
  }));

  const [discountForm, setDiscountForm] = useState(() => ({
    name: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: 0,
    minimum_order_amount: 0,
    maximum_discount_amount: ''
  }));

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (couponModalOpened) {
      fetchCategories();
    }
  }, [couponModalOpened]);

  const fetchProducts = useCallback(async (search: string = '') => {
    setLoadingProducts(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('limit', '100');

      const response = await fetch(`/api/admin/products/simple?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const response = await fetch('/api/admin/categories/simple', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCategories(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const debouncedFetchProducts = React.useMemo(
    () => debounce((search: string) => {
      fetchProducts(search);
    }, 300),
    [fetchProducts]
  );

  useEffect(() => {
    if (showAdvancedTargeting) {
      debouncedFetchProducts(productSearchTerm);
    }
  }, [productSearchTerm, showAdvancedTargeting, debouncedFetchProducts]);

  function debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: Parameters<T>) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      // Fetch coupons
      const couponsResponse = await fetch('/api/admin/coupons?type=coupons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (couponsResponse.ok) {
        const couponsResult = await couponsResponse.json();
        if (couponsResult.success) {
          setCoupons(couponsResult.data.coupons || []);
        }
      }

      // Fetch discounts
      const discountsResponse = await fetch('/api/admin/coupons?type=discounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (discountsResponse.ok) {
        const discountsResult = await discountsResponse.json();
        if (discountsResult.success) {
          setDiscounts(discountsResult.data.discounts || []);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const payload = {
        type: 'coupon',
        ...couponForm,
        max_uses: couponForm.max_uses ? parseInt(couponForm.max_uses) : null
      };

      const isEditing = editingCoupon !== null;
      const url = isEditing ? `/api/admin/coupons/${editingCoupon.id}` : '/api/admin/coupons';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        notifications.show({
          title: 'Success',
          message: `Coupon ${isEditing ? 'updated' : 'created'} successfully`,
          color: 'green'
        });
        closeCouponModal();
        resetCouponForm();
        fetchData();
      } else {
        notifications.show({
          title: 'Error',
          message: result.error || `Failed to ${isEditing ? 'update' : 'create'} coupon`,
          color: 'red'
        });
      }
    } catch (error) {
      console.error(`Error ${editingCoupon ? 'updating' : 'creating'} coupon:`, error);
      notifications.show({
        title: 'Error',
        message: `Failed to ${editingCoupon ? 'update' : 'create'} coupon`,
        color: 'red'
      });
    }
  };

  const handleCreateDiscount = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const payload = {
        type: 'discount',
        ...discountForm,
        maximum_discount_amount: discountForm.maximum_discount_amount 
          ? parseFloat(discountForm.maximum_discount_amount) 
          : null
      };

      const isEditing = editingDiscount !== null;
      const url = isEditing ? `/api/admin/coupons/${editingDiscount.id}` : '/api/admin/coupons';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        notifications.show({
          title: 'Success',
          message: `Discount ${isEditing ? 'updated' : 'created'} successfully`,
          color: 'green'
        });
        closeDiscountModal();
        resetDiscountForm();
        fetchData();
      } else {
        notifications.show({
          title: 'Error',
          message: result.error || `Failed to ${isEditing ? 'update' : 'create'} discount`,
          color: 'red'
        });
      }
    } catch (error) {
      console.error(`Error ${editingDiscount ? 'updating' : 'creating'} discount:`, error);
      notifications.show({
        title: 'Error',
        message: `Failed to ${editingDiscount ? 'update' : 'create'} discount`,
        color: 'red'
      });
    }
  };

  const resetCouponForm = () => {
    setCouponForm({
      discount_id: '',
      code: '',
      description: '',
      max_uses: '',
      max_uses_per_customer: 1,
      applies_to: 'entire_order',
      applicable_product_ids: [],
      applicable_category_ids: []
    });
    setShowAdvancedTargeting(false);
    setProductSearchTerm('');
    setEditingCoupon(null);
  };

  const resetDiscountForm = () => {
    setDiscountForm({
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 0,
      minimum_order_amount: 0,
      maximum_discount_amount: ''
    });
    setEditingDiscount(null);
  };

  const openCreateCouponModal = () => {
    resetCouponForm();
    openCouponModal();
  };

  const openCreateDiscountModal = () => {
    resetDiscountForm();
    openDiscountModal();
  };

  const openEditCouponModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setCouponForm({
      discount_id: coupon.discount_id,
      code: coupon.code,
      description: coupon.description,
      max_uses: coupon.max_uses?.toString() || '',
      max_uses_per_customer: coupon.max_uses_per_customer,
      applies_to: coupon.applies_to || 'entire_order',
      applicable_product_ids: coupon.applicable_product_ids || [],
      applicable_category_ids: coupon.applicable_category_ids || []
    });
    if (coupon.applies_to && coupon.applies_to !== 'entire_order') {
      setShowAdvancedTargeting(true);
    }
    openCouponModal();
  };

  const openEditDiscountModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setDiscountForm({
      name: discount.name,
      description: discount.description,
      discount_type: discount.discount_type,
      discount_value: discount.discount_value,
      minimum_order_amount: discount.minimum_order_amount,
      maximum_discount_amount: discount.maximum_discount_amount?.toString() || ''
    });
    openDiscountModal();
  };

  const handleDeleteCoupon = (coupon: Coupon) => {
    setItemToDelete({
      type: 'coupon',
      id: coupon.id,
      name: coupon.code
    });
    openDeleteConfirm();
  };

  const handleDeleteDiscount = (discount: Discount) => {
    setItemToDelete({
      type: 'discount',
      id: discount.id,
      name: discount.name
    });
    openDeleteConfirm();
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      const response = await fetch(`/api/admin/coupons/${itemToDelete.id}?type=${itemToDelete.type}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();

      if (result.success) {
        notifications.show({
          title: 'Success',
          message: `${itemToDelete.type === 'coupon' ? 'Coupon' : 'Discount'} deleted successfully`,
          color: 'green'
        });
        fetchData();
      } else {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to delete item',
          color: 'red'
        });
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete item',
        color: 'red'
      });
    } finally {
      setItemToDelete(null);
      closeDeleteConfirm();
    }
  };

  const getDiscountTypeIcon = (type: 'percentage' | 'fixed_amount') => {
    return type === 'percentage' ? <IconPercentage size={16} /> : <IconCurrencyDollar size={16} />;
  };

  const getDiscountValue = (discount: Discount) => {
    return discount.discount_type === 'percentage' 
      ? `${discount.discount_value}%`
      : `$${(Number(discount.discount_value) || 0).toFixed(2)}`;
  };

  const getAppliesTo = (coupon: Coupon) => {
    switch (coupon.applies_to) {
      case 'entire_order':
        return 'Entire order';
      case 'specific_products':
        return `${coupon.applicable_product_ids?.length || 0} product(s)`;
      case 'specific_categories':
        return `${coupon.applicable_category_ids?.length || 0} category(s)`;
      default:
        return 'Entire order';
    }
  };


  if (loading) {
    return (
      <Center style={{ height: '400px' }}>
        <Stack align="center">
          <Loader size="lg" />
          <Text>Loading coupons and discounts...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} mb="xs">
            Coupons & Discounts
          </Title>
          <Text c="dimmed">
            Manage promotional codes and discount offers for your store
          </Text>
        </div>
      </Group>

      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Active Coupons</Text>
            <IconTicket size={20} color="var(--mantine-color-blue-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {coupons.filter(c => c.is_active).length}
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Total Discounts</Text>
            <IconPercentage size={20} color="var(--mantine-color-green-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {discounts.length}
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Total Uses</Text>
            <IconCurrencyDollar size={20} color="var(--mantine-color-orange-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {coupons.reduce((sum, c) => sum + c.current_uses, 0)}
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed" fw={500}>Avg. Discount</Text>
            <IconPercentage size={20} color="var(--mantine-color-violet-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {discounts.length > 0 
              ? `${(discounts.reduce((sum, d) => sum + (Number(d.discount_value) || 0), 0) / discounts.length).toFixed(1)}%`
              : '0%'
            }
          </Text>
        </Card>
      </SimpleGrid>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'coupons')}>
        <Tabs.List>
          <Tabs.Tab value="coupons" leftSection={<IconTicket size="1rem" />}>
            Coupons ({coupons.length})
          </Tabs.Tab>
          <Tabs.Tab value="discounts" leftSection={<IconPercentage size="1rem" />}>
            Discounts ({discounts.length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="coupons" pt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={3}>Coupon Codes</Title>
              <Button leftSection={<IconPlus size="1rem" />} onClick={openCreateCouponModal}>
                Create Coupon
              </Button>
            </Group>

            {coupons.length === 0 ? (
              <Stack align="center" py="xl">
                <IconTicket size={48} color="var(--mantine-color-gray-5)" />
                <Text size="lg" c="dimmed">No coupons created yet</Text>
                <Button onClick={openCreateCouponModal}>Create your first coupon</Button>
              </Stack>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Code</Table.Th>
                    <Table.Th>Discount</Table.Th>
                    <Table.Th>Applies To</Table.Th>
                    <Table.Th>Usage</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {coupons.map((coupon) => (
                    <Table.Tr key={coupon.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={500}>{coupon.code}</Text>
                          <Text size="sm" c="dimmed">{coupon.description}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {getDiscountTypeIcon(coupon.discount?.discount_type || 'percentage')}
                          <Text>
                            {coupon.discount?.discount_type === 'percentage' 
                              ? `${coupon.discount.discount_value}%`
                              : `$${(Number(coupon.discount?.discount_value) || 0).toFixed(2)}`
                            }
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {coupon.applies_to === 'entire_order' && <IconShoppingCart size={16} />}
                          {coupon.applies_to === 'specific_products' && <IconPackage size={16} />}
                          {coupon.applies_to === 'specific_categories' && <IconCategory size={16} />}
                          <Text size="sm">{getAppliesTo(coupon)}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text>
                          {coupon.current_uses}
                          {coupon.max_uses && ` / ${coupon.max_uses}`}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={coupon.is_active ? 'green' : 'gray'} variant="light">
                          {coupon.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon size="sm" variant="subtle" onClick={() => openEditCouponModal(coupon)}>
                            <IconEdit size="1rem" />
                          </ActionIcon>
                          <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteCoupon(coupon)}>
                            <IconTrash size="1rem" />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="discounts" pt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={3}>Discount Rules</Title>
              <Button leftSection={<IconPlus size="1rem" />} onClick={openCreateDiscountModal}>
                Create Discount
              </Button>
            </Group>

            {discounts.length === 0 ? (
              <Stack align="center" py="xl">
                <IconPercentage size={48} color="var(--mantine-color-gray-5)" />
                <Text size="lg" c="dimmed">No discounts created yet</Text>
                <Button onClick={openCreateDiscountModal}>Create your first discount</Button>
              </Stack>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Value</Table.Th>
                    <Table.Th>Min. Order</Table.Th>
                    <Table.Th>Coupons</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {discounts.map((discount) => (
                    <Table.Tr key={discount.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={500}>{discount.name}</Text>
                          <Text size="sm" c="dimmed">{discount.description}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {getDiscountTypeIcon(discount.discount_type)}
                          <Text tt="capitalize">
                            {discount.discount_type.replace('_', ' ')}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500}>
                          {getDiscountValue(discount)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text>${(Number(discount.minimum_order_amount) || 0).toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">
                          {discount.coupon_count || 0} coupons
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={discount.is_active ? 'green' : 'gray'} variant="light">
                          {discount.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon size="sm" variant="subtle" onClick={() => openEditDiscountModal(discount)}>
                            <IconEdit size="1rem" />
                          </ActionIcon>
                          <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteDiscount(discount)}>
                            <IconTrash size="1rem" />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      {/* Create/Edit Coupon Modal */}
      <Modal opened={couponModalOpened} onClose={closeCouponModal} title={editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}>
        <Stack gap="md">
          <Select
            label="Discount Rule"
            placeholder="Select a discount to link this coupon to"
            data={discounts
              .filter(d => d.is_active)
              .map(d => ({ 
                value: d.id, 
                label: `${d.name} - ${getDiscountValue(d)}` 
              }))}
            value={couponForm.discount_id || null}
            onChange={(value) => setCouponForm(prev => ({ ...prev, discount_id: value || '' }))}
            required
          />

          <TextInput
            label="Coupon Code"
            placeholder="e.g., SAVE20, WELCOME10"
            value={couponForm.code}
            onChange={(e) => setCouponForm(prev => ({ 
              ...prev, 
              code: (e.currentTarget?.value || '').toUpperCase() 
            }))}
            required
          />

          <Textarea
            label="Description"
            placeholder="Describe when and how this coupon can be used"
            value={couponForm.description}
            onChange={(e) => setCouponForm(prev => ({ 
              ...prev, 
              description: e.currentTarget?.value || '' 
            }))}
            autosize
            minRows={2}
          />

          <Group grow>
            <TextInput
              label="Maximum Uses (Total)"
              placeholder="Leave empty for unlimited"
              value={couponForm.max_uses}
              onChange={(e) => setCouponForm(prev => ({ 
                ...prev, 
                max_uses: e.currentTarget?.value || '' 
              }))}
              type="number"
            />
            <NumberInput
              label="Max Uses Per Customer"
              value={couponForm.max_uses_per_customer}
              onChange={(value) => setCouponForm(prev => ({ 
                ...prev, 
                max_uses_per_customer: Number(value) || 1 
              }))}
              min={1}
            />
          </Group>

          <Divider my="md" />

          {/* Targeting Section */}
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text fw={500}>Coupon Targeting</Text>
                <Text size="sm" c="dimmed">Choose what this coupon applies to</Text>
              </div>
              <Button
                variant="light"
                size="xs"
                onClick={() => setShowAdvancedTargeting(!showAdvancedTargeting)}
              >
                {showAdvancedTargeting ? 'Simple' : 'Advanced'}
              </Button>
            </Group>

            {!showAdvancedTargeting ? (
              <Select
                label="Applies To"
                data={[
                  { value: 'entire_order', label: 'Entire Order' },
                  { value: 'specific_products', label: 'Specific Products' },
                  { value: 'specific_categories', label: 'Specific Categories' }
                ]}
                value={couponForm.applies_to}
                onChange={(value) => {
                  setCouponForm(prev => ({ 
                    ...prev, 
                    applies_to: (value || 'entire_order') as 'entire_order' | 'specific_products' | 'specific_categories',
                    applicable_product_ids: [],
                    applicable_category_ids: []
                  }));
                  if (value === 'specific_products' || value === 'specific_categories') {
                    setShowAdvancedTargeting(true);
                  }
                }}
              />
            ) : (
              <Stack gap="md">
                <Group>
                  <Button
                    variant={couponForm.applies_to === 'entire_order' ? 'filled' : 'light'}
                    leftSection={<IconShoppingCart size={16} />}
                    onClick={() => setCouponForm(prev => ({ 
                      ...prev, 
                      applies_to: 'entire_order',
                      applicable_product_ids: [],
                      applicable_category_ids: []
                    }))}
                  >
                    Entire Order
                  </Button>
                  <Button
                    variant={couponForm.applies_to === 'specific_products' ? 'filled' : 'light'}
                    leftSection={<IconPackage size={16} />}
                    onClick={() => setCouponForm(prev => ({ 
                      ...prev, 
                      applies_to: 'specific_products',
                      applicable_category_ids: []
                    }))}
                  >
                    Specific Products
                  </Button>
                  <Button
                    variant={couponForm.applies_to === 'specific_categories' ? 'filled' : 'light'}
                    leftSection={<IconCategory size={16} />}
                    onClick={() => setCouponForm(prev => ({ 
                      ...prev, 
                      applies_to: 'specific_categories',
                      applicable_product_ids: []
                    }))}
                  >
                    Specific Categories
                  </Button>
                </Group>

                <Collapse in={couponForm.applies_to === 'specific_products'}>
                  <Stack gap="md">
                    <TextInput
                      label="Search Products"
                      placeholder="Type to search products..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.currentTarget?.value || '')}
                      leftSection={<IconSearch size={16} />}
                    />
                    
                    <Box>
                      <Text size="sm" fw={500} mb="xs">
                        Select Products ({couponForm.applicable_product_ids.length} selected)
                      </Text>
                      <ScrollArea h={200} type="auto">
                        <Stack gap="xs">
                          {loadingProducts ? (
                            <Center py="md">
                              <Loader size="sm" />
                            </Center>
                          ) : (
                            products.map((product) => (
                              <Group key={product.id} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: '4px' }}>
                                <Group>
                                  <Avatar src={product.featured_image_url} size={32} radius="sm">
                                    <IconPackage size={16} />
                                  </Avatar>
                                  <div>
                                    <Text size="sm" fw={500}>{product.name}</Text>
                                    <Text size="xs" c="dimmed">{product.sku} • ${product.base_price}</Text>
                                  </div>
                                </Group>
                                <Checkbox
                                  checked={couponForm.applicable_product_ids.includes(product.id)}
                                  onChange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    setCouponForm(prev => ({
                                      ...prev,
                                      applicable_product_ids: checked
                                        ? [...prev.applicable_product_ids, product.id]
                                        : prev.applicable_product_ids.filter(id => id !== product.id)
                                    }));
                                  }}
                                />
                              </Group>
                            ))
                          )}
                        </Stack>
                      </ScrollArea>
                    </Box>
                  </Stack>
                </Collapse>

                <Collapse in={couponForm.applies_to === 'specific_categories'}>
                  <Box>
                    <Text size="sm" fw={500} mb="xs">
                      Select Categories ({couponForm.applicable_category_ids.length} selected)
                    </Text>
                    <ScrollArea h={200} type="auto">
                      <Stack gap="xs">
                        {loadingCategories ? (
                          <Center py="md">
                            <Loader size="sm" />
                          </Center>
                        ) : (
                          categories.map((category) => (
                            <Group key={category.id} justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: '4px' }}>
                              <Group>
                                <Avatar size={32} radius="sm">
                                  <IconCategory size={16} />
                                </Avatar>
                                <div>
                                  <Text size="sm" fw={500}>{category.name}</Text>
                                  <Text size="xs" c="dimmed">{category.product_count} products</Text>
                                </div>
                              </Group>
                              <Checkbox
                                checked={couponForm.applicable_category_ids.includes(category.id)}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setCouponForm(prev => ({
                                    ...prev,
                                    applicable_category_ids: checked
                                      ? [...prev.applicable_category_ids, category.id]
                                      : prev.applicable_category_ids.filter(id => id !== category.id)
                                  }));
                                }}
                              />
                            </Group>
                          ))
                        )}
                      </Stack>
                    </ScrollArea>
                  </Box>
                </Collapse>
              </Stack>
            )}
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeCouponModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCoupon}
              disabled={!couponForm.discount_id || !couponForm.code ||
                (couponForm.applies_to === 'specific_products' && couponForm.applicable_product_ids.length === 0) ||
                (couponForm.applies_to === 'specific_categories' && couponForm.applicable_category_ids.length === 0)
              }
            >
              {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Create/Edit Discount Modal */}
      <Modal opened={discountModalOpened} onClose={closeDiscountModal} title={editingDiscount ? 'Edit Discount' : 'Create New Discount'}>
        <Stack gap="md">
          <TextInput
            label="Discount Name"
            placeholder="e.g., Welcome Discount, Black Friday Sale"
            value={discountForm.name}
            onChange={(e) => setDiscountForm(prev => ({ 
              ...prev, 
              name: e.currentTarget?.value || '' 
            }))}
            required
          />

          <Textarea
            label="Description"
            placeholder="Describe this discount offer"
            value={discountForm.description}
            onChange={(e) => setDiscountForm(prev => ({ 
              ...prev, 
              description: e.currentTarget?.value || '' 
            }))}
            autosize
            minRows={2}
          />

          <Group grow>
            <Select
              label="Discount Type"
              data={[
                { value: 'percentage', label: 'Percentage' },
                { value: 'fixed_amount', label: 'Fixed Amount' }
              ]}
              value={discountForm.discount_type || null}
              onChange={(value) => setDiscountForm(prev => ({ 
                ...prev, 
                discount_type: (value || 'percentage') as 'percentage' | 'fixed_amount' 
              }))}
              required
            />
            <NumberInput
              label="Discount Value"
              value={discountForm.discount_value}
              onChange={(value) => setDiscountForm(prev => ({ 
                ...prev, 
                discount_value: Number(value) || 0 
              }))}
              min={0}
              max={discountForm.discount_type === 'percentage' ? 100 : undefined}
              leftSection={discountForm.discount_type === 'percentage' ? <IconPercentage size={16} /> : <IconCurrencyDollar size={16} />}
              required
            />
          </Group>

          <Group grow>
            <NumberInput
              label="Minimum Order Amount"
              value={discountForm.minimum_order_amount}
              onChange={(value) => setDiscountForm(prev => ({ 
                ...prev, 
                minimum_order_amount: Number(value) || 0 
              }))}
              min={0}
              leftSection={<IconCurrencyDollar size={16} />}
            />
            <TextInput
              label="Maximum Discount Amount"
              placeholder="Optional limit for percentage discounts"
              value={discountForm.maximum_discount_amount}
              onChange={(e) => setDiscountForm(prev => ({ 
                ...prev, 
                maximum_discount_amount: e.currentTarget?.value || '' 
              }))}
              type="number"
              leftSection={<IconCurrencyDollar size={16} />}
              disabled={discountForm.discount_type === 'fixed_amount'}
            />
          </Group>

          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeDiscountModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateDiscount}
              disabled={!discountForm.name || !discountForm.discount_value}
            >
              {editingDiscount ? 'Update Discount' : 'Create Discount'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteConfirmOpened} onClose={closeDeleteConfirm} title="Confirm Delete">
        <Stack gap="md">
          <Text>
            Are you sure you want to delete this {itemToDelete?.type}?
          </Text>
          <Text fw={500} c="red">
            {itemToDelete?.name}
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeDeleteConfirm}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}