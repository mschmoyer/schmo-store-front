'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Title,
  Text,
  Tabs,
  Breadcrumbs,
  Anchor,
  Group,
  Badge,
  Button,
  ActionIcon,
  Skeleton,
  Alert,
  Modal,
  Stack,
  LoadingOverlay
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconEdit,
  IconEye,
  IconTrash,
  IconAlertTriangle,
  IconSettings,
  IconChartBar,
  IconInfoCircle
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/contexts/AdminContext';
import ProductEditForm from '@/components/admin/ProductEditForm';
import ProductAnalytics from '@/components/admin/ProductAnalytics';
import ProductAdvancedSettings from '@/components/admin/ProductAdvancedSettings';
import { Product } from '@/types/database';

interface EnhancedProduct extends Product {
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  needs_attention: string[];
  sales_data: {
    total_sales: number;
    total_revenue: number;
    total_orders: number;
    avg_sale_price: number;
    first_sale_date?: Date;
    last_sale_date?: Date;
  };
  analytics: {
    views: number;
    cart_adds: number;
    cart_abandons: number;
    conversion_rate: number;
    bounce_rate: number;
    avg_time_on_page: number;
  };
  inventory_history: Array<{
    change_type: string;
    quantity_change: number;
    quantity_after: number;
    reference_type?: string;
    reference_id?: string;
    notes?: string;
    created_at: Date;
  }>;
  category_info?: {
    name: string;
    slug: string;
    description?: string;
  };
  related_products: Array<{
    id: string;
    name: string;
    slug: string;
    base_price: number;
    featured_image_url?: string;
    stock_quantity: number;
  }>;
}

interface ProductEditPageProps {
  params: Promise<{
    productId: string;
  }>;
}

/**
 * Product Edit Page Component
 * 
 * Comprehensive product editing interface with tabbed sections for:
 * - Product details editing
 * - Analytics and performance metrics
 * - Advanced settings and configurations
 * 
 * @param props - ProductEditPageProps
 * @returns JSX.Element
 */
export default function ProductEditPage({ params }: ProductEditPageProps) {
  const router = useRouter();
  const { } = useAdmin();
  
  // State management
  const [product, setProduct] = useState<EnhancedProduct | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState<string | null>(null);
  
  // Modal states
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

  /**
   * Fetch product data with analytics and related information
   */
  const fetchProduct = async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/admin/products/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Product not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch product');
      }
      
      setProduct(result.data.product);
      
    } catch (err) {
      console.error('Error fetching product:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch product');
      notifications.show({
        title: 'Error',
        message: 'Failed to load product details',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch categories for form dropdown
   */
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/admin/categories');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCategories(result.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  /**
   * Save product changes
   */
  const handleSave = async (updatedProduct: Partial<Product>) => {
    if (!productId) return;
    
    setSaving(true);
    setFormErrors({});
    
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedProduct)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          // Handle conflict errors (SKU/slug already exists)
          setFormErrors({ [errorData.field || 'general']: errorData.error });
          throw new Error(errorData.error);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save product');
      }
      
      // Update local product data
      if (product) {
        setProduct({
          ...product,
          ...result.data.product
        });
      }
      
      notifications.show({
        title: 'Success',
        message: 'Product updated successfully',
        color: 'green'
      });
      
    } catch (err) {
      console.error('Error saving product:', err);
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to save product',
        color: 'red'
      });
      throw err; // Re-throw to prevent form from resetting
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle product deletion
   */
  const handleDelete = async () => {
    if (!productId) return;
    
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete product');
      }
      
      notifications.show({
        title: 'Success',
        message: 'Product deleted successfully',
        color: 'green'
      });
      
      router.push('/admin/products');
      
    } catch (err) {
      console.error('Error deleting product:', err);
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to delete product',
        color: 'red'
      });
    }
    
    closeDeleteModal();
  };

  /**
   * Navigate back to products list
   */
  const handleBack = () => {
    router.push('/admin/products');
  };

  /**
   * Open product preview in new tab
   */
  const handlePreview = () => {
    if (product) {
      window.open(`/store/${product.store_id}/product/${product.id}`, '_blank');
    }
  };

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      const { productId: id } = await params;
      setProductId(id);
      if (id) {
        fetchProduct(id);
        fetchCategories();
      }
    };
    loadData();
  }, [params]);

  // Show loading state
  if (loading) {
    return (
      <Container size="xl" py="md">
        <Stack gap="md">
          <Skeleton height={40} />
          <Skeleton height={60} />
          <Skeleton height={400} />
        </Stack>
      </Container>
    );
  }

  // Show error state
  if (error || !product) {
    return (
      <Container size="xl" py="md">
        <Alert 
          icon={<IconAlertTriangle size={16} />} 
          title="Error" 
          color="red" 
          variant="light"
        >
          {error || 'Product not found'}
          <Button 
            variant="light" 
            size="sm" 
            mt="sm" 
            onClick={() => router.push('/admin/products')}
          >
            Back to Products
          </Button>
        </Alert>
      </Container>
    );
  }

  const stockStatusColors = {
    in_stock: 'green',
    low_stock: 'yellow',
    out_of_stock: 'red',
    not_tracked: 'gray'
  } as const;

  const stockStatusLabels = {
    in_stock: 'In Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',
    not_tracked: 'Not Tracked'
  } as const;

  return (
    <Container size="xl" py="md">
      <LoadingOverlay visible={saving} />
      
      {/* Breadcrumbs */}
      <Breadcrumbs mb="md">
        <Anchor onClick={handleBack} style={{ cursor: 'pointer' }}>
          Products
        </Anchor>
        <Text>Edit Product</Text>
      </Breadcrumbs>

      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="xl">
        <Box>
          <Group gap="sm" align="center" mb="xs">
            <ActionIcon
              variant="light"
              size="lg"
              onClick={handleBack}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Title order={1}>{product.override_name || product.name}</Title>
            <Badge
              color={stockStatusColors[product.stock_status]}
              variant="light"
            >
              {stockStatusLabels[product.stock_status]}
            </Badge>
            {!product.is_active && (
              <Badge color="gray" variant="light">
                Unlisted
              </Badge>
            )}
          </Group>
          <Text c="dimmed" size="sm">
            SKU: {product.sku} • Last updated: {new Date(product.updated_at).toLocaleDateString()}
          </Text>
          {product.category_info && (
            <Text c="dimmed" size="sm">
              Category: {product.category_info.name}
            </Text>
          )}
        </Box>

        <Group>
          <Button
            variant="light"
            leftSection={<IconEye size={16} />}
            onClick={handlePreview}
            disabled={!product.is_active}
          >
            Preview
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={openDeleteModal}
          >
            Delete
          </Button>
        </Group>
      </Group>

      {/* Attention Alerts */}
      {product.needs_attention.length > 0 && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="This product needs attention"
          color="orange"
          variant="light"
          mb="md"
        >
          <Stack gap="xs">
            {product.needs_attention.map((issue, index) => (
              <Text key={index} size="sm">
                • {issue.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="details" leftSection={<IconEdit size={16} />}>
            Product Details
          </Tabs.Tab>
          <Tabs.Tab value="analytics" leftSection={<IconChartBar size={16} />}>
            Analytics
          </Tabs.Tab>
          <Tabs.Tab value="advanced" leftSection={<IconSettings size={16} />}>
            Advanced Settings
          </Tabs.Tab>
        </Tabs.List>

        {/* Product Details Tab */}
        <Tabs.Panel value="details" pt="md">
          <ProductEditForm
            product={product}
            categories={categories}
            onSave={handleSave}
            onCancel={handleBack}
            loading={saving}
            errors={formErrors}
          />
        </Tabs.Panel>

        {/* Analytics Tab */}
        <Tabs.Panel value="analytics" pt="md">
          <ProductAnalytics
            productId={product.id}
            salesData={product.sales_data}
            analytics={product.analytics}
            inventoryHistory={product.inventory_history}
            needsAttention={product.needs_attention}
          />
        </Tabs.Panel>

        {/* Advanced Settings Tab */}
        <Tabs.Panel value="advanced" pt="md">
          <ProductAdvancedSettings
            discountSettings={{
              discount_type: product.discount_type,
              discount_value: product.discount_value
            }}
            shippingSettings={{
              requires_shipping: product.requires_shipping,
              shipping_class: product.shipping_class,
              weight: product.weight,
              weight_unit: product.weight_unit,
              length: product.length,
              width: product.width,
              height: product.height,
              dimension_unit: product.dimension_unit
            }}
            inventorySettings={{
              track_inventory: product.track_inventory,
              stock_quantity: product.stock_quantity,
              low_stock_threshold: product.low_stock_threshold,
              allow_backorder: product.allow_backorder
            }}
            customFields={[]} // Would be loaded from product data
            onDiscountChange={(settings) => {
              // Handle discount settings change
              console.log('Discount settings:', settings);
            }}
            onShippingChange={(settings) => {
              // Handle shipping settings change
              console.log('Shipping settings:', settings);
            }}
            onInventoryChange={(settings) => {
              // Handle inventory settings change
              console.log('Inventory settings:', settings);
            }}
            onCustomFieldsChange={(fields) => {
              // Handle custom fields change
              console.log('Custom fields:', fields);
            }}
          />
        </Tabs.Panel>
      </Tabs>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete Product"
        centered
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            This action cannot be undone. The product will be permanently removed.
          </Alert>
          
          <Text size="sm">
            Are you sure you want to delete <strong>{product.name}</strong>?
          </Text>
          
          {product.sales_data.total_orders > 0 && (
            <Alert icon={<IconInfoCircle size={16} />} color="orange" variant="light">
              This product has {product.sales_data.total_orders} order(s). 
              Consider unlisting it instead of deleting.
            </Alert>
          )}
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete Product
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}