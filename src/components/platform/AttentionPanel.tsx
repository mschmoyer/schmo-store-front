'use client';

/**
 * What needs an operator, at the foot of the console.
 *
 * ## Where this sits, and why it is reachable without scrolling
 *
 * At the foot of the console, as its own section, and linked directly from the sidebar. The page
 * opens with the four fleet-state cards instead, which answer "is anything wrong" in one reading;
 * this answers "what do I do about it", and a worklist wants the room at the end of a page rather
 * than the glance at the top of one.
 *
 * That only holds while the door stays open. The alerts once sat roughly 1,600px down a 2,952px
 * page with nothing pointing at them, which is how a console ends up with alerts nobody reads — so
 * `PlatformNav` carries a "Needs an operator" link straight to `#attention`, and the health cards
 * above say plainly when something is failing. Merchants' customers are waiting on the orders named
 * here; reaching them must never depend on somebody scrolling far enough.
 *
 * ## The money was computed and hidden
 *
 * `health.unfulfilled` carries `totalCents`, `oldestAgeHours` and a per-store breakdown, and none
 * of it reached a screen. The console rendered "Unshipped for over 48 hours: 4" and left an
 * operator to open two alert cards and add up two dollar amounts by hand to learn that the number
 * behind the 4 was $898.04. A count is a workload; the money is the exposure, and the exposure is
 * what decides whether this is today's problem or this week's.
 *
 * ## Where the drill-through lives
 *
 * The stuck-order backlog is the thing with an obvious next screen, so the per-store doors into
 * "that store's unshipped orders" sit in the headline, built from `unfulfilled.stores[]` — the
 * block that actually knows which stores have a backlog, how many orders and how much money.
 *
 * Each alert keeps its own `href` and nothing else. The console deliberately does not re-point an
 * alert's link by guessing what it is about: a failing-sync alert and an unshipped-orders alert are
 * both `critical` and both name a store, so inferring "this one is about orders" from severity
 * would silently send an operator chasing a sync failure into a list of orders — and hanging an
 * "unshipped orders" button on a *ShipStation-not-connected* alert, which is what doing it by
 * store id produced, is the same error wearing a label. Until `PlatformAlert` carries a `kind`,
 * the backlog owns the backlog's link.
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
import { centsToNumber, formatMoney } from '@/lib/billing/money';
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

      {backlog.length > 0 ? (
        <ul className={styles.attentionStores}>
          {backlog.map((store) => (
            <li key={store.storeId}>
              <Link className={styles.attentionAction} href={storeOrdersHref(store.storeId)}>
                <span className={styles.attentionActionName}>{store.storeName}</span>
                <span className={styles.attentionActionMeta}>
                  {store.count.toLocaleString('en-US')} order{store.count === 1 ? '' : 's'} ·{' '}
                  {formatMoney(store.stuckCents)} · {formatAgeHours(store.oldestAgeHours)}
                </span>
                <IconArrowRight size={15} stroke={1.9} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
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

                {href ? (
                  <div className={styles.alertActions}>
                    <Link className={styles.alertAction} href={href}>
                      {alert.storeName ? `Open ${alert.storeName}` : 'Open details'}
                      <IconArrowRight size={14} stroke={1.9} aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {backlog.length > 0 ? (
        <p className={styles.attentionNote}>
          Those store links open the order list filtered to{' '}
          <span className={styles.attentionCode}>{UNSHIPPED_ORDER_STATUS}</span> — the closest state
          the orders endpoint can filter on, and a superset of the backlog: it also includes paid
          orders that have been waiting less than 48 hours.
        </p>
      ) : null}
    </div>
  );
}
