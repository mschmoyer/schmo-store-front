'use client';

import React from 'react';
import { Price } from '@/components/ui';
import { centsToNumber } from '@/lib/billing/money';
import { conversionPct, formatPct } from './metricDelta';
import { MetricDelta } from './MetricDelta';
import type { PlatformOverview } from './types';
import styles from './PlatformPanels.module.css';

export interface RevenuePanelProps {
  /** The overview's money block, in integer cents. */
  revenue: PlatformOverview['revenue'];
  /** The overview's order block — for average order value and volume. */
  orders: PlatformOverview['orders'];
  /** The selected window, in days. */
  windowDays: number;
}

/**
 * Gross merchandise value across every tenant.
 *
 * **Every figure here arrives as integer cents and stays integer cents.** The only conversion is
 * `centsToNumber` at the moment of rendering, inside `Price`; nothing in this component adds,
 * subtracts or averages a dollar amount. The refund share is a ratio of two cent figures, which is
 * dimensionless and therefore safe.
 *
 * Refunds carry inverted polarity: a fall is good news. That is why the delta component takes a
 * polarity rather than inferring one from the sign — the same red arrow means opposite things two
 * rows apart on this panel.
 *
 * @param props - {@link RevenuePanelProps}
 * @returns The revenue summary.
 */
export function RevenuePanel({ revenue, orders, windowDays }: RevenuePanelProps): React.ReactElement {
  const periodLabel = `previous ${windowDays} days`;
  const refundShare = conversionPct(revenue.refundedCentsInWindow, revenue.gmvCentsInWindow);

  return (
    <div className={styles.revenue}>
      <div className={styles.revenueHero}>
        <span className={styles.revenueHeroLabel}>Gross merchandise value · last {windowDays} days</span>
        <Price value={centsToNumber(revenue.gmvCentsInWindow)} size="xl" className={styles.revenueHeroValue} />
        <MetricDelta
          current={revenue.gmvCentsInWindow}
          previous={revenue.gmvCentsPrevWindow}
          periodLabel={periodLabel}
        />
      </div>

      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factTerm}>GMV, all time</dt>
          <dd className={styles.factDefinition}>
            <Price value={centsToNumber(revenue.gmvCentsAllTime)} size="sm" />
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Average order value</dt>
          <dd className={styles.factDefinition}>
            <Price value={centsToNumber(orders.avgOrderValueCents)} size="sm" />
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Refunded in window</dt>
          <dd className={styles.factDefinition}>
            <Price value={centsToNumber(revenue.refundedCentsInWindow)} size="sm" />
            <span className={styles.factNote}>
              {refundShare === null ? 'no GMV to compare against' : `${formatPct(refundShare)} of GMV`}
            </span>
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Units sold in window</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>
              {revenue.unitsSoldInWindow.toLocaleString('en-US')}
            </span>
          </dd>
        </div>

      </dl>
    </div>
  );
}
