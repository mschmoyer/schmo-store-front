'use client';

/**
 * The console's authenticated GET.
 *
 * This is the customers lane's local fallback for the shared
 * `usePlatformData` hook. It reads the bearer token out of `localStorage`
 * exactly as `AdminContext` does rather than calling `useAdmin()`, so a
 * `/platform` page renders correctly whether or not an `AdminProvider` is
 * mounted above it — the console shell is a separate workstream, and a screen
 * that throws "useAdmin must be used within an AdminProvider" during that
 * window is indistinguishable from a broken page. The session cookie is sent
 * too, so the request still authenticates if the token was never written.
 *
 * The other reason this exists rather than a bare `fetch` in each page: HTTP
 * status carries meaning the console has to act on, and collapsing it to one
 * "something went wrong" banner is the failure this codebase already shipped
 * once. 401 means sign in again, 403 means you are signed in but not a platform
 * admin, and 404 means the record does not exist — three different screens, and
 * a caller cannot tell them apart from an `Error` message. So the failure is
 * returned as a typed value with the status attached.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** How a request failed, in the terms the UI branches on. */
export type PlatformFetchErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'network';

/** A failed request, classified. */
export interface PlatformFetchError {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  kind: PlatformFetchErrorKind;
  /** Safe to show a human. Never contains a credential. */
  message: string;
}

/** What {@link usePlatformFetch} hands back. */
export interface PlatformFetchState<T> {
  data: T | null;
  error: PlatformFetchError | null;
  /** True only until the first response settles. Drives the skeleton. */
  loading: boolean;
  /** True for every refetch after the first. Drives a dim, never a blank. */
  refreshing: boolean;
  /** Refetch the current URL. */
  reload: () => void;
}

/**
 * Classifies a response status into something the UI can branch on.
 *
 * @param status - HTTP status code.
 * @returns The matching error kind.
 */
function classify(status: number): PlatformFetchErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 0) return 'network';
  return 'server';
}

/** Default human copy per kind, used when the API sends no message of its own. */
const DEFAULT_MESSAGE: Record<PlatformFetchErrorKind, string> = {
  unauthenticated: 'Your session has expired. Sign in again to continue.',
  forbidden: 'This account is not a platform administrator.',
  not_found: 'That record does not exist.',
  server: 'The server could not complete the request.',
  network: 'The request could not reach the server.',
};

/**
 * GET a `/api/platform/**` endpoint as the signed-in platform admin.
 *
 * @typeParam T - The shape of `data` in the `{ success, data }` envelope.
 * @param url - The endpoint to call, or `null` to stay idle (e.g. while a
 *   route parameter is still resolving).
 * @returns The response, a typed failure, and the two loading flags.
 */
export function usePlatformFetch<T>(url: string | null): PlatformFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PlatformFetchError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  /* First paint gets the skeleton; every later fetch dims what is already on
     screen. Blanking a loaded table on each keystroke is what made the
     catalogue feel broken, and the search box here is debounced onto the URL. */
  const settledOnce = useRef(false);

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    let cancelled = false;

    if (settledOnce.current) setRefreshing(true);
    else setLoading(true);

    const run = async (): Promise<void> => {
      try {
        const token =
          typeof window === 'undefined' ? null : window.localStorage.getItem('admin_token');

        const response = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        /* A missing route handler answers with Next's HTML 404 page, so the
           body is not always JSON. Failing to parse must not be reported as a
           network error — the status is the fact that matters. */
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: T; error?: string; message?: string }
          | null;

        if (cancelled) return;

        if (!response.ok || payload?.success !== true || payload.data === undefined) {
          const kind = classify(response.ok ? 500 : response.status);
          setError({
            status: response.status,
            kind,
            message: payload?.error || payload?.message || DEFAULT_MESSAGE[kind],
          });
          setData(null);
          return;
        }

        setError(null);
        setData(payload.data);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError({ status: 0, kind: 'network', message: DEFAULT_MESSAGE.network });
        setData(null);
      } finally {
        if (!cancelled) {
          settledOnce.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, refreshing, reload };
}
