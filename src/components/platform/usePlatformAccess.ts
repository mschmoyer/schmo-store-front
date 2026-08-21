'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminUser } from '@/lib/types/admin';
import { readAdminToken } from './usePlatformData';

/**
 * The console's door check.
 *
 * **This is a courtesy, not the gate.** It exists so a merchant who follows a stale link gets a
 * sentence instead of an empty dashboard, and so an operator does not watch a shell render around
 * data it will never be allowed to fetch. It authorises nothing: every figure the console displays
 * comes from `/api/platform/*`, and every one of those routes calls `requirePlatformAdmin` against
 * `users.is_admin` in the database on each request. A client that patches `isAdmin` to `true` in its
 * own memory gets the chrome and six 403s.
 *
 * The flag is re-read from the database by `/api/admin/auth/verify` rather than trusted from the
 * seven-day session JWT, so a revocation takes effect on the next page load in both directions.
 */

/** Where the viewer stands. Each value maps to one thing the shell renders. */
export type PlatformAccessStatus =
  /** The verify call is still in flight. Draw the shell skeleton. */
  | 'checking'
  /** Verified operator. Draw the console. */
  | 'operator'
  /** A valid session that is not an operator. Draw the not-authorised state. */
  | 'not-operator'
  /** No session, or an expired one. Send them to `/login`. */
  | 'signed-out'
  /** The verify call itself failed. Draw an error with a retry — never a silent redirect. */
  | 'error';

/** What {@link usePlatformAccess} reports. */
export interface PlatformAccess {
  status: PlatformAccessStatus;
  /** The verified user, present only when `status` is `operator` or `not-operator`. */
  user: AdminUser | null;
  /** Re-runs the verify call. */
  recheck: () => void;
}

/**
 * Verifies the current session and whether it belongs to a platform operator.
 *
 * @returns The {@link PlatformAccess} state for the console shell.
 */
export function usePlatformAccess(): PlatformAccess {
  const [status, setStatus] = useState<PlatformAccessStatus>('checking');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  const recheck = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const verify = async () => {
      setStatus('checking');
      try {
        const token = readAdminToken();
        const response = await fetch('/api/admin/auth/verify', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
          signal: controller.signal,
        });

        if (cancelled) return;

        if (response.status === 401) {
          setUser(null);
          setStatus('signed-out');
          return;
        }

        if (!response.ok) {
          setUser(null);
          setStatus('error');
          return;
        }

        const payload = (await response.json()) as {
          success?: boolean;
          data?: { user?: AdminUser };
        };

        if (cancelled) return;

        const verified = payload?.success ? (payload.data?.user ?? null) : null;
        if (!verified) {
          setUser(null);
          setStatus('signed-out');
          return;
        }

        setUser(verified);
        setStatus(verified.isAdmin === true ? 'operator' : 'not-operator');
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setUser(null);
        setStatus('error');
      }
    };

    void verify();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  return { status, user, recheck };
}
