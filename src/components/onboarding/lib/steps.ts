/**
 * The onboarding state machine.
 *
 * Five numbered steps, exactly as the copy deck §5.5 words them, plus a
 * terminal `launch` screen that is a celebration rather than a step (the copy
 * deck's progress label is "Step {n} of 5", so `launch` is deliberately not
 * counted).
 *
 * This module is pure and is the single source of truth for:
 *   - which step comes next,
 *   - which steps a merchant may jump back to,
 *   - whether the wizard is finished.
 *
 * The server stores `current_step` / `completed_steps` verbatim from these ids,
 * so a merchant who closes the tab resumes exactly where they were.
 */

export const STEP_IDS = ['account', 'store', 'shipstation', 'import', 'style', 'launch'] as const;

export type StepId = (typeof STEP_IDS)[number];

export interface StepDefinition {
  id: StepId;
  /** 1-based position in the progress label. `null` for the terminal screen. */
  number: number | null;
  /** Copy deck §5.5, verbatim. */
  title: string;
  /** Copy deck §5.5 helper text, verbatim. */
  helper: string;
  /** Copy deck §5.5 primary button label. */
  primaryLabel: string;
  /** Short label for the step indicator, which has no room for the full title. */
  shortLabel: string;
  /** Whether this step can honestly be skipped without breaking the store. */
  skippable: boolean;
}

/** Number of *numbered* steps — the "of 5" in the progress label. */
export const TOTAL_STEPS = 5;

export const STEPS: Record<StepId, StepDefinition> = {
  account: {
    id: 'account',
    number: 1,
    title: 'Create your account',
    helper: 'Email and a password. Two minutes, and nothing syncs yet.',
    primaryLabel: 'Continue',
    shortLabel: 'Account',
    skippable: false,
  },
  store: {
    id: 'store',
    number: 2,
    title: 'Name your store',
    helper: 'Your store name and address. Both can change later.',
    primaryLabel: 'Continue',
    shortLabel: 'Store',
    skippable: false,
  },
  shipstation: {
    id: 'shipstation',
    number: 3,
    title: 'Connect ShipStation',
    helper: 'Paste your API key. We test the connection before saving anything.',
    primaryLabel: 'Test connection',
    shortLabel: 'ShipStation',
    skippable: true,
  },
  import: {
    id: 'import',
    number: 4,
    title: 'Pull in your catalog',
    helper:
      "We'll read your products, SKUs, prices, images and stock levels. A few hundred SKUs takes a few minutes — keep this tab open, and if you close it the sync resumes where it stopped.",
    primaryLabel: 'Start sync',
    shortLabel: 'Catalog',
    skippable: true,
  },
  style: {
    id: 'style',
    number: 5,
    title: 'Style it and publish',
    helper: 'Pick a theme. Publish when it looks right.',
    primaryLabel: 'Publish my store',
    shortLabel: 'Style',
    skippable: false,
  },
  launch: {
    id: 'launch',
    number: null,
    title: 'Your store is live',
    helper: 'Here is the address. Send it to someone.',
    primaryLabel: 'View my store',
    shortLabel: 'Live',
    skippable: false,
  },
};

/** The numbered steps, in order — what the step indicator renders. */
export const NUMBERED_STEPS: StepDefinition[] = STEP_IDS.filter(
  (id) => STEPS[id].number !== null
).map((id) => STEPS[id]);

/**
 * Ordinal position of a step in the full sequence, including `launch`.
 *
 * @param id - Step id
 * @returns Zero-based index, or -1 when the id is unknown
 */
export function stepIndex(id: StepId): number {
  return STEP_IDS.indexOf(id);
}

/**
 * The step that follows `id`.
 *
 * @param id - Current step
 * @returns The next step id, or `null` when already at the end
 */
export function nextStep(id: StepId): StepId | null {
  const index = stepIndex(id);
  if (index < 0 || index >= STEP_IDS.length - 1) return null;
  return STEP_IDS[index + 1];
}

/**
 * The step before `id`.
 *
 * @param id - Current step
 * @returns The previous step id, or `null` when already at the start
 */
export function previousStep(id: StepId): StepId | null {
  const index = stepIndex(id);
  if (index <= 0) return null;
  return STEP_IDS[index - 1];
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export interface OnboardingProgress {
  currentStep: StepId;
  completedSteps: StepId[];
  status: 'in_progress' | 'completed';
}

/**
 * Mark a step complete and move to the next one.
 *
 * Completion is a set, not a counter: re-completing a step the merchant walked
 * back to does not duplicate it, and does not lose the steps beyond it. Moving
 * forward never rewinds `currentStep` — a merchant who went back to step 2 and
 * re-saved lands back on step 3, not somewhere behind where they already were.
 *
 * @param progress - Current progress
 * @param completed - The step just finished
 * @returns A new progress object; the input is not mutated
 */
export function completeStep(
  progress: OnboardingProgress,
  completed: StepId
): OnboardingProgress {
  const completedSteps = progress.completedSteps.includes(completed)
    ? progress.completedSteps
    : [...progress.completedSteps, completed];

  const target = nextStep(completed) ?? completed;
  const currentStep =
    stepIndex(target) > stepIndex(progress.currentStep) ? target : progress.currentStep;

  return {
    currentStep,
    completedSteps: sortSteps(completedSteps),
    status: currentStep === 'launch' ? 'completed' : progress.status,
  };
}

/**
 * Walk back to an earlier step without losing anything.
 *
 * @param progress - Current progress
 * @param target - Step to return to
 * @returns A new progress object, or the input when the jump is not allowed
 */
export function goToStep(progress: OnboardingProgress, target: StepId): OnboardingProgress {
  if (!canAccessStep(progress, target)) return progress;
  return { ...progress, currentStep: target };
}

/**
 * Whether the merchant may jump directly to a step.
 *
 * Reachable = already completed, or the step they are on, or the step
 * immediately after the furthest completed one. You cannot skip ahead past work
 * that has not happened, but you can always go back.
 *
 * @param progress - Current progress
 * @param target - Step being requested
 * @returns Whether the jump is allowed
 */
export function canAccessStep(progress: OnboardingProgress, target: StepId): boolean {
  if (target === progress.currentStep) return true;
  if (progress.completedSteps.includes(target)) return true;
  const furthest = furthestReached(progress);
  return stepIndex(target) <= stepIndex(furthest);
}

/**
 * The furthest step the merchant has legitimately reached.
 *
 * @param progress - Current progress
 * @returns The furthest reachable step id
 */
export function furthestReached(progress: OnboardingProgress): StepId {
  const completedMax = progress.completedSteps.reduce(
    (max, id) => Math.max(max, stepIndex(id)),
    -1
  );
  const afterCompleted = Math.min(completedMax + 1, STEP_IDS.length - 1);
  return STEP_IDS[Math.max(afterCompleted, stepIndex(progress.currentStep))];
}

/**
 * Sort a set of step ids into wizard order, so the indicator and the database
 * never disagree about sequence.
 *
 * @param ids - Step ids in any order
 * @returns The same ids in wizard order
 */
export function sortSteps(ids: StepId[]): StepId[] {
  return [...ids].sort((a, b) => stepIndex(a) - stepIndex(b));
}

/**
 * Coerce an arbitrary string (e.g. a column value written by an older build)
 * into a known step id.
 *
 * @param value - Candidate step id
 * @param fallback - What to return when the value is not a step
 * @returns A valid step id
 */
export function asStepId(value: unknown, fallback: StepId = 'account'): StepId {
  return typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value)
    ? (value as StepId)
    : fallback;
}

/**
 * Percentage of the numbered sequence completed, for the progress bar. The bar
 * reflects *completed* steps, not the step you happen to be looking at, so it
 * can never claim progress that has not happened.
 *
 * @param progress - Current progress
 * @returns 0–100
 */
export function progressPercent(progress: OnboardingProgress): number {
  const numbered = progress.completedSteps.filter((id) => STEPS[id].number !== null);
  return Math.round((numbered.length / TOTAL_STEPS) * 100);
}
