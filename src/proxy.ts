/**
 * Next.js 16 proxy (what earlier versions called middleware — the `middleware.ts` convention is
 * deprecated; see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * **This is convenience, not the security boundary** (docs/plans/clerk-integration.md §3). Its
 * only job is to establish Clerk's request context so `auth()` works inside route handlers and
 * server components, and to let Clerk refresh a session cookie. Every protected route still calls
 * `requireAuth` / `requirePlatformAdmin` for itself, so a mistake in the matcher below fails to a
 * 401, never to an open route. Nothing about authorisation — `store_id`, `is_admin` — is decided
 * here.
 *
 * **Keyless-safe.** With no Clerk keys, `clerkMiddleware()` is never constructed and every request
 * passes straight through. CI builds with no integration keys at all, and storefronts must render
 * for shoppers whatever the auth configuration is; an unconfigured vendor taking down `/store/**`
 * would be the graceful-degradation rule broken at the worst possible layer.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isClerkConfigured } from '@/lib/auth/clerk-config';

/**
 * Lazily-built Clerk handler, so the SDK is only imported where it is configured.
 *
 * Cached because the proxy runs on every matched request and `clerkMiddleware()` builds a handler,
 * not a per-request value.
 */
let clerkHandler: ((request: NextRequest) => Promise<Response> | Response) | null = null;

/**
 * Run Clerk's middleware where it is configured, and get out of the way where it is not.
 *
 * @param request - The incoming request.
 * @returns Clerk's response, or a pass-through.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  if (!isClerkConfigured()) return NextResponse.next();

  // A bad key value, a wrong-instance key, or a Clerk incident must not become a 500 on every
  // matched request — the matcher covers `/store/**`, so a throw here would take shoppers' storefronts
  // down, the exact graceful-degradation failure the keyless branch above exists to prevent. The
  // proxy authenticates nothing (route guards do), so passing through on failure is safe: a request
  // that should be rejected still is, at the route.
  try {
    if (!clerkHandler) {
      const { clerkMiddleware } = await import('@clerk/nextjs/server');
      clerkHandler = clerkMiddleware() as unknown as (request: NextRequest) => Promise<Response>;
    }

    return await clerkHandler(request);
  } catch (error) {
    console.error('[proxy] Clerk middleware failed; passing request through:', error);
    clerkHandler = null;
    return NextResponse.next();
  }
}

/**
 * Where the proxy runs.
 *
 * A negative match: everything except Next's own static output, the image optimiser, the favicon
 * and the file-extension'd assets under `public/`. Without this the proxy would run on every CSS
 * and image request, which is both wasteful and the documented way to accidentally block them.
 *
 * API routes are included on purpose — `auth()` in a route handler needs this context. Public
 * routes inside that net (storefront reads, the Stripe and Clerk webhooks) are unaffected: the
 * proxy authenticates nothing and rejects nothing, it only annotates the request.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
