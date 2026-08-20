'use client';

/**
 * Acting on many SKUs at once from the stock grid.
 *
 * The catalogue has had a bulk bar since it was rewritten; Inventory had none, so deciding what to
 * order for forty SKUs meant opening forty row menus. That is the weekly restock — the single most
 * repetitive thing a merchant does on this screen — and it was the one thing the screen could not
 * help with.
 *
 * The action that matters most is the last one: turning a selection straight into a purchase order.
 * "Needs reordering" is a worklist, and a worklist you cannot act on is a report.
 */

import React, { useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconPackageExport,
  IconShoppingCartPlus,
  IconX
} from '@tabler/icons-react';
import { Price } from '@/components/ui';
import styles from '@/components/admin/catalog/BulkBar.module.css';
import table from '@/components/admin/adminTable.module.css';

/** The subset of a grid row this bar needs. */
export interface BulkTarget {
  product_id: string;
  sku: string;
  name: string;
  available: number;
  incoming: number;
  reorder_point: number | null;
  reorder_quantity: number | null;
  suggested_reorder_point: number | null;
  unit_cost: number | null;
  supplier_id: string | null;
}

export interface InventoryBulkBarProps {
  selected: BulkTarget[];
  onClear: () => void;
  token?: string;
  /** Refresh the grid after anything is written. */
  onChanged: () => void | Promise<void>;
  suppliers: Array<{ value: string; label: string }>;
}

/**
 * The bulk action bar for the stock grid.
 *
 * @param props - {@link InventoryBulkBarProps}
 * @returns The bar, plus its dialogs.
 */
export function InventoryBulkBar({
  selected,
  onClear,
  token,
  onChanged,
  suppliers
}: InventoryBulkBarProps): React.ReactElement | null {
  const [open, setOpen] = useState<null | 'reorder' | 'threshold' | 'tracking' | 'po'>(null);
  const [amount, setAmount] = useState<number | string>('');
  const [tracking, setTracking] = useState(true);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const noun = `${selected.length} product${selected.length === 1 ? '' : 's'}`;

  /*
   * What to order, per line, before the merchant touches anything.
   *
   * Enough to cover the reorder point plus a cycle, less what is on the shelf *and* what is already
   * on its way — ignoring `incoming` is how a merchant orders the same pallet twice. The number is
   * a starting point, and every line stays editable.
   */
  const suggestedQuantity = useMemo(
    () => (row: BulkTarget) => {
      if (row.reorder_quantity && row.reorder_quantity > 0) return row.reorder_quantity;
      const point = row.reorder_point ?? row.suggested_reorder_point ?? 0;
      return Math.max(0, Math.round(point * 2 - row.available - row.incoming));
    },
    []
  );

  const lines = selected.map((row) => ({
    row,
    quantity: quantities[row.product_id] ?? suggestedQuantity(row)
  }));

  const orderTotal = lines.reduce(
    (sum, line) => sum + line.quantity * (Number(line.row.unit_cost) || 0),
    0
  );

  /**
   * Apply a bulk action to the selection.
   *
   * @param body - The bulk endpoint's payload.
   * @param success - What to say when it worked.
   */
  const run = async (body: Record<string, unknown>, success: string) => {
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, product_ids: selected.map((r) => r.product_id) })
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? `That did not work (${response.status})`);
      }

      const summary = payload.data?.summary;
      notifications.show({
        title: success,
        /* Per-row outcomes, not one green count — a skipped row is a thing the merchant needs to
         * know about, and the endpoint already names them. */
        message: summary
          ? `${summary.updated} updated${summary.skipped ? `, ${summary.skipped} skipped` : ''}.`
          : 'Done.',
        color: 'green'
      });
      setOpen(null);
      await onChanged();
      onClear();
    } catch (error) {
      notifications.show({
        title: 'Could not apply that',
        message: error instanceof Error ? error.message : 'Something went wrong',
        color: 'red'
      });
    } finally {
      setBusy(false);
    }
  };

  /** Raise one purchase order covering every selected line with a quantity. */
  const createPurchaseOrder = async () => {
    if (!token || !supplierId) return;

    const orderable = lines.filter((line) => line.quantity > 0);
    if (orderable.length === 0) {
      notifications.show({
        title: 'Nothing to order',
        message: 'Every line is set to zero. Enter how many units you want.',
        color: 'yellow'
      });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: new Date().toISOString().slice(0, 10),
          items: orderable.map((line) => ({
            product_id: line.row.product_id,
            product_sku: line.row.sku,
            product_name: line.row.name,
            quantity: line.quantity,
            /* The cost we hold, not a retail price. A purchase order valued at retail poisons the
             * receipt's moving-average cost and every margin figure after it. */
            unit_cost: Number(line.row.unit_cost) || 0
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? `Could not create the order (${response.status})`);
      }

      notifications.show({
        title: 'Purchase order created',
        message: `${payload.data.purchase_order.po_number} — ${orderable.length} line${
          orderable.length === 1 ? '' : 's'
        }.`,
        color: 'green'
      });
      setOpen(null);
      await onChanged();
      onClear();
    } catch (error) {
      notifications.show({
        title: 'Could not create the order',
        message: error instanceof Error ? error.message : 'Something went wrong',
        color: 'red'
      });
    } finally {
      setBusy(false);
    }
  };

  if (selected.length === 0) return null;

  return (
    <>
      <Paper className={styles.bar} role="region" aria-label={`Bulk actions for ${noun}`} shadow="md">
        <Group justify="space-between" wrap="nowrap" className={styles.inner}>
          <Text size="sm" fw={600}>
            {noun} selected
          </Text>

          <Group gap={4} wrap="nowrap">
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconPackageExport size={14} />}
              onClick={() => setOpen('reorder')}
            >
              Reorder point
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setOpen('threshold')}
            >
              Low-stock level
            </Button>
            <Button size="compact-sm" variant="default" onClick={() => setOpen('tracking')}>
              Tracking
            </Button>
            <Button
              size="compact-sm"
              leftSection={<IconShoppingCartPlus size={14} />}
              onClick={() => {
                setSupplierId(selected.find((r) => r.supplier_id)?.supplier_id ?? null);
                setOpen('po');
              }}
            >
              Create purchase order
            </Button>
          </Group>

          <Tooltip label="Clear selection">
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={onClear}
              aria-label="Clear selection"
            >
              <IconX size={14} />
            </Button>
          </Tooltip>
        </Group>
      </Paper>

      <Modal opened={open === 'reorder'} onClose={() => setOpen(null)} title="Set the reorder point" centered>
        <Stack>
          <NumberInput
            label="Reorder when available stock reaches"
            description="Applied to every selected product."
            min={0}
            allowDecimal={false}
            value={amount}
            onChange={setAmount}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={amount === ''}
              onClick={() => run({ action: 'set_reorder_point', reorder_point: Number(amount) }, 'Reorder point set')}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={open === 'threshold'} onClose={() => setOpen(null)} title="Set the low-stock level" centered>
        <Stack>
          <NumberInput
            label="Warn below"
            min={0}
            allowDecimal={false}
            value={amount}
            onChange={setAmount}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={amount === ''}
              onClick={() =>
                run({ action: 'set_low_stock_threshold', low_stock_threshold: Number(amount) }, 'Low-stock level set')
              }
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={open === 'tracking'} onClose={() => setOpen(null)} title="Stock tracking" centered>
        <Stack>
          <Switch
            label="Track stock for these products"
            description="Untracked products can always be sold, and do not appear in stock counts."
            checked={tracking}
            onChange={(event) => setTracking(event.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => run({ action: 'set_track_inventory', track_inventory: tracking }, 'Tracking updated')}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={open === 'po'}
        onClose={() => setOpen(null)}
        title="Create a purchase order"
        size="xl"
        centered
      >
        <Stack>
          <Select
            label="Supplier"
            placeholder={suppliers.length ? 'Choose a supplier' : 'No suppliers yet'}
            description="One order, to one supplier. Split the selection if you buy these from more than one."
            data={suppliers}
            value={supplierId}
            onChange={setSupplierId}
            searchable
            required
          />

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th className={table.numeric}>Available</Table.Th>
                <Table.Th className={table.numeric}>On order</Table.Th>
                <Table.Th className={table.numeric}>Order</Table.Th>
                <Table.Th className={table.numeric}>Line cost</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lines.map(({ row, quantity }) => (
                <Table.Tr key={row.product_id}>
                  <Table.Td>
                    <Text size="sm">{row.name}</Text>
                    <Text size="xs" c="dimmed">{row.sku}</Text>
                  </Table.Td>
                  <Table.Td className={table.numeric}>{row.available}</Table.Td>
                  <Table.Td className={table.numeric}>{row.incoming || '—'}</Table.Td>
                  <Table.Td className={table.numeric}>
                    <NumberInput
                      size="xs"
                      min={0}
                      allowDecimal={false}
                      w={90}
                      aria-label={`Order quantity for ${row.name}`}
                      value={quantity}
                      onChange={(value) =>
                        setQuantities((current) => ({
                          ...current,
                          [row.product_id]: Math.max(0, Math.trunc(Number(value) || 0))
                        }))
                      }
                    />
                  </Table.Td>
                  <Table.Td className={table.numeric}>
                    {row.unit_cost ? (
                      <Price value={quantity * Number(row.unit_cost)} />
                    ) : (
                      <Text size="xs" c="dimmed">no cost on file</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {/* Said out loud, because a total that quietly excludes uncosted lines is a budget
                  figure the merchant would act on. */}
              {lines.some((l) => !l.row.unit_cost)
                ? 'Some lines have no cost on file and are not counted in this total.'
                : ' '}
            </Text>
            <Text size="sm" fw={600}>
              Order total <Price value={orderTotal} />
            </Text>
          </Group>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(null)}>Cancel</Button>
            <Button loading={busy} disabled={!supplierId} onClick={() => void createPurchaseOrder()}>
              Create purchase order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default InventoryBulkBar;
