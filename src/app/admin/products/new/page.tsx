'use client';

/**
 * Adding a product by hand.
 *
 * The catalogue has had an "Add product" button since it was written, and the empty state's only
 * call to action was the same button. Both navigated to `/admin/products/add`, which no route
 * served — the detail route caught it, refused a non-uuid, and rendered "Product not found". A
 * brand-new store's very first click failed.
 *
 * `POST /api/admin/products` existed the whole time (though it had never worked; it inserted a
 * column the schema does not have). Nothing in the UI called it. This is that page.
 *
 * The form is deliberately short. A merchant creating a product wants it to exist; everything else
 * is editing, and editing has a better screen. Asking for thirty fields before the first save is
 * how a create form becomes something people avoid — so this asks for a name, and lets the rest be
 * optional.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Anchor,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/**
 * The create-product page.
 *
 * @returns A short form that creates a draft product and opens it for editing.
 */
export default function NewProductPage(): React.ReactElement {
  const router = useRouter();
  const { session } = useAdmin();
  const token = session?.sessionToken;

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [cost, setCost] = useState<number | string>('');
  const [stock, setStock] = useState<number | string>(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);

  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((payload) => setCategories(payload.options ?? []))
      .catch(() => setCategories([]));
  }, [token]);

  const save = useCallback(
    async (openAfter: boolean) => {
      if (!name.trim()) {
        setError('Give the product a name');
        return;
      }
      /* The same rule the API enforces, stated here so the merchant finds out before the round
       * trip rather than after it. */
      if (publish && !Number(price)) {
        setError('Set a price before publishing, or save it as a draft');
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const response = await fetch('/api/admin/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: name.trim(),
            sku: sku.trim() || undefined,
            base_price: price === '' ? 0 : Number(price),
            cost_price: cost === '' ? null : Number(cost),
            stock_quantity: Number(stock) || 0,
            long_description: description.trim() || undefined,
            category_id: categoryId || undefined,
            status: publish ? 'active' : 'draft'
          })
        });

        const payload = await response.json();
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error ?? `Could not create the product (${response.status})`);
        }

        const product = payload.data.product;
        notifications.show({
          title: publish ? 'Product published' : 'Draft saved',
          message: `${product.name} · ${product.sku}`,
          color: 'green'
        });

        if (openAfter) {
          router.push(`/admin/products/${product.id}`);
        } else {
          /* "Save and add another" keeps the merchant in the flow when they are entering a batch
           * by hand, which is the only reason anyone uses this page more than once in a sitting. */
          setName('');
          setSku('');
          setPrice('');
          setCost('');
          setStock(0);
          setDescription('');
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not create the product');
      } finally {
        setSaving(false);
      }
    },
    [categoryId, cost, description, name, price, publish, router, sku, stock, token]
  );

  return (
    <Stack gap="lg" maw={760}>
      <AdminPageHeader
        title="Add product"
        description="Create a product that does not come from ShipStation."
        actions={
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href="/admin/products"
          >
            Back to products
          </Button>
        }
      />

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Could not save">
          {error}
        </Alert>
      )}

      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <TextInput
            label="Product name"
            placeholder="Aviator Headphones"
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
          />

          <TextInput
            label="SKU"
            description="Left blank, one is generated from the name. It has to be unique in your store."
            placeholder="Generated automatically"
            value={sku}
            onChange={(event) => setSku(event.currentTarget.value)}
          />

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <NumberInput
              label="Price"
              description="What a shopper pays"
              prefix="$"
              decimalScale={2}
              min={0}
              value={price}
              onChange={setPrice}
            />
            <NumberInput
              label="Cost"
              description="What you pay for it"
              prefix="$"
              decimalScale={2}
              min={0}
              value={cost}
              onChange={setCost}
            />
            <NumberInput
              label="Opening stock"
              description="Recorded as an opening balance"
              min={0}
              value={stock}
              onChange={setStock}
            />
          </SimpleGrid>

          {/* Margin shown as it is typed, because pricing decisions are made against cost and
              making someone open a calculator mid-form is how products get mispriced. */}
          {Number(price) > 0 && Number(cost) > 0 && (
            <Text size="sm" c={Number(price) <= Number(cost) ? 'red' : 'dimmed'}>
              {Number(price) <= Number(cost)
                ? `This sells at or below cost — you would lose ${formatMoney(Number(cost) - Number(price))} per unit.`
                : `Margin: ${(((Number(price) - Number(cost)) / Number(price)) * 100).toFixed(1)}% · ${formatMoney(Number(price) - Number(cost))} per unit.`}
            </Text>
          )}

          <Select
            label="Category"
            placeholder="Uncategorised"
            data={categories}
            value={categoryId}
            onChange={setCategoryId}
            searchable
            clearable
            nothingFoundMessage="No categories yet"
          />

          <Textarea
            label="Description"
            placeholder="What it is, who it is for, and why it is worth the price."
            /* Fixed rows rather than `autosize`: the autosizing textarea rejects the minimum height
             * Mantine hands it and throws during render, taking the whole page with it. */
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />

          <Switch
            label="Publish to the storefront now"
            description={
              publish
                ? 'It will be visible to shoppers as soon as it is saved.'
                : 'Saved as a draft. You can add images and details, then publish.'
            }
            checked={publish}
            onChange={(event) => setPublish(event.currentTarget.checked)}
          />

          <Text size="xs" c="dimmed">
            Images, dimensions, SEO and stock settings are on the product page after it is created.{' '}
            <Anchor component={Link} href="/admin/products" size="xs">
              Or import a spreadsheet
            </Anchor>{' '}
            if you are adding many at once.
          </Text>

          <Group justify="flex-end">
            <Button variant="default" component={Link} href="/admin/products">
              Cancel
            </Button>
            <Button variant="default" loading={saving} onClick={() => void save(false)}>
              Save and add another
            </Button>
            <Button loading={saving} onClick={() => void save(true)}>
              Save and edit
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

/**
 * Format an amount for the inline margin note.
 *
 * @param amount - A value in major units.
 * @returns The amount as currency.
 */
function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
