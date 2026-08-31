'use client';

/**
 * The catalogue.
 *
 * A rewrite rather than a repair, because most of what was wrong was structural.
 *
 * The page kept its view state in component state, so a merchant who filtered to "out of stock,
 * worst margin first", opened a product and pressed Back landed on page one of the unfiltered
 * catalogue. It replaced the entire screen with a skeleton on every refetch — including on every
 * keystroke of a search, which destroyed the cursor mid-word. Its sort control was a `<Select>`
 * beside the filters rather than the column headings every merchant clicks first. Its bulk actions,
 * export and import posted to routes that did not exist, its "Add product" button navigated to a
 * 404, its category filter was a permanently empty array, and its price filter inputs had no
 * `value` and no `onChange` at all.
 *
 * What replaces it is built on three ideas.
 *
 * **The URL is the state.** Views, filters, sort and page all live in the query string, so a view
 * is bookmarkable, shareable, survives Back, and can be linked to — which is what turns the counts
 * above the grid from posters into doors.
 *
 * **The grid is where the work happens.** Price, cost and reorder point are editable in place, with
 * Enter committing and moving down. The old path to changing one price was eight interactions and
 * two page loads.
 *
 * **Never blank what is already on screen.** A refetch dims the rows; the skeleton is for the first
 * paint only. Losing the toolbar and the filters mid-interaction is what made the page feel broken.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
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
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCategory,
  IconChevronDown,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconEyeOff,
  IconPhotoOff,
  IconFileExport,
  IconFileImport,
  IconPlus,
  IconSearch,
  IconTicket,
  IconTrash,
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
import { BulkBar, type BulkRequest } from '@/components/admin/catalog/BulkBar';
import { ImportModal } from '@/components/admin/catalog/ImportModal';
import { downloadWithAuth } from '@/components/admin/catalog/download';
import { CATALOG_VIEWS, useCatalogParams, type CatalogViewKey } from '@/components/admin/catalog/useCatalogParams';
import table from '@/components/admin/adminTable.module.css';
import styles from './products.module.css';

/** A product as the list endpoint returns it. */
interface CatalogRow {
  id: string;
  sku: string;
  name: string;
  slug: string;
  status: 'draft' | 'active' | 'archived';
  featured_image_url: string | null;
  base_price: number;
  sale_price: number | null;
  cost_price: number | null;
  effective_price: number;
  margin_percent: number | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  reorder_point: number | null;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  days_of_cover: number | null;
  completeness_score: number;
  category_name: string | null;
  vendor: string | null;
  field_locks: string[] | null;
  sales_data: {
    total_sales: number;
    total_revenue: number;
    units_30d: number;
    units_90d: number;
    last_sale_date: string | null;
  };
}

interface Statistics {
  total: number;
  active: number;
  draft: number;
  archived: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  incomplete: number;
  negativeMargin: number;
  uncosted: number;
  inventoryValueAtCost: number;
  inventoryValueAtRetail: number;
}

/** Stock state rendered as a dot plus a word — never colour alone. */
const STOCK_LABEL: Record<CatalogRow['stock_status'], string> = {
  in_stock: 'In stock',
  low_stock: 'Low',
  out_of_stock: 'Out',
  not_tracked: 'Untracked'
};

/**
 * The catalogue page.
 *
 * @returns The products grid with its views, filters and bulk actions.
 */
export default function ProductsAdminPage(): React.ReactElement {
  const router = useRouter();
  const { session } = useAdmin();
  const { params, update, setView, toggleSort, apiQuery, hasFilters, clearFilters } =
    useCatalogParams();

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);

  /* `loading` is the first paint only; `refreshing` is every subsequent fetch. Conflating them is
   * what made every keystroke replace the page with a skeleton. */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  /* `?import=1` opens the importer directly, so "Or import a spreadsheet" on the new-product page
   * lands on the thing it names. That link used to point at the bare catalogue, where the importer
   * is three clicks away inside a More menu — a label that described a destination it did not
   * reach. */
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('import') === '1') setImportOpen(true);
  }, []);

  /* The search box is local so typing is never blocked on a request, and the URL is updated on a
   * debounce. Driving the input from the URL directly makes every keystroke a navigation. */
  const [searchDraft, setSearchDraft] = useState(params.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstLoad = useRef(true);

  /* Whether the admin shell has verified a session. The requests below authenticate with the
     httpOnly session cookie; this only keeps the page from firing them before there is one. */
  const signedIn = Boolean(session);
  /* The storefront preview link needs the store's public slug, which the session carries under
   * different names depending on where it was created. */
  const storeSlug =
    (session as { storeSlug?: string; store?: { slug?: string } } | null)?.storeSlug ??
    (session as { store?: { slug?: string } } | null)?.store?.slug ??
    '';

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!signedIn) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }
      return payload;
    },
    [signedIn]
  );

  const load = useCallback(async () => {
    if (!signedIn) return;
    if (firstLoad.current) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const payload = await authFetch(`/api/admin/products?${apiQuery}`);
      setRows(payload.data.products);
      setStatistics(payload.data.statistics);
      setTotal(payload.data.pagination.total);
      setTotalPages(payload.data.pagination.totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load products');
    } finally {
      firstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiQuery, authFetch, signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!signedIn) return;
    authFetch('/api/admin/categories')
      .then((payload) => setCategories(payload.options ?? []))
      /* A failed category list is not worth an error banner over the whole page — the filter just
       * stays empty, which is what it was before this endpoint existed. */
      .catch(() => setCategories([]));
  }, [authFetch, signedIn]);

  /* Debounced search. One timer, cleared on every keystroke, so exactly one request is made per
   * pause — the previous version raced its own debounce against an effect and fired roughly two
   * requests per character. */
  useEffect(() => {
    if (searchDraft === params.search) return;
    const timer = setTimeout(() => update({ search: searchDraft || null }, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [searchDraft, params.search, update]);

  /* `/` focuses search, as it does in every tool a merchant already uses. Ignored while typing, so
   * it never swallows a slash in a product name. */
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

  /* Selection is dropped when the *filter* changes, not when the page does — a merchant paging
   * through results to pick rows across pages is doing something reasonable, and the old code
   * silently cleared the set on every fetch. */
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [params.view, params.search, params.categoryId, params.stockStatus, params.issue, params.vendor]);

  const pageIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleRow = useCallback((id: string) => {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (pageIds.every((id) => next.has(id))) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [pageIds]);

  /**
   * Save one field on one product, optimistically.
   *
   * @param id - The product.
   * @param body - The fields to change.
   */
  const saveField = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const payload = await authFetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });

      /* Patch the row in place rather than refetching the page. A refetch after every cell edit
       * would reorder the grid under the merchant's cursor when they are sorted by the column they
       * are editing — which is exactly when they are most likely to be editing it. */
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                ...payload.data.product,
                base_price: Number(payload.data.product.base_price) || 0,
                sale_price:
                  payload.data.product.sale_price === null
                    ? null
                    : Number(payload.data.product.sale_price),
                cost_price:
                  payload.data.product.cost_price === null
                    ? null
                    : Number(payload.data.product.cost_price),
                sales_data: row.sales_data
              }
            : row
        )
      );
    },
    [authFetch]
  );

  const runBulk = useCallback(
    async (request: BulkRequest) => {
      try {
        const body = allMatching
          ? { ...request, filter: filterForApi(params) }
          : { ...request, product_ids: [...selected] };

        const payload = await authFetch('/api/admin/products/bulk', {
          method: 'POST',
          body: JSON.stringify(body)
        });

        const { summary, results } = payload.data;
        const skipped = results.filter((r: { status: string }) => r.status === 'skipped');

        /* The result is reported per row, not as a blanket success. "183 updated, 2 skipped:
         * SKU-991 would drop below cost" is something a merchant can act on. */
        notifications.show({
          title: `${summary.updated + summary.deleted} of ${summary.requested} updated`,
          message:
            skipped.length > 0
              ? `${skipped.length} skipped — ${skipped
                  .slice(0, 3)
                  .map((r: { sku: string; reason?: string }) => `${r.sku}: ${r.reason}`)
                  .join('; ')}${skipped.length > 3 ? '…' : ''}`
              : 'Done.',
          color: skipped.length > 0 ? 'yellow' : 'green',
          autoClose: skipped.length > 0 ? 12000 : 4000
        });

        setSelected(new Set());
        setAllMatching(false);
        await load();
      } catch (caught) {
        notifications.show({
          title: 'That did not work',
          message: caught instanceof Error ? caught.message : 'Bulk action failed',
          color: 'red'
        });
        throw caught;
      }
    },
    [allMatching, authFetch, load, params, selected]
  );

  const exportCsv = useCallback(
    async (onlySelected: boolean) => {
      const query = new URLSearchParams(apiQuery);
      /* Page and page size are view state, not export scope: a merchant asking for "this view"
       * means every matching row, not the twenty-five currently rendered. */
      query.delete('page');
      query.delete('limit');
      if (onlySelected && selected.size > 0) query.set('ids', [...selected].join(','));

      try {
        await downloadWithAuth(`/api/admin/products/export?${query.toString()}`, 'products.csv');
      } catch (caught) {
        notifications.show({
          title: 'Could not export',
          message: caught instanceof Error ? caught.message : 'Export failed',
          color: 'red'
        });
      }
    },
    [apiQuery, selected, signedIn]
  );

  const viewCounts: Record<CatalogViewKey, number | undefined> = {
    all: statistics?.total,
    active: statistics?.active,
    draft: statistics?.draft,
    incomplete: statistics?.incomplete,
    low_stock: statistics?.lowStock,
    out_of_stock: statistics?.outOfStock,
    no_cost: statistics?.uncosted,
    negative_margin: statistics?.negativeMargin
  };

  const showingFrom = total === 0 ? 0 : (params.page - 1) * params.limit + 1;
  const showingTo = Math.min(params.page * params.limit, total);

  return (
    <Stack gap="lg" className={styles.page}>
      <AdminPageHeader
        title="Products"
        description="Your catalogue, its stock position, and what each product is earning."
        actions={
          <Group gap="xs">
            <ShipStationSyncButton onSynced={load} />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default" rightSection={<IconChevronDown size={14} />}>
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconFileExport size={14} />} onClick={() => void exportCsv(false)}>
                  Export this view as CSV
                </Menu.Item>
                <Menu.Item leftSection={<IconFileImport size={14} />} onClick={() => setImportOpen(true)}>
                  Import from CSV
                </Menu.Item>
                <Menu.Divider />
                {/* Coupons is merged into the catalogue rather than carrying its own nav slot, so
                    this is the route's entry point. In the overflow rather than the header: it is
                    a neighbouring surface, not a thing you do to the products on this page. */}
                <Menu.Item
                  leftSection={<IconTicket size={14} />}
                  component={Link}
                  href="/admin/coupons"
                >
                  Pricing and promotions
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCategory size={14} />}
                  component={Link}
                  href="/admin/inventory"
                >
                  Inventory and stock
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              leftSection={<IconPlus size={16} />}
              component={Link}
              href="/admin/products/new"
            >
              Add product
            </Button>
          </Group>
        }
      />

      {loading ? (
        <StatGridSkeleton count={4} />
      ) : (
        statistics && (
          /*
           * Four cards, every one of them a link into a filtered view. The previous row was five
           * counts a merchant could not act on and could not click — a count with no door is a
           * poster, not a tool. "Inventory value" was also shown here at list price and on the
           * inventory page at cost, two screens giving one label two numbers that differed by the
           * whole gross margin.
           */
          <StatGrid>
            <StatCard
              label="Out of stock"
              value={statistics.outOfStock}
              tone={statistics.outOfStock > 0 ? 'danger' : 'neutral'}
              meta="Not sellable right now"
              href="/admin/products?view=out_of_stock"
            />
            <StatCard
              label="Low stock"
              value={statistics.lowStock}
              tone={statistics.lowStock > 0 ? 'warning' : 'neutral'}
              meta="At or below the reorder point"
              href="/admin/products?view=low_stock"
            />
            <StatCard
              label="Stock value at cost"
              value={statistics.inventoryValueAtCost}
              format="currency"
              meta="What the shelf is worth"
              href="/admin/inventory"
            />
            <StatCard
              label="Needs attention"
              value={statistics.incomplete}
              tone={statistics.incomplete > 0 ? 'warning' : 'neutral'}
              meta="Listings missing images, copy or a price"
              href="/admin/products?view=incomplete"
            />
          </StatGrid>
        )
      )}

      <Paper withBorder radius="md" className={styles.panel}>
        <Tabs
          value={params.view}
          onChange={(value) => setView((value ?? 'all') as CatalogViewKey)}
          keepMounted={false}
        >
          <Tabs.List className={styles.tabs}>
            {(Object.keys(CATALOG_VIEWS) as CatalogViewKey[]).map((key) => (
              <Tabs.Tab
                key={key}
                value={key}
                rightSection={
                  viewCounts[key] === undefined ? null : (
                    <Badge size="xs" variant="light" circle={false}>
                      {viewCounts[key]}
                    </Badge>
                  )
                }
              >
                {CATALOG_VIEWS[key].label}
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
            aria-label="Search products"
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

          <Select
            placeholder="Any category"
            aria-label="Filter by category"
            data={categories}
            value={params.categoryId || null}
            onChange={(value) => update({ category_id: value })}
            clearable
            searchable
            w={190}
            nothingFoundMessage="No categories yet"
          />

          <Select
            placeholder="Any stock level"
            aria-label="Filter by stock level"
            data={[
              { value: 'in_stock', label: 'In stock' },
              { value: 'low_stock', label: 'Low stock' },
              { value: 'out_of_stock', label: 'Out of stock' },
              { value: 'not_tracked', label: 'Not tracked' }
            ]}
            value={params.stockStatus || null}
            onChange={(value) => update({ stock_status: value })}
            clearable
            w={160}
          />

          <Select
            placeholder="Any issue"
            aria-label="Filter by listing issue"
            data={[
              { value: 'missing_image', label: 'No image' },
              { value: 'missing_description', label: 'No description' },
              { value: 'missing_price', label: 'No price' },
              { value: 'missing_cost', label: 'No cost' },
              { value: 'missing_category', label: 'No category' },
              { value: 'missing_seo', label: 'No SEO' },
              { value: 'negative_margin', label: 'Priced below cost' }
            ]}
            value={params.issue || null}
            onChange={(value) => update({ issue: value })}
            clearable
            w={175}
          />

          {hasFilters && (
            <Button variant="subtle" size="compact-sm" onClick={clearFilters} leftSection={<IconX size={14} />}>
              Clear filters
            </Button>
          )}

          <div className={styles.spacer} />

          {/* The row count a merchant needs to know whether the filter did what they meant.
              Rendered even while refreshing, so the number never disappears mid-interaction. */}
          <Text size="sm" c="dimmed" className={styles.count}>
            {total === 0 ? 'No products' : `${showingFrom}–${showingTo} of ${total.toLocaleString()}`}
          </Text>

          <Select
            aria-label="Products per page"
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
            title="Could not load products"
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
          <TableSkeleton rows={8} columns={8} />
        ) : /*
             * `!error` matters: without it a failed load rendered the error banner and the
             * "you have nothing" empty state in the same viewport — "Could not load products /
             * Database connection lost / Try again" directly above "No products yet — add a
             * product by hand" with a call to action. A merchant with a transient database blip
             * was being told their catalogue was empty.
             */
          !error && rows.length === 0 ? (
          <EmptyState
            title={hasFilters || params.view !== 'all' ? 'Nothing matches that' : 'No products yet'}
            description={
              hasFilters || params.view !== 'all'
                ? 'Try a different view, or clear the filters to see the whole catalogue.'
                : 'Sync your ShipStation catalogue, or add a product by hand.'
            }
            action={
              hasFilters || params.view !== 'all' ? (
                <Button variant="default" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button component={Link} href="/admin/products/new" leftSection={<IconPlus size={16} />}>
                  Add product
                </Button>
              )
            }
          />
        ) : (
          /* A scroll container, because eight columns do not fit a phone. Without it the whole
             document scrolls sideways and takes the nav and the header with it. */
          <Table.ScrollContainer minWidth={1000}>
            <Table
              highlightOnHover
              verticalSpacing="sm"
              className={refreshing ? styles.refreshing : undefined}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={togglePage}
                      aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    />
                  </Table.Th>
                  <SortableTh column="name" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort}>
                    Product
                  </SortableTh>
                  <SortableTh column="stock" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort} numeric width={120}>
                    Stock
                  </SortableTh>
                  <SortableTh column="price" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort} numeric width={110}>
                    Price
                  </SortableTh>
                  <SortableTh column="cost" activeColumn={params.sortBy} direction={params.sortOrder} onSort={toggleSort} numeric width={100}>
                    Cost
                  </SortableTh>
                  <SortableTh
                    column="margin"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={90}
                    hint="Margin on the price a shopper pays, against the recorded cost"
                  >
                    Margin
                  </SortableTh>
                  <SortableTh
                    column="units_sold"
                    activeColumn={params.sortBy}
                    direction={params.sortOrder}
                    onSort={toggleSort}
                    numeric
                    width={110}
                    hint="Units sold in the last 90 days, and lifetime revenue"
                  >
                    Sold 90d
                  </SortableTh>
                  <Table.Th w={44}>
                    <span className={styles.srOnly}>Actions</span>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {rows.map((row, index) => (
                  <Table.Tr key={row.id} data-selected={selected.has(row.id) || undefined}>
                    <Table.Td>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        /* Named, so a screen-reader user hears which product they are selecting
                           rather than "checkbox" twenty-five times. */
                        aria-label={`Select ${row.name}`}
                      />
                    </Table.Td>

                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <div className={styles.thumb}>
                          {row.featured_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.featured_image_url} alt="" loading="lazy" />
                          ) : (
                            <span className={styles.noImage}>
                              {/* A crossed-out photo, not a crossed-out eye. In a grid that also
                                  shows Draft and Archived, the universal "hidden" glyph read as
                                  "this product is hidden" — and its only clarification was a
                                  native title on a non-focusable span, invisible to keyboard users
                                  and unreliable for screen readers. */}
                              <IconPhotoOff size={14} aria-hidden="true" />
                              <span className={styles.srOnly}>No image</span>
                            </span>
                          )}
                        </div>
                        <div className={styles.identity}>
                          <Link href={`/admin/products/${row.id}`} className={styles.name}>
                            {row.name}
                          </Link>
                          <Group gap={6}>
                            <span className={table.code}>{row.sku}</span>
                            {row.status !== 'active' && (
                              <Badge size="xs" variant="light" color={row.status === 'draft' ? 'gray' : 'orange'}>
                                {row.status === 'draft' ? 'Draft' : 'Archived'}
                              </Badge>
                            )}
                            {row.completeness_score < 8 && (
                              <Tooltip label={`${8 - row.completeness_score} listing fields still empty`}>
                                <Badge size="xs" variant="light" color="yellow">
                                  {row.completeness_score}/8
                                </Badge>
                              </Tooltip>
                            )}
                          </Group>
                        </div>
                      </Group>
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <div className={table.stacked}>
                        <span>{row.stock_quantity.toLocaleString()}</span>
                        {/* A dot and a word. Colour alone tells a colour-blind merchant nothing
                            and tells a screen reader nothing at all. */}
                        <span className={`${table.sub} ${styles.stockState}`} data-state={row.stock_status}>
                          <span className={styles.dot} aria-hidden="true" />
                          {STOCK_LABEL[row.stock_status]}
                          {row.days_of_cover !== null && row.days_of_cover < 30 && row.stock_quantity > 0
                            ? ` · ${Math.round(row.days_of_cover)}d left`
                            : ''}
                        </span>
                      </div>
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <InlineEdit
                        label={`Price for ${row.name}`}
                        value={row.base_price}
                        locked={row.field_locks?.includes('base_price')}
                        render={(value) => <Price value={Number(value)} />}
                        onCommit={(next) => saveField(row.id, { base_price: next ?? 0 })}
                        onMoveDown={() => focusCell(index + 1, 'price')}
                        cellKey="price"
                      />
                      {row.sale_price !== null && (
                        <div className={table.sub}>
                          on sale at <Price value={row.sale_price} />
                        </div>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <InlineEdit
                        label={`Cost for ${row.name}`}
                        value={row.cost_price}
                        placeholder="Not set"
                        render={(value) => <Price value={Number(value)} />}
                        onCommit={(next) => saveField(row.id, { cost_price: next })}
                        onMoveDown={() => focusCell(index + 1, 'cost')}
                        cellKey="cost"
                      />
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      {row.margin_percent === null ? (
                        /* Not "0%" or "100%": an unknown cost means an unknown margin, and a
                           fabricated figure here is one a merchant would price against. */
                        <Tooltip label="Record a cost to see the margin">
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        </Tooltip>
                      ) : (
                        <span className={styles.margin} data-low={row.margin_percent < 20 || undefined}>
                          {row.margin_percent < 20 && (
                            <IconAlertTriangle size={12} aria-hidden="true" />
                          )}
                          {row.margin_percent.toFixed(1)}%
                        </span>
                      )}
                    </Table.Td>

                    <Table.Td className={table.numeric}>
                      <div className={table.stacked}>
                        <span>{row.sales_data.units_90d.toLocaleString()}</span>
                        <span className={table.sub}>
                          <Price value={row.sales_data.total_revenue} /> all time
                        </span>
                      </div>
                    </Table.Td>

                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label={`Actions for ${row.name}`}>
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => router.push(`/admin/products/${row.id}`)}>
                            Edit
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconCopy size={14} />}
                            onClick={() => void duplicate(row)}
                          >
                            Duplicate
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconExternalLink size={14} />}
                            component="a"
                            href={`/store/${storeSlug}/product/${row.slug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View on storefront
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            onClick={() =>
                              void saveField(row.id, {
                                status: row.status === 'active' ? 'draft' : 'active'
                              })
                            }
                          >
                            {row.status === 'active' ? 'Unpublish' : 'Publish'}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => void remove(row)}
                          >
                            Delete
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

      <BulkBar
        selectedIds={[...selected]}
        allMatching={allMatching}
        totalMatching={total}
        categories={categories}
        onRun={runBulk}
        onSelectAllMatching={() => setAllMatching(true)}
        onClear={() => {
          setSelected(new Set());
          setAllMatching(false);
        }}
        onExport={() => void exportCsv(true)}
      />

      <ImportModal
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={load}
      />
    </Stack>
  );

  /**
   * Copy a product into a new draft.
   *
   * Duplicating is how merchants create their second through thousandth product, and it did not
   * exist. The copy is always a draft: a duplicate that went straight onto the storefront under a
   * near-identical name would be a merchandising accident.
   *
   * @param row - The product to copy.
   */
  async function duplicate(row: CatalogRow) {
    try {
      const detail = await authFetch(`/api/admin/products/${row.id}`);
      const source = detail.data.product;
      const created = await authFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          ...source,
          id: undefined,
          name: `${source.name} (copy)`,
          sku: `${source.sku}-COPY`,
          /* Lets the server pick `-COPY-2` when `-COPY` is taken. Without it, duplicating the same
           * product a second time always failed with a conflict on a SKU the merchant never
           * chose — and duplicating is how a merchant creates their second through thousandth
           * product. */
          unique_sku: true,
          slug: undefined,
          status: 'draft',
          stock_quantity: 0
        })
      });
      notifications.show({
        title: 'Duplicated',
        message: `Created "${created.data.product.name}" as a draft.`,
        color: 'green'
      });
      router.push(`/admin/products/${created.data.product.id}`);
    } catch (caught) {
      notifications.show({
        title: 'Could not duplicate',
        message: caught instanceof Error ? caught.message : 'Something went wrong',
        color: 'red'
      });
    }
  }

  /**
   * Delete a product, or archive it when it has order history.
   *
   * @param row - The product to remove.
   */
  async function remove(row: CatalogRow) {
    if (!window.confirm(`Delete "${row.name}"? Products with order history are archived instead.`)) {
      return;
    }
    try {
      const payload = await authFetch(`/api/admin/products/${row.id}`, { method: 'DELETE' });
      notifications.show({
        title: payload.data.archived ? 'Archived' : 'Deleted',
        message: payload.data.message,
        color: 'green',
        autoClose: 8000
      });
      await load();
    } catch (caught) {
      notifications.show({
        title: 'Could not delete',
        message: caught instanceof Error ? caught.message : 'Something went wrong',
        color: 'red'
      });
    }
  }
}

/**
 * Move focus to the same editable column one row down.
 *
 * Enter committing and advancing is what makes editing a column of prices feel like a spreadsheet
 * rather than forty separate interactions.
 *
 * @param rowIndex - The row to move to.
 * @param cell - Which column.
 */
function focusCell(rowIndex: number, cell: string, attempt = 0): void {
  /*
   * The cell button itself carries `data-cell`, so this is a direct hit rather than a descendant
   * search. It used to look for `[data-cell] button` because the attribute was being passed to a
   * component that did not forward it, so it matched nothing at all — and repricing a column by
   * keyboard cost 26 tab stops per row.
   *
   * Retried across a couple of frames because committing the edit re-renders the row being left,
   * and React can replace the cell that had focus after the first attempt lands. Three frames is
   * enough for the commit to settle and short enough that a genuinely absent row — the last one in
   * the grid — gives up without the merchant noticing.
   */
  const rows = document.querySelectorAll('tbody tr');
  const target = rows[rowIndex]?.querySelector<HTMLElement>(`[data-cell="${cell}"]`);

  if (!target) return;

  target.focus();

  if (document.activeElement !== target && attempt < 3) {
    requestAnimationFrame(() => focusCell(rowIndex, cell, attempt + 1));
  }
}

/** Turn the current view state into the filter object the bulk endpoint resolves server-side. */
function filterForApi(params: ReturnType<typeof useCatalogParams>['params']): Record<string, unknown> {
  const viewParams = CATALOG_VIEWS[params.view].params as Record<string, string>;
  return {
    search: params.search || undefined,
    category_id: params.categoryId || undefined,
    vendor: params.vendor || undefined,
    stock_status: params.stockStatus || viewParams.stock_status || undefined,
    issue: params.issue || viewParams.issue || undefined,
    min_price: params.minPrice ? Number(params.minPrice) : undefined,
    max_price: params.maxPrice ? Number(params.maxPrice) : undefined,
    is_active: viewParams.is_active === undefined ? undefined : viewParams.is_active === 'true'
  };
}
