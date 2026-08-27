/**
 * `CouponReservationBanner` renders the *reservation* clock — `docs/plans/platform-coupons.md`
 * §5.1's "Two clocks, not one" note and §6's 30-day attribution window. Distinct from
 * `DiscountNoticeAlert`'s tests: there is no card/no-card split and no ladder here, just one date
 * derived from `attributedAt`, so what is worth asserting is that the derivation matches
 * `PLATFORM_CLAIM_RESERVATION_DAYS` (30 days) and that the banner names the actual coupon code.
 */

// `@/lib/billing/coupon-claims` (imported below only for its `PLATFORM_CLAIM_RESERVATION_DAYS`
// constant, to prove this component's duplicated value hasn't drifted) pulls in
// `src/lib/database/connection` at module scope, which throws "TextEncoder is not defined" under
// jsdom unless stubbed first — the path must be relative; `next/jest` does not map the `@/` alias
// for `jest.mock` specifiers, only for imports.
jest.mock('../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CouponReservationBanner, reservationEndsAt } from '../CouponReservationBanner';
import { PLATFORM_CLAIM_RESERVATION_DAYS } from '@/lib/billing/coupon-claims';

describe('reservationEndsAt', () => {
  it('is exactly PLATFORM_CLAIM_RESERVATION_DAYS (30 days) after attribution', () => {
    // The plan's own worked example (§5.1, "Two clocks"): attributed 27 Aug -> reserved until 26
    // Sept. Ties this component's boundary directly to the source-of-truth constant in
    // `coupon-claims.ts` rather than to a hardcoded date, so a change to that constant is caught
    // here even though this component cannot import it directly (see the file header).
    const attributedAt = new Date('2026-08-27T12:00:00.000Z');
    const expected = new Date(
      attributedAt.getTime() + PLATFORM_CLAIM_RESERVATION_DAYS * 24 * 60 * 60 * 1000
    );
    expect(reservationEndsAt(attributedAt).getTime()).toBe(expected.getTime());
    expect(reservationEndsAt(attributedAt).toISOString().slice(0, 10)).toBe('2026-09-26');
  });

  it('is one day short of a hand-picked 31-day gap', () => {
    const attributedAt = new Date('2026-01-01T00:00:00.000Z');
    const thirtyOneDaysLater = new Date(attributedAt.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(reservationEndsAt(attributedAt).getTime()).not.toBe(thirtyOneDaysLater.getTime());
    expect(reservationEndsAt(attributedAt).getTime()).toBe(
      thirtyOneDaysLater.getTime() - 24 * 60 * 60 * 1000
    );
  });
});

describe('CouponReservationBanner', () => {
  it('names the coupon code and the reservation deadline', () => {
    render(
      <MantineProvider>
        <CouponReservationBanner code="FRIENDS12" attributedAt={new Date('2026-08-27T00:00:00.000Z')} />
      </MantineProvider>
    );

    // Mantine's `Alert` hardcodes `role="alert"` on its root regardless of any `role` prop passed
    // in — see this component's file header — so `role="alert"` is what actually renders.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('FRIENDS12');
    expect(alert).toHaveTextContent('September 26, 2026');
  });

  it('always renders — this clock has no silent state', () => {
    render(
      <MantineProvider>
        <CouponReservationBanner code="ANYCODE" attributedAt={new Date()} />
      </MantineProvider>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
