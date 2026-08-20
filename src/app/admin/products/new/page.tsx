'use client';

/**
 * Create a product.
 *
 * The **Add Product** button pointed at `/admin/products/add`, a route that has
 * never existed. It fell through to the `[productId]` dynamic segment, which
 * fetched `/api/admin/products/add`, got a 404, and rendered "Product not
 * found". So the only way a product could enter this platform was a ShipStation
 * sync or the demo seed — which made RebelShops a ShipStation front-end rather
 * than a store builder, and blocked every merchant who does not ship through
 * ShipStation: a digital seller, a bakery, anyone with a spreadsheet.
 *
 * This page is deliberately short. It asks for the six things a product cannot
 * exist without and then hands the merchant to the full editor, where images,
 * SEO, options and variants live. A single form carrying every field is a wall
 * on the one screen where a new merchant most needs momentum, and the fields it
 * omits are all ones that are easier to fill in against a saved product.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Container,
  Grid,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowLeft, IconDeviceFloppy } from '@tabler/icons-react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useAdmin } from '@/contexts/AdminContext';

/**
 * Turn a product name into a URL slug.
 *
 * Proposed, not imposed: it fills the slug field as the merchant types the
 * name, and stops the moment they edit the slug themselves. A slug that keeps
 * overwriting itself after you have corrected it is the single most irritating
 * behaviour a form like this can have.
 *
 * @param value - The product name
 * @returns A slug candidate
 */
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '');
}

interface CategoryOption {
  id: string;
  name: string;
}

/**
 * The new-product page.
 * @returns The creation form
 */
export default function NewProductPage() {
  const router = useRouter();
  const { session } = useAdmin();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [stock, setStock] = useState<number | string>(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/admin/categories/simple', {
          headers: session?.sessionToken
            ? { Authorization: `Bearer ${session.sessionToken}` }
            : undefined,
        });
        const payload = await response.json();
        if (cancelled || !payload?.success) return;
        const rows: CategoryOption[] = payload.data?.categories ?? payload.categories ?? [];
        setCategories(rows);
      } catch {
        // A store with no categories yet is normal, and the field is optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.sessionToken]);

  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : slugify(name)),
    [slug, slugTouched, name],
  );

  const save = useCallback(async () => {
    setError(null);
    setFieldError({});

    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = 'A product needs a name';
    if (!sku.trim()) problems.sku = 'A product needs a SKU';
    if (!effectiveSlug) problems.slug = 'A product needs a URL slug';
    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      problems.price = 'Enter a price of 0 or more';
    }
    if (Object.keys(problems).length > 0) {
      setFieldError(problems);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.sessionToken
            ? { Authorization: `Bearer ${session.sessionToken}` }
            : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: effectiveSlug,
          sku: sku.trim(),
          base_price: priceValue,
          inventory_quantity: Number(stock) || 0,
          short_description: description.trim() || null,
          category_id: categoryId,
          is_active: isActive,
        }),
      });
      const payload = await response.json();

      if (!payload?.success) {
        setError(payload?.error ?? 'The product could not be created.');
        return;
      }

      notifications.show({
        title: 'Product created',
        message: isActive
          ? `${name.trim()} is live on your storefront.`
          : `${name.trim()} was saved as a draft.`,
        color: 'green',
      });

      // Straight into the full editor, which is where images, SEO and variants
      // are. Creating a product is a step, not a destination.
      const created = payload.data?.product;
      router.push(created?.id ? `/admin/products/${created.id}` : '/admin/products');
    } catch {
      setError('The request failed. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [name, sku, effectiveSlug, price, stock, description, categoryId, isActive, router, session]);

  return (
    <Container size="md" py="lg">
      <AdminPageHeader
        title="New product"
        description="The essentials now — images, SEO, options and variants come next."
      />

      {error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md" title="Not created">
          {error}
        </Alert>
      ) : null}

      <Card withBorder padding="lg">
        <Stack gap="md">
          <TextInput
            label="Product name"
            placeholder="Alpine Wool Overshirt"
            required
            value={name}
            error={fieldError.name}
            onChange={(event) => setName(event.currentTarget.value)}
          />

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="SKU"
                description="What your warehouse picks by. Must be unique in your store."
                placeholder="AWO-001"
                required
                value={sku}
                error={fieldError.sku}
                onChange={(event) => setSku(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="URL slug"
                description="Where the product lives on your storefront."
                required
                value={effectiveSlug}
                error={fieldError.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.currentTarget.value);
                }}
              />
            </Grid.Col>
          </Grid>

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Price"
                description="Before any sale price or discount."
                prefix="$"
                decimalScale={2}
                min={0}
                required
                value={price}
                error={fieldError.price}
                onChange={setPrice}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Stock on hand"
                min={0}
                value={stock}
                onChange={setStock}
              />
            </Grid.Col>
          </Grid>

          {categories.length > 0 ? (
            <Select
              label="Category"
              placeholder="Uncategorised"
              clearable
              data={categories.map((category) => ({ value: category.id, label: category.name }))}
              value={categoryId}
              onChange={setCategoryId}
            />
          ) : null}

          <Textarea
            label="Short description"
            description="One or two sentences. Shown under the price on the product page."
            // Not `autosize`: the admin theme sets a minHeight on the textarea
            // input (rebel-theme.ts), and react-textarea-autosize throws on a
            // style minHeight rather than ignoring it -- which blanked this
            // whole page with "This page couldn't load".
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />

          <Switch
            label="Show on my storefront"
            description="Turn this off to save it as a draft nobody can see yet."
            checked={isActive}
            onChange={(event) => setIsActive(event.currentTarget.checked)}
          />

          <Text size="xs" c="dimmed">
            Selling this in more than one size or colour? Save it first, then open
            Options &amp; Variants.
          </Text>

          <Group justify="space-between" mt="sm">
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/admin/products')}
            >
              Back to products
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              loading={saving}
              onClick={save}
            >
              Create product
            </Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}
