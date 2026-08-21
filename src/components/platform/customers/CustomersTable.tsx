'use client';

/**
 * The merchant table.
 *
 * This is the console's primary object list, so it is a real `<table>` with a
 * real header row: the eleven numeric columns only mean anything through their
 * association with the header that names them, and a grid of `<div>`s throws
 * that association away for every reader who is not looking at it.
 *
 * The store name is both the link into the merchant and the pinned column, and
 * the external-link icon at the far right is deliberately *not* the same
 * control — an operator clicking a store name wants the console's view of that
 * merchant, and an operator clicking the arrow wants to look at the shop the
 * way a customer would. Conflating them means one of the two jobs is always a
 * back button away.
 */

import React from 'react';
import Link from 'next/link';
import { Anchor, Table, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { Price } from '@/components/ui';
import { SortableColumn } from './SortableColumn';
import { CustomizationBadge, IntegrationBadge, StoreStateBadge } from './StoreBadges';
import { RelativeDate } from './RelativeDate';
import { centsToPrice, formatCents, formatCount, formatDate } from './format';
import type { CustomerSortKey, PlatformCustomerRow, SortDirection } from './types';
import styles from './customersTable.module.css';

export interface CustomersTableProps {
  /** The current page of merchants. */
  rows: PlatformCustomerRow[];
  /** The column the API sorted by. */
  sort: CustomerSortKey;
  /** The direction the API sorted in. */
  dir: SortDirection;
  /** Called when a column header is activated. */
  onSort: (column: CustomerSortKey, numeric: boolean) => void;
  /** Dims the rows during a refetch instead of blanking them. */
  refreshing?: boolean;
}

/**
 * Renders the paginated merchant table.
 *
 * @param props - {@link CustomersTableProps}
 * @returns A horizontally scrollable table with a pinned identity column.
 */
export function CustomersTable({
  rows,
  sort,
  dir,
  onSort,
  refreshing = false,
}: CustomersTableProps): React.ReactElement {
  return (
    <div className={styles.tableCard}>
      <div className={refreshing ? styles.refreshing : undefined} aria-busy={refreshing}>
        <Table.ScrollContainer minWidth={1240}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <SortableColumn
                  column="name"
                  activeColumn={sort}
                  direction={dir}
                  onSort={onSort}
                  sticky
                >
                  Store
                </SortableColumn>
                <Table.Th scope="col">Owner</Table.Th>
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
                    <Anchor
                      component={Link}
                      href={`/platform/customers/${row.storeId}`}
                      className={styles.storeName}
                    >
                      {row.storeName}
                    </Anchor>
                    <span className={styles.storeSlug}>/{row.storeSlug}</span>
                  </Table.Th>

                  <Table.Td>
                    <span className={styles.ownerName}>{row.ownerName || '—'}</span>
                    <span className={styles.ownerEmail}>{row.ownerEmail}</span>
                  </Table.Td>

                  <Table.Td>
                    <RelativeDate value={row.createdAt} className={styles.ownerName} />
                    <span className={styles.ownerEmail}>{formatDate(row.createdAt)}</span>
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
                      {/* Booked but unpaid sits under GMV rather than in a column
                          of its own: it is a qualifier on the number above it,
                          and it is only worth the reader's attention when it is
                          not zero. */}
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
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
    </div>
  );
}
