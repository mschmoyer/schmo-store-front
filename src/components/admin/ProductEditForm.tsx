'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Textarea
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
    name: product.name || '',
    sku: product.sku || '',
    slug: product.slug || '',
    short_description: product.short_description || '',
    long_description: product.long_description || '',
    description_html: product.description_html || product.long_description || '',
    
    // Pricing
    base_price: product.base_price || 0,
    override_price: product.override_price || null,
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
    
    // Shipping — the fields carriers quote rates against, which used to live in a tab that
    // discarded them.
    weight: product.weight ?? null,
    weight_unit: product.weight_unit || 'lb',
    length: product.length ?? null,
    width: product.width ?? null,
    height: product.height ?? null,
    dimension_unit: product.dimension_unit || 'in',

    // Inventory policy. Stock itself is not here: it moves through the ledger with a reason.
    track_inventory: product.track_inventory ?? true,
    low_stock_threshold: product.low_stock_threshold ?? null,
    reorder_point: (product as { reorder_point?: number | null }).reorder_point ?? null,
    lead_time_days: (product as { lead_time_days?: number | null }).lead_time_days ?? null,
    allow_backorder: product.allow_backorder ?? false,

    // Settings
    is_active: product.is_active || false,
    is_featured: product.is_featured || false,
    is_digital: product.is_digital || false
  });

  const [hasChanges, setHasChanges] = useState(false);

  /*
   * Warn before the tab is closed or reloaded with unsaved work.
   *
   * The form already tracked `hasChanges` and rendered "You have unsaved changes. Don't forget to
   * save your work!" — and then let the merchant navigate away without a word, losing the lot.
   * Telling someone they have unsaved changes and then discarding them silently is worse than not
   * mentioning it.
   *
   * `beforeunload` covers closing the tab, reloading, and following an external link. It does not
   * cover the client-side sidebar links; Next's App Router has no supported navigation guard, so
   * those are handled by the link interception below rather than left unhandled.
   */
  useEffect(() => {
    if (!hasChanges) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* Browsers ignore custom text now and show their own wording; assigning is what triggers the
       * prompt at all. */
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  /*
   * The in-app equivalent: intercept a click on any admin link while there is unsaved work.
   *
   * Capture phase, so it runs before the router's own handler and can stop the navigation.
   */
  useEffect(() => {
    if (!hasChanges) return;

    const intercept = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]');
      if (!anchor) return;

      const href = anchor.getAttribute('href') ?? '';
      /* Only in-app navigations. An external link or a download already goes through
       * `beforeunload`. */
      if (!href.startsWith('/') || href === window.location.pathname) return;

      if (!window.confirm('You have unsaved changes to this product. Leave without saving?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [hasChanges]);
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

    // Check for product name (either user-entered or from integration)
    const effectiveName = formData.name.trim() || product.name;
    if (!effectiveName) {
      newErrors.name = 'Product name is required';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required';
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'URL slug is required';
    }

    // Check for effective display price
    const effectivePrice = formData.override_price || formData.sale_price || formData.base_price;
    if (effectivePrice === null || effectivePrice === undefined || effectivePrice < 0) {
      newErrors.base_price = 'A valid price must be set (base price, override price, or sale price)';
    }

    // Validate override price if set
    if (formData.override_price !== null && formData.override_price < 0) {
      newErrors.override_price = 'Override price must be 0 or greater';
    }

    // Validate sale price against base price or override price
    const referencePrice = formData.override_price || formData.base_price;
    if (formData.sale_price && formData.sale_price >= referencePrice) {
      newErrors.sale_price = 'Sale price must be less than the reference price (override or base price)';
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
      /*
       * WHAT GETS SENT, AND WHY IT NO LONGER PINS AN OVERRIDE.
       *
       * This used to set `override_name: formData.name` and
       * `override_description: formData.long_description` on *every* save. So changing a price
       * also silently overrode the product's name — and since the route ignored `override_name`
       * entirely and wrote plain `name` instead, the edit was then reverted by the next
       * ShipStation sync. The merchant saw their change, then saw it disappear an hour later.
       *
       * Ownership is per-field now: the API locks whichever fields a save actually touches, and the
       * sync skips locked fields. So the form sends the fields as themselves and nothing is pinned
       * that the merchant did not deliberately edit.
       */
      const saveData = {
        ...formData,
        sale_price: formData.sale_price || null,
        cost_price: formData.cost_price || null,
        override_price: formData.override_price || null
      };

      await onSave(saveData as Parameters<typeof onSave>[0]);
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
                placeholder="Enter product name"
                value={formData.name || product.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                error={validationErrors.name}
                description={product.name && !formData.name ? `Using integration value: ${product.name}` : undefined}
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
              rows={3}
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
                label="Price"
                placeholder="0.00"
                value={formData.base_price}
                onChange={(value) => handleFieldChange('base_price', value)}
                error={validationErrors.base_price}
                description="Editing this claims it from ShipStation — the sync will not overwrite it"
                min={0}
                step={0.01}
                decimalScale={2}
                leftSection="$"
              />
              <NumberInput
                label="Override Price"
                placeholder="Leave empty to use base price"
                value={formData.override_price || undefined}
                onChange={(value) => handleFieldChange('override_price', value)}
                error={validationErrors.override_price}
                description="Set custom price that overrides integration price"
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
                description="Temporary promotional price"
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

            {/* Display Price Indicator */}
            <Alert icon={<IconInfoCircle size={16} />} color="ink" variant="light">
              <Text size="sm" fw={500}>Customer Display Price: ${Number(formData.override_price || formData.sale_price || formData.base_price || 0).toFixed(2)}</Text>
              <Text size="xs" c="dimmed">
                Priority: Override Price → Sale Price → Base Price
                {formData.override_price && " (Using Override Price)"}
                {!formData.override_price && formData.sale_price && " (Using Sale Price)"}
                {!formData.override_price && !formData.sale_price && " (Using Base Price)"}
              </Text>
            </Alert>

            {formData.sale_price && formData.sale_price < (formData.override_price || formData.base_price) && (
              <Alert icon={<IconInfoCircle size={16} />} color="green" variant="light">
                Sale discount: {Math.round((((formData.override_price || formData.base_price) - formData.sale_price) / (formData.override_price || formData.base_price)) * 100)}%
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
              rows={3}
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

        {/*
          * SHIPPING AND INVENTORY.
          *
          * These fields lived in an "Advanced Settings" tab whose four change handlers were all
          * `console.log`, and whose form had no save button at all — so a merchant could set
          * dimensions, a shipping class, a low-stock threshold and a backorder policy, navigate
          * away, and lose every one of them with no warning. Dimensions in particular are not
          * decoration: they are what ShipStation quotes rates against.
          *
          * They are here because this is the form that saves.
          */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Shipping</Text>

            <Group grow>
              <NumberInput
                label="Weight"
                value={formData.weight ?? undefined}
                onChange={(value) => handleFieldChange('weight', value)}
                min={0}
                step={0.01}
                decimalScale={2}
                rightSection={
                  <Text size="xs" c="dimmed" pr="xs">
                    {formData.weight_unit || 'lb'}
                  </Text>
                }
              />
              <NumberInput
                label="Length"
                value={formData.length ?? undefined}
                onChange={(value) => handleFieldChange('length', value)}
                min={0}
                step={0.1}
                decimalScale={2}
              />
              <NumberInput
                label="Width"
                value={formData.width ?? undefined}
                onChange={(value) => handleFieldChange('width', value)}
                min={0}
                step={0.1}
                decimalScale={2}
              />
              <NumberInput
                label="Height"
                value={formData.height ?? undefined}
                onChange={(value) => handleFieldChange('height', value)}
                min={0}
                step={0.1}
                decimalScale={2}
              />
            </Group>

            <Text size="xs" c="dimmed">
              Dimensions are in {formData.dimension_unit || 'in'} and are what carriers quote
              shipping rates against. A product with none is quoted on a guess.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="md" fw={600}>Inventory</Text>

            <Group justify="space-between">
              <Box>
                <Text size="sm" fw={500}>Track inventory</Text>
                <Text size="xs" c="dimmed">
                  Count stock for this product and stop it selling when there is none
                </Text>
              </Box>
              <Switch
                checked={formData.track_inventory}
                onChange={(e) => handleFieldChange('track_inventory', e.currentTarget.checked)}
              />
            </Group>

            {formData.track_inventory && (
              <>
                <Group grow>
                  <NumberInput
                    label="Low stock threshold"
                    description="Flag this product when available stock reaches it"
                    value={formData.low_stock_threshold ?? undefined}
                    onChange={(value) => handleFieldChange('low_stock_threshold', value)}
                    min={0}
                  />
                  <NumberInput
                    label="Reorder point"
                    description="Raise a purchase order at this level"
                    value={formData.reorder_point ?? undefined}
                    onChange={(value) => handleFieldChange('reorder_point', value)}
                    min={0}
                  />
                  <NumberInput
                    label="Lead time (days)"
                    description="How long the supplier takes"
                    value={formData.lead_time_days ?? undefined}
                    onChange={(value) => handleFieldChange('lead_time_days', value)}
                    min={0}
                  />
                </Group>

                <Group justify="space-between">
                  <Box>
                    <Text size="sm" fw={500}>Allow backorders</Text>
                    <Text size="xs" c="dimmed">
                      Let customers buy this when it is out of stock
                    </Text>
                  </Box>
                  <Switch
                    checked={formData.allow_backorder}
                    onChange={(e) => handleFieldChange('allow_backorder', e.currentTarget.checked)}
                  />
                </Group>

                {/* Stock itself is not editable here. It moves through the inventory page, where a
                    reason is recorded — a quantity typed into a product form cannot say what
                    happened to the units. */}
                <Alert icon={<IconInfoCircle size={16} />} variant="light">
                  <Text size="sm">
                    Stock levels are changed on the{' '}
                    <Anchor component={Link} href="/admin/inventory" size="sm">
                      inventory page
                    </Anchor>
                    , where each movement records why it happened.
                  </Text>
                </Alert>
              </>
            )}
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
                      <IconEye size={12} color="var(--success-text)" />
                    ) : (
                      <IconEyeOff size={12} color="var(--text-secondary)" />
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
                  color="ink"
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