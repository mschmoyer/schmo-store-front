'use client';

/**
 * The totals strip above the merchant table.
 *
 * These five figures are the API's aggregate over the **whole filtered set**,
 * not over the twenty-five rows on screen, and that distinction is the entire
 * reason the component exists. A number that says "$412,880" directly above a
 * page showing $9,140 of visible rows is a lie unless it says out loud what it
 * is counting — so the scope sentence is part of the component rather than
 * something each caller remembers to add, and it names the active filter and
 * the active search in words.
 */

import React from 'react';
import { IconClick, IconCoin, IconShoppingCart, IconTruck, IconUsers } from '@tabler/icons-react';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { centsToPrice, formatCents, formatCount } from './format';
import type { PlatformCustomerTotals } from './types';
import styles from './customerTotals.module.css';

export interface CustomerTotalsProps {
  /** Aggregates over every matching merchant. */
  totals: PlatformCustomerTotals;
  /** Plain-language name for the active filter, e.g. `merchants with no orders`. */
  scopeLabel: string;
  /** The active search term, if any. */
  query?: string;
}

/**
 * Renders the filtered-set totals with an explicit statement of their scope.
 *
 * @param props - {@link CustomerTotalsProps}
 * @returns The summary strip.
 */
export function CustomerTotals({
  totals,
  scopeLabel,
  query,
}: CustomerTotalsProps): React.ReactElement {
  const count = formatCount(totals.customers);

  return (
    <section className={styles.root} aria-labelledby="platform-customer-totals">
      <p className={styles.scope} id="platform-customer-totals">
        <span className={styles.scopeLead}>Totals across all {count}</span>{' '}
        <span className={styles.scopeFilter}>{scopeLabel}</span>
        {query ? (
          <>
            {' matching '}
            <span className={styles.scopeQuery}>&ldquo;{query}&rdquo;</span>
          </>
        ) : null}
        {' — not just this page.'}
      </p>

      <StatGrid min={168}>
        <StatCard
          label="Merchants"
          value={totals.customers}
          icon={<IconUsers size={16} />}
          meta="Matching the current view"
        />
        <StatCard
          label="Orders received"
          value={totals.orders}
          icon={<IconShoppingCart size={16} />}
          meta="All time"
        />
        <StatCard
          label="Orders shipped"
          value={totals.shipped}
          icon={<IconTruck size={16} />}
          meta={
            totals.orders > 0
              ? `${Math.round((totals.shipped / totals.orders) * 100)}% of orders received`
              : 'Nothing received yet'
          }
        />
        <StatCard
          label="GMV"
          value={centsToPrice(totals.gmvCents)}
          format="currency"
          icon={<IconCoin size={16} />}
          /* Paid orders only. The unpaid remainder is named rather than
             dropped: GMV and unsettled together account for every order that
             was not cancelled, and an operator reading one without the other
             is reading a smaller number than the merchants booked. */
          meta={
            totals.unsettledCents > 0
              ? `Paid orders. ${formatCents(totals.unsettledCents)} booked but unpaid.`
              : 'Paid orders, cancellations excluded'
          }
        />
        <StatCard
          label="Storefront clicks"
          value={totals.clicks}
          icon={<IconClick size={16} />}
          meta="All tracked events, all time"
        />
      </StatGrid>
    </section>
  );
}
