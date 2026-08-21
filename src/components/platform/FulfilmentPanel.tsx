'use client';

import React from 'react';
import { Price } from '@/components/ui';
import { centsToNumber } from '@/lib/billing/money';
import { formatAgeHours, formatDurationHours } from './formatDuration';
import { conversionPct, formatPct } from './metricDelta';
import type { PlatformOverview, PlatformUnfulfilledBacklog } from './types';
import styles from './PlatformPanels.module.css';

export interface FulfilmentPanelProps {
  /** The overview's order block. */
  orders: PlatformOverview['orders'];
  /** Orders sitting unshipped for more than 48 hours, from `/api/platform/health`. */
  unfulfilledOver48h: number | null;
  /**
   * The same backlog with its money and its age, when the health endpoint reports them.
   *
   * `null` covers both "health is still loading" and "this deployment does not send the block", and
   * both render as a named absence rather than as `$0.00`.
   */
  unfulfilled?: PlatformUnfulfilledBacklog | null;
  /** The selected window, in days. */
  windowDays: number;
}

/**
 * How much of what was ordered actually shipped.
 *
 * The fulfilment rate is the platform's promise made measurable: merchants come here because their
 * ShipStation account already ships things, so a rate that slides is the first symptom of a broken
 * integration rather than a merchant's bad week. It is displayed with its two ingredients next to
 * it — shipped and received, all time — because a bare percentage cannot tell an operator whether
 * 80% means four orders out of five or forty thousand out of fifty.
 *
 * `avgHoursToShip` is `null` until enough orders have both timestamps. That renders as "not
 * measured yet", never as `0.0 hours`, which would be a claim of instantaneous fulfilment.
 *
 * The duration is formatted through the console's shared {@link formatDurationHours}, which is the
 * fix for a real inconsistency: this panel used to print `33.6 hours` while the merchant detail
 * screen printed `1.2 days` for the same measurement under a shorter label. Two units and two names
 * for one metric is how a reader concludes a console is quoting two different things.
 *
 * @param props - {@link FulfilmentPanelProps}
 * @returns The fulfilment summary.
 */
export function FulfilmentPanel({
  orders,
  unfulfilledOver48h,
  unfulfilled = null,
  windowDays,
}: FulfilmentPanelProps): React.ReactElement {
  /*
   * The API's all-time rate, not the window's one, and not a second division performed here.
   * `fulfillmentRatePct` is the WINDOW's rate (`shippedInWindow / receivedInWindow`) and this hero
   * is the all-time one; printing the window's percentage above the all-time counts would put two
   * unrelated numbers side by side and imply they were the same measurement. The fallback
   * division exists only for a deployment that predates `fulfillmentRateAllTimePct`, and
   * `conversionPct` returns `null` on a zero denominator, so a platform with no orders reads as an
   * em dash and a sentence, never as `0%` or `NaN%`.
   */
  const rate =
    orders.fulfillmentRateAllTimePct === undefined
      ? conversionPct(orders.shippedAllTime, orders.receivedAllTime)
      : orders.fulfillmentRateAllTimePct;

  return (
    <div className={styles.revenue}>
      <div className={styles.revenueHero}>
        <span className={styles.revenueHeroLabel}>Fulfilment rate · all time</span>
        <span className={styles.fulfilmentHeroValue}>{formatPct(rate)}</span>
        <span className={styles.deltaMuted}>
          {orders.receivedAllTime === 0
            ? 'No orders have been received yet'
            : `${orders.shippedAllTime.toLocaleString('en-US')} of ${orders.receivedAllTime.toLocaleString('en-US')} orders shipped`}
        </span>
      </div>

      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Received in last {windowDays} days</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>{orders.receivedInWindow.toLocaleString('en-US')}</span>
            {orders.cancelledInWindow === undefined ? null : (
              <span className={styles.factNote}>
                including {orders.cancelledInWindow.toLocaleString('en-US')} cancelled
              </span>
            )}
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Shipped in last {windowDays} days</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>{orders.shippedInWindow.toLocaleString('en-US')}</span>
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Delivered, all time</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>{orders.deliveredAllTime.toLocaleString('en-US')}</span>
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Average time to ship</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>
              {orders.avgHoursToShip === null
                ? 'Not measured yet'
                : formatDurationHours(orders.avgHoursToShip)}
            </span>
            {orders.avgHoursToShip === null ? null : (
              <span className={styles.factNote}>mean, order to dispatch</span>
            )}
          </dd>
        </div>

        <div className={styles.factRow}>
          <dt className={styles.factTerm}>Unshipped for over 48 hours</dt>
          <dd className={styles.factDefinition}>
            <span className={styles.factFigure}>
              {unfulfilledOver48h === null
                ? 'Health check unavailable'
                : unfulfilledOver48h.toLocaleString('en-US')}
            </span>
          </dd>
        </div>

        {/* The money behind that count. It was computed on every load and rendered nowhere, so
            learning it meant opening the alert cards and adding two amounts up by hand. */}
        {unfulfilled === null ? null : (
          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Value of that backlog</dt>
            <dd className={styles.factDefinition}>
              <Price value={centsToNumber(unfulfilled.totalCents)} size="sm" />
              {unfulfilled.oldestAgeHours === null ? null : (
                <span className={styles.factNote}>
                  oldest waiting {formatAgeHours(unfulfilled.oldestAgeHours)}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
