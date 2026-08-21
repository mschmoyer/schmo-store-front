'use client';

/**
 * The merchant list.
 *
 * This is the console's primary object list, so on a wide viewport it is a real `<table>` with a
 * real header row: the numeric columns only mean anything through their association with the header
 * that names them, and a grid of `<div>`s throws that association away for every reader who is not
 * looking at it. The table carries a `<caption>` — the one element whose job is to say what a table
 * is — and it doubles as the place the horizontal-scroll behaviour is explained in words.
 *
 * The store name is both the link into the merchant and the pinned column, and the external-link
 * icon at the far right is deliberately *not* the same control — an operator clicking a store name
 * wants the console's view of that merchant, and an operator clicking the arrow wants to look at the
 * shop the way a customer would. Conflating them means one of the two jobs is always a back button
 * away.
 *
 * ## Three fixes for a table that did not survive its own widths
 *
 * The measured intrinsic width was 1,320px inside a ~1,120px content column at a 1440px viewport.
 * Clicks was cut through the middle of a number; Products and the storefront link were off-screen;
 * nothing on the page said so. At 390px it was two and a half columns and roughly 900px of
 * horizontal scroll in an unmarked container.
 *
 * 1. **The owner moved under the store name.** Owner was a whole column carrying a name and an
 *    address that both belong to the row's subject, and the subject already has a column. Folding
 *    it in removes ~180px of the overflow rather than hiding it behind a scrollbar.
 * 2. **The scroll has an affordance.** A fade and an edge appear on whichever side has content
 *    beyond it, and only while there is something there — see {@link useScrollEdges}. The caption
 *    says the same thing in words for anyone the fade does not reach.
 * 3. **Below 700px it is not a table.** Two and a half columns of an eleven-column table is not a
 *    degraded table, it is an unusable one. The narrow layout is a list of cards, each a complete
 *    merchant, with the sort control that lived in the header row promoted to its own field —
 *    otherwise sorting simply disappears on a phone.
 */

import React from 'react';
import Link from 'next/link';
import { Anchor, Group, Select, Table, Tooltip, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconExternalLink } from '@tabler/icons-react';
import { Price } from '@/components/ui';
import { SortableColumn } from './SortableColumn';
import { CustomizationBadge, IntegrationBadge, StoreStateBadge } from './StoreBadges';
import { EmailAddress } from './EmailAddress';
import { RelativeDate } from './RelativeDate';
import { useScrollEdges } from './useScrollEdges';
import { centsToPrice, formatCents, formatCount } from './format';
import type { CustomerSortKey, PlatformCustomerRow, SortDirection } from './types';
import styles from './customersTable.module.css';

/**
 * Below this width the table becomes a list of cards.
 *
 * 700px is where the pinned identity column plus one data column stops leaving enough room for the
 * data column to be worth reading.
 */
const CARD_BREAKPOINT = 700;

/** The sortable columns, with the labels the narrow layout's sort field offers. */
const SORT_OPTIONS: ReadonlyArray<{ value: CustomerSortKey; label: string; numeric: boolean }> = [
  { value: 'created', label: 'Joined', numeric: true },
  { value: 'name', label: 'Store name', numeric: false },
  { value: 'orders', label: 'Orders', numeric: true },
  { value: 'shipped', label: 'Shipped', numeric: true },
  { value: 'gmv', label: 'GMV', numeric: true },
  { value: 'clicks', label: 'Clicks', numeric: true },
  { value: 'products', label: 'Products', numeric: true },
];

export interface CustomersTableProps {
  /** The current page of merchants. */
  rows: PlatformCustomerRow[];
  /** The column the API sorted by. */
  sort: CustomerSortKey;
  /** The direction the API sorted in. */
  dir: SortDirection;
  /** Called when a column header, or the narrow layout's sort field, is activated. */
  onSort: (column: CustomerSortKey, numeric: boolean) => void;
  /** Dims the rows during a refetch instead of blanking them. */
  refreshing?: boolean;
}

/**
 * The merchant's identity block: name, slug, owner. Shared by both layouts so the two cannot
 * describe the same merchant differently.
 *
 * @param props.row - The merchant.
 * @returns The identity block.
 */
function StoreIdentity({ row }: { row: PlatformCustomerRow }): React.ReactElement {
  return (
    <>
      <Anchor
        component={Link}
        href={`/platform/customers/${row.storeId}`}
        className={styles.storeName}
      >
        {row.storeName}
      </Anchor>
      <span className={styles.storeSlug}>/{row.storeSlug}</span>
      <span className={styles.ownerLine}>
        <span className={styles.ownerName}>{row.ownerName || 'Unnamed owner'}</span>
        <EmailAddress address={row.ownerEmail} className={styles.ownerEmail} />
      </span>
    </>
  );
}

/**
 * The link out to the public storefront.
 *
 * @param props.row - The merchant.
 * @returns An external link with an accessible name that says which store it opens.
 */
function StorefrontLink({ row }: { row: PlatformCustomerRow }): React.ReactElement {
  return (
    <Tooltip label={`Open ${row.storeName} in a new tab`} withArrow>
      <a
        className={styles.openLink}
        href={row.storeUrl || `/store/${row.storeSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open the ${row.storeName} storefront in a new tab`}
      >
        <IconExternalLink size={16} aria-hidden="true" />
      </a>
    </Tooltip>
  );
}

/**
 * The sort control for the narrow layout.
 *
 * The wide layout sorts from its column headers. Those headers do not exist below the card
 * breakpoint, and a list that silently loses its sort on a phone is a list an operator cannot use
 * away from a desk — so the same two decisions (which column, which direction) get a field and a
 * button.
 *
 * @param props.sort - The active column.
 * @param props.dir - The active direction.
 * @param props.onSort - Applies a new sort. Called with the column and whether it is numeric, so a
 *   first touch on a count sorts high-to-low exactly as it does in the header row.
 * @returns The sort field and direction toggle.
 */
function CardSortControl({
  sort,
  dir,
  onSort,
}: {
  sort: CustomerSortKey;
  dir: SortDirection;
  onSort: CustomersTableProps['onSort'];
}): React.ReactElement {
  const active = SORT_OPTIONS.find((option) => option.value === sort) ?? SORT_OPTIONS[0];
  const Arrow = dir === 'asc' ? IconArrowUp : IconArrowDown;

  return (
    <Group gap="xs" align="flex-end" className={styles.cardSort}>
      <Select
        size="xs"
        label="Sort by"
        allowDeselect={false}
        value={sort}
        data={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        onChange={(value) => {
          const chosen = SORT_OPTIONS.find((option) => option.value === value);
          if (chosen) onSort(chosen.value, chosen.numeric);
        }}
        className={styles.cardSortField}
      />
      <UnstyledButton
        className={styles.cardSortDirection}
        onClick={() => onSort(active.value, active.numeric)}
        aria-label={`Sorted ${dir === 'asc' ? 'ascending' : 'descending'} by ${active.label}. Activate to reverse.`}
      >
        <Arrow size={15} stroke={1.9} aria-hidden="true" />
        <span>{dir === 'asc' ? 'Ascending' : 'Descending'}</span>
      </UnstyledButton>
    </Group>
  );
}

/**
 * One merchant as a card, for viewports too narrow for a table.
 *
 * @param props.row - The merchant.
 * @returns The card.
 */
function MerchantCard({ row }: { row: PlatformCustomerRow }): React.ReactElement {
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardIdentity}>
          <StoreIdentity row={row} />
        </div>
        <StorefrontLink row={row} />
      </div>

      <div className={styles.cardBadges}>
        <StoreStateBadge isActive={row.isActive} isPublic={row.isPublic} />
        <IntegrationBadge
          label="ShipStation"
          connected={row.integrations.shipstation}
          status={row.integrations.syncStatus}
        />
        <IntegrationBadge label="Stripe" connected={row.integrations.stripe} />
        <CustomizationBadge customized={row.customized} themeStatus={row.themeStatus} />
      </div>

      <dl className={styles.cardFacts}>
        <div className={styles.cardFact}>
          <dt>Joined</dt>
          <dd>
            <RelativeDate value={row.createdAt} withAbsolute />
          </dd>
        </div>
        <div className={styles.cardFact}>
          <dt>Orders</dt>
          <dd>
            {formatCount(row.orders.received)}
            <span className={styles.sub}>{formatCount(row.orders.last30d)} in 30d</span>
          </dd>
        </div>
        <div className={styles.cardFact}>
          <dt>Shipped</dt>
          <dd>{formatCount(row.orders.shipped)}</dd>
        </div>
        <div className={styles.cardFact}>
          <dt>GMV</dt>
          <dd>
            <Price value={centsToPrice(row.gmvCents)} size="sm" />
            {row.unsettledCents > 0 ? (
              <span className={styles.unsettled}>{formatCents(row.unsettledCents)} unpaid</span>
            ) : null}
          </dd>
        </div>
        <div className={styles.cardFact}>
          <dt>Clicks</dt>
          <dd>
            {formatCount(row.clicks.allTime)}
            <span className={styles.sub}>{formatCount(row.clicks.last30d)} in 30d</span>
          </dd>
        </div>
        <div className={styles.cardFact}>
          <dt>Products</dt>
          <dd>
            {formatCount(row.products)}
            <span className={styles.sub}>{formatCount(row.inventoryUnits)} units</span>
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * Renders the paginated merchant list: a table on a wide viewport, cards on a narrow one.
 *
 * @param props - {@link CustomersTableProps}
 * @returns The list, with a pinned identity column and a scroll affordance in table form.
 */
export function CustomersTable({
  rows,
  sort,
  dir,
  onSort,
  refreshing = false,
}: CustomersTableProps): React.ReactElement {
  /* `getInitialValueInEffect` keeps the server render and the first client render identical; the
     layout resolves on the first effect. Desktop-first while unknown, because the table is the
     richer layout and the one a wide viewport will keep. */
  const narrow = useMediaQuery(`(max-width: ${CARD_BREAKPOINT}px)`, false, {
    getInitialValueInEffect: true,
  });

  const { ref: scrollRef, edges } = useScrollEdges<HTMLDivElement>();

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Joined';
  const caption =
    `${rows.length.toLocaleString('en-US')} merchant${rows.length === 1 ? '' : 's'} on this page, ` +
    `sorted by ${sortLabel.toLowerCase()}, ${dir === 'asc' ? 'ascending' : 'descending'}.`;

  if (narrow) {
    return (
      <div className={styles.cardsCard}>
        <CardSortControl sort={sort} dir={dir} onSort={onSort} />
        <ul
          className={`${styles.cards} ${refreshing ? styles.refreshing : ''}`}
          aria-busy={refreshing}
          aria-label={caption}
        >
          {rows.map((row) => (
            <MerchantCard key={row.storeId} row={row} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.tableCard}>
      <div className={refreshing ? styles.refreshing : undefined} aria-busy={refreshing}>
        <div
          className={styles.scrollFrame}
          data-scrollable={edges.scrollable ? 'true' : undefined}
          data-at-start={edges.atStart ? 'true' : undefined}
          data-at-end={edges.atEnd ? 'true' : undefined}
        >
          <Table.ScrollContainer minWidth={1120} type="native" ref={scrollRef}>
            <Table highlightOnHover verticalSpacing="sm" captionSide="top">
              <Table.Caption className={styles.caption}>
                {caption}
                {edges.scrollable ? ' Scroll sideways for the remaining columns.' : ''}
              </Table.Caption>

              <Table.Thead>
                <Table.Tr>
                  <SortableColumn
                    column="name"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    sticky
                  >
                    Store and owner
                  </SortableColumn>
                  <SortableColumn column="created" activeColumn={sort} direction={dir} onSort={onSort}>
                    Joined
                  </SortableColumn>
                  <Table.Th scope="col">State</Table.Th>
                  <Table.Th scope="col">Integrations</Table.Th>
                  <Table.Th scope="col">Theme</Table.Th>
                  <SortableColumn
                    column="orders"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    numeric
                    hint="Orders received all time, with the last 30 days underneath"
                  >
                    Orders
                  </SortableColumn>
                  <SortableColumn
                    column="shipped"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    numeric
                    hint="Orders dispatched all time"
                  >
                    Shipped
                  </SortableColumn>
                  <SortableColumn
                    column="gmv"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    numeric
                    hint="Gross merchandise value, cancellations excluded"
                  >
                    GMV
                  </SortableColumn>
                  <SortableColumn
                    column="clicks"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    numeric
                    hint="Storefront events all time, with the last 30 days underneath"
                  >
                    Clicks
                  </SortableColumn>
                  <SortableColumn
                    column="products"
                    activeColumn={sort}
                    direction={dir}
                    onSort={onSort}
                    numeric
                    hint="Products in the catalogue, with inventory units underneath"
                  >
                    Products
                  </SortableColumn>
                  <Table.Th scope="col" className={styles.numeric}>
                    <span className={styles.srOnly}>Open storefront</span>
                    <span aria-hidden="true">Shop</span>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.storeId}>
                    <Table.Th scope="row" className={styles.stickyCell}>
                      <StoreIdentity row={row} />
                    </Table.Th>

                    <Table.Td className={styles.dateCell}>
                      <RelativeDate value={row.createdAt} withAbsolute />
                    </Table.Td>

                    <Table.Td>
                      <StoreStateBadge isActive={row.isActive} isPublic={row.isPublic} />
                    </Table.Td>

                    <Table.Td>
                      <div className={styles.badgeStack}>
                        <IntegrationBadge
                          label="ShipStation"
                          connected={row.integrations.shipstation}
                          status={row.integrations.syncStatus}
                        />
                        <IntegrationBadge label="Stripe" connected={row.integrations.stripe} />
                      </div>
                    </Table.Td>

                    <Table.Td>
                      <CustomizationBadge
                        customized={row.customized}
                        themeStatus={row.themeStatus}
                      />
                    </Table.Td>

                    <Table.Td className={styles.numeric}>
                      <div className={styles.stacked}>
                        <span>{formatCount(row.orders.received)}</span>
                        <span className={styles.sub}>{formatCount(row.orders.last30d)} in 30d</span>
                      </div>
                    </Table.Td>

                    <Table.Td className={styles.numeric}>{formatCount(row.orders.shipped)}</Table.Td>

                    <Table.Td className={styles.numeric}>
                      <div className={styles.stacked}>
                        <Price value={centsToPrice(row.gmvCents)} size="sm" />
                        {/* Booked but unpaid sits under GMV rather than in a column of its own:
                            it is a qualifier on the number above it, and it is only worth the
                            reader's attention when it is not zero. */}
                        {row.unsettledCents > 0 ? (
                          <span className={styles.unsettled}>
                            {formatCents(row.unsettledCents)} unpaid
                          </span>
                        ) : null}
                      </div>
                    </Table.Td>

                    <Table.Td className={styles.numeric}>
                      <div className={styles.stacked}>
                        <span>{formatCount(row.clicks.allTime)}</span>
                        <span className={styles.sub}>{formatCount(row.clicks.last30d)} in 30d</span>
                      </div>
                    </Table.Td>

                    <Table.Td className={styles.numeric}>
                      <div className={styles.stacked}>
                        <span>{formatCount(row.products)}</span>
                        <span className={styles.sub}>{formatCount(row.inventoryUnits)} units</span>
                      </div>
                    </Table.Td>

                    <Table.Td className={styles.numeric}>
                      <StorefrontLink row={row} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </div>
      </div>
    </div>
  );
}
