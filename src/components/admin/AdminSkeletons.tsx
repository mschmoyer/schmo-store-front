'use client';

import React from 'react';
import { Skeleton } from '@/components/ui';
import styles from './AdminSkeletons.module.css';

/**
 * The whole admin shell, in skeleton.
 *
 * Shown while `AdminContext` verifies the stored session. §5 forbids a centred
 * spinner on a full page, and the reason is legible here: the shell's geometry
 * is known before the session resolves, so drawing it costs nothing and stops
 * the layout from jumping when the real chrome arrives.
 *
 * @returns The shell skeleton.
 */
export function AdminShellSkeleton(): React.ReactElement {
  return (
    <div className={styles.shell} aria-busy="true" aria-label="Loading the admin">
      <div className={styles.shellHeader}>
        <Skeleton width={140} height={22} />
        <Skeleton width={180} height={14} />
      </div>
      <div className={styles.shellBody}>
        <div className={styles.shellNav}>
          {[72, 96, 84, 110, 90, 78].map((width, index) => (
            <Skeleton key={index} width={width} height={14} />
          ))}
        </div>
        <div className={styles.shellMain}>
          <Skeleton width={260} height={30} />
          <div className={styles.shellCards}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} height={104} radius="var(--radius-lg)" />
            ))}
          </div>
          <Skeleton height={280} radius="var(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}

export interface StatGridSkeletonProps {
  /** How many stat cards the real grid will render. @default 4 */
  count?: number;
}

/**
 * A row of stat cards, in skeleton.
 *
 * @param props - {@link StatGridSkeletonProps}
 * @returns Placeholder cards at the real cards' height.
 */
export function StatGridSkeleton({ count = 4 }: StatGridSkeletonProps): React.ReactElement {
  return (
    <div className={styles.statGrid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={116} radius="var(--radius-lg)" />
      ))}
    </div>
  );
}

export interface TableSkeletonProps {
  /** Body rows to draw. @default 6 */
  rows?: number;
  /** Columns to draw. @default 4 */
  columns?: number;
  /** Optional accessible label for the loading region. */
  label?: string;
}

/**
 * A table, in skeleton, with a header band on `--surface-2` so the placeholder
 * has the same silhouette as the table it precedes.
 *
 * @param props - {@link TableSkeletonProps}
 * @returns The table skeleton.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
  label = 'Loading rows',
}: TableSkeletonProps): React.ReactElement {
  return (
    <div className={styles.table} role="status" aria-label={label}>
      <div className={styles.tableHead}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} height={10} width={index === 0 ? '45%' : '60%'} motionless />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={styles.tableRow}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              height={12}
              width={column === 0 ? '72%' : '48%'}
              motionless={row > 2}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface PanelSkeletonProps {
  /** Height of the placeholder body. @default 220 */
  height?: number;
  /** Optional accessible label. */
  label?: string;
}

/**
 * A card-shaped placeholder for a panel or chart.
 *
 * @param props - {@link PanelSkeletonProps}
 * @returns The panel skeleton.
 */
export function PanelSkeleton({
  height = 220,
  label = 'Loading',
}: PanelSkeletonProps): React.ReactElement {
  return (
    <div className={styles.panel} role="status" aria-label={label}>
      <Skeleton width={180} height={16} />
      <Skeleton height={height} radius="var(--radius-md)" />
    </div>
  );
}
