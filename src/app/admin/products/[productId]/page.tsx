'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { attentionLabel } from '@/lib/catalog/attention';
import ProductEditForm from '@/components/admin/ProductEditForm';
import ProductAnalytics from '@/components/admin/ProductAnalytics';
import { Product } from '@/types/database';

interface EnhancedProduct extends Product {
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  needs_attention: string[];
  /** The price a shopper pays — sale price where one is set. */
  effective_price: number;
  margin_percent: number | null;
  /** Stock split by the ledger, rather than one number three writers disagreed about. */
  on_hand: number;
  committed: number;
  available: number;
  /** Fields the merchant has claimed, which the ShipStation sync will not overwrite. */
  field_locks: string[];
  sales_data: {
    total_sales: number;
    total_revenue: number;
    total_orders: number;
    gross_profit: number;
    avg_sale_price: number;
    units_30d: number;
    units_90d: number;
    first_sale_date: string | null;
    last_sale_date: string | null;
  };
  /*
   * `analytics` and `inventory_history` are gone. The first was a stub the route returned as
   * `{ rows: [] }` — the wrong shape entirely — which rendered `NaN%` in four places and a red
   * "Needs improvement" verdict computed from `undefined`. The second is replaced by `movements`,
   * which comes from the ledger and records who moved the stock and why.
   */
  movements: Array<{
    id: string;
    reason: string;
    delta: number;
    balance_after: number;
    note: string | null;
    created_at: string;
    location_name: string;
    actor_name: string | null;
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
  const { session } = useAdmin();
  
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
  const fetchProduct = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      if (!session) {
        throw new Error('You are not signed in.');
      }

      const response = await fetch(`/api/admin/products/${id}`, { credentials: 'include' });
      
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
  }, [session]);

  /**
   * Fetch categories for form dropdown
   */
  const fetchCategories = useCallback(async () => {
    try {
      if (!session) {
        console.error('Not signed in; skipping the categories fetch');
        return;
      }

      const response = await fetch('/api/admin/categories', { credentials: 'include' });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCategories(result.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, [session]);

  /**
   * Save product changes
   */
  const handleSave = async (updatedProduct: Partial<Product>) => {
    if (!productId) return;
    
    setSaving(true);
    setFormErrors({});
    
    try {
      if (!session) {
        throw new Error('You are not signed in.');
      }

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
      if (!session) {
        throw new Error('You are not signed in.');
      }

      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE',
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
  const handlePreview = async () => {
    if (product) {
      try {
        // First, get the store slug from the store API
        const storeResponse = await fetch(`/api/stores/public?id=${product.store_id}`);
        if (storeResponse.ok) {
          const storeData = await storeResponse.json();
          if (storeData.success && storeData.data) {
            const storeSlug = storeData.data.store_slug;
            window.open(`/store/${storeSlug}/product/${product.id}`, '_blank');
          } else {
            console.warn('Store data not found, fallback to store ID');
            window.open(`/store/${product.store_id}/product/${product.id}`, '_blank');
          }
        } else {
          console.warn('Store API failed, fallback to store ID');
          window.open(`/store/${product.store_id}/product/${product.id}`, '_blank');
        }
      } catch (error) {
        console.error('Error fetching store slug:', error);
        // Fallback: try to open with store ID
        window.open(`/store/${product.store_id}/product/${product.id}`, '_blank');
      }
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
  }, [params, fetchProduct, fetchCategories]);

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
            {/* Icon-only, so it needs a name. Without one it announced as
                "button" and was unreachable by role. */}
            <ActionIcon
              variant="light"
              size="lg"
              aria-label="Back to products"
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
            /* Enabled for a draft too. Preview is *most* useful before publishing — it is how a
             * merchant checks a product looks right — and disabling it exactly then, with no
             * tooltip and no aria-label to say why, made it look broken. The storefront route
             * already 404s a draft, so the honest thing is to say that in the label. */
            title={
              product.is_active
                ? 'Open this product on your storefront'
                : 'Drafts are not on the storefront yet — publish to see this live'
            }
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
                • {attentionLabel(issue)}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)}>
        <Tabs.List>
          <Tabs.Tab value="details" leftSection={<IconEdit size={16} />}>
            Product Details
          </Tabs.Tab>
          <Tabs.Tab value="analytics" leftSection={<IconChartBar size={16} />}>
            Analytics
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
            salesData={product.sales_data}
            movements={product.movements ?? []}
            effectivePrice={Number(product.effective_price) || 0}
            costPrice={product.cost_price === null ? null : Number(product.cost_price)}
            available={Number(product.available) || 0}
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