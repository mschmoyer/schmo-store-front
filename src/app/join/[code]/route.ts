/**
 * `GET /join/<code>` — the platform signup link (plan `docs/plans/platform-coupons.md` §4A/§9).
 *
 * A Route Handler, not a page: it never renders anything itself. It validates the code, sets a
 * cookie when (and only when) it is currently redeemable, and always redirects into the setup
 * wizard — never a 404, whatever the code turns out to be.
 *
 * ```
 * GET /join/FRIENDS12
 *   ├─ valid   → Set-Cookie: rs_platform_coupon=FRIENDS12 (httpOnly, lax, 30d)
 *   │            302 → /create-store?coupon=FRIENDS12
 *   └─ invalid → 302 → /create-store?coupon_error=unknown|expired|exhausted|inactive
 * ```
 *
 * Two invariants from plan §11 land here specifically:
 *
 * - **4. The cookie is a hint.** It carries the code, not a claim and not a JWT. Nothing here
 *   reserves anything — that only happens later, server-side, at `POST /api/onboarding/account`
 *   (`attributeCouponFromCookie` in `../../api/onboarding/_lib/state.ts`), which re-validates the
 *   same code against the database rather than trusting this route's earlier verdict.
 * - **7. A failed coupon never becomes a silent full-price signup.** An unknown, expired,
 *   exhausted or deactivated code still redirects into signup, carrying the reason on the query
 *   string, so the wizard can say what happened instead of quietly charging standard price with no
 *   explanation.
 *
 * The decision itself — {@link decideJoin} — takes its coupon lookup as a parameter rather than
 * reaching for the database directly, so the whole valid/unknown/expired/exhausted/inactive table is
 * unit-testable by injecting a fake lookup, per this feature's test plan (§12), without touching
 * Postgres or mocking `getPlatformCouponByCode` itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlatformCouponByCode } from '@/lib/platform/coupons';
import { isRedeemable, type PlatformCoupon } from '@/lib/billing/platform-coupons';
import {
  PLATFORM_COUPON_COOKIE,
  PLATFORM_COUPON_COOKIE_MAX_AGE_SECONDS,
} from '@/app/api/onboarding/_lib/coupon-cookie';

/** Re-exported so callers (and this route's own handler) need only one import for the cookie name. */
export { PLATFORM_COUPON_COOKIE, PLATFORM_COUPON_COOKIE_MAX_AGE_SECONDS };

/** How long the cookie lives: plan §4A's "30d". */

/** The four reasons `/join` can redirect with — matches `CouponRedeemability['status']` plus `unknown`. */
export type JoinFailureReason = 'unknown' | 'expired' | 'exhausted' | 'inactive';

/** Where a code resolves a coupon, given a normalized-or-not code string. Injectable for tests. */
export type PlatformCouponLookup = (code: string) => Promise<PlatformCoupon | null>;

/** What {@link decideJoin} decided. */
export interface JoinDecision {
  /** The code to set as the cookie's value. `null` means: set no cookie. */
  cookieCode: string | null;
  /** Absolute-from-root path to redirect to. */
  redirectPath: string;
}

/**
 * Build the failure redirect for a given reason.
 *
 * @param reason - Why the code did not validate.
 * @returns The `/create-store` path carrying it.
 */
function failureRedirect(reason: JoinFailureReason): JoinDecision {
  return { cookieCode: null, redirectPath: `/create-store?coupon_error=${reason}` };
}

/**
 * Decide what `/join/<code>` should do: validate the code and pick a cookie (or not) and a
 * redirect. Pure aside from the injected `lookup`, so every row of the decision table —
 * valid, unknown, expired, exhausted, inactive — is testable without a database.
 *
 * Never throws for a bad or missing code, and never for a lookup failure: both degrade to the
 * `unknown` redirect rather than a 500, because a dead or misbehaving link must still land the
 * visitor in signup (plan §11 invariant 7). It resolves the coupon exactly once and reasons from
 * that one snapshot — there is no re-check between the redeemability decision and the redirect, so
 * this function never claims two different things about the same request.
 *
 * @param rawCode - The code exactly as it appeared in the URL segment.
 * @param lookup - Resolves a code to a coupon, or `null` when none matches. In production this is
 *   `getPlatformCouponByCode`; tests inject a fake.
 * @param now - Current time, for the `redeemBy` check. Injectable for tests.
 * @returns The cookie (or lack of one) and the redirect path.
 */
export async function decideJoin(
  rawCode: string,
  lookup: PlatformCouponLookup,
  now: Date = new Date()
): Promise<JoinDecision> {
  const code = (rawCode ?? '').trim();
  if (!code) {
    return failureRedirect('unknown');
  }

  let coupon: PlatformCoupon | null;
  try {
    coupon = await lookup(code);
  } catch (error) {
    // A code is never logged in full on a public-facing error path (plan §11 invariant 12) — and
    // neither is a lookup failure here worth surfacing as anything other than "didn't work".
    console.error('[join] coupon lookup failed:', error);
    return failureRedirect('unknown');
  }

  if (!coupon) {
    return failureRedirect('unknown');
  }

  const redeemability = isRedeemable(coupon, now);
  if (redeemability.status !== 'ok') {
    return failureRedirect(redeemability.status);
  }

  // The code as issued (case and punctuation as an operator typed it), not the raw URL segment —
  // so the cookie and the confirmation query param always show what the coupon record itself says.
  return {
    cookieCode: coupon.code,
    redirectPath: `/create-store?coupon=${encodeURIComponent(coupon.code)}`,
  };
}

/**
 * Validate the code, set the cookie when it earns one, and redirect into the wizard.
 *
 * @param request - Incoming request.
 * @param context - Route params; `code` is the dynamic segment.
 * @returns A 302 to `/create-store`, with or without the coupon cookie attached.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;
  const decision = await decideJoin(code, getPlatformCouponByCode);

  const response = NextResponse.redirect(new URL(decision.redirectPath, request.url), 302);

  if (decision.cookieCode) {
    response.cookies.set(PLATFORM_COUPON_COOKIE, decision.cookieCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PLATFORM_COUPON_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
