import {
  NUMBERED_STEPS,
  STEPS,
  STEP_IDS,
  TOTAL_STEPS,
  asStepId,
  canAccessStep,
  completeStep,
  furthestReached,
  goToStep,
  nextStep,
  previousStep,
  progressPercent,
  sortSteps,
  type OnboardingProgress,
  type StepId,
} from '../steps';

/**
 * A fresh run.
 *
 * @returns Progress for a merchant who has just landed on step 1
 */
function fresh(): OnboardingProgress {
  return { currentStep: 'account', completedSteps: [], status: 'in_progress' };
}

describe('step definitions', () => {
  it('numbers exactly five steps, matching the copy deck progress label', () => {
    expect(NUMBERED_STEPS).toHaveLength(TOTAL_STEPS);
    expect(NUMBERED_STEPS.map((step) => step.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps launch out of the numbered sequence', () => {
    expect(STEPS.launch.number).toBeNull();
    expect(STEP_IDS[STEP_IDS.length - 1]).toBe('launch');
  });

  it('uses the copy deck titles verbatim', () => {
    expect(STEPS.account.title).toBe('Create your account');
    expect(STEPS.store.title).toBe('Name your store');
    expect(STEPS.shipstation.title).toBe('Connect ShipStation');
    expect(STEPS.import.title).toBe('Pull in your catalog');
    expect(STEPS.style.title).toBe('Style it and publish');
  });

  it('marks only the steps that can honestly be skipped', () => {
    expect(STEPS.shipstation.skippable).toBe(true);
    expect(STEPS.import.skippable).toBe(true);
    expect(STEPS.account.skippable).toBe(false);
    expect(STEPS.store.skippable).toBe(false);
    expect(STEPS.style.skippable).toBe(false);
  });
});

describe('nextStep / previousStep', () => {
  it('walks the sequence forwards', () => {
    expect(nextStep('account')).toBe('store');
    expect(nextStep('store')).toBe('shipstation');
    expect(nextStep('shipstation')).toBe('import');
    expect(nextStep('import')).toBe('style');
    expect(nextStep('style')).toBe('launch');
  });

  it('stops at the end', () => {
    expect(nextStep('launch')).toBeNull();
  });

  it('walks the sequence backwards and stops at the start', () => {
    expect(previousStep('store')).toBe('account');
    expect(previousStep('account')).toBeNull();
  });
});

describe('completeStep', () => {
  it('advances the cursor and records the completion', () => {
    const after = completeStep(fresh(), 'account');
    expect(after.currentStep).toBe('store');
    expect(after.completedSteps).toEqual(['account']);
  });

  it('does not mutate the input', () => {
    const before = fresh();
    completeStep(before, 'account');
    expect(before).toEqual(fresh());
  });

  it('is idempotent — re-completing does not duplicate', () => {
    const once = completeStep(fresh(), 'account');
    const twice = completeStep(once, 'account');
    expect(twice.completedSteps).toEqual(['account']);
    expect(twice.currentStep).toBe('store');
  });

  it('does not rewind the cursor when an earlier step is re-saved', () => {
    let progress = fresh();
    progress = completeStep(progress, 'account');
    progress = completeStep(progress, 'store');
    progress = completeStep(progress, 'shipstation');
    expect(progress.currentStep).toBe('import');

    // Merchant walks back to step 2 and saves again.
    progress = goToStep(progress, 'store');
    expect(progress.currentStep).toBe('store');
    progress = completeStep(progress, 'store');
    expect(progress.currentStep).toBe('shipstation');
    expect(progress.completedSteps).toEqual(['account', 'store', 'shipstation']);
  });

  it('keeps completed steps in wizard order regardless of arrival order', () => {
    const progress: OnboardingProgress = {
      currentStep: 'import',
      completedSteps: ['shipstation', 'account', 'store'],
      status: 'in_progress',
    };
    expect(completeStep(progress, 'import').completedSteps).toEqual([
      'account',
      'store',
      'shipstation',
      'import',
    ]);
  });

  it('marks the run completed on reaching launch', () => {
    const progress: OnboardingProgress = {
      currentStep: 'style',
      completedSteps: ['account', 'store', 'shipstation', 'import'],
      status: 'in_progress',
    };
    const after = completeStep(progress, 'style');
    expect(after.currentStep).toBe('launch');
    expect(after.status).toBe('completed');
  });
});

describe('canAccessStep / goToStep', () => {
  const midway: OnboardingProgress = {
    currentStep: 'import',
    completedSteps: ['account', 'store', 'shipstation'],
    status: 'in_progress',
  };

  it('always allows going back to a completed step', () => {
    expect(canAccessStep(midway, 'store')).toBe(true);
    expect(goToStep(midway, 'store').currentStep).toBe('store');
  });

  it('allows staying put', () => {
    expect(canAccessStep(midway, 'import')).toBe(true);
  });

  it('refuses to skip ahead past work that has not happened', () => {
    expect(canAccessStep(midway, 'style')).toBe(false);
    expect(canAccessStep(midway, 'launch')).toBe(false);
    expect(goToStep(midway, 'style')).toBe(midway);
  });

  it('still allows the forward step after walking backwards', () => {
    const back = goToStep(midway, 'store');
    expect(canAccessStep(back, 'import')).toBe(true);
    expect(canAccessStep(back, 'style')).toBe(false);
  });

  it('reports the furthest step reached', () => {
    expect(furthestReached(midway)).toBe('import');
    expect(furthestReached(goToStep(midway, 'account'))).toBe('import');
  });
});

describe('resume', () => {
  it('round-trips through the shape the database stores', () => {
    // Simulates: complete three steps, close the tab, come back.
    let progress = fresh();
    progress = completeStep(progress, 'account');
    progress = completeStep(progress, 'store');
    progress = completeStep(progress, 'shipstation');

    const persisted = {
      current_step: progress.currentStep as string,
      completed_steps: progress.completedSteps as string[],
    };

    const resumed: OnboardingProgress = {
      currentStep: asStepId(persisted.current_step),
      completedSteps: sortSteps(persisted.completed_steps.map((id) => asStepId(id))),
      status: 'in_progress',
    };

    expect(resumed).toEqual(progress);
  });

  it('falls back safely when the stored step is unrecognised', () => {
    expect(asStepId('not-a-step')).toBe('account');
    expect(asStepId(undefined, 'store')).toBe('store');
    expect(asStepId(42, 'store')).toBe('store');
  });
});

describe('progressPercent', () => {
  it('reports zero for a fresh run', () => {
    expect(progressPercent(fresh())).toBe(0);
  });

  it('counts completed steps, not the step being looked at', () => {
    const progress: OnboardingProgress = {
      currentStep: 'style',
      completedSteps: ['account', 'store', 'shipstation', 'import'],
      status: 'in_progress',
    };
    expect(progressPercent(progress)).toBe(80);
  });

  it('excludes launch from the denominator so it can reach exactly 100', () => {
    const progress: OnboardingProgress = {
      currentStep: 'launch',
      completedSteps: ['account', 'store', 'shipstation', 'import', 'style'],
      status: 'completed',
    };
    expect(progressPercent(progress)).toBe(100);
  });

  it('never claims progress a merchant has not made', () => {
    const jumped: OnboardingProgress = {
      currentStep: 'style',
      completedSteps: ['account'],
      status: 'in_progress',
    };
    expect(progressPercent(jumped)).toBe(20);
  });
});

describe('sortSteps', () => {
  it('orders ids by wizard position', () => {
    const shuffled: StepId[] = ['style', 'account', 'import', 'store'];
    expect(sortSteps(shuffled)).toEqual(['account', 'store', 'import', 'style']);
  });
});
