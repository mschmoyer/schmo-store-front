'use client';

/**
 * What needs an operator, at the top of the console.
 *
 * ## Why this is the first thing on the page
 *
 * The overview used to open with six equal-weight KPI cards and two charts, and put the CRITICAL
 * alerts roughly 1,600px down a 2,952px page. That is the information hierarchy of a report, not of
 * a console. An operator's morning question is not "what is GMV" — it is "is anything on fire, and
 * whose". Merchants' customers are waiting on the orders named here; the KPI strip can wait a
 * screen.
 *
 * ## The money was computed and hidden
 *
 * `health.unfulfilled` carries `totalCents`, `oldestAgeHours` and a per-store breakdown, and none
 * of it reached a screen. The console rendered "Unshipped for over 48 hours: 4" and left an
 * operator to open two alert cards and add up two dollar amounts by hand to learn that the number
 * behind the 4 was $898.04. A count is a workload; the money is the exposure, and the exposure is
 * what decides whether this is today's problem or this week's.
 *
 * ## Where an alert sends you
 *
 * Each alert links to its own `href` — the store the API says the alert is about. Alerts for a
 * store that also has a stuck backlog get a **second, explicitly labelled** action into that
 * store's order list. The console deliberately does not re-point the primary link by guessing what
 * an alert is about: a failing-sync alert and an unshipped-orders alert are both `critical` and
 * both name a store, so inferring "this one is about orders" from severity would silently send an
 * operator chasing a sync failure into a list of orders. Until `PlatformAlert` carries a `kind`,
 * two labelled doors are the honest construction.
 */

import React from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconInfoCircle,
  IconPackageOff,
  IconXboxX,
} from '@tabler/icons-react';
import { Price } from '@/components/ui';
import { centsToNumber } from '@/lib/billing/money';
import { formatAgeHours } from './formatDuration';
import { storeOrdersHref, UNSHIPPED_ORDER_STATUS } from './drillThrough';
import type { PlatformHealth, PlatformHealthAlert, PlatformUnfulfilledStore } from './types';
import styles from './PlatformPanels.module.css';

const MARK = { size: 16, stroke: 1.8 } as const;

export interface AttentionPanelProps {
  /** The `/api/platform/health` payload. */
  health: PlatformHealth;
}

/**
 * Picks the mark for an alert's severity.
 *
 * @param severity - The alert's severity.
 * @returns A Tabler icon component.
 */
function severityIcon(severity: PlatformHealthAlert['severity']) {
  if (severity === 'critical') return IconXboxX;
  if (severity === 'warning') return IconAlertTriangle;
  return IconInfoCircle;
}

/**
 * Resolves where an alert's primary action should go.
 *
 * @param alert - The alert.
 * @returns A console route, or `null` when the alert names nothing to open — a platform-wide
 *   condition such as a failed job queue has no single subject, and a link to nowhere is worse
 *   than no link.
 */
function alertHref(alert: PlatformHealthAlert): string | null {
  if (alert.href) return alert.href;
  if (alert.storeId) return `/platform/customers/${alert.storeId}`;
  return null;
}

/**
 * The stuck-order headline: how many, how much, how old.
 *
 * @param props.backlog - The per-store backlog rows, worst first. Empty when nothing is stuck.
 * @param props.total - Platform-wide stuck order count, from the scalar the contract guarantees.
 * @param props.totalCents - What the backlog is worth, or `null` when this deployment does not
 *   report it. `null` renders as a named absence, never as `$0.00`.
 * @param props.oldestAgeHours - Age of the oldest stuck order anywhere, or `null`.
 * @returns The headline block.
 */
function StuckHeadline({
  backlog,
  total,
  totalCents,
  oldestAgeHours,
}: {
  backlog: PlatformUnfulfilledStore[];
  total: number;
  totalCents: number | null;
  oldestAgeHours: number | null;
}): React.ReactElement {
  const storeCount = backlog.length;
  /* One affected store means the headline itself has somewhere honest to go. More than one and it
     does not — the per-store rows below carry the links instead. */
  const singleStore = storeCount === 1 ? backlog[0] : null;

  return (
    <div className={styles.attentionHead}>
      <span className={styles.attentionMark} aria-hidden="true">
        <IconPackageOff size={20} stroke={1.7} />
      </span>

      <div className={styles.attentionFigures}>
        <p className={styles.attentionHero}>
          <span className={styles.attentionHeroValue}>{total.toLocaleString('en-US')}</span>
          <span className={styles.attentionHeroLabel}>
            paid order{total === 1 ? '' : 's'} unshipped for over 48 hours
          </span>
        </p>

        <p className={styles.attentionSub}>
          {totalCents === null ? (
            <span>Value of the backlog is not reported by this deployment</span>
          ) : (
            <span className={styles.attentionMoney}>
              <Price value={centsToNumber(totalCents)} size="sm" /> of settled orders waiting
            </span>
          )}
          {oldestAgeHours === null ? null : (
            <> · oldest has waited {formatAgeHours(oldestAgeHours)}</>
          )}
          {storeCount > 0 ? (
            <> · across {storeCount} store{storeCount === 1 ? '' : 's'}</>
          ) : null}
        </p>
      </div>

      {singleStore ? (
        <Link
          className={styles.attentionAction}
          href={storeOrdersHref(singleStore.storeId)}
        >
          Review {singleStore.storeName}&rsquo;s orders
          <IconArrowRight size={15} stroke={1.9} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The operator's triage block: the stuck-order exposure, then every open alert.
 *
 * @param props - {@link AttentionPanelProps}
 * @returns The headline, the alert list, or a written all-clear.
 */
export function AttentionPanel({ health }: AttentionPanelProps): React.ReactElement {
  const backlog = health.unfulfilled?.stores ?? [];
  const total = health.unfulfilled?.total ?? health.unfulfilledOver48h;
  const totalCents = health.unfulfilled?.totalCents ?? null;
  const oldestAgeHours = health.unfulfilled?.oldestAgeHours ?? null;

  /* Which stores have a backlog, so their alerts can offer the order-list door as well. */
  const stuckByStore = new Map<string, PlatformUnfulfilledStore>(
    backlog.map((entry) => [entry.storeId, entry])
  );

  const nothingWrong = total === 0 && health.alerts.length === 0;

  if (nothingWrong) {
    return (
      <p className={styles.healthClear}>
        <IconCircleCheck {...MARK} aria-hidden="true" />
        Nothing needs an operator right now. No paid order has been waiting more than 48 hours and no
        store is reporting a problem.
      </p>
    );
  }

  return (
    <div className={styles.attention}>
      {total > 0 ? (
        <StuckHeadline
          backlog={backlog}
          total={total}
          totalCents={totalCents}
          oldestAgeHours={oldestAgeHours}
        />
      ) : null}

      {health.alerts.length === 0 ? (
        <p className={styles.healthClear}>
          <IconCircleCheck {...MARK} aria-hidden="true" />
          No store is reporting a problem.
        </p>
      ) : (
        <ul className={styles.alertList}>
          {health.alerts.map((alert, index) => {
            const Mark = severityIcon(alert.severity);
            const href = alertHref(alert);
            const stuck = alert.storeId === null ? undefined : stuckByStore.get(alert.storeId);

            return (
              <li
                key={`${alert.severity}-${alert.storeId ?? 'platform'}-${index}`}
                className={styles.alert}
                data-severity={alert.severity}
              >
                <div className={styles.alertRow}>
                  <span className={styles.alertMark} aria-hidden="true">
                    <Mark {...MARK} />
                  </span>

                  <div className={styles.alertCopy}>
                    <span className={styles.alertTitle}>{alert.title}</span>
                    <span className={styles.alertDetail}>{alert.detail}</span>
                    {alert.storeName ? (
                      <span className={styles.alertStore}>{alert.storeName}</span>
                    ) : null}
                  </div>

                  <span className={styles.alertSeverity}>{alert.severity}</span>
                </div>

                {href || stuck ? (
                  <div className={styles.alertActions}>
                    {stuck ? (
                      <Link
                        className={styles.alertAction}
                        href={storeOrdersHref(stuck.storeId)}
                        data-primary="true"
                      >
                        {stuck.count.toLocaleString('en-US')} unshipped order
                        {stuck.count === 1 ? '' : 's'}
                        <IconArrowRight size={14} stroke={1.9} aria-hidden="true" />
                      </Link>
                    ) : null}

                    {href ? (
                      <Link className={styles.alertAction} href={href}>
                        {alert.storeName ? `Open ${alert.storeName}` : 'Open details'}
                        <IconArrowRight size={14} stroke={1.9} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.attentionNote}>
        The order list opens filtered to <span className={styles.attentionCode}>{UNSHIPPED_ORDER_STATUS}</span>{' '}
        — the closest state the orders endpoint can filter on. It is a superset of the backlog: it
        includes paid orders that have been waiting less than 48 hours.
      </p>
    </div>
  );
}
