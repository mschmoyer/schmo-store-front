'use client';

import * as React from 'react';
import { validateSlug } from './lib/slug';

export type SlugState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

export interface SlugAvailabilityResult {
  state: SlugState;
  message: string | null;
  suggestions: string[];
}

/** How long we wait after the last keystroke before asking the server. */
export const SLUG_DEBOUNCE_MS = 350;

/**
 * Debounced server-side availability check for a store address.
 *
 * Local validation runs immediately (no round-trip needed to know that `My
 * Store!` is not a legal address); the network call only happens for slugs that
 * are already well-formed. Responses that arrive out of order are discarded, so
 * a slow answer for an old slug can never overwrite a fresh one.
 *
 * @param slug - The current slug
 * @returns The availability state, its message and any suggestions
 */
export function useSlugAvailability(slug: string): SlugAvailabilityResult {
  const [result, setResult] = React.useState<SlugAvailabilityResult>({
    state: 'idle',
    message: null,
    suggestions: [],
  });
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!slug) {
      setResult({ state: 'idle', message: null, suggestions: [] });
      return;
    }

    const validation = validateSlug(slug);
    if (!validation.valid) {
      setResult({
        state: 'invalid',
        message: validation.message ?? 'Enter a store address',
        suggestions: [],
      });
      return;
    }

    setResult((current) => ({ ...current, state: 'checking', message: null }));
    const id = requestId.current + 1;
    requestId.current = id;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/onboarding/slug?slug=${encodeURIComponent(slug)}`,
            { signal: controller.signal, cache: 'no-store' }
          );
          const payload = (await response.json()) as {
            available?: boolean;
            message?: string;
            suggestions?: string[];
          };
          if (requestId.current !== id) return;

          if (!response.ok) {
            setResult({
              state: 'error',
              message: payload.message ?? 'We couldn’t check that address.',
              suggestions: [],
            });
            return;
          }

          setResult({
            state: payload.available ? 'available' : 'taken',
            message: payload.available ? null : (payload.message ?? 'That address is taken. Try another.'),
            suggestions: payload.suggestions ?? [],
          });
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          if (requestId.current !== id) return;
          setResult({
            state: 'error',
            message: 'We couldn’t check that address. Check your connection and try again.',
            suggestions: [],
          });
        }
      })();
    }, SLUG_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);

  return result;
}
