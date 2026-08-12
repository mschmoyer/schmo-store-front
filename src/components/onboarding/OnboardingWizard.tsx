'use client';

import * as React from 'react';
import { WizardContainer } from '@/components/wizard';
import { useOnboarding } from './useOnboarding';
import type { StepId } from './lib/steps';
import AccountStep from './steps/AccountStep';
import StoreStep from './steps/StoreStep';
import ShipStationStep from './steps/ShipStationStep';
import ImportStep from './steps/ImportStep';
import ThemeStep from './steps/ThemeStep';
import LaunchStep from './steps/LaunchStep';
import wizardStyles from '@/components/wizard/Wizard.module.css';

const STEP_COMPONENTS: Record<StepId, React.ComponentType<{ api: ReturnType<typeof useOnboarding> }>> =
  {
    account: AccountStep,
    store: StoreStep,
    shipstation: ShipStationStep,
    import: ImportStep,
    style: ThemeStep,
    launch: LaunchStep,
  };

/**
 * The signup wizard.
 *
 * Renders whichever step the *server* says the merchant is on. There is no
 * client-side step counter to get out of sync, which is what makes resume work:
 * loading `/create-store` with a session cookie lands you exactly where you left
 * off, including mid-import.
 *
 * @returns The wizard
 */
export default function OnboardingWizard(): React.ReactElement {
  const api = useOnboarding();

  if (api.loading) {
    return (
      <div className={wizardStyles.page}>
        <div className={wizardStyles.masthead}>
          <span className={wizardStyles.brand}>
            <span className={wizardStyles.brandMark} aria-hidden="true">
              R
            </span>
            <span className={wizardStyles.brandName}>RebelShops</span>
          </span>
        </div>
        <div className={wizardStyles.body} aria-busy="true">
          <div className={wizardStyles.skeletonRail} />
          <div className={wizardStyles.skeletonCard} />
        </div>
      </div>
    );
  }

  const Step = STEP_COMPONENTS[api.state.currentStep] ?? AccountStep;

  return (
    <WizardContainer
      progress={{
        currentStep: api.state.currentStep,
        completedSteps: api.state.completedSteps,
        status: api.state.status,
      }}
      onNavigate={(step) => void api.navigate(step)}
      busy={api.busy}
      exitHref={api.state.authenticated ? '/login' : '/'}
      exitLabel={api.state.authenticated ? 'Save and finish later' : 'Back to site'}
    >
      <Step api={api} />
    </WizardContainer>
  );
}
