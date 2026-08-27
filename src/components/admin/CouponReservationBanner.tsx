'use client';

/**
 * The `/admin` banner for the *reservation* clock — `docs/plans/platform-coupons.md` §5.1's "Two
 * clocks, not one" note and §6's attribution window.
 *
 * A merchant who signed up through a `/join/<code>` link but has not yet subscribed holds an
 * `attributed` claim. Its deadline is `attributed_at + PLATFORM_CLAIM_RESERVATION_DAYS` (30 days,
 * `src/lib/billing/coupon-claims.ts`) — a completely different clock from `discount_ends_at`, which
 * does not exist for this merchant yet. `discount-notice.ts` deliberately returns
 * `'nothing-to-say'` for an `attributed` claim for exactly this reason (see that module's header),
 * so this banner is intentionally its own component rather than a sixth state bolted onto
 * {@link DiscountNoticeAlert} — the plan is explicit: "build it in phase 7 beside the ladder, not
 * inside it."
 *
 * `PLATFORM_CLAIM_RESERVATION_DAYS` is **not imported** from `coupon-claims.ts` here: that module
 * pulls in `src/lib/database/connection` (a Node-only `pg`/`@neondatabase/serverless` client) at
 * module scope, which is safe in a server route but not in a `'use client'` bundle — the same class
 * of bug `CLAUDE.md`'s `JWT_SECRET` story describes ("a client component transitively imports that
 * module and a browser bundle has no environment"). The value is duplicated below as a documented
 * constant instead, the same call `discount-notice.ts` itself makes for `RedemptionStatus`
 * ("Defined locally rather than imported so this module stays dependency-free … unlikely to drift
 * from the schema").
 *
 * Unlike the free-window ladder, this clock has exactly one shape — a single reservation deadline,
 * no card/no-card split, no grace (§5.2.2: "grace is automatic, and nothing should be built for
 * it" — a lapsed reservation simply frees the seat for re-attribution). So there is only one state
 * to render, always informational: this is a heads-up, not a task the merchant must complete before
 * a deadline that locks anything.
 *
 * Renders as `role="alert"` — Mantine's `Alert` hardcodes that role on its root element
 * unconditionally regardless of any `role` prop passed in, so there is no way to render this as the
 * quieter `role="status"` short of not using that primitive. See `DiscountNoticeAlert.tsx`'s file
 * header, which documents the same constraint.
 */

import type React from 'react';
import { Alert, Text } from '@mantine/core';
import { IconGift } from '@tabler/icons-react';

/**
 * Mirrors `PLATFORM_CLAIM_RESERVATION_DAYS` in `src/lib/billing/coupon-claims.ts` — see the file
 * header for why it is duplicated here rather than imported.
 */
const RESERVATION_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Props for {@link CouponReservationBanner}. */
export interface CouponReservationBannerProps {
  /** The coupon's display code, e.g. `"FRIENDS12"`. */
  code: string;
  /** When the claim was attributed — the start of the reservation window. */
  attributedAt: Date;
}

/**
 * Format a date the way `/admin/billing` does (`src/app/admin/billing/page.tsx`'s `formatDate`), so
 * this banner and {@link DiscountNoticeAlert} never quote a date two different ways.
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
 * @returns `attributedAt` plus {@link RESERVATION_WINDOW_DAYS} days.
 */
export function reservationEndsAt(attributedAt: Date): Date {
  return new Date(attributedAt.getTime() + RESERVATION_WINDOW_DAYS * MS_PER_DAY);
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
