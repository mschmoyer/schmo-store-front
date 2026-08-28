/**
 * `upsertSubscriptionFromStripe`'s discount handling — specifically the fix described in
 * `docs/plans/platform-coupons.md` §3 ("A bug this feature walks into").
 *
 * Before this fix, `readIntroDiscount`'s unexpanded-coupon-id branch treated *any* coupon id other
 * than the intro coupon as unknown, writing `intro_months: 0` / `intro_ends_at: NULL`. A merchant
 * on a real platform coupon (say, a free year) would therefore get no end date and a wrong next
 * charge the moment a caller retrieved their subscription without `expand: ['discounts']` — which
 * `GET /api/billing/status` did, before this phase. These tests pin the fixed behaviour in both
 * shapes Stripe can hand back a discount: expanded (a full `Coupon` object) and unexpanded (a bare
 * id, requiring the `platform_coupons` lookup this fix adds).
 *
 * The driver is stubbed rather than hit for real, and the SQL parameters `upsertSubscriptionFromStripe`
 * sends to the `INSERT ... ON CONFLICT` are asserted directly — the same shape as
 * `webhook-events.test.ts` and `coupon-claims.test.ts` in this directory. (`jest.mock` specifiers
 * must be relative; `next/jest` does not map the `@/` alias for them.)
 */

jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import type Stripe from 'stripe';
import { db } from '@/lib/database/connection';
import { asQueryMock } from '../test-support/query-mock';
import { upsertSubscriptionFromStripe } from '../subscriptions';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  computeIntroEndDate,
  resolveIntroCouponId,
} from '../intro-offer';
import { computeDiscountedAmountCents } from '../platform-coupons';

const query = asQueryMock(db.query);

const OWNER_ID = 'owner-uuid-1';
const STORE_ID = 'store-uuid-1';
const STARTED_AT = new Date('2026-01-15T00:00:00Z');

/** INSERT parameter indices for `subscriptions`, matching `upsertSubscriptionFromStripe`'s VALUES list. */
const COL = {
  introAmount: 9,
  introCouponId: 10,
  introMonths: 12,
  introStartedAt: 13,
  introEndsAt: 14,
} as const;

/**
 * Build a minimal Stripe subscription fixture. Only the fields `upsertSubscriptionFromStripe` and
 * `readIntroDiscount` actually read are populated; everything else is the shape Stripe would send.
 *
 * @param discounts - The subscription's `discounts` array, in whichever shape the case needs.
 * @param overrides - Any other subscription fields to override.
 * @returns An object structurally usable as a `Stripe.Subscription`.
 */
function buildSubscription(
  discounts: Array<string | Partial<Stripe.Discount>>,
  overrides: Record<string, unknown> = {}
): Stripe.Subscription {
  return {
    id: 'sub_test123',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test123',
    start_date: Math.floor(STARTED_AT.getTime() / 1000),
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    latest_invoice: null,
    metadata: { owner_id: OWNER_ID, store_id: STORE_ID, plan_key: 'rebelshops_standard' },
    items: {
      object: 'list',
      data: [
        {
          price: { id: 'price_test123', unit_amount: PLATFORM_LIST_AMOUNT_CENTS, currency: 'usd' },
          current_period_start: Math.floor(STARTED_AT.getTime() / 1000),
          current_period_end: Math.floor(STARTED_AT.getTime() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
    },
    discounts,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

/**
 * Build the row shape `db.query` returns for `platform_coupons WHERE stripe_coupon_id = $1`.
 *
 * @param overrides - Fields to override.
 * @returns A raw row.
 */
function platformCouponRow(overrides: Record<string, unknown> = {}) {
  return {
    code: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    percent_off: 100,
    duration_months: 12,
    collect_payment_method: false,
    max_redemptions: null,
    redeemed_count: 1,
    redeem_by: null,
    is_active: true,
    ...overrides,
  };
}

/** The row shape the final `INSERT ... RETURNING` gives back — content does not matter to these tests. */
const UPSERT_RESULT_ROW = {
  id: 'row-1',
  owner_id: OWNER_ID,
  store_id: STORE_ID,
  stripe_customer_id: 'cus_test123',
  stripe_subscription_id: 'sub_test123',
  stripe_price_id: 'price_test123',
  plan_key: 'rebelshops_standard',
  status: 'active',
  currency: 'usd',
  unit_amount: PLATFORM_LIST_AMOUNT_CENTS,
  intro_amount: null,
  intro_months: 0,
  intro_ends_at: null,
  intro_coupon_id: null,
  current_period_start: STARTED_AT,
  current_period_end: STARTED_AT,
  cancel_at_period_end: false,
  canceled_at: null,
  latest_invoice_id: null,
  last_payment_status: null,
};

describe('upsertSubscriptionFromStripe — discount window (plan §3 bug fix)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('records a platform coupon correctly when Stripe returns it unexpanded (bare id)', async () => {
    // First call: readIntroDiscount's platform_coupons lookup by stripe_coupon_id.
    query.mockResolvedValueOnce({ rows: [platformCouponRow({ percent_off: 100, duration_months: 12 })] });
    // Second call: the INSERT ... RETURNING.
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      { id: 'di_1', source: { coupon: 'rebelshops-platform-coupon-uuid-1' } } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    expect(query).toHaveBeenCalledTimes(2);
    const insertParams = query.mock.calls[1][1] as unknown[];

    // The bug: this used to be `null` for any coupon id that was not the intro coupon.
    expect(insertParams[COL.introEndsAt]).toEqual(computeIntroEndDate(STARTED_AT, 12));
    expect(insertParams[COL.introMonths]).toBe(12);
    expect(insertParams[COL.introCouponId]).toBe('rebelshops-platform-coupon-uuid-1');
    // 100% off PLATFORM_LIST_AMOUNT_CENTS: the discounted price is 0.
    expect(insertParams[COL.introAmount]).toBe(0);
  });

  it('records a partial-percentage platform coupon correctly when unexpanded', async () => {
    query.mockResolvedValueOnce({ rows: [platformCouponRow({ percent_off: 50, duration_months: 6 })] });
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      { id: 'di_2', source: { coupon: 'rebelshops-platform-coupon-uuid-2' } } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    const insertParams = query.mock.calls[1][1] as unknown[];
    const expectedAmountOff = computeDiscountedAmountCents(PLATFORM_LIST_AMOUNT_CENTS, 50);

    expect(insertParams[COL.introMonths]).toBe(6);
    expect(insertParams[COL.introEndsAt]).toEqual(computeIntroEndDate(STARTED_AT, 6));
    expect(insertParams[COL.introAmount]).toBe(PLATFORM_LIST_AMOUNT_CENTS - expectedAmountOff);
  });

  it('records a platform coupon correctly when Stripe returns it expanded (full Coupon object)', async () => {
    // No platform_coupons lookup needed for the expanded shape — only the final INSERT.
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      {
        id: 'di_3',
        source: {
          coupon: {
            id: 'rebelshops-platform-coupon-uuid-3',
            object: 'coupon',
            percent_off: 100,
            amount_off: null,
            duration: 'repeating',
            duration_in_months: 12,
          } as unknown as Stripe.Coupon,
        },
      } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    expect(query).toHaveBeenCalledTimes(1);
    const insertParams = query.mock.calls[0][1] as unknown[];

    expect(insertParams[COL.introMonths]).toBe(12);
    expect(insertParams[COL.introEndsAt]).toEqual(computeIntroEndDate(STARTED_AT, 12));
    // Percent-off coupons carry `amount_off: null` in Stripe's response — this is the other half
    // of the bug fix: the expanded branch used to read only `amount_off`, so any percent-based
    // coupon (which is what every platform coupon is — plan §2) landed `amountOff: null` even when
    // fully expanded.
    expect(insertParams[COL.introAmount]).toBe(0);
  });

  it('still recognizes the intro coupon when unexpanded (regression)', async () => {
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      { id: 'di_4', source: { coupon: resolveIntroCouponId() } } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    // The intro coupon is recognized by id alone; no platform_coupons lookup is needed.
    expect(query).toHaveBeenCalledTimes(1);
    const insertParams = query.mock.calls[0][1] as unknown[];

    expect(insertParams[COL.introMonths]).toBe(PLATFORM_INTRO_MONTHS);
    expect(insertParams[COL.introEndsAt]).toEqual(computeIntroEndDate(STARTED_AT, PLATFORM_INTRO_MONTHS));
    // `intro_amount` stores the discounted *price the merchant pays*, not the amount knocked off —
    // list minus the intro coupon's `amount_off`.
    expect(insertParams[COL.introAmount]).toBe(PLATFORM_INTRO_AMOUNT_CENTS);
  });

  it('falls back to unknown (not NULL-by-accident) for an unexpanded id that matches nothing', async () => {
    // The platform_coupons lookup finds no row.
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      { id: 'di_5', source: { coupon: 'some-other-stripe-coupon' } } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    const insertParams = query.mock.calls[1][1] as unknown[];
    expect(insertParams[COL.introMonths]).toBe(0);
    expect(insertParams[COL.introEndsAt]).toBeNull();
    expect(insertParams[COL.introAmount]).toBeNull();
  });

  it('records a forever platform coupon (duration_months null) with no end date but a real amount', async () => {
    query.mockResolvedValueOnce({ rows: [platformCouponRow({ percent_off: 100, duration_months: null })] });
    query.mockResolvedValueOnce({ rows: [UPSERT_RESULT_ROW] });

    const subscription = buildSubscription([
      { id: 'di_6', source: { coupon: 'rebelshops-platform-coupon-uuid-6' } } as Partial<Stripe.Discount>,
    ]);

    await upsertSubscriptionFromStripe(subscription);

    const insertParams = query.mock.calls[1][1] as unknown[];
    // No fixed window -> no end date, but the discounted amount is still correctly recorded.
    expect(insertParams[COL.introEndsAt]).toBeNull();
    expect(insertParams[COL.introAmount]).toBe(0);
  });
});
