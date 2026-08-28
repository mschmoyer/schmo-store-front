'use client';

import * as React from 'react';
import { Banner, WizardContainer } from '@/components/wizard';
import { useOnboarding } from './useOnboarding';
import { STEP_IDS, type StepId } from './lib/steps';
import type { OnboardingCoupon, OnboardingCouponErrorReason } from './lib/types';
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

/** Turn `?step=` into a step id, if it names one. */
const stepFromSearch = (search: string): StepId | null => {
  const value = new URLSearchParams(search).get('step');
  return value && (STEP_IDS as readonly string[]).includes(value) ? (value as StepId) : null;
};

/**
 * Give every step its own history entry, so Back goes back a step.
 *
 * Without this the wizard was a single URL and the browser's Back button —
 * the second most-used control there is — dropped the merchant out of setup
 * entirely, onto whatever preceded it. Nothing was lost (the server holds the
 * state, and returning resumes), but the merchant had no way to know that, and
 * "Back" quietly meaning "leave" is a trap.
 *
 * The rules:
 *
 *  - the first render *replaces* rather than pushes, so Back from step 1 still
 *    leaves the wizard, which is what it should do;
 *  - a step change the merchant caused pushes a new entry;
 *  - a step change caused by Back or Forward replaces, so history does not
 *    grow while walking through it;
 *  - the server is still the authority. `popstate` asks it to move, and if it
 *    declines — a merchant editing the URL to jump ahead of work not done —
 *    the effect below writes the real step back into the address bar.
 *
 * @param currentStep - Where the server says the merchant is
 * @param navigate - Ask the server to move the cursor
 * @param loading - True during the first state fetch; no history is written yet
 */
function useStepHistory(
  currentStep: StepId,
  navigate: (step: StepId) => Promise<void>,
  loading: boolean,
): void {
  const started = React.useRef(false);
  const fromPopState = React.useRef(false);
  // Bumped after a Back-triggered navigate settles, so the effect below runs
  // again and can correct the address bar even when the step did not change.
  const [reconcile, setReconcile] = React.useState(0);

  React.useEffect(() => {
    if (loading || typeof window === 'undefined') return;

    // The address bar is the single comparison. Reading it rather than
    // remembering what we last wrote is what makes this correct across Back,
    // Forward, a hand-edited URL and a refresh alike.
    if (stepFromSearch(window.location.search) === currentStep) {
      fromPopState.current = false;
      started.current = true;
      return;
    }

    const url = `${window.location.pathname}?step=${currentStep}`;
    if (!started.current || fromPopState.current) {
      window.history.replaceState({ step: currentStep }, '', url);
    } else {
      window.history.pushState({ step: currentStep }, '', url);
    }
    started.current = true;
    fromPopState.current = false;
  }, [currentStep, loading, reconcile]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onPopState = (): void => {
      const target = stepFromSearch(window.location.search);
      if (!target) return;
      fromPopState.current = true;
      void navigate(target).finally(() => setReconcile((n) => n + 1));
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);
}

/** Human sentence for a coupon that could not be honoured. Signup always still works — see the type. */
function describeCouponFailure(reason: OnboardingCouponErrorReason): string {
  switch (reason) {
    case 'expired':
      return 'This invite link has expired.';
    case 'exhausted':
      return 'This invite link has already been fully claimed.';
    case 'inactive':
      return 'This invite link is no longer active.';
    case 'already_claimed':
      return 'Your account already has an offer applied.';
    case 'unknown':
    default:
      return 'We couldn’t find that invite code.';
  }
}

/**
 * The `/join` link's offer (or its honest failure), rendered once at the wizard shell so it
 * survives every step (docs/plans/platform-coupons.md §4A). Reads `api.state.coupon`, already
 * re-validated server-side; this component does no validation of its own.
 *
 * States the card requirement up front on the success side (plan §14 decision 1): a friend told
 * "no card needed" and then asked for one at billing is the exact failure this prevents.
 *
 * @param props.coupon - The coupon info from the current onboarding state.
 * @returns The banner, or `null` when no link is in play.
 */
function CouponBanner({ coupon }: { coupon: OnboardingCoupon }): React.ReactElement | null {
  if (coupon.offer) {
    const cardNote =
      coupon.requiresPaymentMethod === false
        ? 'No card needed today.'
        : 'A card will still be required at signup.';
    return (
      <Banner
        tone="success"
        title={coupon.attributed ? 'Your invite is reserved' : 'You have an invite offer'}
      >
        {/* `coupon.offer` has no closing full stop, so without one this reads as one run-on line:
            "…then $19.99/month No card needed today." */}
        {coupon.offer}. {cardNote}
      </Banner>
    );
  }

  if (coupon.errorReason) {
    return (
      <Banner tone="warning" title="That invite link didn’t work">
        {describeCouponFailure(coupon.errorReason)} You can still sign up — standard pricing applies.
      </Banner>
    );
  }

  return null;
}

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
  useStepHistory(api.state.currentStep, api.navigate, api.loading);

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

  /*
   * Which of the five the merchant passed over rather than finished.
   *
   * The server already knows — `shipstation.skipped` and an import whose status
   * is `skipped` — and the indicator is the only place that ever pretended
   * otherwise. `import` also counts as skipped when ShipStation was never
   * connected, because there was nothing there to import in the first place.
   */
  const skippedSteps: StepId[] = [];
  if (api.state.shipstation.skipped || (!api.state.shipstation.connected && api.state.completedSteps.includes('shipstation'))) {
    skippedSteps.push('shipstation');
  }
  if (
    api.state.completedSteps.includes('import') &&
    (api.state.importProgress.status === 'skipped' || api.state.importProgress.imported === 0)
  ) {
    skippedSteps.push('import');
  }

  return (
    <WizardContainer
      progress={{
        currentStep: api.state.currentStep,
        completedSteps: api.state.completedSteps,
        status: api.state.status,
        skippedSteps,
      }}
      onNavigate={(step) => void api.navigate(step)}
      busy={api.busy}
      exitHref={
        api.state.status === 'completed' ? null : api.state.authenticated ? '/login' : '/'
      }
      exitLabel={api.state.authenticated ? 'Save and finish later' : 'Back to site'}
    >
      <CouponBanner coupon={api.state.coupon} />
      <Step api={api} />
    </WizardContainer>
  );
}
