'use client';

/**
 * The card every section of the merchant detail screen sits in.
 *
 * The detail screen is seven panels of unrelated facts — orders, catalogue,
 * integrations, theme, traffic — and the only thing holding it together is that
 * each one announces what it is in the same place, at the same rank, with the
 * same edge. When each panel invents its own heading level the screen stops
 * being navigable by heading, which is the one way a screen-reader user can
 * skip from "orders" to "integrations" without reading forty numbers in
 * between. So the title is always an `<h2>` and always labels its own region.
 */

import React, { useId } from 'react';
import styles from './panel.module.css';

export interface PanelProps {
  /** The section name. Rendered as the panel's `<h2>`. */
  title: string;
  /** One line of what this panel is showing, when the title is not enough. */
  description?: React.ReactNode;
  /** Right-aligned controls in the panel head. */
  actions?: React.ReactNode;
  /** Removes the body padding, for panels whose body is a full-bleed table. */
  flush?: boolean;
  children: React.ReactNode;
}

/**
 * A titled panel that is also a labelled landmark.
 *
 * @param props - {@link PanelProps}
 * @returns The panel.
 */
export function Panel({
  title,
  description,
  actions,
  flush = false,
  children,
}: PanelProps): React.ReactElement {
  const headingId = useId();

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>

      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  );
}

export interface DataListItem {
  /** The field name. */
  label: string;
  /** The value. Already formatted — this component does no formatting. */
  value: React.ReactNode;
  /** A short qualifier under the value. */
  hint?: React.ReactNode;
}

export interface DataListProps {
  /** The rows, in reading order. */
  items: DataListItem[];
  /** Minimum column width before the list wraps to more columns, in px. @default 190 */
  min?: number;
}

/**
 * A grid of label/value pairs, rendered as a real `<dl>`.
 *
 * Every "spec sheet" block in this product used to be a stack of `<div>`s with
 * a bold span and a plain span, which is a table drawn with the wrong elements:
 * nothing associates the value with the name it belongs to. A `<dl>` is the
 * markup that says "this is that", and it costs nothing to use.
 *
 * @param props - {@link DataListProps}
 * @returns The definition list.
 */
export function DataList({ items, min = 190 }: DataListProps): React.ReactElement {
  return (
    <dl
      className={styles.dataList}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {items.map((item) => (
        <div className={styles.dataItem} key={item.label}>
          <dt className={styles.dataLabel}>{item.label}</dt>
          <dd className={styles.dataValue}>
            {item.value}
            {item.hint ? <span className={styles.dataHint}>{item.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface MetricItem {
  /** What is being counted. Sentence case. */
  label: string;
  /** The figure, already formatted. */
  value: React.ReactNode;
  /** One short qualifier under the figure. */
  hint?: React.ReactNode;
  /** Colours the figure when the number itself is the problem. */
  tone?: 'neutral' | 'signal' | 'warning' | 'danger';
}

export interface MetricsProps {
  /** The figures, in reading order. */
  items: MetricItem[];
  /** Minimum column width before the grid wraps, in px. @default 132 */
  min?: number;
}

/**
 * A row of headline figures inside a panel.
 *
 * `StatCard` is the right component for a dashboard's top row and the wrong one
 * here: seven bordered cards inside an already-bordered panel is a card inside
 * a card inside a card, and the borders end up carrying more visual weight than
 * the numbers. This is the same information with the chrome removed — display
 * face, tabular numerals, and a tone only when the value has earned one.
 *
 * @param props - {@link MetricsProps}
 * @returns The figures as a definition list.
 */
export function Metrics({ items, min = 132 }: MetricsProps): React.ReactElement {
  return (
    <dl
      className={styles.metrics}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {items.map((item) => (
        <div className={styles.metric} key={item.label}>
          <dt className={styles.metricLabel}>{item.label}</dt>
          <dd className={styles.metricValue} data-tone={item.tone ?? 'neutral'}>
            {item.value}
          </dd>
          {item.hint ? <dd className={styles.metricHint}>{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
