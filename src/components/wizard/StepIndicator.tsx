'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import {
  NUMBERED_STEPS,
  STEPS,
  TOTAL_STEPS,
  canAccessStep,
  progressPercent,
  reallyCompletedSteps,
  stepIndex,
  type OnboardingProgress,
  type StepId,
} from '@/components/onboarding/lib/steps';
import styles from './Wizard.module.css';

export interface StepIndicatorProps {
  progress: OnboardingProgress;
  /** Called when the merchant clicks a step they are allowed to return to. */
  onNavigate: (step: StepId) => void;
  /** Blocks navigation while a request is in flight. */
  busy?: boolean;
}

type MarkerState = 'done' | 'skipped' | 'current' | 'todo';

/**
 * Work out how a step should render.
 *
 * `skipped` outranks `done` deliberately. The state machine marks a skipped
 * step complete so the wizard can move on, which is right; showing the merchant
 * a green tick beside "ShipStation" when they never connected it is not. The
 * sidebar used to read `ShipStation Done / Catalog Done` over a store with
 * nothing in it.
 *
 * @param id - The step in question
 * @param progress - Current progress
 * @returns Its visual state
 */
function stateOf(id: StepId, progress: OnboardingProgress): MarkerState {
  if (progress.skippedSteps?.includes(id)) return 'skipped';
  if (progress.completedSteps.includes(id)) return 'done';
  if (progress.currentStep === id) return 'current';
  // Everything before the launch screen counts as done once the run is over.
  if (progress.currentStep === 'launch') return 'done';
  return 'todo';
}

/** A dash, for a step that was passed over rather than finished. */
function SkipMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true">
      <path d="M3 6h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** Check mark used on completed steps. */
function CheckMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.2 4.9 8.6 9.5 3.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The wizard's progress rail.
 *
 * Two presentations of the same state: a vertical rail with real labels above
 * 960px, and a segmented bar with "Step 2 of 5" below it. Completed steps are
 * buttons — going back is a first-class action, not a hidden one — and steps the
 * merchant has not reached are inert, both visually and to the keyboard.
 *
 * The bar reflects *completed* steps, never the step being looked at, so it
 * cannot claim progress that has not happened.
 *
 * @param props - {@link StepIndicatorProps}
 * @returns The step indicator
 */
export default function StepIndicator({
  progress,
  onNavigate,
  busy = false,
}: StepIndicatorProps): React.ReactElement {
  const current = STEPS[progress.currentStep];
  const currentNumber = current.number ?? TOTAL_STEPS;
  const percent = progress.currentStep === 'launch' ? 100 : progressPercent(progress);
  const finishedCount = reallyCompletedSteps(progress).length;
  const skippedCount = TOTAL_STEPS - finishedCount;

  return (
    <div className={styles.rail}>
      <p className={styles.railTitle}>Set up your store</p>
      <p className={styles.railMeta}>
        {progress.currentStep === 'launch'
          ? skippedCount === 0
            ? 'All five steps done'
            : `${finishedCount} of ${TOTAL_STEPS} done · ${skippedCount} skipped`
          : `Step ${currentNumber} of ${TOTAL_STEPS} · about ${Math.max(1, 6 - currentNumber)} min left`}
      </p>

      {/* Narrow viewports: segmented bar. */}
      <div className={styles.compact}>
        <div className={styles.compactHead}>
          <span className={styles.compactStep}>
            {progress.currentStep === 'launch'
              ? skippedCount === 0
                ? 'Done'
                : `${finishedCount} of ${TOTAL_STEPS} done`
              : `Step ${currentNumber} of ${TOTAL_STEPS} · ${current.shortLabel}`}
          </span>
          <span className={styles.compactPercent}>{percent}%</span>
        </div>
        <div
          className={styles.segments}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Setup progress: ${percent}% complete`}
        >
          {NUMBERED_STEPS.map((step) => (
            <span key={step.id} className={styles.segment} data-state={stateOf(step.id, progress)} />
          ))}
        </div>
      </div>

      {/* Wide viewports: the real rail. */}
      <ol className={styles.stepList}>
        {NUMBERED_STEPS.map((step) => {
          const state = stateOf(step.id, progress);
          const reachable =
            canAccessStep(progress, step.id) &&
            stepIndex(step.id) < stepIndex(progress.currentStep);

          return (
            <li key={step.id} className={styles.stepItem} data-state={state}>
              <button
                type="button"
                className={styles.stepButton}
                onClick={() => onNavigate(step.id)}
                disabled={!reachable || busy}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className={cn(styles.stepMarker)} aria-hidden="true">
                  {state === 'done' ? (
                    <CheckMark />
                  ) : state === 'skipped' ? (
                    <SkipMark />
                  ) : (
                    step.number
                  )}
                </span>
                <span className={styles.stepLabel}>{step.shortLabel}</span>
                {state === 'current' ? (
                  <span className={styles.stepHint}>In progress</span>
                ) : state === 'done' ? (
                  <span className={styles.stepStatus}>Done</span>
                ) : state === 'skipped' ? (
                  <span className={styles.stepSkipped}>
                    Skipped{reachable ? ' · do it now' : ''}
                  </span>
                ) : (
                  <span className={styles.stepHint}>Not started</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
