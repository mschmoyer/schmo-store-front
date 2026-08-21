'use client';

import React from 'react';
import { Skeleton } from '@/components/ui';
import styles from './PlatformChrome.module.css';

/**
 * Placeholders for the operator console.
 *
 * §5 of the design system forbids a centred spinner on a full page, and the reason is visible in
 * this console more than anywhere else: the shell's geometry — a 260px rail, a 60px bar, a six-card
 * KPI row, two charts — is known before the first byte of `/api/platform/overview` arrives. Drawing
 * it costs nothing and stops the layout from jumping under the operator's cursor when the numbers
 * land. Each skeleton below matches the geometry of the thing it stands in for, not a generic box.
 */

/**
 * The whole console, in skeleton, while the operator check is in flight.
 *
 * @returns The shell skeleton.
 */
export function PlatformShellSkeleton(): React.ReactElement {
  return (
    <div className={styles.shellSkeleton} aria-busy="true" aria-label="Loading the operator console">
      <div className={styles.shellSkeletonHeader}>
        <Skeleton width={150} height={22} />
        <Skeleton width={120} height={14} />
      </div>
      <div className={styles.shellSkeletonBody}>
        <div className={styles.shellSkeletonNav}>
          {[80, 96, 72, 88, 64].map((width, index) => (
            <Skeleton key={index} width={width} height={14} />
          ))}
        </div>
        <div className={styles.shellSkeletonMain}>
          <Skeleton width={280} height={30} />
          <div className={styles.shellSkeletonCards}>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} height={116} radius="var(--radius-lg)" />
            ))}
          </div>
          <Skeleton height={260} radius="var(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}

/**
 * The overview page's body, in skeleton, while its three endpoints answer.
 *
 * @returns The overview skeleton.
 */
export function PlatformOverviewSkeleton(): React.ReactElement {
  return (
    <div className={styles.overviewSkeleton} role="status" aria-label="Loading platform numbers">
      {/* The four health cards the console now opens with, then the six-card KPI strip. */}
      <div className={styles.healthSkeletonCounts}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={116} radius="var(--radius-lg)" />
        ))}
      </div>
      <div className={styles.shellSkeletonCards}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} height={116} radius="var(--radius-lg)" />
        ))}
      </div>
      <Skeleton height={300} radius="var(--radius-lg)" />
      <div className={styles.overviewSkeletonSplit}>
        <Skeleton height={280} radius="var(--radius-lg)" />
        <Skeleton height={280} radius="var(--radius-lg)" />
      </div>
      <Skeleton height={200} radius="var(--radius-lg)" />
    </div>
  );
}

/**
 * Two stacked plots, in skeleton, at the height the real charts occupy.
 *
 * @returns The chart skeleton.
 */
export function PlatformChartSkeleton(): React.ReactElement {
  return (
    <div className={styles.chartSkeleton} role="status" aria-label="Loading the trend charts">
      <Skeleton width={160} height={13} />
      <Skeleton height={240} radius="var(--radius-md)" />
      <Skeleton width={160} height={13} />
      <Skeleton height={240} radius="var(--radius-md)" />
    </div>
  );
}

/**
 * The fleet-health block, in skeleton: the four state cards at the height they occupy.
 *
 * @returns The health skeleton.
 */
export function PlatformHealthCardsSkeleton(): React.ReactElement {
  return (
    <div className={styles.healthSkeletonCounts} role="status" aria-label="Loading platform health">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} height={116} radius="var(--radius-lg)" />
      ))}
    </div>
  );
}

/**
 * The worklist, in skeleton: the stuck-order headline over a short alert list.
 *
 * Separate from {@link PlatformHealthCardsSkeleton} since the two blocks moved to opposite ends of
 * the console and stopped having the same shape. One placeholder standing in for two different
 * geometries is the layout jump §5 asks skeletons to prevent.
 *
 * @returns The attention skeleton.
 */
export function PlatformAttentionSkeleton(): React.ReactElement {
  return (
    <div className={styles.healthSkeleton} role="status" aria-label="Loading the operator worklist">
      <Skeleton height={80} radius="var(--radius-md)" />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} height={64} radius="var(--radius-md)" motionless={index > 1} />
      ))}
    </div>
  );
}
