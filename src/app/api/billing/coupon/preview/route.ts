/**
 * POST /api/billing/coupon/preview
 *
 * Validates a platform signup coupon code and describes its offer — see
 * `docs/plans/platform-coupons.md` §4B. **Writes nothing.** A preview that consumed a single-use
 * coupon would burn it on a typo-and-retry, which is exactly why the plan calls for two endpoints
 * (this one, and `POST /api/billing/checkout { couponCode }`, which does the writing). This route
 * never calls `attributeCoupon` or touches `platform_coupon_redemptions`.
 *
 * The actual decision — {@link previewPlatformCouponCode} — lives in `./decide.ts`, not here: see
 * that file's header for why (importing `requireMerchant` pulls in `jose`, which breaks Jest's
 * parser, so the pure logic has to live somewhere that import never reaches).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import { getPlatformCouponByCode } from '@/lib/platform/coupons';
import { rateLimit } from '@/lib/ai/rate-limit';
import { previewPlatformCouponCode } from './decide';

export { type CouponPreviewFail, type CouponPreviewOk, type CouponPreviewReason, type CouponPreviewResult, type PlatformCouponLookup, previewPlatformCouponCode } from './decide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Plan §9: "`/join/[code]` and `/api/billing/coupon/preview` are the two places an attacker can
 * guess codes. Both need rate limiting." This route sits behind `requireMerchant`, so the attacker
 * already needs a valid merchant session — but that merchant could still script guesses against a
 * friend-only code, so the limit is per authenticated user rather than per IP.
 */
const PREVIEW_RATE_LIMIT = 20;
/** Ten-minute fixed window for {@link PREVIEW_RATE_LIMIT}. */
const PREVIEW_RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Validate and describe a platform coupon code for the signed-in merchant. Writes nothing.
 *
 * @param request - The inbound request, carrying `{ code: string }` as JSON.
 * @returns JSON describing the offer, or a typed reason when it cannot be redeemed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { merchant } = auth;

  const limited = rateLimit(
    `billing-coupon-preview:${merchant.userId}`,
    PREVIEW_RATE_LIMIT,
    PREVIEW_RATE_WINDOW_MS
  );
  if (!limited.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many coupon checks. Try again in a few minutes.',
        code: 'RATE_LIMITED',
      },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const code = typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : '';
  if (!code.trim()) {
    return NextResponse.json(
      { success: false, error: 'A coupon code is required', code: 'CODE_REQUIRED' },
      { status: 400 }
    );
  }

  try {
    const result = await previewPlatformCouponCode(code, getPlatformCouponByCode);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[billing/coupon/preview] lookup failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not check that code right now', code: 'PREVIEW_FAILED' },
      { status: 500 }
    );
  }
}
