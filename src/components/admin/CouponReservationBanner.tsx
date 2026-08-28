'use client';

/**
 * The `/admin` banner for the *reservation* clock — docs/plans/platform-coupons.md §5.1's "Two
 * clocks, not one" and §6's attribution window.
 *
 * An `attributed` claim (signed up via `/join/<code>`, not yet subscribed) runs on
 * `attributed_at + PLATFORM_CLAIM_RESERVATION_DAYS` — a different clock from `discount_ends_at`,
 * which doesn't exist yet for this merchant. `discount-notice.ts` returns `'nothing-to-say'` for an
 * `attributed` claim for exactly this reason, so this is its own component rather than a sixth
 * state on {@link DiscountNoticeAlert}.
 *
 * One shape only — a single deadline, no card/no-card split, no grace (§5.2.2: a lapsed
 * reservation just frees the seat) — so always informational, never a task with a locking deadline.
 *
 * Renders as `role="alert"`: Mantine's `Alert` hardcodes that role regardless of any `role` prop,
 * so there's no way to get the quieter `role="status"` short of not using that primitive (same
 * constraint noted in `DiscountNoticeAlert.tsx`).
 */

import type React from 'react';
import { Alert, Text } from '@mantine/core';
import { IconGift } from '@tabler/icons-react';
import { PLATFORM_CLAIM_RESERVATION_DAYS } from '@/lib/billing/coupon-windows';


const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Props for {@link CouponReservationBanner}. */
export interface CouponReservationBannerProps {
  /** The coupon's display code, e.g. `"FRIENDS12"`. */
  code: string;
  /** When the claim was attributed — the start of the reservation window. */
  attributedAt: Date;
}

/**
 * Format a date the way `/admin/billing` does, so this banner and {@link DiscountNoticeAlert}
 * never quote a date two different ways.
 *
 * @param date - The date to format.
 * @returns e.g. `"September 26, 2026"`.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * The date an `attributed` claim's reservation lapses, per §6.
 *
 * @param attributedAt - When the claim was attributed.
 * @returns `attributedAt` plus {@link PLATFORM_CLAIM_RESERVATION_DAYS} days.
 */
export function reservationEndsAt(attributedAt: Date): Date {
  return new Date(attributedAt.getTime() + PLATFORM_CLAIM_RESERVATION_DAYS * MS_PER_DAY);
}

/**
 * The `/admin` banner telling a merchant their signup offer is reserved, and until when.
 *
 * Always renders — the caller only mounts this component when `GET /api/billing/coupon/notice`
 * reports an `attributed` claim, so there is no `'nothing-to-say'` state to model here the way
 * {@link DiscountNoticeAlert} has one.
 *
 * @param props - {@link CouponReservationBannerProps}
 * @returns The reservation banner.
 */
export function CouponReservationBanner({
  code,
  attributedAt,
}: CouponReservationBannerProps): React.ReactElement {
  const deadline = reservationEndsAt(attributedAt);

  return (
    <Alert icon={<IconGift size="1rem" />} color="ink" variant="light" title="Your offer is reserved">
      <Text size="sm">
        Your <strong>{code}</strong> offer is reserved until {formatDate(deadline)}. Finish setting
        up billing before then to lock it in — after that the seat is released and someone else can
        claim it.
      </Text>
    </Alert>
  );
}
