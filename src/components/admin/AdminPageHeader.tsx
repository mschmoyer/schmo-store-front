'use client';

import React from 'react';
import styles from './AdminPageHeader.module.css';

export interface AdminPageHeaderProps {
  /** The page title. Rendered as the route's single `<h1>`. */
  title: string;
  /** One sentence of what this screen is for. */
  description?: React.ReactNode;
  /** Primary and secondary actions, right-aligned. */
  actions?: React.ReactNode;
}

/**
 * The standard heading block for an admin route.
 *
 * Every screen hand-rolled its own: some used `<Title order={1}>`, some
 * `order={2}`, some a bare `<Text fw={700}>` — so the same visual rank meant a
 * different heading level on each route and the type size changed as you
 * navigated. One component fixes both.
 *
 * @param props - {@link AdminPageHeaderProps}
 * @returns The heading row.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
}: AdminPageHeaderProps): React.ReactElement {
  return (
    <header className={styles.root}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
