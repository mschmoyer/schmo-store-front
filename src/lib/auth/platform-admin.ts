/**
 * The platform-operator guard.
 *
 * Every other authenticated surface in this codebase answers one question — *which store is this
 * user allowed to see?* — and answers it by pulling `storeId` out of the session and putting it in
 * a `WHERE` clause. The platform console is the one place that deliberately reads across every
 * tenant, so the guard that opens it is the only thing standing between an ordinary merchant and
 * the whole tenancy. Three rules follow from that, and each one is load-bearing:
 *
 * **1. The flag is read from the database on every request, never from the JWT.** Putting
 * `isAdmin` in the signed token would be faster and would also mean a revoked operator keeps
 * platform access until their seven-day session expires. A session says *who* you are; the
 * database says what you may do, and it says it now rather than at sign-in.
 *
 * **2. A non-admin gets 403, an anonymous caller gets 401.** They are different facts and a
 * merchant who bookmarks `/platform` deserves the honest one. Neither response says whether the
 * console exists in any more detail than that.
 *
 * **3. Reads are recorded.** {@link recordAdminAction} writes to `platform_admin_audit`. It is
 * deliberately best-effort: an audit write that fails must not take the console down with it, so
 * it logs and returns rather than throwing. The console is read-only, so a lost audit row loses a
 * record of a *view*, not of a change.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { getSessionFromRequest, getSessionFromCookies } from '@/lib/auth/session';

/** A signed-in user who carries `users.is_admin = true`. */
export interface PlatformAdmin {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** The operator's own store, if they have one. They are a merchant too. */
  storeId?: string;
}

/** Why a platform request was refused. `unauthenticated` is a 401; `forbidden` is a 403. */
export type PlatformAdminDenial = 'unauthenticated' | 'forbidden';

/** Thrown by {@link requirePlatformAdmin}. Carries the status the route should return. */
export class PlatformAdminError extends Error {
  readonly reason: PlatformAdminDenial;
  readonly status: number;

  constructor(reason: PlatformAdminDenial) {
    super(reason === 'unauthenticated' ? 'Authentication required' : 'Platform admin access required');
    this.name = 'PlatformAdminError';
    this.reason = reason;
    this.status = reason === 'unauthenticated' ? 401 : 403;
  }
}

/**
 * Resolve the caller's session from either transport the app uses.
 *
 * The merchant admin sends a `Bearer` token from `localStorage`; server-rendered navigation and
 * anything hit directly from the browser sends the `session` cookie. A route that checked only one
 * of them would work in exactly half the app, which has already happened here more than once.
 *
 * @param request - The incoming request.
 * @returns The session, or `null` if neither transport carried a valid one.
 */
async function resolveSession(request: Request) {
  const fromHeader = await getSessionFromRequest(request);
  if (fromHeader) return fromHeader;

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  return getSessionFromCookies(cookieHeader);
}

/**
 * Whether a user id currently carries the platform admin flag.
 *
 * @param userId - The user to check.
 * @returns `true` only for an active user with `is_admin = true`. A deactivated operator is not an
 *          operator: `is_active` is checked here so revoking a person's account revokes the console
 *          with it, rather than leaving a second switch someone has to remember to flip.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const result = await db.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1 AND is_active = TRUE',
    [userId]
  );
  return result.rows[0]?.is_admin === true;
}

/**
 * The guard. Resolves the caller and confirms they are a platform operator.
 *
 * @param request - The incoming request.
 * @returns The operator's identity.
 * @throws {PlatformAdminError} `unauthenticated` when there is no valid session, `forbidden` when
 *         there is one but it does not carry the admin flag.
 */
export async function requirePlatformAdmin(request: Request): Promise<PlatformAdmin> {
  const session = await resolveSession(request);
  if (!session) throw new PlatformAdminError('unauthenticated');

  if (!(await isPlatformAdmin(session.userId))) {
    throw new PlatformAdminError('forbidden');
  }

  return {
    userId: session.userId,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    storeId: session.storeId,
  };
}

/**
 * Turn a thrown {@link PlatformAdminError} into the response it describes.
 *
 * Anything else is a genuine fault and becomes a 500 with a generic body — a platform route's
 * error text can name tables and store ids, and none of that belongs in an HTTP response.
 *
 * @param error - Whatever the handler threw.
 * @param context - A short label used in the server-side log line.
 * @returns The response to return from the route.
 */
export function platformErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof PlatformAdminError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }

  console.error(`[platform] ${context} failed:`, error);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}

/**
 * Record that an operator looked at something.
 *
 * Best-effort by design — see the module note. Never throws.
 *
 * @param adminUserId - The operator.
 * @param action - A short verb, e.g. `view_overview`, `view_customer`, `export_customers`.
 * @param target - Optional subject of the action.
 * @param metadata - Anything worth keeping. Never put credentials or raw addresses here.
 * @returns Nothing; failures are logged and swallowed.
 */
export async function recordAdminAction(
  adminUserId: string,
  action: string,
  target?: { type: string; id?: string | null },
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO platform_admin_audit (admin_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUserId, action, target?.type ?? null, target?.id ?? null, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('[platform] audit write failed:', error);
  }
}
