'use client';

import React from 'react';
import Link from 'next/link';
import { Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Price } from '@/components/ui';
import styles from './StatCard.module.css';

export type StatTone = 'neutral' | 'signal' | 'warning' | 'danger';

export interface StatCardProps {
  /** What is being counted. Sentence case, no trailing colon. */
  label: string;
  /**
   * The figure. Pass a **number in major units** with `format="currency"` and
   * the card renders it through `Price`; pass a string for anything already
   * formatted (a percentage, a duration, a ratio).
   */
  value: number | string;
  /** @default 'number' */
  format?: 'number' | 'currency' | 'raw';
  /** One short line under the figure. Context, never a restatement. */
  meta?: React.ReactNode;
  /** A small line-art mark. Rendered in `--text-subtle`, never tinted. */
  icon?: React.ReactNode;
  /**
   * Something wrong with this number, stated in full and in plain sentences.
   *
   * Draws a warning mark beside the label carrying this text as its tooltip and
   * as its accessible name. Pass it only when the condition holds — an always-on
   * mark is furniture, and the reader stops seeing it.
   */
  warning?: string;
  /**
   * Colours the figure. `neutral` is the default and the right answer almost
   * always — §2 reserves the signal for money, stock and success, and a card
   * per tint is what this component replaced.
   * @default 'neutral'
   */
  tone?: StatTone;
  /** 0–100. Draws a hairline meter under the figure. */
  progress?: number;
  /** Makes the whole card a link. */
  href?: string;
}

/**
 * One stat, one treatment.
 *
 * The dashboard used to render six cards with six different pastel tints — one
 * per card, chosen for variety rather than meaning. That is decoration
 * masquerading as information: a reader learns that the cards are different
 * colours, not that any of them needs attention. Every card now looks identical
 * unless its **value** earns a tone, so a warning tint is a fact about the
 * number instead of a fact about the card's position in the row.
 *
 * The figure is set in the display face with tabular numerals per §3, so the
 * row of cards keeps a common baseline and digits do not jitter on refresh.
 *
 * @param props - {@link StatCardProps}
 * @returns A stat card, wrapped in a link when `href` is given.
 */
export function StatCard({
  label,
  value,
  format = 'number',
  meta,
  icon,
  warning,
  tone = 'neutral',
  progress,
  href,
}: StatCardProps): React.ReactElement {
  const body = (
    <>
      <div className={styles.head}>
        <span className={styles.label}>
          {label}
          {warning ? (
            <Tooltip label={warning} withArrow multiline w={280} position="bottom-start">
              {/*
               * Focusable, and the tooltip text is repeated as the accessible
               * name. A hover-only warning is a warning only for people using a
               * mouse, and this one replaced a banner that everybody could read.
               */}
              <span className={styles.warning} tabIndex={0} role="img" aria-label={warning}>
                <IconAlertTriangle size={15} />
              </span>
            </Tooltip>
          ) : null}
        </span>
        {icon ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>

      <div className={styles.valueRow} data-tone={tone}>
        {format === 'currency' && typeof value === 'number' ? (
          <Price value={value} size="lg" className={styles.price} />
        ) : (
          <span className={styles.value}>
            {format === 'number' && typeof value === 'number' ? value.toLocaleString('en-US') : value}
          </span>
        )}
      </div>

      {meta ? <p className={styles.meta}>{meta}</p> : null}

      {typeof progress === 'number' ? (
        <div
          className={styles.meter}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress`}
        >
          <span
            className={styles.meterFill}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${styles.card} ${styles.linked}`}>
        {body}
      </Link>
    );
  }

  return <div className={styles.card}>{body}</div>;
}

export interface StatGridProps {
  children: React.ReactNode;
  /** Minimum card width before the grid wraps, in px. @default 200 */
  min?: number;
}

/**
 * The row the stat cards live in — an auto-fit grid so six cards never squeeze
 * into six unreadable columns on a laptop.
 *
 * @param props - {@link StatGridProps}
 * @returns The grid wrapper.
 */
export function StatGrid({ children, min = 200 }: StatGridProps): React.ReactElement {
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}
