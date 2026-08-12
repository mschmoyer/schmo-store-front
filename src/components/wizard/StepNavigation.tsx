'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import styles from './Wizard.module.css';

export interface StepNavigationProps {
  /** Label for the primary action. Comes from the copy deck per step. */
  primaryLabel: string;
  onPrimary: () => void;
  /** True only when the step is genuinely invalid — never "not touched yet". */
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** Omitted on the first step. */
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** The honest escape hatch. Rendered only when the step can be skipped. */
  onSkip?: () => void;
  skipLabel?: string;
  skipDisabled?: boolean;
  /** A second, non-primary action (e.g. "Save as draft" on the final step). */
  secondary?: React.ReactNode;
}

/**
 * The footer of every wizard step: Back on the left, the single primary action
 * on the right, and the skip link where it belongs — visible, but not competing
 * with the action we actually want.
 *
 * There is never more than one `primary` button here (§5 of the design system).
 *
 * @param props - {@link StepNavigationProps}
 * @returns The step's action row
 */
export default function StepNavigation({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  onBack,
  backLabel = 'Back',
  backDisabled = false,
  onSkip,
  skipLabel = 'Skip for now',
  skipDisabled = false,
  secondary,
}: StepNavigationProps): React.ReactElement {
  return (
    <div className={styles.footer}>
      <div className={styles.footerLeft}>
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={backDisabled || primaryLoading}>
            {backLabel}
          </Button>
        ) : null}
        {onSkip ? (
          <button
            type="button"
            className={styles.skip}
            onClick={onSkip}
            disabled={skipDisabled || primaryLoading}
          >
            {skipLabel}
          </button>
        ) : null}
      </div>

      <div className={styles.footerRight}>
        {secondary}
        <Button
          variant="primary"
          size="lg"
          onClick={onPrimary}
          disabled={primaryDisabled}
          loading={primaryLoading}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
