/**
 * What the wizard says about itself.
 *
 * Every case here is a sentence the flow used to get wrong. They are grouped by
 * the claim rather than by the component, because the defect was never in one
 * file — it was that three screens each said something reasonable in isolation
 * and contradictory together: skipped steps marked "Done", "All five steps
 * done", "Anyone with this address can shop it right now", and sixty pixels
 * below that, a note explaining the store cannot take payments.
 */

import * as React from 'react';
import { render, screen, within } from '@testing-library/react';

import StepIndicator from '@/components/wizard/StepIndicator';
import { PRESETS } from '@/lib/storefront-theme';

import { reallyCompletedSteps, type OnboardingProgress } from '../steps';

/* ------------------------------------------------------------------ *
 * The step indicator
 * ------------------------------------------------------------------ */

const finished: OnboardingProgress = {
  currentStep: 'launch',
  completedSteps: ['account', 'store', 'shipstation', 'import', 'style'],
  status: 'completed',
};

/**
 * Render the rail and return a scope over the step list itself.
 *
 * The indicator renders twice — a vertical rail above 960px and a segmented bar
 * below it — so an unscoped query sees both. Everything about *steps* is
 * asserted inside the `<ol>`.
 *
 * @param progress - Progress to render
 * @returns Queries scoped to the step list
 */
function renderRail(progress: OnboardingProgress) {
  render(<StepIndicator progress={progress} onNavigate={() => {}} />);
  return within(screen.getByRole('list'));
}

describe('a run where two steps were skipped', () => {
  const skipped: OnboardingProgress = { ...finished, skippedSteps: ['shipstation', 'import'] };

  it('does not call a skipped step done', () => {
    const steps = renderRail(skipped);
    expect(steps.getAllByText('Done')).toHaveLength(3);
    expect(steps.getAllByText(/^Skipped/)).toHaveLength(2);
  });

  it('counts the skips in the summary instead of claiming all five', () => {
    renderRail(skipped);
    expect(screen.getByText('3 of 5 done · 2 skipped')).toBeInTheDocument();
    expect(screen.queryByText('All five steps done')).not.toBeInTheDocument();
  });

  it('offers a way to go and do them', () => {
    const steps = renderRail(skipped);
    expect(steps.getAllByText(/do it now/)).toHaveLength(2);
  });
});

describe('a run where everything was done', () => {
  it('says so', () => {
    const steps = renderRail(finished);
    expect(screen.getByText('All five steps done')).toBeInTheDocument();
    expect(steps.getAllByText('Done')).toHaveLength(5);
    expect(steps.queryByText(/^Skipped/)).not.toBeInTheDocument();
  });
});

describe('a run still in progress', () => {
  it('shows the step count and marks a skipped step as it happens', () => {
    const steps = renderRail({
      currentStep: 'import',
      completedSteps: ['account', 'store', 'shipstation'],
      status: 'in_progress',
      skippedSteps: ['shipstation'],
    });
    expect(screen.getAllByText(/Step 4 of 5/).length).toBeGreaterThan(0);
    expect(steps.getByText(/^Skipped/)).toBeInTheDocument();
    expect(steps.getAllByText('Done')).toHaveLength(2);
  });
});

describe('reallyCompletedSteps', () => {
  it('excludes skipped steps', () => {
    expect(
      reallyCompletedSteps({ ...finished, skippedSteps: ['shipstation', 'import'] }),
    ).toEqual(['account', 'store', 'style']);
  });

  it('excludes the terminal launch screen, which is not a numbered step', () => {
    expect(
      reallyCompletedSteps({ ...finished, completedSteps: [...finished.completedSteps, 'launch'] }),
    ).not.toContain('launch');
  });

  it('is the identity when nothing was skipped', () => {
    expect(reallyCompletedSteps(finished)).toEqual(finished.completedSteps);
  });
});

/* ------------------------------------------------------------------ *
 * Preset copy
 * ------------------------------------------------------------------ */

describe('presets never write a promise on the merchant’s behalf', () => {
  it('ships the announcement bar off, and empty', () => {
    for (const [id, preset] of Object.entries(PRESETS)) {
      expect(preset.theme.header.announcement.enabled).toBe(false);
      expect(preset.theme.header.announcement.text).toBe('');
      expect(id).toBeTruthy();
    }
  });

  it('carries no delivery, returns or discount commitment in the header', () => {
    // The bar sits above every page on the shop. Whatever is in it reads as the
    // merchant's word, and picking a theme is not consent to give it.
    const forbidden =
      /next-day|same-day|free shipping|free samples|net-30|subscribe and save|\d+% off|\bwithin \d+ days\b/i;
    for (const preset of Object.values(PRESETS)) {
      expect(preset.theme.header.announcement.text).not.toMatch(forbidden);
    }
  });
});
