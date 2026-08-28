/**
 * Reservation sweep for platform signup coupons.
 *
 * Releases every `attributed` claim older than the reservation window
 * (`PLATFORM_CLAIM_RESERVATION_DAYS`, 30 days) back to `released`, freeing the seat so someone else
 * — or the same person, re-clicking the same link later — can claim the code again. The SQL and the
 * state-machine rule ("a `redeemed` claim is never touched") live in `coupon-claims.ts`'s
 * `releaseExpiredClaims`; this is only the cron-shaped wrapper around it.
 */

import {
  PLATFORM_CLAIM_RESERVATION_DAYS,
  releaseExpiredClaims,
} from '@/lib/billing/coupon-claims';

/**
 * Structured outcome of one sweep run. `releasedCount` is reported honestly, including `0` — a run
 * that released nothing because nothing was due is still a successful run.
 */
export interface CouponSweepResult {
  /** The reservation window, in days, actually used for this run. */
  windowDays: number;
  /** How many `attributed` reservations were released. Zero is a valid, honestly-reported result. */
  releasedCount: number;
  /** Which coupons those releases belonged to — one id per released claim, duplicates included. */
  couponIds: string[];
  timestamp: string;
}

/**
 * Run the reservation sweep once.
 *
 * Safe to re-run for the same window: a claim already released, redeemed, or not yet due simply
 * does not match `releaseExpiredClaims`'s `WHERE`.
 *
 * @param windowDays - Reservation age threshold, in days. Defaults to
 *   {@link PLATFORM_CLAIM_RESERVATION_DAYS}.
 * @returns A structured summary — the real released count, including zero.
 */
export async function runCouponSweepJob(
  windowDays: number = PLATFORM_CLAIM_RESERVATION_DAYS
): Promise<CouponSweepResult> {
  console.log(`[cron:coupon-sweep] releasing reservations older than ${windowDays} day(s)`);

  const { releasedCount, claims } = await releaseExpiredClaims(windowDays);

  console.log(`[cron:coupon-sweep] released ${releasedCount} reservation(s)`);

  return {
    windowDays,
    releasedCount,
    couponIds: claims.map((claim) => claim.couponId),
    timestamp: new Date().toISOString(),
  };
}
