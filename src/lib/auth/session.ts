/**
 * Session resolution: Clerk first, the legacy JWT second, and only while it is allowed to exist.
 *
 * ~80 API routes call {@link requireAuth} / {@link getSessionFromRequest} /
 * {@link getSessionFromCookies} and get a {@link UserSession} back. That interface is the whole
 * reason the Clerk migration is small (docs/plans/clerk-integration.md §2): the internals change
 * here, once, and no call site moves. `userId` still means `users.id` — our UUID, the thing every
 * FK, audit row and `store_id` query already speaks. The Clerk id is a lookup key inside
 * `clerk-user.ts` and never escapes it.
 *
 * Two identity sources, in a fixed order:
 *
 * 1. **Clerk**, whenever `isClerkConfigured()`. `auth()` needs `clerkMiddleware` to have run for
 *    this request; where it has not (a route outside the proxy matcher, a unit test, a keyless
 *    build), it throws, and that must degrade rather than 500 — hence the try/catch.
 * 2. **The legacy HS256 JWT**, Bearer header then `session` cookie, and *only* while
 *    {@link isNativeLoginEnabled}. When native login is off, an outstanding legacy token
 *    authenticates nothing: that flag is the kill switch for the whole homegrown transport, and a
 *    kill switch that still accepts old tokens is not one. (Phase 4 also rotates `JWT_SECRET`, so
 *    tokens in the wild die rather than trickle out over their seven-day life.)
 *
 * Nothing here logs on the anonymous path. A request with no credentials at all is the ordinary
 * case for every public route that calls this, and a `console.error` per anonymous hit buries the
 * failures that matter.
 */

import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { getJwtSecret } from '@/lib/auth/jwt-secret';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import { ClerkUserLinkError, resolveUserByClerkId } from '@/lib/auth/clerk-user';

// The cookie name and its clearing helper live in `./session-cookie` so routes that only expire a
// cookie need not pull `jose` in with them. Re-exported here because this is where callers look.
export { SESSION_COOKIE, clearSessionCookie } from './session-cookie';


const JWT_ISSUER = 'schmo-store';
const JWT_AUDIENCE = 'schmo-store-users';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * The signing key, encoded on first use rather than at module load.
 *
 * Lazy because `getJwtSecret()` throws on a missing or placeholder secret, and
 * a throw at module scope fires wherever the module is merely imported —
 * including client bundles that only want a type from here. See
 * `jwt-secret.ts` for the customizer regression that taught us this.
 *
 * @returns The secret as bytes, ready for `jose`
 */
function secretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export interface UserSession {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  storeId?: string;
  storeSlug?: string;
  storeName?: string;
}

export async function createSession(userData: UserSession): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  // Create JWT token
  const jwt = await new SignJWT({
    sessionId,
    userId: userData.userId,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    storeId: userData.storeId,
    storeSlug: userData.storeSlug,
    storeName: userData.storeName,
    type: 'user_session'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(secretBytes());

  return jwt;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function destroySession(_sessionToken: string): Promise<void> {
  // For JWT tokens, we can't actually destroy them server-side
  // The client should remove the token from storage
  // In a production environment, you might want to maintain a blacklist
  // or use shorter expiration times
  return Promise.resolve();
}

/**
 * Verify a legacy HS256 session token.
 *
 * Returns `null` for anything that does not verify — expired, forged, or simply not one of ours.
 * It does not log: an unverifiable token reaches here on every stale-cookie request, and the
 * caller decides whether that is worth a line.
 *
 * @param sessionToken - The raw JWT.
 * @returns The session it carries, or `null`.
 */
export async function verifySession(sessionToken: string): Promise<UserSession | null> {
  try {
    // Verify JWT token
    const { payload } = await jwtVerify(sessionToken, secretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      firstName: payload.firstName as string,
      lastName: payload.lastName as string,
      storeId: payload.storeId as string,
      storeSlug: payload.storeSlug as string,
      storeName: payload.storeName as string
    };
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: Request): Promise<UserSession | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return await verifySession(token);
  }

  return null;
}

export async function getSessionFromCookies(cookieHeader: string): Promise<UserSession | null> {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));

  if (!sessionCookie) return null;

  const token = sessionCookie.split('=')[1];
  return await verifySession(token);
}

/**
 * Resolve the Clerk session for this request, if there is one.
 *
 * `auth()` is imported dynamically so an unconfigured deployment never loads the SDK at all, and
 * every failure mode collapses to `null`:
 *
 * - **no `clerkMiddleware` context** — `auth()` throws. That happens on any route the proxy
 *   matcher does not cover, and a route that is merely outside the matcher must fall through to
 *   the other transports (or to 401), never 500. This is why the middleware is convenience and
 *   `requireAuth` is the security boundary.
 * - **a linking refusal** — logged, because it is exactly the case an operator has to act on, and
 *   turned into "no session", which the caller renders as 401. Never an auto-link.
 *
 * @param request - Unused by `auth()` (it reads the ambient request), taken for symmetry and so
 *   the signature survives a future switch to `getAuth(request)`.
 * @returns The session, or `null`.
 */
export async function getSessionFromClerk(request: Request): Promise<UserSession | null> {
  void request;
  let clerkUserId: string | null = null;

  try {
    const { auth } = await import('@clerk/nextjs/server');
    const result = await auth();
    clerkUserId = result?.userId ?? null;
  } catch {
    // No middleware context, or the SDK could not initialise. Not an authenticated request.
    return null;
  }

  if (!clerkUserId) return null;

  try {
    return await resolveUserByClerkId(clerkUserId);
  } catch (error) {
    if (error instanceof ClerkUserLinkError) {
      // Deliberately loud, and deliberately not fatal: support has to see this, the caller gets a
      // 401. The Clerk id is not a secret; the message never carries a token or an email.
      console.error(`[auth] refused to link Clerk user ${clerkUserId}: ${error.reason} — ${error.message}`);
      return null;
    }
    throw error;
  }
}

/**
 * Resolve the caller's identity from whichever transport is currently valid.
 *
 * Clerk first, then — only while native login is enabled — the Bearer token and the `session`
 * cookie. Shared with `platform-admin.ts` so the two guards can never disagree about who someone
 * is.
 *
 * @param request - The incoming request.
 * @returns The session, or `null` when the request carries no valid credential.
 */
export async function resolveSession(request: Request): Promise<UserSession | null> {
  if (isClerkConfigured()) {
    const fromClerk = await getSessionFromClerk(request);
    if (fromClerk) return fromClerk;
  }

  if (!isNativeLoginEnabled()) return null;

  const fromHeader = await getSessionFromRequest(request);
  if (fromHeader) return fromHeader;

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  return getSessionFromCookies(cookieHeader);
}

/**
 * The guard every protected route calls.
 *
 * @param request - The incoming request.
 * @returns The caller's session.
 * @throws When the request carries no valid credential from any enabled transport.
 */
export async function requireAuth(request: Request): Promise<UserSession> {
  const user = await resolveSession(request);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
