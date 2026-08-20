'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  Group,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconPlus,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';

import { MAX_OPTION_AXES, type ProductOption, type ProductVariant } from '@/lib/catalog/variants';

/** An axis while it is being edited. Values are a list, not a comma string. */
interface DraftOption {
  name: string;
  values: string[];
  /** Hex per value, when the merchant wants swatches. */
  swatches: Record<string, string>;
}

/** A variant row while it is being edited. */
interface DraftVariant {
  id?: string;
  sku: string;
  options: (string | null)[];
  /** Dollars as typed, or '' meaning "inherit the product". */
  price: string;
  stock: number;
  isActive: boolean;
  /** Image URL or store path shown when this variant is selected; '' for none. */
  image: string;
  /**
   * Fields this editor does not surface controls for but must not destroy.
   *
   * The PUT is a full replace, so anything omitted from the payload is wiped.
   * These three can be set through the API, and before they were carried here a
   * save from this screen silently reset every variant's sale price and
   * inventory flags to "inherit". They are loaded, held, and written back
   * unchanged.
   */
  salePriceCents: number | null;
  trackInventory: boolean | null;
  allowBackorder: boolean | null;
}

export interface VariantEditorProps {
  productId: string;
  /** Used to show what an inheriting variant will actually charge. */
  productPrice: number;
  /** Seeds SKUs for generated variants. */
  productSku: string;
}

/**
 * Turn dollars-as-typed into integer cents, or null for "inherit".
 *
 * An empty field is the inheritance signal and must not become 0 — a variant
 * priced at zero is free, which is a different and much worse thing to publish
 * by accident.
 *
 * @param value - The raw field value
 * @returns Cents, or null to inherit
 */
function toCentsOrInherit(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * Every combination of the declared axes, in a stable order.
 *
 * @param options - The axes
 * @returns One array of chosen values per combination
 */
function cartesian(options: DraftOption[]): string[][] {
  return options.reduce<string[][]>(
    (rows, option) => rows.flatMap((row) => option.values.map((value) => [...row, value])),
    [[]],
  );
}

/**
 * The variant editor on the product page.
 *
 * Two steps, in the order a merchant thinks in: declare the axes, then fill in
 * the grid. **Generate** builds every combination of the axes and keeps the
 * rows that already exist, so adding a colour to a shirt that already has three
 * sizes adds three rows and disturbs none of the existing ones — losing a
 * merchant's stock counts because they added a colour would be unforgivable.
 *
 * A blank price means "inherit the product", which is shown inline rather than
 * left to be inferred: the placeholder is the product's own price, so a
 * merchant can see what an empty field will charge.
 *
 * @param props - {@link VariantEditorProps}
 * @returns The variant editor
 */
export function VariantEditor({ productId, productPrice, productSku }: VariantEditorProps) {
  const [options, setOptions] = useState<DraftOption[]>([]);
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/products/${productId}/variants`);
        const payload = await response.json();
        if (cancelled || !payload?.success) return;

        const loadedOptions: ProductOption[] = payload.data.options ?? [];
        const loadedVariants: ProductVariant[] = payload.data.variants ?? [];

        setOptions(
          loadedOptions.map((option) => ({
            name: option.name,
            values: option.values,
            swatches: Object.fromEntries(
              Object.entries(option.valueMeta ?? {})
                .filter(([, meta]) => Boolean(meta?.swatch))
                .map(([value, meta]) => [value, meta.swatch as string]),
            ),
          })),
        );
        setVariants(
          loadedVariants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            options: variant.options,
            price: variant.priceCents === null ? '' : (variant.priceCents / 100).toFixed(2),
            stock: variant.stockQuantity,
            isActive: variant.isActive,
            image: variant.imageUrl ?? '',
            salePriceCents: variant.salePriceCents,
            trackInventory: variant.trackInventory,
            allowBackorder: variant.allowBackorder,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const addOption = useCallback(() => {
    setOptions((current) =>
      current.length >= MAX_OPTION_AXES
        ? current
        : [...current, { name: '', values: [], swatches: {} }],
    );
  }, []);

  const updateOption = useCallback((index: number, patch: Partial<DraftOption>) => {
    setOptions((current) =>
      current.map((option, position) => (position === index ? { ...option, ...patch } : option)),
    );
  }, []);

  const removeOption = useCallback((index: number) => {
    setOptions((current) => current.filter((_, position) => position !== index));
    // Drop that axis from every row too, or the rows keep a value for an axis
    // that no longer exists and the payload fails validation with an error the
    // merchant cannot see the cause of.
    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        options: variant.options.filter((_, position) => position !== index),
      })),
    );
  }, []);

  /**
   * Build the missing combinations, keeping every row that already exists.
   */
  const generate = useCallback(() => {
    const usable = options.filter((option) => option.name.trim() && option.values.length > 0);
    if (usable.length === 0) return;

    const key = (values: (string | null)[]): string =>
      JSON.stringify(values.slice(0, usable.length).map((value) => value ?? ''));

    setVariants((current) => {
      const existing = new Map(current.map((variant) => [key(variant.options), variant]));

      return cartesian(usable).map((combination) => {
        const found = existing.get(key(combination));
        if (found) return { ...found, options: combination };
        return {
          sku: `${productSku || 'SKU'}-${combination
            .map((value) => value.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 4).toUpperCase())
            .join('-')}`,
          options: combination,
          price: '',
          stock: 0,
          isActive: true,
          image: '',
          salePriceCents: null,
          trackInventory: null,
          allowBackorder: null,
        };
      });
    });
  }, [options, productSku]);

  const updateVariant = useCallback((index: number, patch: Partial<DraftVariant>) => {
    setVariants((current) =>
      current.map((variant, position) => (position === index ? { ...variant, ...patch } : variant)),
    );
  }, []);

  const removeVariant = useCallback((index: number) => {
    setVariants((current) => current.filter((_, position) => position !== index));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setFieldErrors({});

    const usable = options.filter((option) => option.name.trim() && option.values.length > 0);

    const payload = {
      options: usable.map((option, index) => ({
        name: option.name.trim(),
        position: index + 1,
        values: option.values,
        valueMeta: Object.fromEntries(
          Object.entries(option.swatches)
            .filter(([value, swatch]) => option.values.includes(value) && Boolean(swatch))
            .map(([value, swatch]) => [value, { swatch }]),
        ),
      })),
      variants: variants.map((variant, index) => ({
        ...(variant.id ? { id: variant.id } : {}),
        sku: variant.sku.trim(),
        options: variant.options.slice(0, usable.length),
        priceCents: toCentsOrInherit(variant.price),
        salePriceCents: variant.salePriceCents,
        stockQuantity: Math.max(0, Math.floor(variant.stock) || 0),
        trackInventory: variant.trackInventory,
        allowBackorder: variant.allowBackorder,
        imageUrl: variant.image.trim() === '' ? null : variant.image.trim(),
        position: index + 1,
        isActive: variant.isActive,
      })),
    };

    try {
      const response = await fetch(`/api/admin/products/${productId}/variants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!result?.success) {
        setFieldErrors(result?.fieldErrors ?? {});
        notifications.show({
          title: 'Not saved',
          message: result?.error ?? 'Something went wrong.',
          color: 'red',
        });
        return;
      }

      // Adopt the ids the server assigned, so an immediate second save updates
      // these rows instead of deleting and recreating them.
      const saved: ProductVariant[] = result.data.variants ?? [];
      setVariants((current) =>
        current.map((variant, index) => ({ ...variant, id: saved[index]?.id ?? variant.id })),
      );

      notifications.show({
        title: 'Saved',
        message:
          payload.variants.length === 0
            ? 'This product is sold as a single SKU.'
            : `${payload.variants.length} variant${payload.variants.length === 1 ? '' : 's'} saved.`,
        color: 'green',
      });
    } catch {
      notifications.show({ title: 'Not saved', message: 'The request failed.', color: 'red' });
    } finally {
      setSaving(false);
    }
  }, [options, variants, productId]);

  const rootError = useMemo(
    () => Object.entries(fieldErrors).flatMap(([, messages]) => messages),
    [fieldErrors],
  );

  if (loading) return <Text c="dimmed">Loading variants…</Text>;

  const usableOptions = options.filter((o) => o.name.trim() && o.values.length > 0);

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Options</Title>
        <Text size="sm" c="dimmed">
          Up to {MAX_OPTION_AXES} — size, colour, material. Leave this empty to sell the product as
          a single SKU.
        </Text>
      </div>

      {options.map((option, index) => (
        <Card key={index} withBorder padding="md">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Option name"
              placeholder="Size"
              value={option.name}
              onChange={(event) => updateOption(index, { name: event.currentTarget.value })}
              style={{ flex: '0 0 200px' }}
            />
            <TextInput
              label="Values"
              description="Comma separated, in the order they should appear"
              placeholder="S, M, L"
              value={option.values.join(', ')}
              onChange={(event) =>
                updateOption(index, {
                  values: event.currentTarget.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              style={{ flex: 1 }}
            />
            <ActionIcon
              color="red"
              variant="subtle"
              size="lg"
              onClick={() => removeOption(index)}
              aria-label={`Remove the ${option.name || 'unnamed'} option`}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>

          {option.values.length > 0 ? (
            <Group mt="sm" gap="xs">
              <Text size="xs" c="dimmed">
                Swatches (optional — set them all to show colour circles instead of buttons)
              </Text>
              {option.values.map((value) => (
                <ColorInput
                  key={value}
                  size="xs"
                  format="hex"
                  placeholder={value}
                  aria-label={`Swatch colour for ${value}`}
                  value={option.swatches[value] ?? ''}
                  onChange={(colour) =>
                    updateOption(index, { swatches: { ...option.swatches, [value]: colour } })
                  }
                  style={{ width: 130 }}
                />
              ))}
            </Group>
          ) : null}
        </Card>
      ))}

      <Group>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={addOption}
          disabled={options.length >= MAX_OPTION_AXES}
        >
          Add option
        </Button>
        <Tooltip label="Builds every combination and keeps the rows you already have">
          <Button
            variant="light"
            leftSection={<IconWand size={16} />}
            onClick={generate}
            disabled={usableOptions.length === 0}
          >
            Generate variants
          </Button>
        </Tooltip>
      </Group>

      {rootError.length > 0 ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Fix these first">
          <Stack gap={2}>
            {rootError.map((message, index) => (
              <Text key={index} size="sm">
                {message}
              </Text>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {variants.length > 0 ? (
        <>
          <Title order={4}>Variants</Title>
          <Alert icon={<IconInfoCircle size={16} />} variant="light">
            Leave a price blank to use the product price of ${productPrice.toFixed(2)}. Set one only
            where the variant differs.
          </Alert>

          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {usableOptions.map((option, index) => (
                  <Table.Th key={index}>{option.name}</Table.Th>
                ))}
                <Table.Th>SKU</Table.Th>
                <Table.Th style={{ width: 140 }}>Price</Table.Th>
                <Table.Th style={{ width: 120 }}>Stock</Table.Th>
                <Table.Th style={{ width: 220 }}>Image URL</Table.Th>
                <Table.Th style={{ width: 110 }}>For sale</Table.Th>
                <Table.Th style={{ width: 50 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {variants.map((variant, index) => (
                <Table.Tr key={variant.id ?? `new-${index}`}>
                  {usableOptions.map((option, axis) => (
                    <Table.Td key={axis}>
                      <Badge variant="light">{variant.options[axis] ?? '—'}</Badge>
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <TextInput
                      size="xs"
                      value={variant.sku}
                      error={fieldErrors[`variants.${index}.sku`]?.[0]}
                      onChange={(event) =>
                        updateVariant(index, { sku: event.currentTarget.value })
                      }
                      aria-label={`SKU for ${variant.options.filter(Boolean).join(' / ')}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      placeholder={productPrice.toFixed(2)}
                      value={variant.price}
                      onChange={(event) =>
                        updateVariant(index, { price: event.currentTarget.value })
                      }
                      aria-label={`Price for ${variant.options.filter(Boolean).join(' / ')}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      min={0}
                      value={variant.stock}
                      onChange={(value) => updateVariant(index, { stock: Number(value) || 0 })}
                      aria-label={`Stock for ${variant.options.filter(Boolean).join(' / ')}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      placeholder="https://… or /path.jpg"
                      value={variant.image}
                      error={fieldErrors[`variants.${index}.imageUrl`]?.[0]}
                      onChange={(event) =>
                        updateVariant(index, { image: event.currentTarget.value })
                      }
                      aria-label={`Image for ${variant.options.filter(Boolean).join(' / ')}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={variant.isActive}
                      onChange={(event) =>
                        updateVariant(index, { isActive: event.currentTarget.checked })
                      }
                      aria-label={`Sell ${variant.options.filter(Boolean).join(' / ')}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => removeVariant(index)}
                      aria-label={`Delete ${variant.options.filter(Boolean).join(' / ')}`}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      ) : null}

      <Group justify="flex-end">
        <Button onClick={save} loading={saving}>
          Save variants
        </Button>
      </Group>
    </Stack>
  );
}

export default VariantEditor;
