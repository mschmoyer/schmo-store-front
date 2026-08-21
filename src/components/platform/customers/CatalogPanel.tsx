'use client';

/**
 * One merchant's catalogue and the stock behind it.
 *
 * Inventory value is shown next to inventory units on purpose: a merchant with
 * 40,000 units and $900 of value has imported a catalogue with no cost prices,
 * which is a data problem an operator can fix, and neither figure says that on
 * its own. Out-of-stock and low-stock get a tone only when they are non-zero —
 * a zero painted amber teaches the reader to ignore the colour.
 */

import React from 'react';
import { Table } from '@mantine/core';
import { EmptyState, Price } from '@/components/ui';
import { Panel, Metrics } from './Panel';
import { centsToPrice, formatCount, NOT_SET } from './format';
import type { PlatformCatalogStats } from './types';
import styles from './detailTables.module.css';

export interface CatalogPanelProps {
  /** Catalogue counters and the top sellers. */
  catalog: PlatformCatalogStats;
}

/**
 * Renders the catalogue and inventory panel.
 *
 * @param props - {@link CatalogPanelProps}
 * @returns The catalogue panel.
 */
export function CatalogPanel({ catalog }: CatalogPanelProps): React.ReactElement {
  return (
    <Panel
      title="Catalogue and inventory"
      description={
        catalog.products === 0
          ? 'No products have been imported for this merchant.'
          : `${formatCount(catalog.activeProducts)} of ${formatCount(catalog.products)} products are active.`
      }
    >
      <Metrics
        items={[
          { label: 'Products', value: formatCount(catalog.products) },
          { label: 'Active', value: formatCount(catalog.activeProducts) },
          {
            label: 'Out of stock',
            value: formatCount(catalog.outOfStock),
            tone: catalog.outOfStock > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Low stock',
            value: formatCount(catalog.lowStock),
            tone: catalog.lowStock > 0 ? 'warning' : 'neutral',
          },
          { label: 'Inventory units', value: formatCount(catalog.inventoryUnits) },
          {
            label: 'Inventory value',
            value: <Price value={centsToPrice(catalog.inventoryValueCents)} size="lg" />,
            hint: 'At the price on file',
          },
        ]}
      />

      <div className={styles.tableBlock}>
        <h3 className={styles.subhead}>Top products by units sold</h3>

        {catalog.topProducts.length === 0 ? (
          <EmptyState
            compact
            title="Nothing sold yet"
            description="Once this merchant takes orders, their best sellers appear here."
          />
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Product</Table.Th>
                  <Table.Th scope="col">SKU</Table.Th>
                  <Table.Th scope="col" className={styles.numeric}>
                    Units sold
                  </Table.Th>
                  <Table.Th scope="col" className={styles.numeric}>
                    Revenue
                  </Table.Th>
                  <Table.Th scope="col" className={styles.numeric}>
                    In stock
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {catalog.topProducts.map((product) => (
                  <Table.Tr key={product.id}>
                    <Table.Th scope="row" className={styles.productName}>
                      {product.name}
                    </Table.Th>
                    <Table.Td>
                      <span className={styles.code}>{product.sku || NOT_SET}</span>
                    </Table.Td>
                    <Table.Td className={styles.numeric}>{formatCount(product.unitsSold)}</Table.Td>
                    <Table.Td className={styles.numeric}>
                      <Price value={centsToPrice(product.revenueCents)} size="sm" />
                    </Table.Td>
                    <Table.Td className={styles.numeric}>{formatCount(product.stock)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>
    </Panel>
  );
}
