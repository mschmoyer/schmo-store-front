'use client';

import React from 'react';
import { IconArrowNarrowDown } from '@tabler/icons-react';
import { EmptyState } from '@/components/ui';
import { conversionPct, formatPct } from './metricDelta';
import styles from './PlatformPanels.module.css';

/** One stage of the buyer journey. */
export interface FunnelStep {
  /** Stable key — the click event type, or `order` for the last stage. */
  key: string;
  /** What the stage is, in the operator's words. */
  label: string;
  /** How many of this event were recorded in the window. */
  value: number;
}

export interface ConversionFunnelProps {
  /** Ordered widest to narrowest. The first step sets the bar scale. */
  steps: FunnelStep[];
  /** The window length, for the empty state's sentence. */
  windowDays: number;
}

/**
 * Clicks → product views → add to cart → checkout start → orders.
 *
 * Two things this component refuses to do:
 *
 * - **Divide by an empty stage.** A platform with no traffic has no conversion rate; it does not
 *   have a conversion rate of `NaN%`, and it certainly does not have one of `0%`, which would claim
 *   we measured a failure to convert. Stages with a zero predecessor render an em dash.
 * - **Assume the funnel narrows.** These counts come from independent event rows, not from a nested
 *   cohort, so a stage can legitimately exceed the one above it (a shopper adds to cart twice). Bar
 *   widths are clamped rather than the numbers being massaged to look tidy, and a step-over-step
 *   rate above 100% is shown as measured.
 *
 * @param props - {@link ConversionFunnelProps}
 * @returns The funnel, or an empty state when nothing entered it.
 */
export function ConversionFunnel({ steps, windowDays }: ConversionFunnelProps): React.ReactElement {
  const top = steps[0]?.value ?? 0;

  if (steps.length === 0 || top === 0) {
    return (
      <EmptyState
        title="Nobody has reached a storefront yet"
        description={`No buyer events were recorded in the last ${windowDays} days, so there is no funnel to measure. This fills in as soon as click tracking sees its first visitor.`}
        titleAs="p"
        compact
      />
    );
  }

  return (
    <ol className={styles.funnel}>
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1] : null;
        const stepRate = previous ? conversionPct(step.value, previous.value) : null;
        /* Clamped so an out-of-order stage cannot draw a bar past the panel edge. */
        const width = Math.max(0, Math.min(100, top > 0 ? (step.value / top) * 100 : 0));

        return (
          <li key={step.key} className={styles.funnelStep}>
            {previous ? (
              <p className={styles.funnelRate}>
                <IconArrowNarrowDown size={14} stroke={2} aria-hidden="true" />
                <span className={styles.funnelRateValue}>{formatPct(stepRate)}</span>
                <span className={styles.funnelRateLabel}>
                  {stepRate === null
                    ? `no ${previous.label.toLowerCase()} to convert`
                    : `of ${previous.label.toLowerCase()}`}
                </span>
              </p>
            ) : null}

            <div className={styles.funnelHead}>
              <span className={styles.funnelLabel}>{step.label}</span>
              <span className={styles.funnelValue}>{step.value.toLocaleString('en-US')}</span>
            </div>

            <div className={styles.funnelTrack}>
              {/*
                A data-driven width is the one thing a stylesheet cannot express, so it is set
                inline — exactly as `StatCard`'s meter does. Everything else about the bar,
                including its colour, comes from the token layer.
              */}
              <span className={styles.funnelBar} style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
