'use client';

/**
 * The onboarding checklist for one merchant.
 *
 * This is the panel a support conversation actually starts from: "your orders
 * are not coming through" almost always resolves to one unticked line here.
 * So the items are rendered in the order the API sends them and every one keeps
 * its `detail` sentence, even when it is done — the detail on a done item is
 * the evidence ("last synced 4 hours ago"), and stripping it leaves a tick that
 * asserts something with nothing behind it.
 *
 * The meter is a real `progressbar` with its value in the accessible name, not
 * a coloured bar with the number rendered elsewhere on the screen.
 */

import React from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';
import { Panel } from './Panel';
import { formatPercent } from './format';
import type { PlatformChecklistItem } from './types';
import styles from './checklistPanel.module.css';

export interface ChecklistPanelProps {
  /** The checks, in the order the API returns them. */
  items: PlatformChecklistItem[];
  /** 0–100. The store's setup completeness. */
  completenessPct: number;
}

/**
 * Renders the setup checklist and its completeness meter.
 *
 * @param props - {@link ChecklistPanelProps}
 * @returns The checklist panel.
 */
export function ChecklistPanel({ items, completenessPct }: ChecklistPanelProps): React.ReactElement {
  const done = items.filter((item) => item.done).length;
  const pct = Math.max(0, Math.min(100, Math.round(completenessPct)));

  return (
    <Panel
      title="Setup and health"
      description={
        items.length > 0
          ? `${done} of ${items.length} checks passing.`
          : 'No checks were returned for this merchant.'
      }
    >
      <div className={styles.meterRow}>
        <span className={styles.meterValue}>{formatPercent(pct)}</span>
        <div
          className={styles.meter}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Storefront setup completeness"
        >
          {/* The width is data, not styling: it is the value being drawn, and
              it cannot live in a stylesheet. `StatCard` sets its meter the
              same way. */}
          <span
            className={styles.meterFill}
            data-complete={pct >= 100 ? 'true' : undefined}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {items.length === 0 ? null : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li className={styles.item} key={item.key} data-done={item.done ? 'true' : 'false'}>
              <span className={styles.mark} aria-hidden="true">
                {item.done ? <IconCheck size={14} /> : <IconX size={14} />}
              </span>
              <span className={styles.copy}>
                <span className={styles.label}>
                  {item.label}
                  <span className={styles.srOnly}>{item.done ? ' — done' : ' — not done'}</span>
                </span>
                {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
