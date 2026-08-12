'use client';

/**
 * Renders a contrast finding inline, beside the control that caused it.
 *
 * The tone is deliberate: state the measured ratio, say what it needs to be,
 * and offer the way out. Never "invalid", never a red cross with no next step.
 */

import * as React from 'react';
import { IconAlertTriangle, IconWand } from '@tabler/icons-react';

import type { ContrastFinding } from '../contrast/findings';
import styles from './controls.module.css';

export interface ContrastNoticeProps {
  finding: ContrastFinding;
  /**
   * Apply the finding's suggested value.
   * @param fix - The theme path and value that resolve the finding
   */
  onApplyFix?: (fix: { path: string; value: string | null }) => void;
}

/**
 * One contrast finding.
 * @param props - {@link ContrastNoticeProps}
 * @returns An inline advisory block
 */
export function ContrastNotice({ finding, onApplyFix }: ContrastNoticeProps): React.ReactElement {
  const failing = finding.level === 'fail';

  return (
    <div
      className={`${styles.finding} ${failing ? styles.findingFail : styles.findingAdjusted}`}
      role={failing ? 'alert' : 'status'}
    >
      <IconAlertTriangle size={15} className={styles.findingIcon} aria-hidden="true" />
      <div className={styles.findingBody}>
        <span className={styles.findingTitle}>{finding.title}</span>
        <span>{finding.detail}</span>

        {finding.from && finding.to ? (
          <span className={styles.findingSwatches}>
            <span
              className={styles.findingSwatch}
              style={{ background: finding.from }}
              aria-hidden="true"
            />
            {finding.from}
            <span aria-hidden="true">→</span>
            <span
              className={styles.findingSwatch}
              style={{ background: finding.to }}
              aria-hidden="true"
            />
            {finding.to}
          </span>
        ) : null}

        {finding.fix && onApplyFix ? (
          <button
            type="button"
            className={styles.findingAction}
            onClick={() => onApplyFix(finding.fix!)}
          >
            <IconWand
              size={12}
              style={{ verticalAlign: '-2px', marginRight: 4 }}
              aria-hidden="true"
            />
            {finding.level === 'fail' ? 'Use an accessible colour' : 'Adopt the adjusted colour'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface ContrastNoticeListProps {
  findings: ContrastFinding[];
  onApplyFix?: (fix: { path: string; value: string | null }) => void;
}

/**
 * Every finding attached to one control.
 * @param props - {@link ContrastNoticeListProps}
 * @returns A stack of advisories, or nothing
 */
export function ContrastNoticeList({
  findings,
  onApplyFix,
}: ContrastNoticeListProps): React.ReactElement | null {
  if (findings.length === 0) return null;
  return (
    <>
      {findings.map((finding) => (
        <ContrastNotice key={finding.id} finding={finding} onApplyFix={onApplyFix} />
      ))}
    </>
  );
}
