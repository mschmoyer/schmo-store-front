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
  /** Whether the preceding window was observed, from `overview.comparison.measured`. */
  baselineMeasured?: boolean;
}

/**
 * Gross merchandise value across every tenant.
 *
 * **Every figure here arrives as integer cents and stays integer cents.** The only conversion is
 * `centsToNumber` at the moment of rendering, inside `Price`; nothing in this component adds,
 * subtracts or averages a dollar amount.
 *
 * ## The refund share was a ratio of two disjoint sets
 *
 * This panel used to render "Refunded in window · 12% of GMV". It was arithmetic on numbers that do
 * not belong in the same fraction. GMV is **settled** orders — not cancelled, actually paid — and
 * every dollar in that refund figure sat on an order that *was* cancelled. The two sets were
 * disjoint by construction, so the percentage described nothing: it invited a reader to subtract
 * money from a total that never contained it, which is exactly the mistake the settled/unsettled
 * split elsewhere in this codebase exists to prevent.
 *
 * The API now publishes the refund as two figures rather than one, and the panel renders both under
 * labels that say which is which. **Only the settled figure may be netted against GMV**, and it is
 * the only one shown as a share of it; the cancelled figure is real money out of the business whose
 * value GMV never held, and it is shown as an amount and nothing else. Two honest numbers beat one
 * plausible ratio.
 *
 * Refunds carry inverted polarity: a fall is good news. That is why the delta component takes a
 * polarity rather than inferring one from the sign — the same red arrow means opposite things two
 * rows apart on this panel.
 *
 * @param props - {@link RevenuePanelProps}
 * @returns The revenue summary.
 */
export function RevenuePanel({
  revenue,
  orders,
  windowDays,
  baselineMeasured,
}: RevenuePanelProps): React.ReactElement {
  const periodLabel = `previous ${windowDays} days`;

  /* `refundedCentsInWindow` is the contract alias for the settled figure. Reading the explicit name
     when the API sends it keeps the two impossible to confuse at a glance. */
  const refundedSettled = revenue.refundedSettledCentsInWindow ?? revenue.refundedCentsInWindow;
  const refundedCancelled = revenue.refundedCancelledCentsInWindow;
  const settledShare = conversionPct(refundedSettled, revenue.gmvCentsInWindow);

  return (
    <div className={styles.revenue}>
      <div className={styles.revenueHero}>
        <span className={styles.revenueHeroLabel}>
          Gross merchandise value · settled orders · last {windowDays} days
        </span>
        <Price value={centsToNumber(revenue.gmvCentsInWindow)} size="xl" className={styles.revenueHeroValue} />
        <MetricDelta
          current={revenue.gmvCentsInWindow}
          previous={revenue.gmvCentsPrevWindow}
          baselineMeasured={baselineMeasured}
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
            {orders.avgOrderValueCents === null ? (
              <span className={styles.factFigure}>Not measured</span>
            ) : (
              <Price value={centsToNumber(orders.avgOrderValueCents)} size="sm" />
            )}
            <span className={styles.factNote}>
              {orders.avgOrderValueCents === null
                ? 'no order settled in this window'
                : orders.settledInWindow === undefined
                  ? 'over settled orders'
                  : `over ${orders.settledInWindow.toLocaleString('en-US')} settled order${orders.settledInWindow === 1 ? '' : 's'}`}
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

        {revenue.gmvUnsettledCentsInWindow === undefined ? null : (
          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Booked but never paid</dt>
            <dd className={styles.factDefinition}>
              <Price value={centsToNumber(revenue.gmvUnsettledCentsInWindow)} size="sm" />
              <span className={styles.factNote}>a checkout or capture problem, not a slow month</span>
            </dd>
          </div>
        )}

        {revenue.gmvCancelledCentsInWindow === undefined ? null : (
          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Cancelled in window</dt>
            <dd className={styles.factDefinition}>
              <Price value={centsToNumber(revenue.gmvCancelledCentsInWindow)} size="sm" />
              <span className={styles.factNote}>never part of GMV</span>
            </dd>
          </div>
        )}

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Refunded on settled orders</dt>
          <dd className={styles.factDefinition}>
            <Price value={centsToNumber(refundedSettled)} size="sm" />
            <span className={styles.factNote}>
              {settledShare === null
                ? 'no GMV to compare against'
                : `${formatPct(settledShare)} of GMV — the only refund figure GMV may be netted against`}
            </span>
          </dd>
        </div>

        {refundedCancelled === undefined ? null : (
          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Refunded on cancelled orders</dt>
            <dd className={styles.factDefinition}>
              <Price value={centsToNumber(refundedCancelled)} size="sm" />
              <span className={styles.factNote}>
                money out of the business, of value GMV never held
              </span>
            </dd>
          </div>
        )}

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Refunds vs the period before</dt>
          <dd className={styles.factDefinition}>
            <MetricDelta
              current={refundedSettled}
              previous={
                revenue.refundedSettledCentsPrevWindow ?? revenue.refundedCentsPrevWindow ?? null
              }
              polarity="down-is-good"
              baselineMeasured={baselineMeasured}
              periodLabel={periodLabel}
            />
          </dd>
        </div>
      </dl>

      <p className={styles.panelFootnote}>
        GMV counts settled orders only — not cancelled, and actually paid. Refunds are split because
        one figure cannot answer both questions: refunds on settled orders came out of the money
        above, and refunds on cancelled orders are real money returned whose value GMV never
        contained. Adding the two and calling the sum a share of GMV is the reading this split
        exists to prevent.
      </p>
    </div>
  );
}
