/**
 * Shared helpers for the storefront-theme admin routes.
 *
 * Authentication reuses the app's existing session mechanism
 * (`src/lib/auth/session.ts`): a `jose`-signed JWT carried either as a Bearer
 * token or in the `session` cookie, exactly as `/api/admin/store-config` does.
 * No new auth scheme is introduced here.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

import type { UserSession } from '@/lib/auth/session';

/** Field-level errors keyed by dotted path, for the customizer to display inline. */
export type FieldErrors = Record<string, string[]>;

/**
 * Flatten a Zod error into `{ 'brand.color': ['Must be a hex color…'] }`.
 * @param error - The Zod error from a failed `safeParse`
 * @returns Field errors keyed by dotted path (`_root` for top-level issues)
 */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * 401 for requests without a usable session.
 * @returns A JSON 401 response
 */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Authentication required' },
    { status: 401 },
  );
}

/**
 * 400 with optional field errors. Invalid input must never surface as a 500.
 * @param message - Human-readable summary
 * @param fieldErrors - Optional per-field detail
 * @returns A JSON 400 response
 */
export function badRequest(message: string, fieldErrors?: FieldErrors): NextResponse {
  return NextResponse.json(
    { success: false, error: message, ...(fieldErrors ? { fieldErrors } : {}) },
    { status: 400 },
  );
}

/**
 * Extract the store a session may edit.
 *
 * A session is scoped to exactly one store, so this is also the multi-tenant
 * boundary: a caller can never name a different store in the request body.
 *
 * @param user - The verified session
 * @returns The store id, or null when the account has no store
 */
export function resolveStoreId(user: UserSession): string | null {
  return user.storeId && user.storeId.length > 0 ? user.storeId : null;
}
