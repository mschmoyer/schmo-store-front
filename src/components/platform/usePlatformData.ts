'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlatformResponse } from './types';

/**
 * The one place the operator console talks to `/api/platform/*`.
 *
 * Three things are centralised here because getting any of them wrong on one screen and right on
 * another is how a console starts lying:
 *
 * 1. **Authentication.** The merchant shell keeps its JWT in `localStorage` under `admin_token` and
 *    sends it as a Bearer header (see `src/contexts/AdminContext.tsx`); the same session also
 *    exists as an httpOnly `session` cookie. Both are sent, so the console keeps working if either
 *    one is the only survivor.
 * 2. **Failure is never zero.** A rejected fetch, a 403 and a 404 are three different facts and
 *    none of them is "0 orders". Callers get a typed error and are expected to render it — §
 *    "Honest results" in CLAUDE.md exists because this codebase has shipped the other thing.
 * 3. **Staleness.** A window switch from 30 to 7 days fires a second request while the first is in
 *    flight. The in-flight one is aborted and its result discarded, so the numbers on screen always
 *    belong to the window the selector is showing.
 */

/** What went wrong, at the granularity the UI actually branches on. */
export type PlatformErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-implemented'
  | 'server'
  | 'network';

/** A fetch failure the console can render honestly. */
export interface PlatformFetchError {
  kind: PlatformErrorKind;
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** One sentence, safe to show an operator. Never contains a credential. */
  message: string;
}

/** What {@link usePlatformData} hands back. */
export interface PlatformDataState<T> {
  /** The last successful payload, or `null` if none has arrived. */
  data: T | null;
  /** The current failure, or `null`. Mutually exclusive with a fresh `data`. */
  error: PlatformFetchError | null;
  /** True while a request is in flight. */
  isLoading: boolean;
  /** Re-runs the request. Wire this to the retry button. */
  reload: () => void;
}

/**
 * Reads the merchant session token from `localStorage`.
 *
 * @returns The stored JWT, or `null` on the server and when no token is stored.
 */
export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('admin_token');
  } catch {
    /* Private-mode browsers throw on access. The session cookie still carries the request. */
    return null;
  }
}

/**
 * Builds the request headers for a platform call.
 *
 * @returns A header bag carrying the Bearer token when one is available.
 */
function authHeaders(): HeadersInit {
  const token = readAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Turns a response status into the error the console renders.
 *
 * @param status - HTTP status code.
 * @param serverMessage - `error` from the JSON envelope, when the body parsed.
 * @returns A typed {@link PlatformFetchError}.
 */
function toFetchError(status: number, serverMessage?: string): PlatformFetchError {
  if (status === 401) {
    return {
      kind: 'unauthenticated',
      status,
      message: serverMessage || 'Your session has expired. Sign in again to continue.',
    };
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      status,
      message: serverMessage || 'This account is not a platform operator.',
    };
  }
  if (status === 404) {
    return {
      kind: 'not-implemented',
      status,
      message: serverMessage || 'This platform endpoint is not available on this deployment yet.',
    };
  }
  return {
    kind: 'server',
    status,
    message: serverMessage || `The platform API returned ${status}.`,
  };
}

/**
 * Fetches one `/api/platform/*` endpoint, with auth, abort-on-change and typed errors.
 *
 * The client-side session check in `src/app/platform/layout.tsx` is a courtesy that keeps a
 * non-operator from staring at an empty console. **The enforcement is server-side**, in
 * `requirePlatformAdmin` on every route this hook calls — which is why a 403 here is rendered as a
 * real answer rather than treated as impossible.
 *
 * @typeParam T - The `data` payload shape for the endpoint.
 * @param path - The endpoint to read, query string included. Pass `null` to stay idle (for example
 *   while the shell is still deciding whether the viewer is an operator).
 * @returns The {@link PlatformDataState} for that endpoint.
 */
export function usePlatformData<T>(path: string | null): PlatformDataState<T> {
  const [attempt, setAttempt] = useState(0);
  /*
   * One piece of state, stamped with the request it belongs to.
   *
   * `isLoading` is *derived* from that stamp rather than being a third `useState` toggled at the
   * top of the effect. Setting state synchronously in an effect body schedules a second render
   * before the browser paints — React's own `set-state-in-effect` lint rule flags it — and doing it
   * per endpoint on a screen with three of them is three extra render passes on every window
   * switch. Comparing a key costs nothing and cannot get out of sync with the fetch it describes.
   */
  const [settled, setSettled] = useState<{
    key: string;
    data: T | null;
    error: PlatformFetchError | null;
  }>({ key: '', data: null, error: null });

  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);

  /* Identifies one request. `reload` bumps `attempt`, so retrying the same path is a new key. */
  const key = path === null ? '' : `${attempt}::${path}`;
  const isLoading = path !== null && settled.key !== key;

  useEffect(() => {
    if (path === null) return;

    const controller = new AbortController();
    let cancelled = false;

    const finish = (data: T | null, error: PlatformFetchError | null) => {
      if (!cancelled) setSettled({ key, data, error });
    };

    const run = async () => {
      try {
        const response = await fetch(path, {
          headers: authHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        let payload: PlatformResponse<T> | null = null;
        try {
          payload = (await response.json()) as PlatformResponse<T>;
        } catch {
          /* A 500 from the edge, or an HTML error page. `payload` stays null. */
        }

        if (cancelled) return;

        if (!response.ok || !payload?.success || payload.data === undefined) {
          finish(
            null,
            response.ok && payload && !payload.success
              ? {
                  kind: 'server',
                  status: response.status,
                  message: payload.error || 'The platform API could not answer.',
                }
              : toFetchError(response.status, payload?.error)
          );
          return;
        }

        finish(payload.data, null);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        finish(null, {
          kind: 'network',
          status: 0,
          message: 'The console could not reach the platform API. Check your connection and retry.',
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, key]);

  /*
   * While a request is in flight the caller gets neither the previous window's numbers nor a stale
   * error. Showing 30 days of data under a heading that now says "last 7 days" is a small lie, and
   * the loading skeleton is the honest answer for the few hundred milliseconds it takes.
   */
  return {
    data: isLoading ? null : settled.data,
    error: isLoading ? null : settled.error,
    isLoading,
    reload,
  };
}
