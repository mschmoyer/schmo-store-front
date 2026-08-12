/**
 * Authentication helpers for the billing API routes.
 *
 * These wrap the application's existing session mechanism (`src/lib/auth/session.ts`, a JOSE JWT
 * sent either as `Authorization: Bearer <token>` or in a `session` cookie). No new auth scheme is
 * introduced here.
 */

import { NextResponse } from 'next/server';
import { db } from '../database/connection';
import { getSessionFromCookies, getSessionFromRequest, type UserSession } from '../auth/session';

/** A signed-in merchant plus the store they own. */
export interface MerchantContext {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly storeId: string;
  readonly storeSlug: string;
  readonly storeName: string;
}

/** Either a resolved merchant, or the response to return to the caller. */
export type MerchantResult =
  | { readonly ok: true; readonly merchant: MerchantContext }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Resolve the signed-in user from a request, checking the bearer token then the cookie.
 *
 * @param request - The inbound request.
 * @returns The user session, or `null` when unauthenticated.
 */
export async function getUserSession(request: Request): Promise<UserSession | null> {
  const fromHeader = await getSessionFromRequest(request);
  if (fromHeader) {
    return fromHeader;
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  return await getSessionFromCookies(cookieHeader);
}

/**
 * Require an authenticated store owner.
 *
 * Returns a 401 response (never a 500) when the caller is anonymous, and a 403 when the session is
 * valid but carries no store.
 *
 * @param request - The inbound request.
 * @returns A {@link MerchantResult}.
 */
export async function requireMerchant(request: Request): Promise<MerchantResult> {
  let session: UserSession | null = null;

  try {
    session = await getUserSession(request);
  } catch {
    session = null;
  }

  if (!session?.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  let storeId = session.storeId ?? null;
  let storeSlug = session.storeSlug ?? '';
  let storeName = session.storeName ?? '';

  // Older tokens may predate store details being embedded in the session.
  if (!storeId) {
    try {
      const result = await db.query<{ id: string; store_slug: string; store_name: string }>(
        `SELECT id, store_slug, store_name FROM stores WHERE owner_id = $1 ORDER BY created_at LIMIT 1`,
        [session.userId]
      );
      const row = result.rows[0];
      if (row) {
        storeId = row.id;
        storeSlug = row.store_slug;
        storeName = row.store_name;
      }
    } catch {
      storeId = null;
    }
  }

  if (!storeId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'No store is associated with this account' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    merchant: {
      userId: session.userId,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      storeId,
      storeSlug,
      storeName,
    },
  };
}
