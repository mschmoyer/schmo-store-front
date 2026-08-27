import { PLATFORM_LIST_AMOUNT_CENTS, formatCents } from '../intro-offer';
import {
  computeDiscountEndsAt,
  computeDiscountedAmountCents,
  computeDiscountedPriceCents,
  describePlatformCoupon,
  isRedeemable,
  normalizeCouponCode,
  requiresPaymentMethod,
  type PlatformCoupon,
} from '../platform-coupons';

/** Build a valid, active, unlimited coupon, overridden per test. */
function coupon(overrides: Partial<PlatformCoupon> = {}): PlatformCoupon {
  return {
    code: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    percentOff: 100,
    durationMonths: 12,
    collectPaymentMethod: false,
    maxRedemptions: null,
    redeemedCount: 0,
    redeemBy: null,
    isActive: true,
    ...overrides,
  };
}

describe('normalizeCouponCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeCouponCode('  friends12  ')).toBe('FRIENDS12');
  });

  it('is a no-op on an already-normalized code', () => {
    expect(normalizeCouponCode('FRIENDS12')).toBe('FRIENDS12');
  });

  it('does not touch internal characters', () => {
    expect(normalizeCouponCode('friends-12')).toBe('FRIENDS-12');
  });

  it('collapses only leading/trailing whitespace, not internal', () => {
    expect(normalizeCouponCode('\tfriends 12\n')).toBe('FRIENDS 12');
  });
});

describe('computeDiscountedAmountCents', () => {
  it('discounts the full list price at 100% off', () => {
    expect(computeDiscountedAmountCents(PLATFORM_LIST_AMOUNT_CENTS, 100)).toBe(
      PLATFORM_LIST_AMOUNT_CENTS
    );
  });

  it('computes half off in integer cents', () => {
    expect(computeDiscountedAmountCents(1999, 50)).toBe(1000); // 999.5 rounds half-up
  });

  it('rounds half-up deliberately at an exact .5 cent boundary', () => {
    // 101 * 50 / 100 = 50.5 -> rounds up to 51
    expect(computeDiscountedAmountCents(101, 50)).toBe(51);
  });

  it('never exceeds the list amount', () => {
    expect(computeDiscountedAmountCents(1999, 100)).toBeLessThanOrEqual(1999);
  });

  it('rejects a non-integer amount', () => {
    expect(() => computeDiscountedAmountCents(19.99, 50)).toThrow(/integer/i);
  });

  it('rejects percentOff outside 1-100', () => {
    expect(() => computeDiscountedAmountCents(1999, 0)).toThrow(/1 and 100/);
    expect(() => computeDiscountedAmountCents(1999, 101)).toThrow(/1 and 100/);
  });
});

describe('computeDiscountedPriceCents', () => {
  it('is zero at 100% off', () => {
    expect(computeDiscountedPriceCents(PLATFORM_LIST_AMOUNT_CENTS, 100)).toBe(0);
  });

  it('is the list price minus the discount at partial off', () => {
    expect(computeDiscountedPriceCents(1999, 50)).toBe(999);
  });
});

describe('computeDiscountEndsAt', () => {
  it('returns null for a forever coupon (durationMonths null)', () => {
    expect(computeDiscountEndsAt(new Date('2026-01-15T12:00:00Z'), null)).toBeNull();
  });

  it('adds whole UTC months, mirroring computeIntroEndDate', () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(computeDiscountEndsAt(start, 12)!.toISOString()).toBe('2027-01-15T12:00:00.000Z');
  });

  it('rolls a month-end date forward the way UTC month arithmetic does (Jan 31 + 1 month)', () => {
    const start = new Date(Date.UTC(2026, 0, 31, 0, 0, 0));
    // 2026 is not a leap year; Feb has 28 days, so Date.UTC rolls into March.
    expect(computeDiscountEndsAt(start, 1)!.toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });

  it('handles a single-month duration', () => {
    const start = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));
    expect(computeDiscountEndsAt(start, 1)!.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('describePlatformCoupon', () => {
  const listPrice = formatCents(PLATFORM_LIST_AMOUNT_CENTS);

  it('describes a free-for-N-months coupon', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 100, durationMonths: 12 }));
    expect(text).toBe(`Free for 12 months, then ${listPrice}/month`);
  });

  it('uses singular "month" for a one-month duration', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 100, durationMonths: 1 }));
    expect(text).toBe(`Free for 1 month, then ${listPrice}/month`);
  });

  it('describes free forever (percentOff 100, durationMonths null)', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 100, durationMonths: null }));
    expect(text).toBe('Free forever');
  });

  it('describes a partial discount for a fixed window', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 50, durationMonths: 6 }));
    expect(text).toBe(`50% off for 6 months, then ${listPrice}/month`);
  });

  it('describes a partial discount that never ends', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 25, durationMonths: null }));
    expect(text).toBe('25% off forever');
  });

  it('never inlines a literal price, always the shared constant', () => {
    const text = describePlatformCoupon(coupon({ percentOff: 100, durationMonths: 12 }));
    expect(text).toContain(formatCents(PLATFORM_LIST_AMOUNT_CENTS));
  });
});

describe('isRedeemable', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  it('is ok for an active, unexpired, uncapped coupon', () => {
    expect(isRedeemable(coupon(), now)).toEqual({ status: 'ok' });
  });

  it('reports inactive for a deactivated coupon', () => {
    expect(isRedeemable(coupon({ isActive: false }), now)).toEqual({ status: 'inactive' });
  });

  it('reports expired once redeemBy has passed', () => {
    expect(
      isRedeemable(coupon({ redeemBy: new Date('2026-06-14T23:59:59Z') }), now)
    ).toEqual({ status: 'expired' });
  });

  it('treats the exact redeemBy instant as expired (boundary is inclusive)', () => {
    expect(isRedeemable(coupon({ redeemBy: now }), now)).toEqual({ status: 'expired' });
  });

  it('is still ok one millisecond before redeemBy', () => {
    expect(
      isRedeemable(coupon({ redeemBy: new Date(now.getTime() + 1) }), now)
    ).toEqual({ status: 'ok' });
  });

  it('reports exhausted once redeemedCount reaches maxRedemptions', () => {
    expect(
      isRedeemable(coupon({ maxRedemptions: 1, redeemedCount: 1 }), now)
    ).toEqual({ status: 'exhausted' });
  });

  it('is ok when redeemedCount is below maxRedemptions', () => {
    expect(
      isRedeemable(coupon({ maxRedemptions: 5, redeemedCount: 4 }), now)
    ).toEqual({ status: 'ok' });
  });

  it('prefers inactive over expired or exhausted when several are true', () => {
    expect(
      isRedeemable(
        coupon({
          isActive: false,
          redeemBy: new Date('2020-01-01T00:00:00Z'),
          maxRedemptions: 1,
          redeemedCount: 1,
        }),
        now
      )
    ).toEqual({ status: 'inactive' });
  });
});

describe('requiresPaymentMethod', () => {
  it('is false only when collectPaymentMethod is false and percentOff is 100', () => {
    expect(requiresPaymentMethod(coupon({ collectPaymentMethod: false, percentOff: 100 }))).toBe(
      false
    );
  });

  it('is true when collectPaymentMethod is true, regardless of percentOff', () => {
    expect(requiresPaymentMethod(coupon({ collectPaymentMethod: true, percentOff: 100 }))).toBe(
      true
    );
    expect(requiresPaymentMethod(coupon({ collectPaymentMethod: true, percentOff: 50 }))).toBe(
      true
    );
  });

  it('is true at a partial discount even when collectPaymentMethod is false, per the schema rule', () => {
    // The CHECK constraint should prevent this combination from ever being stored, but the
    // function computes the honest answer rather than trusting the row.
    expect(requiresPaymentMethod(coupon({ collectPaymentMethod: false, percentOff: 50 }))).toBe(
      true
    );
  });
});
