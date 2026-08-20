'use client';

/**
 * Inventory.
 *
 * The old page loaded the entire catalogue with no `LIMIT`, attached seven windowed sales
 * aggregates per SKU, shipped the lot to the browser, filtered it in JavaScript, and recomputed a
 * forecast for every row on every change. At a few thousand SKUs it was unusable. It had no
 * pagination control, no row count, no error state — a failed fetch was swallowed and left a
 * fully-rendered page with six zeroed cards and an empty table, which reads as "you have no
 * inventory".
 *
 * The numbers were worse than the performance. It showed one quantity, `stock_quantity`, which the
 * ShipStation sync overwrote with *available* while the order trigger subtracted from it as *on
 * hand*. Supplier was the literal string 'ShipStation' for every row, so the supplier filter was a
 * dropdown with one option. The reorder point was recomputed as `forecast30 + 5` on every request
 * and shown in an editable field whose value the API discarded. "Create purchase order" showed a
 * green toast and made no request at all.
 *
 * What this page shows now comes from the ledger: on hand, committed, available, and incoming from
 * open purchase orders. Adjustments go through a dialog that requires a reason, and every movement
 * is readable afterwards. The five things a merchant does here — see what needs ordering, adjust
 * stock, count a shelf, check where units went, and set a reorder policy — are each one or two
 * clicks from the grid.
 *
 * Purchase orders and suppliers are no longer tabs on this page. They have their own lifecycles and
 * their own screens; nesting them here meant two implementations of the same list, one of which
 * had a dead edit button and no pagination.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconClipboardList,
  IconDots,
  IconFileExport,
  IconArrowsExchange,
  IconBuildingWarehouse,
  IconHistory,
  IconSearch,
  IconShoppingCart,
  IconTruckDelivery,
  IconX
} from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { EmptyState, Price } from '@/components/ui';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { ShipStationSyncButton } from '@/components/admin/ShipStationSyncButton';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { StatGridSkeleton, TableSkeleton } from '@/components/admin/AdminSkeletons';
import { SortableTh } from '@/components/admin/catalog/SortableTh';
import { InlineEdit } from '@/components/admin/catalog/InlineEdit';
import { downloadWithAuth } from '@/components/admin/catalog/download';
import { AdjustStockModal, type AdjustTarget } from '@/components/admin/inventory/AdjustStockModal';
import {
  TransferStockModal,
  type TransferTarget
} from '@/components/admin/inventory/TransferStockModal';
import { LocationsModal } from '@/components/admin/inventory/LocationsModal';
import { LedgerDrawer } from '@/components/admin/inventory/LedgerDrawer';
import {
  INVENTORY_VIEWS,
  useInventoryParams,
  type InventoryViewKey
} from '@/components/admin/inventory/useInventoryParams';
import table from '@/components/admin/adminTable.module.css';
import styles from './inventory.module.css';

/** One row of the inventory grid. */
interface InventoryRow {
  product_id: string;
  sku: string;
  name: string;
  featured_image_url: string | null;
  track_inventory: boolean;
  on_hand: number;
  committed: number;
  reserved: number;
  unavailable: number;
  available: number;
  incoming: number;
  location_count: number;
  unit_cost: number | null;
  base_price: number;
  value_at_cost: number;
  units_30d: number;
  units_90d: number;
  daily_demand: number;
  days_of_cover: number | null;
  reorder_point: number | null;
  suggested_reorder_point: number | null;
  low_stock_threshold: number | null;
  supplier_name: string | null;
  category_name: string | null;
  state: 'in_stock' | 'low_stock' | 'out_of_stock' | 'oversold' | 'not_tracked';
  last_sale_date: string | null;
}

interface InventoryStats {
  total: number;
  oversold: number;
  outOfStock: number;
  lowStock: number;
  needsReorder: number;
  incoming: number;
  unavailable: number;
  deadStock: number;
  totalUnits: number;
  valueAtCost: number;
  valueAtRetail: number;
  uncostedProducts: number;
  uncostedUnits: number;
}

interface Location {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
}

/** Stock state as a word, paired with a dot. Never colour alone. */
const STATE_LABEL: Record<InventoryRow['state'], string> = {
  in_stock: 'In stock',
  low_stock: 'Low',
  out_of_stock: 'Out',
  oversold: 'Oversold',
  not_tracked: 'Untracked'
};

/**
 * The inventory page.
 *
 * @returns The stock grid with its views, adjustments and movement history.
 */
export default function InventoryPage(): React.ReactElement {
  const { session } = useAdmin();
  const { params, update, setView, toggleSort, apiQuery, hasFilters, clearFilters } =
    useInventoryParams();

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ value: string; label: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [transferring, setTransferring] = useState<TransferTarget | null>(null);
  const [locationsOpen, { open: openLocations, close: closeLocations }] = useDisclosure(false);
  const [viewingHistory, setViewingHistory] = useState<InventoryRow | null>(null);

  const [searchDraft, setSearchDraft] = useState(params.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstLoad = useRef(true);

  const token = session?.sessionToken;

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }
      return payload;
    },
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    if (firstLoad.current) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const payload = await authFetch(`/api/admin/inventory?${apiQuery}`);
      setRows(payload.data.items);
      setStats(payload.data.statistics);
      setLocations(payload.data.locations);
      setTotal(payload.data.pagination.total);
      setTotalPages(payload.data.pagination.totalPages);
    } catch (caught) {
      /* Surfaced, not swallowed. A failed fetch used to leave a fully-rendered page with zeroed
       * cards and an empty table, which a merchant reads as "I have no inventory". */
      setError(caught instanceof Error ? caught.message : 'Could not load inventory');
    } finally {
      firstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiQuery, authFetch, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    authFetch('/api/admin/categories')
      .then((payload) => setCategories(payload.options ?? []))
      .catch(() => setCategories([]));
    authFetch('/api/admin/suppliers')
      .then((payload) =>
        setSuppliers(
          (payload.data ?? []).map((supplier: { id: string; name: string }) => ({
            value: supplier.id,
            label: supplier.name
          }))
        )
      )
      .catch(() => setSuppliers([]));
  }, [authFetch, token]);

  useEffect(() => {
    if (searchDraft === params.search) return;
    const timer = setTimeout(() => update({ search: searchDraft || null }, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [searchDraft, params.search, update]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Save an inventory setting on one product.
   *
   * @param productId - The product.
   * @param body - The settings to change.
   */
  const saveSetting = useCallback(
    async (productId: string, body: Record<string, unknown>) => {
      const payload = await authFetch(`/api/admin/inventory/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      setRows((current) =>
        current.map((row) =>
          row.product_id === productId
            ? {
                ...row,
                ...payload.data.product,
                product_id: row.product_id,
                unit_cost:
                  payload.data.product.cost_price === null
                    ? null
                    : Number(payload.data.product.cost_price)
              }
            : row
        )
      );
    },
    [authFetch]
  );

  const exportCsv = useCallback(async () => {
    const query = new URLSearchParams(apiQuery);
    query.delete('page');
    query.delete('limit');
    try {
      await downloadWithAuth(`/api/admin/inventory/export?${query}`, token, 'inventory.csv');
    } catch (caught) {
      notifications.show({
        title: 'Could not export',
        message: caught instanceof Error ? caught.message : 'Export failed',
        color: 'red'
      });
    }
  }, [apiQuery, token]);

  const viewCounts: Record<InventoryViewKey, number | undefined> = {
    all: stats?.total,
    needs_reorder: stats?.needsReorder,
    low_stock: stats?.lowStock,
    out_of_stock: stats?.outOfStock,
    oversold: stats?.oversold,
    incoming: stats?.incoming,
    dead_stock: stats?.deadStock,
    uncosted: stats?.uncostedProducts
  };

  const locationOptions = useMemo(
    () => locations.map((location) => ({ value: location.id, label: location.name })),
    [locations]
  );

  const showingFrom = total === 0 ? 0 : (params.page - 1) * params.limit + 1;
  const showingTo = Math.min(params.page * params.limit, total);

  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Inventory"
        description="What you hold, what is already sold, what is on the way, and what runs out first."
        actions={
          <Group gap="xs">
            <ShipStationSyncButton
              endpoint="/api/admin/sync/inventory"
              label="Sync stock"
              onSynced={load}
            />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default" rightSection={<IconChevronDown size={14} />}>
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconFileExport size={14} />} onClick={() => void exportCsv()}>
                  Export this view as CSV
                </Menu.Item>
                <Menu.Divider />
                {/* Purchase orders and suppliers are their own screens now. They were tabs here,
                    which meant two implementations of the same list — the tab's had a dead edit
                    button, no pagination, and sent no store id so it was permanently empty. */}
                <Menu.Item
                  leftSection={<IconShoppingCart size={14} />}
                  component={Link}
                  href="/admin/purchase-orders"
                >
                  Purchase orders
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTruckDelivery size={14} />}
                  component={Link}
                  href="/admin/suppliers"
                >
                  Suppliers
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconBuildingWarehouse size={14} />}
                  onClick={openLocations}
                >
                  Locations
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconClipboardList size={14} />}
                  component={Link}
                  href="/admin/inventory/reports/valuation"
                >
                  Stock reports
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        }
      />

      {loading ? (
        <StatGridSkeleton count={4} />
      ) : (
        stats && (
          <StatGrid>
            <StatCard
              label="Needs reordering"
              value={stats.needsReorder}
              tone={stats.needsReorder > 0 ? 'warning' : 'neutral'}
              meta="Below the reorder point with nothing on order"
              href="/admin/inventory?view=needs_reorder&state=needs_reorder"
            />
            <StatCard
              label={stats.oversold > 0 ? 'Oversold' : 'Out of stock'}
              value={stats.oversold > 0 ? stats.oversold : stats.outOfStock}
              tone={stats.oversold > 0 || stats.outOfStock > 0 ? 'danger' : 'neutral'}
              meta={
                stats.oversold > 0
                  ? 'Sold more than you hold'
                  : 'Nothing available to sell'
              }
              href={
                stats.oversold > 0
                  ? '/admin/inventory?view=oversold&state=oversold'
                  : '/admin/inventory?view=out_of_stock&state=out_of_stock'
              }
            />
            <StatCard
              label="Stock value at cost"
              value={stats.valueAtCost}
              format="currency"
              meta={
                /* The figure's own limits travel with it. The reports used to fill a missing cost
                   with base_price × 0.6 — a 40% margin invented for a number that goes to insurers
                   and lenders. Now what cannot be valued is counted and said out loud. */
                stats.uncostedProducts > 0
                  ? `Excludes ${stats.uncostedProducts} SKU${stats.uncostedProducts === 1 ? '' : 's'} with no cost on file`
                  : `${stats.totalUnits.toLocaleString()} units`
              }
              href={
                stats.uncostedProducts > 0
                  ? '/admin/inventory?view=uncosted&state=uncosted'
                  : undefined
              }
            />
            <StatCard
              label="Not selling"
              value={stats.deadStock}
              tone={stats.deadStock > 0 ? 'warning' : 'neutral'}
              meta="Held stock with no sale in 90 days"
              href="/admin/inventory?view=dead_stock&state=dead_stock"
            />
          </StatGrid>
        )
      )}

      <Paper withBorder radius="md" className={styles.panel}>
        <Tabs
          value={params.view}
          onChange={(value) => setView((value ?? 'all') as InventoryViewKey)}
          keepMounted={false}
        >
          <Tabs.List className={styles.tabs}>
            {(Object.keys(INVENTORY_VIEWS) as InventoryViewKey[]).map((key) => (
              <Tabs.Tab
                key={key}
                value={key}
                rightSection={
                  viewCounts[key] === undefined ? null : (
                    <Badge size="xs" variant="light">
                      {viewCounts[key]}
                    </Badge>
                  )
                }
              >
                {INVENTORY_VIEWS[key].label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Group gap="sm" className={styles.toolbar} wrap="wrap">
          <TextInput
            ref={searchRef}
            className={styles.search}
            leftSection={<IconSearch size={16} />}
            placeholder="Search name, SKU or barcode"
            aria-label="Search inventory"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.currentTarget.value)}
            rightSection={
              searchDraft ? (
                <ActionIcon variant="subtle" onClick={() => setSearchDraft('')} aria-label="Clear search">
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
          />

          {/* Only shown once a store actually has more than one location, so single-location
              merchants never meet the concept. */}
          {locationOptions.length > 1 && (
            <Select
              aria-label="Stock location"
              placeholder="All locations"
              data={locationOptions}
              value={params.locationId || null}
              onChange={(value) => update({ location_id: value })}
              clearable
              w={180}
            />
          )}

          <Select
            placeholder="Any category"
            aria-label="Filter by category"
            data={categories}
            value={params.categoryId || null}
            onChange={(value) => update({ category_id: value })}
            clearable
            searchable
            w={180}
            nothingFoundMessage="No categories yet"
          />

          <Select
            placeholder="Any supplier"
            aria-label="Filter by supplier"
            data={suppliers}
            value={params.supplierId || null}
            onChange={(value) => update({ supplier_id: value })}
            clearable
            searchable
            w={180}
            nothingFoundMessage="No suppliers yet"
          />

          {hasFilters && (
            <Button variant="subtle" size="compact-sm" onClick={clearFilters} leftSection={<IconX size={14} />}>
              Clear filters
            </Button>
          )}

          <div className={styles.spacer} />

          <Text size="sm" c="dimmed" className={styles.count}>
            {total === 0 ? 'Nothing here' : `${showingFrom}–${showingTo} of ${total.toLocaleString()}`}
          </Text>

          <Select
            aria-label="Rows per page"
            data={['25', '50', '100', '250']}
            value={String(params.limit)}
            onChange={(value) => update({ limit: value, page: 1 })}
            w={90}
          />
        </Group>

        {error && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Could not load inventory"
            className={styles.alert}
          >
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{error}</Text>
              <Button size="compact-sm" variant="default" onClick={load}>
                Try again
              </Button>
            </Stack>
          </Alert>
        )}

        {loading ? (
          <TableSkeleton rows={10} columns={9} />
        ) : /*
             * `!error` matters: without it a failed load rendered the error banner and the
             * "you have nothing" empty state in the same viewport — "Could not load products /
             * Database connection lost / Try again" directly above "No products yet — add a
             * product by hand" with a call to action. A merchant with a transient database blip
             * was being told their catalogue was empty.
             */
          !error && rows.length === 0 ? (
          <EmptyState
            title={params.view === 'all' && !hasFilters ? 'No stock tracked yet' : 'Nothing matches that'}
            description={
              params.view === 'all' && !hasFilters
                ? 'Sync your ShipStation stock levels, or add products and record their opening balances.'
                : 'Try a different view, or clear the filters.'
            }
            action={
              params.view === 'all' && !hasFilters ? (
                <Button component={Link} href="/admin/products">
                  Go to products
                </Button>
              ) : (
                <Button variant="default" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={1100}>
            <Table highlightOnHover verticalSpacing="sm" className={refreshing ? styles.refreshing : undefined}>
              <Table.Thead>
                <Table.Tr>
                  <SortableTh column="name" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort}>
                    Product
                  </SortableTh>
                  <SortableTh
                    column="on_hand"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={90}
                    hint="Physically present, saleable or not"
                  >
                    On hand
                  </SortableTh>
                  <SortableTh
                    column="committed"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={95}
                    hint="Sold but not yet shipped — still on the shelf, not available to promise"
                  >
                    Committed
                  </SortableTh>
                  <SortableTh
                    column="available"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={110}
                    hint="What you can still sell"
                  >
                    Available
                  </SortableTh>
                  <SortableTh
                    column="incoming"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={90}
                    hint="On open purchase orders and not yet received"
                  >
                    On order
                  </SortableTh>
                  <SortableTh
                    column="days_of_cover"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={110}
                    hint="How long available stock lasts at the last 90 days' rate"
                  >
                    Cover
                  </SortableTh>
                  <SortableTh
                    column="reorder_point"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={110}
                    hint="Raise a purchase order when available stock reaches this. Editable."
                  >
                    Reorder at
                  </SortableTh>
                  <SortableTh column="unit_cost" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort} numeric width={100}>
                    Unit cost
                  </SortableTh>
                  <SortableTh column="value_at_cost" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort} numeric width={110}>
                    Value
                  </SortableTh>
                  <Table.Th w={44}>
                    <span className={styles.srOnly}>Actions</span>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.product_id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <div className={styles.thumb}>
                          {row.featured_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.featured_image_url} alt="" loading="lazy" />
                          ) : null}
                        </div>
                        <div className={styles.identity}>
                          <Link href={`/admin/products/${row.product_id}`} className={styles.name}>
                            {row.name}
                          </Link>
                          <Group gap={6}>
                            <span className={table.code}>{row.sku}</span>
                            <span className={styles.state} data-state={row.state}>
                              <span className={styles.dot} aria-hidden="true" />
                              {STATE_LABEL[row.state]}
                            </span>
                            {row.supplier_name && (
                              <span className={table.sub}>· {row.supplier_name}</span>
                            )}
                          </Group>
                        </div>
                      </Group>
                    </Table.Td>

                    <Table.Td className={table.numeric}>{row.on_hand.toLocaleString()}</Table.Td>

                    <Table.Td className={table.numeric}>
                      {row.committed > 0 ? (
                        row.committed.toLocaleString()
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <span className={styles.available} data-negative={row.available < 0 || undefined}>
                        {row.available < 0 && <IconAlertTriangle size={12} aria-hidden="true" />}
                        {row.available.toLocaleString()}
                      </span>
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      {row.incoming > 0 ? (
                        <Tooltip label="On an open purchase order">
                          <span>+{row.incoming.toLocaleString()}</span>
                        </Tooltip>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      {row.days_of_cover === null ? (
                        /* Not "∞" and not a 999999 sentinel: no demand signal is a different fact
                           from never running out, and a merchant sorting by cover needs the
                           difference. */
                        <Tooltip label="No sales in the last 90 days">
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        </Tooltip>
                      ) : (
                        <div className={table.stacked}>
                          <span>{formatCover(row.days_of_cover)}</span>
                          <span className={table.sub}>{row.units_90d} sold 90d</span>
                        </div>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <InlineEdit
                        label={`Reorder point for ${row.name}`}
                        value={row.reorder_point}
                        placeholder={
                          row.suggested_reorder_point === null
                            ? 'Not set'
                            : `${row.suggested_reorder_point} suggested`
                        }
                        render={(value) => <span>{Number(value).toLocaleString()}</span>}
                        onCommit={(next) => saveSetting(row.product_id, { reorder_point: next })}
                      />
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <InlineEdit
                        label={`Unit cost for ${row.name}`}
                        value={row.unit_cost}
                        placeholder="Not set"
                        render={(value) => <Price value={Number(value)} />}
                        onCommit={(next) => saveSetting(row.product_id, { unit_cost: next })}
                      />
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      {row.unit_cost === null ? (
                        <Tooltip label="Record a cost to value this stock">
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        </Tooltip>
                      ) : (
                        <Price value={row.value_at_cost} />
                      )}
                    </Table.Td>

                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label={`Actions for ${row.name}`}>
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            onClick={() =>
                              setAdjusting({
                                product_id: row.product_id,
                                sku: row.sku,
                                name: row.name,
                                on_hand: row.on_hand,
                                available: row.available,
                                committed: row.committed,
                                unit_cost: row.unit_cost
                              })
                            }
                          >
                            Adjust stock
                          </Menu.Item>
                          {/* Only offered when there is somewhere to move stock to. A transfer
                              action in a single-location store is a dead end dressed as a
                              feature. */}
                          {locationOptions.length > 1 && (
                            <Menu.Item
                              leftSection={<IconArrowsExchange size={14} />}
                              onClick={() =>
                                setTransferring({
                                  product_id: row.product_id,
                                  sku: row.sku,
                                  name: row.name
                                })
                              }
                            >
                              Move between locations
                            </Menu.Item>
                          )}
                          <Menu.Item
                            leftSection={<IconHistory size={14} />}
                            onClick={() => setViewingHistory(row)}
                          >
                            Stock history
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item component={Link} href={`/admin/products/${row.product_id}`}>
                            Edit product
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconShoppingCart size={14} />}
                            component={Link}
                            href={`/admin/purchase-orders/create?sku=${encodeURIComponent(row.sku)}`}
                          >
                            Order more
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {totalPages > 1 && (
          <Group justify="space-between" className={styles.footer}>
            <Text size="sm" c="dimmed">
              Page {params.page} of {totalPages}
            </Text>
            <Pagination
              total={totalPages}
              value={params.page}
              onChange={(page) => update({ page })}
              siblings={1}
              withEdges
            />
          </Group>
        )}
      </Paper>

      <AdjustStockModal
        target={adjusting}
        onClose={() => setAdjusting(null)}
        locations={locationOptions}
        activeLocationId={params.locationId || null}
        token={token}
        onAdjusted={load}
      />

      <LocationsModal
        opened={locationsOpen}
        onClose={closeLocations}
        token={token}
        onChanged={load}
      />

      <TransferStockModal
        target={transferring}
        onClose={() => setTransferring(null)}
        locations={locationOptions}
        activeLocationId={params.locationId || null}
        token={token}
        onTransferred={load}
      />

      <LedgerDrawer
        product={viewingHistory}
        onClose={() => setViewingHistory(null)}
        token={token}
      />
    </Stack>
  );
}

/**
 * Days of cover in the unit a person reasons in.
 *
 * At the current rate a slow-moving product can have four or five thousand days of cover, which is
 * arithmetically true and useless: nobody plans in units of "6,390 days". Past a year the exact
 * figure carries no decision — the answer is "far more than you need" — so it reads as years, and
 * beyond five as a ceiling.
 *
 * @param days - Days of cover, or null when there is no demand signal.
 * @returns A short label.
 */
function formatCover(days: number): string {
  if (days < 60) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return years >= 5 ? '5y+' : `${years.toFixed(1)}y`;
}
