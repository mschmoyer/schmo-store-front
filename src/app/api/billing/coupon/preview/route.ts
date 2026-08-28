/**
 * POST /api/billing/coupon/preview
 *
 * Validates a platform signup coupon code and describes its offer. **Writes nothing** — never
 * calls `attributeCoupon` or touches `platform_coupon_redemptions` — so a typo-and-retry can't burn
 * a single-use coupon. `POST /api/billing/checkout { couponCode }` is the endpoint that writes.
 *
 * The decision itself — {@link previewPlatformCouponCode} — lives in `./decide.ts`; see that file's
 * header for why.
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
 * This route sits behind `requireMerchant`, but an authenticated merchant could still script
 * guesses against a friend-only code, so the limit is per user rather than per IP.
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
