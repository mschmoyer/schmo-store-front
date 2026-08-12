'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import StepIndicator from './StepIndicator';
import type { OnboardingProgress, StepId } from '@/components/onboarding/lib/steps';
import styles from './Wizard.module.css';

export interface WizardContainerProps {
  progress: OnboardingProgress;
  onNavigate: (step: StepId) => void;
  busy?: boolean;
  /** Rendered top-right. The copy deck's "Save and finish later" exit.
   *  Pass `null` to hide it — there is nothing left to finish later once the
   *  run is complete, and offering it there is a lie. */
  exitHref?: string | null;
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
        <Link href="/" className={styles.brand} aria-label="RebelShops home">
          <Image
            src="/brand/logo-horizontal.svg"
            alt="RebelShops"
            width={134}
            height={22}
            priority
            className={styles.brandMark}
          />
        </Link>
        {exitHref ? (
          <div className={styles.mastheadRight}>
            <Link href={exitHref} className={styles.exitLink}>
              {exitLabel}
            </Link>
          </div>
        ) : null}
      </header>

      <div className={styles.body}>
        <StepIndicator progress={progress} onNavigate={onNavigate} busy={busy} />
        <main className={styles.panel}>{children}</main>
      </div>
    </div>
  );
}
