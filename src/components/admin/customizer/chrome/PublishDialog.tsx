'use client';

/**
 * The publish confirmation.
 *
 * Publishing replaces what every visitor sees, so this shows the actual diff
 * between the live storefront and the draft — in words, with colour swatches
 * where a colour changed — rather than a version number.
 *
 * It is also the last gate on the contrast guardrail: a draft with a failing
 * pair cannot be published from here, and the dialog says which control to go
 * and fix.
 */

import * as React from 'react';
import { IconAlertTriangle, IconRocket } from '@tabler/icons-react';

import { Button, Modal } from '@/components/ui';

import type { ContrastFinding } from '../contrast/findings';
import type { DiffEntry } from '../state/diff';
import styles from '../Customizer.module.css';
import controlStyles from '../controls/controls.module.css';

export interface PublishDialogProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  publishing: boolean;
  changes: DiffEntry[];
  blocking: ContrastFinding[];
  /**
   * Jump to the panel holding a failing control.
   * @param path - Dotted theme path
   */
  onGoToFinding: (path: string) => void;
}

/** The order diff groups appear in. */
const GROUP_ORDER: Array<DiffEntry['group']> = ['Theme', 'Sections', 'Custom CSS'];

/**
 * Publish confirmation with a plain-English change list.
 * @param props - {@link PublishDialogProps}
 * @returns The dialog
 */
export function PublishDialog({
  opened,
  onClose,
  onConfirm,
  publishing,
  changes,
  blocking,
  onGoToFinding,
}: PublishDialogProps): React.ReactElement {
  const blocked = blocking.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Publish to your live storefront"
      description={
        blocked
          ? 'One thing needs fixing before this can go live.'
          : `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} will go live for every visitor.`
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={publishing}>
            Keep editing
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={publishing}
            disabled={blocked}
            leftIcon={<IconRocket size={15} aria-hidden="true" />}
            onClick={onConfirm}
          >
            Publish now
          </Button>
        </>
      }
    >
      {blocked ? (
        <div
          className={`${controlStyles.finding} ${controlStyles.findingFail}`}
          role="alert"
          style={{ marginBottom: 16 }}
        >
          <IconAlertTriangle size={16} className={controlStyles.findingIcon} aria-hidden="true" />
          <div className={controlStyles.findingBody}>
            <span className={controlStyles.findingTitle}>
              {blocking.length === 1
                ? 'This would ship an unreadable storefront'
                : `${blocking.length} readability problems would ship`}
            </span>
            {blocking.map((finding) => (
              <span key={finding.id}>
                <strong>{finding.title}.</strong> {finding.detail}{' '}
                <button
                  type="button"
                  className={controlStyles.linkButton}
                  style={{ color: 'inherit' }}
                  onClick={() => onGoToFinding(finding.path)}
                >
                  Take me there
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {changes.length === 0 ? (
        <p className={styles.railHint}>
          Nothing has changed since your last publish. There is nothing to send.
        </p>
      ) : (
        <div>
          {GROUP_ORDER.map((group) => {
            const rows = changes.filter((entry) => entry.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <p className={styles.diffGroupLabel}>{group}</p>
                <ul className={styles.diffList}>
                  {rows.map((entry, index) => (
                    <li className={styles.diffRow} key={`${group}-${index}`}>
                      <span className={styles.diffLabel}>{entry.label}</span>
                      {entry.from !== undefined && entry.to !== undefined ? (
                        <span className={styles.diffValues}>
                          {entry.kind === 'color' ? (
                            <span
                              className={styles.diffSwatch}
                              style={{ background: entry.from }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{entry.from}</span>
                          <span className={styles.diffArrow} aria-hidden="true">
                            →
                          </span>
                          {entry.kind === 'color' ? (
                            <span
                              className={styles.diffSwatch}
                              style={{ background: entry.to }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className={styles.diffTo}>{entry.to}</span>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
