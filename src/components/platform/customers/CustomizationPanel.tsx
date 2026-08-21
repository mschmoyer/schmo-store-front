'use client';

/**
 * How far the merchant has taken the storefront beyond the defaults.
 *
 * This is the panel that separates "signed up and left" from "actually
 * building a shop", which is the distinction that decides whether a support
 * nudge is worth sending. A theme with a draft version and no published-at is
 * the most interesting row on the screen — someone did the work and never
 * pressed publish — so the published date is shown as its own field rather than
 * folded into the status word.
 */

import React from 'react';
import { Panel, DataList } from './Panel';
import { CustomizationBadge } from './StoreBadges';
import { RelativeDate } from './RelativeDate';
import { formatCount, formatPercent, humanizeStatus, NOT_SET } from './format';
import type { PlatformCustomization } from './types';
import styles from './integrationsPanel.module.css';

export interface CustomizationPanelProps {
  /** The store's theme and content state. */
  customization: PlatformCustomization;
}

/**
 * Renders the storefront customisation panel.
 *
 * @param props - {@link CustomizationPanelProps}
 * @returns The customisation panel.
 */
export function CustomizationPanel({
  customization,
}: CustomizationPanelProps): React.ReactElement {
  const {
    themeCustomized,
    themeStatus,
    themeVersion,
    publishedAt,
    sectionCount,
    hasLogo,
    hasHero,
    hasDescription,
    blogPosts,
    completenessPct,
  } = customization;

  return (
    <Panel
      title="Storefront customisation"
      description={
        themeCustomized
          ? 'This merchant has moved off the default theme.'
          : 'This merchant is still on the default theme.'
      }
      actions={<CustomizationBadge customized={themeCustomized} themeStatus={themeStatus} size="md" />}
    >
      <div className={styles.group}>
        <DataList
          items={[
            { label: 'Theme status', value: humanizeStatus(themeStatus, 'Default') },
            {
              label: 'Theme version',
              value: themeVersion === null ? NOT_SET : `v${themeVersion}`,
            },
            {
              label: 'Published',
              value: <RelativeDate value={publishedAt} fallback="Never published" />,
            },
            { label: 'Sections', value: formatCount(sectionCount) },
            { label: 'Blog posts', value: formatCount(blogPosts) },
            { label: 'Setup complete', value: formatPercent(completenessPct) },
          ]}
        />
      </div>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <h3 className={styles.groupTitle}>Storefront content</h3>
        </div>

        <DataList
          items={[
            { label: 'Logo', value: hasLogo ? 'Uploaded' : 'Missing' },
            { label: 'Hero', value: hasHero ? 'Configured' : 'Missing' },
            { label: 'Description', value: hasDescription ? 'Written' : 'Missing' },
          ]}
        />
      </div>
    </Panel>
  );
}
