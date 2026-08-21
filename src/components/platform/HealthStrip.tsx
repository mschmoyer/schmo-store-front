'use client';

import React from 'react';
import {
  IconCircleCheck,
  IconClockPause,
  IconPlugConnectedX,
  IconXboxX,
} from '@tabler/icons-react';
import { formatMoney } from '@/lib/billing/money';
import { formatAgeHours } from './formatDuration';
import type { PlatformHealth } from './types';
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
 * Fleet health across every connected store.
 *
 * The counts row is deliberately worst-first. An operator opening this console is looking for the
 * stores that need them, and a row that leads with "112 healthy" buries the two that are failing.
 *
 * Each state carries an icon, a word and a number; the tint is the third cue, never the only one —
 * §7 forbids colour as the sole signal, and a fleet-status row is precisely where that matters.
 *
 * **The alerts no longer live here.** They moved to the console's attention block above the KPI
 * strip, because an alert list that opens 1,600px down the page is an alert list nobody reads. What
 * remains is the fleet's shape — how many stores are in each sync state and how deep the job queue
 * is — which is context rather than a call to action, and belongs where context belongs.
 *
 * The four counts here describe **ShipStation** sync state, which is not the same population as the
 * merchant list's "Unconnected" filter (no integration of any kind). They are deliberately not
 * linked to it: a drill-through whose destination is a different set than the number it came from
 * is worse than none. The readiness panel owns that door, where the counts and the filter agree.
 *
 * @param props - {@link HealthStripProps}
 * @returns The counts row and the queue lines.
 */
export function HealthStrip({ health }: HealthStripProps): React.ReactElement {
  const totalStores =
    health.counts.failing + health.counts.stale + health.counts.notConnected + health.counts.healthy;

  const backlogCents = health.unfulfilled?.totalCents ?? null;
  const oldest = health.unfulfilled?.oldestAgeHours ?? null;

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
        {health.jobs.failed.toLocaleString('en-US')} failed
      </p>

      <p className={styles.healthJobs}>
        {health.unfulfilledOver48h.toLocaleString('en-US')} order
        {health.unfulfilledOver48h === 1 ? '' : 's'} unshipped for over 48 hours
        {backlogCents === null ? '' : ` · ${formatMoney(backlogCents)} of settled orders`}
        {oldest === null ? '' : ` · oldest waiting ${formatAgeHours(oldest)}`}
      </p>
    </div>
  );
}

