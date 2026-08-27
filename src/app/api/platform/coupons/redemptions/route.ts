/**
 * `GET /api/platform/coupons/redemptions` — the operator console's redemptions tab (plan §4C,
 * §9). Every redemption across every coupon, newest-attributed first: who, which store, which
 * coupon, attributed vs redeemed, and when the discount ends.
 *
 * A read, so — unlike the two mutating routes beside this one — `recordAdminAction` here is the
 * ordinary best-effort call, exactly like `GET /api/platform/customers`.
 *
 * Demo stores are excluded by default and included with `?includeDemo=1`, matching every other
 * list on `/platform` (`docs/platform-admin.md`). `scope.demoStoresHidden` says how many were left
 * out — a hidden store is a fact about the reading, not something this response is allowed to hide.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { validateUUID } from '@/lib/database/connection';
import { listRedemptions } from '@/lib/platform/coupons';
import type { PlatformCouponClaimStatus } from '@/lib/billing/coupon-claims';

/** Every value `platform_coupon_redemptions.status` can take. */
const REDEMPTION_STATUSES: readonly PlatformCouponClaimStatus[] = ['attributed', 'redeemed', 'released'];

/**
 * Parse `?status=` into a validated {@link PlatformCouponClaimStatus}.
 *
 * @param value - The raw query-string value, or `null`.
 * @returns The matching status, or `undefined` for absent/unrecognised — which
 *          {@link import('@/lib/platform/coupons').listRedemptions} reads as "every status".
 */
function parseStatus(value: string | null): PlatformCouponClaimStatus | undefined {
  return value && (REDEMPTION_STATUSES as readonly string[]).includes(value)
    ? (value as PlatformCouponClaimStatus)
    : undefined;
}

/**
 * Parse a positive-integer query parameter.
 *
 * @param value - The raw query-string value, or `null`.
 * @param fallback - Used for anything absent, non-numeric or non-positive.
 * @returns The parsed integer, or `fallback`.
 */
function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Read the `includeDemo` escape hatch off a query string, matching
 * `src/lib/platform/customers.ts`'s narrow reading: only `1`, `true` or `yes` turn demo stores on.
 *
 * @param searchParams - The request's query string.
 * @returns Whether demo stores should be included.
 */
function readIncludeDemo(searchParams: URLSearchParams): boolean {
  const value = searchParams.get('includeDemo');
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * List coupon redemptions across every merchant, paged and optionally filtered.
 *
 * @param request - The incoming request. Reads `status`, `couponId`, `includeDemo`, `page` and
 *                  `pageSize` from the query string.
 * @returns `{ success: true, data: { redemptions, pagination, scope } }`, or `400` when `couponId`
 *          is present but not a UUID.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const searchParams = request.nextUrl.searchParams;

    const couponId = searchParams.get('couponId');
    if (couponId && !validateUUID(couponId)) {
      return NextResponse.json({ success: false, error: 'Invalid coupon id' }, { status: 400 });
    }

    const filter = {
      status: parseStatus(searchParams.get('status')),
      couponId: couponId ?? undefined,
      includeDemo: readIncludeDemo(searchParams),
      page: parsePositiveInt(searchParams.get('page'), 1),
      pageSize: parsePositiveInt(searchParams.get('pageSize'), 25),
    };

    const result = await listRedemptions(filter);

    const data = {
      redemptions: result.redemptions.map((redemption) => ({
        id: redemption.id,
        status: redemption.status,
        source: redemption.source,
        attributedAt: redemption.attributedAt.toISOString(),
        redeemedAt: redemption.redeemedAt ? redemption.redeemedAt.toISOString() : null,
        releasedAt: redemption.releasedAt ? redemption.releasedAt.toISOString() : null,
        releaseReason: redemption.releaseReason,
        discountEndsAt: redemption.discountEndsAt ? redemption.discountEndsAt.toISOString() : null,
        coupon: redemption.coupon,
        user: redemption.user,
        store: redemption.store,
      })),
      pagination: result.pagination,
      scope: result.scope,
    };

    await recordAdminAction(admin.userId, 'view_coupon_redemptions', undefined, {
      status: filter.status ?? 'all',
      couponId: filter.couponId ?? null,
      includeDemo: filter.includeDemo,
      page: filter.page,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'coupon redemptions');
  }
}
