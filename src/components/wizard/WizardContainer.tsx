'use client';

import * as React from 'react';
import Link from 'next/link';
import StepIndicator from './StepIndicator';
import type { OnboardingProgress, StepId } from '@/components/onboarding/lib/steps';
import styles from './Wizard.module.css';

export interface WizardContainerProps {
  progress: OnboardingProgress;
  onNavigate: (step: StepId) => void;
  busy?: boolean;
  /** Rendered top-right. The copy deck's "Save and finish later" exit. */
  exitHref?: string;
  exitLabel?: string;
  children: React.ReactNode;
}

/**
 * Page chrome for the setup wizard: masthead, progress rail and the panel the
 * current step renders into.
 *
 * Deliberately not a Mantine `Paper`/`Stepper` — the whole point of this rebuild
 * is that the first screen a merchant sees looks like RebelShops and not like a
 * component library's default theme.
 *
 * @param props - {@link WizardContainerProps}
 * @returns The wizard shell
 */
export default function WizardContainer({
  progress,
  onNavigate,
  busy = false,
  exitHref = '/login',
  exitLabel = 'Save and finish later',
  children,
}: WizardContainerProps): React.ReactElement {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            R
          </span>
          <span className={styles.brandName}>RebelShops</span>
        </Link>
        <div className={styles.mastheadRight}>
          <Link href={exitHref} className={styles.exitLink}>
            {exitLabel}
          </Link>
        </div>
      </header>

      <div className={styles.body}>
        <StepIndicator progress={progress} onNavigate={onNavigate} busy={busy} />
        <main className={styles.panel}>{children}</main>
      </div>
    </div>
  );
}
