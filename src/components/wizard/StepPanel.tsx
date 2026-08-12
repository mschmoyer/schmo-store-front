'use client';

import * as React from 'react';
import { TOTAL_STEPS, type StepDefinition } from '@/components/onboarding/lib/steps';
import styles from './Wizard.module.css';

export interface StepPanelProps {
  step: StepDefinition;
  /** A per-step banner (error, success). Rendered above the fields. */
  banner?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Submitting the form (Enter in any field) runs this. Every step is a real
   * `<form>` so Enter advances without anyone having to wire a keydown handler.
   */
  onSubmit?: () => void;
}

/**
 * One step's card: eyebrow, title, helper text, fields, footer.
 *
 * @param props - {@link StepPanelProps}
 * @returns The step card
 */
export default function StepPanel({
  step,
  banner,
  children,
  footer,
  onSubmit,
}: StepPanelProps): React.ReactElement {
  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {step.number !== null ? (
        <span className={styles.stepEyebrow}>
          Step {step.number} of {TOTAL_STEPS}
        </span>
      ) : null}
      <h1 className={styles.stepTitle}>{step.title}</h1>
      <p className={styles.stepHelper}>{step.helper}</p>

      {banner}

      <div className={styles.stepContent}>{children}</div>

      {footer}
    </form>
  );
}
