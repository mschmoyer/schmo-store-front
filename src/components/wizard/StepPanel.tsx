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
  /**
   * Render the panel as a `<div>` instead of a `<form>`.
   *
   * For a step whose body brings its own form — Clerk's `<SignUp />` does — because nested
   * `<form>` elements are invalid HTML and the browser reparents the inner one out, which breaks
   * the widget rather than merely looking untidy. Enter-to-advance is that form's job then.
   */
  noForm?: boolean;
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
  noForm = false,
}: StepPanelProps): React.ReactElement {
  const body = (
    <>
      {!noForm ? (
        /*
        Implicit form submission needs a submit button to exist. Every visible
        control here is `type="button"` (the primary carries an onClick so it
        also works when focus is elsewhere), so without this Enter in a field
        would do nothing on any multi-input step. Off-screen rather than
        `display: none`, and out of the tab order.
      */
        <button type="submit" className={styles.hiddenSubmit} tabIndex={-1} aria-hidden="true" />
      ) : null}

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
    </>
  );

  if (noForm) {
    return <div className={styles.card}>{body}</div>;
  }

  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {body}
    </form>
  );
}
