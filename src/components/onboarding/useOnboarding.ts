'use client';

import * as React from 'react';
import type { OnboardingState } from './lib/types';
import { ANONYMOUS_STATE } from './lib/types';
import type { StepId } from './lib/steps';

export interface OnboardingApiError {
  message: string;
  fieldErrors?: Record<string, string>;
  status: number;
  /** Present on the ShipStation route: the classified check result. */
  check?: {
    status: string;
    message: string;
    action: string;
    httpStatus?: number;
    detail?: string;
  };
}

export interface OnboardingApi {
  state: OnboardingState;
  /** True only during the first load, so we can show a skeleton once. */
  loading: boolean;
  /** True while a mutation is in flight. Disables navigation, not fields. */
  busy: boolean;
  /** A transport-level failure that is not tied to one field. */
  error: string | null;
  clearError: () => void;
  /**
   * POST a step. Resolves with `null` on success (state is applied internally)
   * or with the parsed error so the step can put it on the right field.
   */
  submit: (path: string, body?: unknown) => Promise<OnboardingApiError | null>;
  /** Move the server-side cursor. Used by Back and by the indicator. */
  navigate: (step: StepId) => Promise<void>;
  /** Re-read state from the server. Used on resume and after an import slice. */
  refresh: () => Promise<void>;
}

/**
 * The wizard's only source of truth.
 *
 * There is deliberately no local mirror of `currentStep` here: every transition
 * is a server round-trip that returns the whole state, and the component tree
 * renders from that. Closing the tab therefore loses nothing, and the Back
 * button cannot desync from what the database thinks.
 *
 * @returns {@link OnboardingApi}
 */
export function useOnboarding(): OnboardingApi {
  const [state, setState] = React.useState<OnboardingState>(ANONYMOUS_STATE);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      /*
       * Forward `?coupon_error=` from the browser's URL to the state route.
       *
       * `/join/<code>` redirects a dead link to `/create-store?coupon_error=expired` (or
       * `exhausted` / `inactive` / `unknown`) and sets no cookie — there is nothing to remember,
       * only something to say. The state route reads that reason off `request.url`, but its
       * request is this fetch, not the page navigation, so without forwarding it the reason is
       * dropped and the wizard renders no banner at all. That is exactly the silent full-price
       * signup `docs/plans/platform-coupons.md` §11 invariant 7 forbids: a friend clicking a dead
       * link would be quietly charged standard price with nothing on screen explaining why.
       */
      const couponError =
        typeof window === 'undefined'
          ? null
          : new URLSearchParams(window.location.search).get('coupon_error');
      const url = couponError
        ? `/api/onboarding/state?coupon_error=${encodeURIComponent(couponError)}`
        : '/api/onboarding/state';

      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        setState(ANONYMOUS_STATE);
        return;
      }
      const payload = (await response.json()) as { state?: OnboardingState };
      if (payload.state) setState(payload.state);
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.');
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const submit = React.useCallback(
    async (path: string, body?: unknown): Promise<OnboardingApiError | null> => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });

        let payload: Record<string, unknown> = {};
        try {
          payload = (await response.json()) as Record<string, unknown>;
        } catch {
          payload = {};
        }

        if (payload.state) setState(payload.state as OnboardingState);

        if (!response.ok) {
          return {
            status: response.status,
            message:
              typeof payload.message === 'string'
                ? payload.message
                : 'We couldn’t save that. Check your connection and try again.',
            fieldErrors: payload.fieldErrors as Record<string, string> | undefined,
            check: payload.check as OnboardingApiError['check'],
          };
        }
        return null;
      } catch {
        return {
          status: 0,
          message: 'We couldn’t save that. Check your connection and try again.',
        };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const navigate = React.useCallback(
    async (step: StepId) => {
      await submit('/api/onboarding/state', { step });
    },
    [submit]
  );

  return {
    state,
    loading,
    busy,
    error,
    clearError: React.useCallback(() => setError(null), []),
    submit,
    navigate,
    refresh,
  };
}
