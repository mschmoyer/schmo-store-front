'use client';

import React from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClockPause,
  IconInfoCircle,
  IconPlugConnectedX,
  IconXboxX,
} from '@tabler/icons-react';
import type { PlatformHealth, PlatformHealthAlert } from './types';
import styles from './PlatformPanels.module.css';

export interface HealthStripProps {
  /** The `/api/platform/health` payload. */
  health: PlatformHealth;
}

const MARK = { size: 16, stroke: 1.8 } as const;

/** The four states, in the order an operator triages them: worst first. */
const STATES = [
  { key: 'failing', label: 'Failing', icon: IconXboxX, tone: 'danger' },
  { key: 'stale', label: 'Stale', icon: IconClockPause, tone: 'warning' },
  { key: 'notConnected', label: 'Not connected', icon: IconPlugConnectedX, tone: 'neutral' },
  { key: 'healthy', label: 'Healthy', icon: IconCircleCheck, tone: 'good' },
] as const;

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
 * Resolves where an alert should take the operator.
 *
 * The API may supply an `href`; when it does not but names a store, the console links to that
 * store's detail page itself, so an alert is never a dead end.
 *
 * @param alert - The alert.
 * @returns A console route, or `null` when the alert names nothing to open.
 */
function alertHref(alert: PlatformHealthAlert): string | null {
  if (alert.href) return alert.href;
  if (alert.storeId) return `/platform/customers/${alert.storeId}`;
  return null;
}

/**
 * Fleet health across every connected store.
 *
 * The counts row is deliberately worst-first. An operator opening this console is looking for the
 * stores that need them, and a row that leads with "112 healthy" buries the two that are failing.
 *
 * Each state carries an icon, a word and a number; the tint is the third cue, never the only one —
 * §7 forbids colour as the sole signal, and a fleet-status row is precisely where that matters.
 *
 * @param props - {@link HealthStripProps}
 * @returns The counts row, the job queue line and the alert list.
 */
export function HealthStrip({ health }: HealthStripProps): React.ReactElement {
  const totalStores =
    health.counts.failing + health.counts.stale + health.counts.notConnected + health.counts.healthy;

  return (
    <div className={styles.health}>
      <ul className={styles.healthCounts}>
        {STATES.map((state) => {
          const Mark = state.icon;
          return (
            <li key={state.key} className={styles.healthCount} data-tone={state.tone}>
              <span className={styles.healthCountMark} aria-hidden="true">
                <Mark {...MARK} />
              </span>
              <span className={styles.healthCountValue}>
                {health.counts[state.key].toLocaleString('en-US')}
              </span>
              <span className={styles.healthCountLabel}>{state.label}</span>
            </li>
          );
        })}
      </ul>

      <p className={styles.healthJobs}>
        {totalStores.toLocaleString('en-US')} store{totalStores === 1 ? '' : 's'} tracked ·{' '}
        {health.jobs.pending.toLocaleString('en-US')} jobs pending ·{' '}
        {health.jobs.processing.toLocaleString('en-US')} processing ·{' '}
        {health.jobs.failed.toLocaleString('en-US')} failed ·{' '}
        {health.unfulfilledOver48h.toLocaleString('en-US')} orders unfulfilled over 48 hours
      </p>

      {health.alerts.length === 0 ? (
        <p className={styles.healthClear}>
          <IconCircleCheck {...MARK} aria-hidden="true" />
          Nothing needs an operator right now.
        </p>
      ) : (
        <ul className={styles.alertList}>
          {health.alerts.map((alert, index) => {
            const Mark = severityIcon(alert.severity);
            const href = alertHref(alert);

            const body = (
              <>
                <span className={styles.alertMark} aria-hidden="true">
                  <Mark {...MARK} />
                </span>
                <span className={styles.alertCopy}>
                  <span className={styles.alertTitle}>{alert.title}</span>
                  <span className={styles.alertDetail}>{alert.detail}</span>
                  {alert.storeName ? (
                    <span className={styles.alertStore}>{alert.storeName}</span>
                  ) : null}
                </span>
                <span className={styles.alertSeverity}>{alert.severity}</span>
              </>
            );

            return (
              <li
                key={`${alert.severity}-${alert.storeId ?? 'platform'}-${index}`}
                className={styles.alert}
                data-severity={alert.severity}
              >
                {href ? (
                  <Link href={href} className={styles.alertLink}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.alertLink} data-static="true">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
