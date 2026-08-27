/**
 * The wire shape every `/api/platform/coupons*` route sends for one coupon.
 *
 * One function, called from the list, create and update routes, so the three cannot drift into
 * describing a coupon three slightly different ways — the same reasoning `platform/customers.ts`
 * gives for owning "received" in one place.
 */

import {
  derivePlatformCouponStatus,
  type PlatformCouponRecord,
  type PlatformCouponStatus,
} from '@/lib/platform/coupons';
import { describePlatformCoupon } from '@/lib/billing/platform-coupons';

/** A coupon as the console's API sends it: dates are ISO strings, and `offer` is pre-rendered. */
export interface PlatformCouponApiItem {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  percentOff: number;
  durationMonths: number | null;
  collectPaymentMethod: boolean;
  maxRedemptions: number | null;
  redeemedCount: number;
  redeemBy: string | null;
  isActive: boolean;
  status: PlatformCouponStatus;
  /** The human offer sentence from {@link describePlatformCoupon} — the UI never re-derives it. */
  offer: string;
  createdBy: string | null;
  /** Resolved by `creators.ts`. `null` when the creator's account no longer exists. */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a persisted coupon into {@link PlatformCouponApiItem}.
 *
 * @param coupon - The record from `src/lib/platform/coupons.ts`.
 * @param createdByName - The creator's display name, resolved separately (see `creators.ts`) since
 *                         the coupons module only stores the bare `users.id`.
 * @returns The API item.
 */
export function serializeCoupon(
  coupon: PlatformCouponRecord,
  createdByName: string | null
): PlatformCouponApiItem {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    notes: coupon.notes,
    percentOff: coupon.percentOff,
    durationMonths: coupon.durationMonths,
    collectPaymentMethod: coupon.collectPaymentMethod,
    maxRedemptions: coupon.maxRedemptions,
    redeemedCount: coupon.redeemedCount,
    redeemBy: coupon.redeemBy ? coupon.redeemBy.toISOString() : null,
    isActive: coupon.isActive,
    status: derivePlatformCouponStatus(coupon),
    offer: describePlatformCoupon(coupon),
    createdBy: coupon.createdBy,
    createdByName,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}
