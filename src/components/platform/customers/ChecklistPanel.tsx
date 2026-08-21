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
 *
 * ## One denominator per card
 *
 * The meter used to be drawn from `customization.completenessPct` — a score
 * over eight storefront signals — while the sentence beside it counted the six
 * items in this list. So the card read "63%" above "4 of 6 checks passing", and
 * 4/6 is 67%. The bar corresponded to nothing else on the card, and a reader
 * who noticed the mismatch had no way to tell which of the two numbers was
 * wrong. The meter is now the checklist's own ratio and nothing else: the bar,
 * the percentage and the sentence are three renderings of one fraction, and
 * they cannot disagree. `completenessPct` is still on screen — it is the
 * "Setup complete" field in the storefront customisation panel, where it is
 * labelled as the separate measurement it is.
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
}

/**
 * Renders the setup checklist and the meter for how much of it is passing.
 *
 * @param props - {@link ChecklistPanelProps}
 * @returns The checklist panel.
 */
export function ChecklistPanel({ items }: ChecklistPanelProps): React.ReactElement {
  const done = items.filter((item) => item.done).length;
  /* The one fraction on this card. The bar, the percentage and the sentence in
     the panel description are all rendered from it. */
  const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

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
          aria-label={`${done} of ${items.length} setup checks passing`}
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
