/**
 * Reservation sweep for platform signup coupons (flow A — `docs/plans/platform-coupons.md` §6).
 *
 * Releases every `attributed` claim older than the reservation window
 * (`PLATFORM_CLAIM_RESERVATION_DAYS`, 30 days) back to `released`, freeing the seat so someone else
 * — or the same person, re-clicking the same link on day 45 — can claim the code again. Every line
 * of the actual SQL and the state-machine rule ("a `redeemed` claim is never touched") lives in
 * `billing/coupon-claims.ts`'s `releaseExpiredClaims`; this module is only the cron-shaped wrapper
 * around it, the same way `inventory-snapshot-job.ts` wraps `inventorySnapshotService`.
 */

import {
  PLATFORM_CLAIM_RESERVATION_DAYS,
  releaseExpiredClaims,
} from '@/lib/billing/coupon-claims';

/**
 * Structured outcome of one sweep run.
 *
 * `releasedCount` is reported honestly, including `0` — per `CLAUDE.md`'s "Honest results", a run
 * that released nothing because nothing was due is still a successful run, and this shape makes that
 * distinguishable from a run that never happened rather than collapsing both into a bare `success`.
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
 * Safe to run more than once for the same window: a claim already released, redeemed, or not yet due
 * simply does not match `releaseExpiredClaims`'s `WHERE`, so a re-run (a retried cron invocation, an
 * operator triggering it by hand) releases only what is still actually due.
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
