'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconEdit,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { StatGridSkeleton, TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Badge, EmptyState } from '@/components/ui';
import table from '@/components/admin/adminTable.module.css';

/** A coupon as the `coupons` table stores it. There is no separate discount. */
interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string | number;
  minimum_order_amount: string | number | null;
  maximum_discount_amount: string | number | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  applies_to: 'entire_order' | 'specific_products' | 'specific_categories';
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  redemption_count: string | number;
  discount_total: string | number;
}

interface CouponStats {
  total: number;
  active: number;
  expired: number;
  redemptions: number;
  discountTotal: number;
}

const EMPTY_STATS: CouponStats = {
  total: 0,
  active: 0,
  expired: 0,
  redemptions: 0,
  discountTotal: 0,
};

interface CouponForm {
  code: string;
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  minimum_order_amount: number | '';
  maximum_discount_amount: number | '';
  usage_limit: number | '';
  usage_limit_per_customer: number | '';
  valid_until: string;
  is_active: boolean;
  applies_to: 'entire_order' | 'specific_products' | 'specific_categories';
  applicable_product_ids: string[];
  applicable_category_ids: string[];
}

const BLANK_FORM: CouponForm = {
  code: '',
  name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: 10,
  minimum_order_amount: '',
  maximum_discount_amount: '',
  usage_limit: '',
  usage_limit_per_customer: 1,
  valid_until: '',
  is_active: true,
  applies_to: 'entire_order',
  applicable_product_ids: [],
  applicable_category_ids: [],
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/**
 * Renders a coupon's discount as the merchant wrote it.
 *
 * @param coupon - The coupon row.
 * @returns "10% off" or "$9.99 off".
 */
function describeDiscount(coupon: Coupon): string {
  const value = Number(coupon.discount_value) || 0;
  return coupon.discount_type === 'percentage' ? `${value}% off` : `${money(value)} off`;
}

/**
 * Whether a coupon is genuinely live: switched on and inside its window.
 *
 * @param coupon - The coupon row.
 * @returns True when a shopper could redeem it right now.
 */
function isLive(coupon: Coupon): boolean {
  if (!coupon.is_active) return false;
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return false;
  if (coupon.valid_from && new Date(coupon.valid_from) > new Date()) return false;
  return true;
}

/**
 * Coupons.
 *
 * This page reported "Active coupons 0 / Total redemptions 0" and the empty
 * state *"No coupon codes yet"* while two coupons were live on the storefront.
 * Two separate failures stacked:
 *
 * 1. `GET /api/admin/coupons` returned a 500 —
 *    `relation "discounts" does not exist` — from an abandoned refactor.
 *    That is fixed in the API.
 * 2. **This page swallowed the 500.** The fetch was wrapped in
 *    `if (response.ok) { … }` with no `else`, so a failed request left the
 *    coupon list at its initial `[]` and the component rendered its empty
 *    state. An empty state is a claim about the data — "you have not made one
 *    of these yet" — and making that claim on the strength of an error is how
 *    a completely broken feature stayed invisible. A merchant would have
 *    created duplicates of promotions they already had.
 *
 * Every fetch here now distinguishes "no rows" from "could not ask", and the
 * second renders the error with the server's own message.
 *
 * The Discounts tab is gone with the table it queried; `coupons` carries
 * `discount_type`, `discount_value` and `minimum_order_amount` inline and
 * needs no parent row.
 *
 * @returns The coupons route.
 */
export default function CouponsPage(): React.ReactElement {
  const { session } = useAdmin();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [stats, setStats] = useState<CouponStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Array<{ value: string; label: string }>>([]);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(BLANK_FORM);

  /*
   * The session cookie authenticates every call below; this only says whether the shell has
   * finished verifying, so the page does not fire six requests before it knows there is a session
   * at all. It used to be a Bearer header built from `localStorage`, which is gone.
   */
  const signedIn = Boolean(session);

  const fetchCoupons = useCallback(async () => {
    if (!signedIn) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/coupons', { credentials: 'include' });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || result?.error || `Request failed with status ${response.status}`
        );
      }

      setCoupons(result.data.coupons ?? []);
      setStats(result.data.stats ?? EMPTY_STATS);
    } catch (err) {
      console.error('Error fetching coupons:', err);
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
      setCoupons([]);
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  /* Targeting options. A failure here is not fatal — the editor falls back to
     whole-order coupons rather than blocking the page. */
  const fetchTargets = useCallback(async () => {
    if (!signedIn) return;

    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetch('/api/admin/products?limit=200', { credentials: 'include' }),
        fetch('/api/admin/categories', { credentials: 'include' }),
      ]);

      if (productsRes.ok) {
        const body = await productsRes.json();
        setProducts(
          (body?.data?.products ?? []).map((p: { id: string; name: string; sku?: string }) => ({
            value: p.id,
            label: p.sku ? `${p.name} (${p.sku})` : p.name,
          }))
        );
      }

      if (categoriesRes.ok) {
        const body = await categoriesRes.json();
        const rows = body?.data?.categories ?? body?.data ?? [];
        setCategories(
          (Array.isArray(rows) ? rows : []).map((c: { id: string; name: string }) => ({
            value: c.id,
            label: c.name,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching coupon targeting options:', err);
    }
  }, [signedIn]);

  useEffect(() => {
    void fetchCoupons();
    void fetchTargets();
  }, [fetchCoupons, fetchTargets]);

  const startCreate = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    openModal();
  };

  const startEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      name: coupon.name ?? '',
      description: coupon.description ?? '',
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value) || 0,
      minimum_order_amount:
        coupon.minimum_order_amount === null ? '' : Number(coupon.minimum_order_amount),
      maximum_discount_amount:
        coupon.maximum_discount_amount === null ? '' : Number(coupon.maximum_discount_amount),
      usage_limit: coupon.usage_limit ?? '',
      usage_limit_per_customer: coupon.usage_limit_per_customer ?? '',
      valid_until: coupon.valid_until ? coupon.valid_until.slice(0, 10) : '',
      is_active: coupon.is_active,
      applies_to: coupon.applies_to,
      applicable_product_ids: coupon.applicable_product_ids ?? [],
      applicable_category_ids: coupon.applicable_category_ids ?? [],
    });
    openModal();
  };

  const save = async () => {
    if (!signedIn) return;

    if (!form.code.trim()) {
      notifications.show({ title: 'Code required', message: 'Give the coupon a code shoppers can type.', color: 'red' });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim() || form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        minimum_order_amount: form.minimum_order_amount === '' ? null : form.minimum_order_amount,
        maximum_discount_amount:
          form.maximum_discount_amount === '' ? null : form.maximum_discount_amount,
        usage_limit: form.usage_limit === '' ? null : form.usage_limit,
        usage_limit_per_customer:
          form.usage_limit_per_customer === '' ? null : form.usage_limit_per_customer,
        valid_until: form.valid_until || null,
        is_active: form.is_active,
        applies_to: form.applies_to,
        applicable_product_ids:
          form.applies_to === 'specific_products' ? form.applicable_product_ids : null,
        applicable_category_ids:
          form.applies_to === 'specific_categories' ? form.applicable_category_ids : null,
      };

      const response = await fetch(
        editing ? `/api/admin/coupons/${editing.id}` : '/api/admin/coupons',
        {
          method: editing ? 'PUT' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || result?.error || `Request failed with status ${response.status}`
        );
      }

      notifications.show({
        title: editing ? 'Coupon updated' : 'Coupon created',
        message: `${payload.code} is ${payload.is_active ? 'live on your storefront' : 'saved but switched off'}.`,
        color: 'green',
      });

      closeModal();
      await fetchCoupons();
    } catch (err) {
      console.error('Error saving coupon:', err);
      notifications.show({
        title: 'Could not save the coupon',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (coupon: Coupon) => {
    if (!signedIn) return;
    if (!window.confirm(`Delete ${coupon.code}? Shoppers using it will be turned away.`)) return;

    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || result?.error || `Request failed with status ${response.status}`
        );
      }

      notifications.show({ title: 'Coupon deleted', message: `${coupon.code} is gone.`, color: 'green' });
      await fetchCoupons();
    } catch (err) {
      notifications.show({
        title: 'Could not delete the coupon',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Coupons"
        description="Codes shoppers type at checkout, and what they have cost you."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={startCreate}>
            New coupon
          </Button>
        }
      />

      {loading && coupons.length === 0 ? (
        <StatGridSkeleton count={4} />
      ) : (
        <StatGrid min={200}>
          <StatCard
            label="Live now"
            value={stats.active}
            meta={`${stats.total} coupon${stats.total === 1 ? '' : 's'} in total`}
          />
          <StatCard label="Expired" value={stats.expired} meta="Past their end date" />
          <StatCard label="Redemptions" value={stats.redemptions} meta="Times a code has been used" />
          <StatCard
            label="Given away"
            value={stats.discountTotal}
            format="currency"
            meta="Discount taken off orders"
            tone={stats.discountTotal > 0 ? 'warning' : 'neutral'}
          />
        </StatGrid>
      )}

      {error ? (
        <Alert
          color="red"
          variant="light"
          title="Could not load your coupons"
          icon={<IconAlertTriangle size={18} />}
        >
          <Stack gap="xs">
            <Text size="sm">
              This is a failure to read them, not a sign that you have none. Do not create
              replacements until it is fixed — you may already have live codes.
            </Text>
            <Text size="xs" c="dimmed">
              {error}
            </Text>
            <div>
              <Button size="xs" variant="default" onClick={() => void fetchCoupons()}>
                Try again
              </Button>
            </div>
          </Stack>
        </Alert>
      ) : loading ? (
        <TableSkeleton rows={4} columns={6} label="Loading coupons" />
      ) : coupons.length === 0 ? (
        <EmptyState
          title="No coupon codes yet"
          description="Create a code shoppers can type at checkout for a percentage or fixed amount off."
          action={<Button onClick={startCreate}>New coupon</Button>}
        />
      ) : (
        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={820}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>Discount</Table.Th>
                  <Table.Th>Applies to</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th className={table.numeric}>Used</Table.Th>
                  <Table.Th className={table.numeric}>Given away</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {coupons.map((coupon) => {
                  const live = isLive(coupon);
                  const expired =
                    coupon.valid_until !== null && new Date(coupon.valid_until) < new Date();

                  return (
                    <Table.Tr key={coupon.id}>
                      <Table.Td>
                        <Text fw={600} className={table.code}>
                          {coupon.code}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {coupon.name}
                        </Text>
                      </Table.Td>

                      <Table.Td>
                        <Text size="sm">{describeDiscount(coupon)}</Text>
                        {coupon.minimum_order_amount ? (
                          <Text size="xs" c="dimmed">
                            on orders over {money(Number(coupon.minimum_order_amount))}
                          </Text>
                        ) : null}
                      </Table.Td>

                      <Table.Td>
                        <Text size="sm">
                          {coupon.applies_to === 'entire_order'
                            ? 'Whole order'
                            : coupon.applies_to === 'specific_products'
                              ? `${coupon.applicable_product_ids?.length ?? 0} products`
                              : `${coupon.applicable_category_ids?.length ?? 0} categories`}
                        </Text>
                      </Table.Td>

                      <Table.Td>
                        <Badge tone={live ? 'mint' : expired ? 'neutral' : 'amber'} size="sm" dot>
                          {live ? 'live' : expired ? 'expired' : 'off'}
                        </Badge>
                        {coupon.valid_until ? (
                          <Text size="xs" c="dimmed" mt={2}>
                            {expired ? 'ended' : 'ends'}{' '}
                            {new Date(coupon.valid_until).toLocaleDateString('en-US', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                        ) : null}
                      </Table.Td>

                      <Table.Td className={table.numeric}>
                        {Number(coupon.redemption_count) || 0}
                        {coupon.usage_limit ? (
                          <Text size="xs" c="dimmed">
                            of {coupon.usage_limit}
                          </Text>
                        ) : null}
                      </Table.Td>

                      <Table.Td className={table.numeric}>
                        {money(Number(coupon.discount_total) || 0)}
                      </Table.Td>

                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Tooltip label="Edit">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => startEdit(coupon)}
                              aria-label={`Edit ${coupon.code}`}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => void remove(coupon)}
                              aria-label={`Delete ${coupon.code}`}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editing ? `Edit ${editing.code}` : 'New coupon'}
        size="lg"
      >
        <Stack gap="md">
          <Group grow align="flex-start">
            <TextInput
              label="Code"
              description="What the shopper types. Uppercased automatically."
              placeholder="WELCOME10"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.currentTarget.value })}
              required
            />
            <TextInput
              label="Name"
              description="For your own reference"
              placeholder="Welcome discount"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
          </Group>

          <Textarea
            label="Description"
            placeholder="10% off a first order"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
            rows={2}
          />

          <Group grow align="flex-start">
            <Select
              label="Discount type"
              data={[
                { value: 'percentage', label: 'Percentage off' },
                { value: 'fixed_amount', label: 'Fixed amount off' },
              ]}
              value={form.discount_type}
              onChange={(value) =>
                setForm({ ...form, discount_type: (value as CouponForm['discount_type']) || 'percentage' })
              }
              allowDeselect={false}
            />
            <NumberInput
              label={form.discount_type === 'percentage' ? 'Percent off' : 'Amount off'}
              min={0}
              max={form.discount_type === 'percentage' ? 100 : undefined}
              decimalScale={2}
              prefix={form.discount_type === 'fixed_amount' ? '$' : undefined}
              suffix={form.discount_type === 'percentage' ? '%' : undefined}
              value={form.discount_value}
              onChange={(value) => setForm({ ...form, discount_value: Number(value) || 0 })}
            />
          </Group>

          <Group grow align="flex-start">
            <NumberInput
              label="Minimum order"
              description="Leave blank for no minimum"
              min={0}
              decimalScale={2}
              prefix="$"
              value={form.minimum_order_amount}
              onChange={(value) =>
                setForm({ ...form, minimum_order_amount: value === '' ? '' : Number(value) })
              }
            />
            <NumberInput
              label="Maximum discount"
              description="Caps a percentage coupon"
              min={0}
              decimalScale={2}
              prefix="$"
              value={form.maximum_discount_amount}
              onChange={(value) =>
                setForm({ ...form, maximum_discount_amount: value === '' ? '' : Number(value) })
              }
            />
          </Group>

          <Group grow align="flex-start">
            <NumberInput
              label="Total uses"
              description="Leave blank for unlimited"
              min={1}
              value={form.usage_limit}
              onChange={(value) => setForm({ ...form, usage_limit: value === '' ? '' : Number(value) })}
            />
            <NumberInput
              label="Uses per customer"
              min={1}
              value={form.usage_limit_per_customer}
              onChange={(value) =>
                setForm({ ...form, usage_limit_per_customer: value === '' ? '' : Number(value) })
              }
            />
            <TextInput
              label="Ends on"
              description="Leave blank to run indefinitely"
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.currentTarget.value })}
            />
          </Group>

          <Select
            label="Applies to"
            data={[
              { value: 'entire_order', label: 'The whole order' },
              { value: 'specific_products', label: 'Specific products' },
              { value: 'specific_categories', label: 'Specific categories' },
            ]}
            value={form.applies_to}
            onChange={(value) =>
              setForm({ ...form, applies_to: (value as CouponForm['applies_to']) || 'entire_order' })
            }
            allowDeselect={false}
          />

          {form.applies_to === 'specific_products' ? (
            <MultiSelect
              label="Products"
              placeholder="Search your catalog"
              data={products}
              value={form.applicable_product_ids}
              onChange={(value) => setForm({ ...form, applicable_product_ids: value })}
              searchable
              clearable
            />
          ) : null}

          {form.applies_to === 'specific_categories' ? (
            <MultiSelect
              label="Categories"
              placeholder="Pick categories"
              data={categories}
              value={form.applicable_category_ids}
              onChange={(value) => setForm({ ...form, applicable_category_ids: value })}
              searchable
              clearable
            />
          ) : null}

          <Switch
            label="Live on the storefront"
            description="Switch off to keep the coupon without letting anyone redeem it"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.currentTarget.checked })}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeModal}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              {editing ? 'Save changes' : 'Create coupon'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
