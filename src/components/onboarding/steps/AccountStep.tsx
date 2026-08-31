'use client';

import * as React from 'react';
import { useClerkAvailable } from '@/components/auth/ClerkAvailability';
import type { OnboardingApi } from '../useOnboarding';
import ClerkAccountStep from './ClerkAccountStep';
import NativeAccountStep from './NativeAccountStep';

/**
 * Step 1 — Create your account.
 *
 * Picks the identity provider, nothing else. The question is whether the root layout actually
 * mounted a `<ClerkProvider>` — which it does only when *both* keys are set — because that is what
 * decides whether `ClerkAccountStep`'s `useUser` works or throws. The publishable key alone would
 * be the wrong question: it is present on a deployment missing `CLERK_SECRET_KEY`, where the
 * widget would sign someone in against an instance no route can verify.
 *
 * @param props.api - The onboarding API from `useOnboarding`
 * @returns Whichever account step this environment can actually complete
 */
export default function AccountStep({ api }: { api: OnboardingApi }): React.ReactElement {
  return useClerkAvailable() ? <ClerkAccountStep api={api} /> : <NativeAccountStep api={api} />;
}
