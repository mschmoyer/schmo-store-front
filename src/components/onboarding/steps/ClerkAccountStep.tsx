'use client';

import * as React from 'react';
import { SignUp, useUser } from '@clerk/nextjs';
import { Spinner } from '@/components/ui';
import { Banner, StepPanel } from '@/components/wizard';
import { clerkAppearance } from '@/components/auth/clerkAppearance';
import { STEPS } from '../lib/steps';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

/**
 * Step 1 — Create your account, through Clerk.
 *
 * Two phases in one step, because signing up and being provisioned are two different things:
 *
 * 1. `<SignUp />` runs the whole email/verification/OAuth flow in place. Hash routing keeps every
 *    sub-step on `/create-store` so the wizard's own `?step=` history (see `useStepHistory`) is
 *    not fighting a second router for the path.
 * 2. The moment Clerk reports a signed-in user, we POST an **empty body** to
 *    `/api/onboarding/account`. Clerk already told the server who this is, via the session cookie;
 *    sending an email or a name from the browser would just be an unverified claim about identity,
 *    and the route ignores it. The response is the same onboarding state the native path gets, so
 *    `api.submit` advances the wizard identically.
 *
 * Provisioning is idempotent server-side, but it is also guarded here: React may run the effect
 * twice (StrictMode, a re-render while the request is in flight) and two concurrent creates for
 * one user is not a race worth relying on the database to settle. The guard is released on
 * failure so the retry button can work.
 *
 * @param props.api - The onboarding API from `useOnboarding`
 * @returns The account step
 */
export default function ClerkAccountStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const { isLoaded, isSignedIn } = useUser();
  const { submit } = api;
  const claimed = React.useRef(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const provision = React.useCallback(async () => {
    if (claimed.current) return;
    claimed.current = true;
    setFailure(null);
    const error = await submit('/api/onboarding/account', {});
    if (error) {
      claimed.current = false;
      setFailure(error.message);
    }
  }, [submit]);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void provision();
  }, [isLoaded, isSignedIn, provision]);

  if (isLoaded && isSignedIn) {
    return (
      <StepPanel
        step={STEPS.account}
        onSubmit={() => void provision()}
        banner={
          failure ? (
            <Banner tone="danger" title="We couldn’t finish setting up your account">
              {failure} Press Enter to try again.
            </Banner>
          ) : null
        }
      >
        <div className={styles.fields} aria-busy={!failure} aria-live="polite">
          {failure ? null : (
            <p>
              <Spinner size="sm" /> Setting up your account…
            </p>
          )}
        </div>
      </StepPanel>
    );
  }

  return (
    <StepPanel step={STEPS.account} noForm>
      <div className={styles.fields}>
        <SignUp routing="hash" appearance={clerkAppearance} signInUrl="/login" />
      </div>
    </StepPanel>
  );
}
