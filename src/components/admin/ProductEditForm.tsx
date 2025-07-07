'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Stack,
  Group,
  Text,
  TextInput,
  NumberInput,
  Textarea,
  Switch,
  Select,
  Button,
  Card,
  TagsInput,
  Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconDeviceFloppy,
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconTag,
  IconSeo,
  IconInfoCircle
} from '@tabler/icons-react';
import RichTextEditor from './RichTextEditor';
import ImageGalleryManager from './ImageGalleryManager';
import { Product } from '@/types/database';

interface ImageItem {
  id: string;
  url: string;
  alt?: string;
  title?: string;
  isFeatured?: boolean;
}

interface ProductEditFormProps {
  product: Product;
  categories: Array<{ id: string; name: string }>;
  onSave: (updatedProduct: Partial<Product>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  errors?: Record<string, string>;
}

/**
 * Product Edit Form Component
 * 
 * Main form component for editing product information including:
 * - Basic product details (name, description, price)
 * - Images and gallery management
 * - SEO settings
 * - Categories and tags
 * - Visibility settings
 * 
 * @param props - ProductEditFormProps
 * @returns JSX.Element
 */
export default function ProductEditForm({
  product,
  categories,
  onSave,
  onCancel,
  loading = false,
  errors = {}
}: ProductEditFormProps) {
  // Form state - User-entered values automatically override integration data
  const [formData, setFormData] = useState({
    // Basic Information - These will become override values when user enters data
    name: product.override_name || '',
    sku: product.sku || '',
    slug: product.slug || '',
    short_description: product.short_description || '',
    long_description: product.override_description || '',
    description_html: product.description_html || '',
    
    // Pricing
    base_price: product.override_price || 0,
    sale_price: product.sale_price || null,
    cost_price: product.cost_price || null,
    
    // Images
    featured_image_url: product.featured_image_url || '',
    gallery_images: product.gallery_images || [],
    
    // SEO
    meta_title: product.meta_title || '',
    meta_description: product.meta_description || '',
    
    // Categories and Tags
    category_id: product.category_id || '',
    tags: product.tags || [],
    
    // Settings
    is_active: product.is_active || false,
    is_featured: product.is_featured || false,
    is_digital: product.is_digital || false
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleFieldChange = useCallback((field: string, value: string | number | boolean | null | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [validationErrors]);

  const handleImageChange = useCallback((images: ImageItem[], featuredImageUrl?: string) => {
    setFormData(prev => ({
      ...prev,
      gallery_images: images.map(img => img.url),
      featured_image_url: featuredImageUrl || images[0]?.url || ''
    }));
    setHasChanges(true);
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required';
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'URL slug is required';
    }

    if (formData.base_price <= 0) {
      newErrors.base_price = 'Base price must be greater than 0';
    }

    if (formData.sale_price && formData.sale_price >= formData.base_price) {
      newErrors.sale_price = 'Sale price must be less than base price';
    }

    if (formData.meta_title && formData.meta_title.length > 60) {
      newErrors.meta_title = 'Meta title should be 60 characters or less';
    }

    if (formData.meta_description && formData.meta_description.length > 160) {
      newErrors.meta_description = 'Meta description should be 160 characters or less';
    }

    setValidationErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please fix the form errors before saving',
        color: 'red'
      });
      return;
    }

    try {
      // Transform form data to save user-entered values as overrides
      const saveData = {
        ...formData,
        // Convert null values to undefined for TypeScript compatibility
        sale_price: formData.sale_price || undefined,
        cost_price: formData.cost_price || undefined,
        // Save user entries as overrides (convert null to undefined for TypeScript)
        override_name: formData.name || undefined,
        override_description: formData.long_description || undefined,
        override_price: formData.base_price || undefined,
        // Keep the original values from integration data intact
        name: product.name,
        long_description: product.long_description,
        base_price: product.base_price
      };
      
      await onSave(saveData);
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  const generateSlug = () => {
    const slug = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    handleFieldChange('slug', slug);
  };

  const imageItems: ImageItem[] = formData.gallery_images.map((url, index) => ({
    id: `image-${index}`,
    url,
    alt: `${formData.name} image ${index + 1}`,
    title: `Product image ${index + 1}`,
    isFeatured: url === formData.featured_image_url
  }));

  return (
    <Box>
      <Stack gap="md">
        {/* Form Errors */}
        {Object.keys(errors).length > 0 && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            <Stack gap="xs">
              {Object.entries(errors).map(([field, error]) => (
                <Text key={field} size="sm">• {error}</Text>
              ))}
            </Stack>
          </Alert>
        )}

        {/* Basic Information */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Basic Information</Text>
            
            <Group grow>
              <TextInput
                label="Product Name"
                placeholder={product.name || "Enter product name"}
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                error={validationErrors.name}
                description={product.name ? `Integration: ${product.name}` : undefined}
              />
              <TextInput
                label="SKU"
                placeholder="Enter SKU"
                value={formData.sku}
                onChange={(e) => handleFieldChange('sku', e.target.value)}
                error={validationErrors.sku}
                required
              />
            </Group>

            <Group>
              <TextInput
                label="URL Slug"
                placeholder="product-url-slug"
                value={formData.slug}
                onChange={(e) => handleFieldChange('slug', e.target.value)}
                error={validationErrors.slug}
                required
                style={{ flex: 1 }}
              />
              <Button
                variant="light"
                onClick={generateSlug}
                disabled={!formData.name}
                mt={24}
              >
                Generate
              </Button>
            </Group>

            <Textarea
              label="Short Description"
              placeholder="Brief description for product listings"
              value={formData.short_description}
              onChange={(e) => handleFieldChange('short_description', e.target.value)}
              autosize
              minRows={2}
              maxRows={4}
            />

            <RichTextEditor
              label="Long Description"
              description={product.long_description ? 
                `Custom product description. Integration: ${product.long_description?.substring(0, 100)}${product.long_description?.length > 100 ? '...' : ''}` : 
                "Detailed product description with rich formatting"
              }
              initialContent={formData.description_html}
              onChange={(content) => {
                handleFieldChange('description_html', content);
                handleFieldChange('long_description', content.replace(/<[^>]*>/g, ''));
              }}
              height={300}
              showStats
            />
          </Stack>
        </Card>

        {/* Pricing */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Pricing</Text>
            
            <Group grow>
              <NumberInput
                label="Base Price"
                placeholder={product.base_price ? `${product.base_price}` : "0.00"}
                value={formData.base_price}
                onChange={(value) => handleFieldChange('base_price', value)}
                error={validationErrors.base_price}
                description={product.base_price ? `Integration: $${product.base_price}` : undefined}
                min={0}
                step={0.01}
                decimalScale={2}
                leftSection="$"
              />
              <NumberInput
                label="Sale Price"
                placeholder="0.00 (optional)"
                value={formData.sale_price || undefined}
                onChange={(value) => handleFieldChange('sale_price', value)}
                error={validationErrors.sale_price}
                min={0}
                step={0.01}
                decimalScale={2}
                leftSection="$"
              />
              <NumberInput
                label="Cost Price"
                placeholder="0.00 (optional)"
                value={formData.cost_price || undefined}
                onChange={(value) => handleFieldChange('cost_price', value)}
                min={0}
                step={0.01}
                decimalScale={2}
                leftSection="$"
              />
            </Group>

            {formData.sale_price && formData.sale_price < formData.base_price && (
              <Alert icon={<IconInfoCircle size={16} />} color="green" variant="light">
                Sale discount: {Math.round(((formData.base_price - formData.sale_price) / formData.base_price) * 100)}%
              </Alert>
            )}
          </Stack>
        </Card>

        {/* Images */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Product Images</Text>
            
            <ImageGalleryManager
              images={imageItems}
              featuredImageUrl={formData.featured_image_url}
              onChange={handleImageChange}
              maxImages={10}
              label=""
              description="Upload product images. The first image will be the main product image."
            />
          </Stack>
        </Card>

        {/* SEO Settings */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group gap="xs">
              <IconSeo size={20} />
              <Text size="md" fw={600}>SEO Settings</Text>
            </Group>
            
            <TextInput
              label="Meta Title"
              placeholder="SEO title for search engines"
              value={formData.meta_title}
              onChange={(e) => handleFieldChange('meta_title', e.target.value)}
              error={validationErrors.meta_title}
              description={`${formData.meta_title.length}/60 characters`}
            />
            
            <Textarea
              label="Meta Description"
              placeholder="SEO description for search engines"
              value={formData.meta_description}
              onChange={(e) => handleFieldChange('meta_description', e.target.value)}
              error={validationErrors.meta_description}
              description={`${formData.meta_description.length}/160 characters`}
              autosize
              minRows={2}
              maxRows={4}
            />
          </Stack>
        </Card>

        {/* Categories and Tags */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group gap="xs">
              <IconTag size={20} />
              <Text size="md" fw={600}>Categories & Tags</Text>
            </Group>
            
            <Select
              label="Category"
              placeholder="Select a category"
              data={categories.map(cat => ({ value: cat.id, label: cat.name }))}
              value={formData.category_id}
              onChange={(value) => handleFieldChange('category_id', value)}
              clearable
            />
            
            <TagsInput
              label="Tags"
              placeholder="Add tags (press Enter to add)"
              value={formData.tags}
              onChange={(value) => handleFieldChange('tags', value)}
              description="Tags help customers find your product"
            />
          </Stack>
        </Card>

        {/* Product Settings */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Product Settings</Text>
            
            <Stack gap="sm">
              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={500}>Product Visibility</Text>
                  <Text size="xs" c="dimmed">
                    Make product visible in store
                  </Text>
                </Box>
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => handleFieldChange('is_active', e.currentTarget.checked)}
                  color="green"
                  thumbIcon={
                    formData.is_active ? (
                      <IconEye size={12} color="var(--mantine-color-green-6)" />
                    ) : (
                      <IconEyeOff size={12} color="var(--mantine-color-gray-6)" />
                    )
                  }
                />
              </Group>

              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={500}>Featured Product</Text>
                  <Text size="xs" c="dimmed">
                    Show in featured products section
                  </Text>
                </Box>
                <Switch
                  checked={formData.is_featured}
                  onChange={(e) => handleFieldChange('is_featured', e.currentTarget.checked)}
                  color="yellow"
                />
              </Group>

              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={500}>Digital Product</Text>
                  <Text size="xs" c="dimmed">
                    No physical shipping required
                  </Text>
                </Box>
                <Switch
                  checked={formData.is_digital}
                  onChange={(e) => handleFieldChange('is_digital', e.currentTarget.checked)}
                  color="blue"
                />
              </Group>
            </Stack>
          </Stack>
        </Card>


        {/* Action Buttons */}
        <Group justify="flex-end" mt="xl">
          <Button variant="light" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={loading}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </Group>

        {hasChanges && (
          <Alert icon={<IconInfoCircle size={16} />} color="orange" variant="light">
            You have unsaved changes. Don&apos;t forget to save your work!
          </Alert>
        )}
      </Stack>
    </Box>
  );
}