/**
 * `/pricing`'s coupon variant — `docs/plans/platform-coupons.md` §4A / §14 decision 4: "A merchant
 * who is promised a free year by a link and then shown '$1 for 3 months, then $19.99' on `/pricing`
 * has already been told two different things before they reach a form."
 *
 * These are pure rendering tests against a hand-built `PlatformCouponRecord` — no database, no
 * cookies, no `next/headers`. The cookie-reading and re-validation logic lives in `page.tsx`'s
 * `resolvePricingCoupon`, which is a thin, side-effecting wrapper around
 * `getPlatformCouponByCode` + `isRedeemable` (both covered by their own suites in
 * `src/lib/platform/__tests__/coupons.test.ts` and `src/lib/billing/__tests__/platform-coupons.test.ts`);
 * what is worth pinning here is that the *page* renders the coupon's real numbers and the real
 * card-collection answer, for every shape the model allows.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { CouponPricingPage } from '../CouponPricingPage';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';

/**
 * Build a full `PlatformCouponRecord` with sane defaults, overridable per test. The fields that do
 * not affect either component under test (`id`, `notes`, `stripeCouponId`, `createdBy`, `createdAt`,
 * `updatedAt`) are filled in only so the type checks — they carry no test-relevant meaning.
 */
function makeCoupon(overrides: Partial<PlatformCouponRecord> = {}): PlatformCouponRecord {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    code: 'FRIENDS12',
    codeNormalized: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    notes: null,
    percentOff: 100,
    durationMonths: 12,
    collectPaymentMethod: false,
    maxRedemptions: null,
    redeemedCount: 0,
    redeemBy: null,
    isActive: true,
    stripeCouponId: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CouponPricingPage', () => {
  it('states the coupon offer in the headline, not the standard $19.99 line', () => {
    render(<CouponPricingPage coupon={makeCoupon()} />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('One plan. Free for 12 months, then $19.99/month.');
    expect(screen.queryByText('One plan. $19.99 a month.')).not.toBeInTheDocument();
  });

  it('says no card is required for a friends-and-family, no-card coupon', () => {
    const { container } = render(
      <CouponPricingPage coupon={makeCoupon({ collectPaymentMethod: false, percentOff: 100 })} />
    );
    // Split across text nodes by the `{' '}` between the conditional line and the sentence after
    // it, so this asserts on the rendered text content rather than a single exact text node.
    expect(container.textContent).toContain('No card required to start.');
    expect(container.textContent).not.toContain('A card will be required');
  });

  it('says a card is required once a partial discount forces one, even with collectPaymentMethod off', () => {
    // Schema forbids this combination in the database (`platform_coupons_no_card_needs_full_discount`),
    // but the component computes the honest answer from `requiresPaymentMethod` regardless of what the
    // row claims — see the CHECK constraint's neighbouring comment in migration 042.
    const { container } = render(
      <CouponPricingPage coupon={makeCoupon({ collectPaymentMethod: false, percentOff: 50 })} />
    );
    expect(container.textContent).toContain('A card will be required at signup.');
    expect(container.textContent).not.toContain('No card required to start.');
  });

  it('says a card is required for a publicly-issued coupon that collects one', () => {
    const { container } = render(
      <CouponPricingPage coupon={makeCoupon({ collectPaymentMethod: true, percentOff: 100 })} />
    );
    expect(container.textContent).toContain('A card will be required at signup.');
  });

  it('renders "forever" coupons with no "then $19.99/mo" line', () => {
    render(<CouponPricingPage coupon={makeCoupon({ durationMonths: null, percentOff: 100 })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('One plan. Free forever.');
    expect(screen.queryByText('then $19.99/mo')).not.toBeInTheDocument();
  });

  it('quotes a partial-percentage coupon\'s actual discounted price, not "Free"', () => {
    render(<CouponPricingPage coupon={makeCoupon({ percentOff: 50, durationMonths: 6 })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'One plan. 50% off for 6 months, then $19.99/month.'
    );
    expect(screen.getByText('9.99')).toBeInTheDocument();
    expect(screen.getByText('then $19.99/mo')).toBeInTheDocument();
  });

  it('still renders the shared comparison table and FAQ unchanged', () => {
    render(<CouponPricingPage coupon={makeCoupon()} />);
    expect(screen.getByText('Do you offer refunds?')).toBeInTheDocument();
    expect(screen.getByText('Where Shopify wins.')).toBeInTheDocument();
  });
});
