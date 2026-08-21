'use client';

import React from 'react';
import styles from './PlatformPanels.module.css';

export interface PlatformPanelProps {
  /** The panel's heading. Rendered as an `<h2>` so the page keeps one heading outline. */
  title: string;
  /** One line under the heading. Context, not a restatement of the title. */
  description?: React.ReactNode;
  /** Right-aligned controls for this panel only. */
  actions?: React.ReactNode;
  /** The panel body. */
  children: React.ReactNode;
  /** Adds an accessible name to the section landmark. Defaults to `title`. */
  ariaLabel?: string;
  /** Anchor id, so the sidebar's overview-section links have somewhere real to land. */
  id?: string;
}

/**
 * The console's one card.
 *
 * Every panel on `/platform` is this component, for the same reason `StatCard` exists in the
 * merchant admin: when each region rolls its own card, the paddings, radii and heading levels drift
 * until a screen reader's outline no longer matches what a sighted reader sees. The heading is
 * always an `<h2>` under the page's single `<h1>`, and the wrapper is a real `<section>` with an
 * accessible name, so the console is navigable by landmark and by heading.
 *
 * @param props - {@link PlatformPanelProps}
 * @returns A titled card section.
 */
export function PlatformPanel({
  title,
  description,
  actions,
  children,
  ariaLabel,
  id,
}: PlatformPanelProps): React.ReactElement {
  return (
    <section className={styles.panel} aria-label={ariaLabel ?? title} id={id}>
      <header className={styles.panelHead}>
        <div className={styles.panelCopy}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {description ? <p className={styles.panelDescription}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.panelActions}>{actions}</div> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
