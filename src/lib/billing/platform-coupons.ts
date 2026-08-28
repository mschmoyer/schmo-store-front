/**
 * The platform signup coupon model, expressed as pure integer arithmetic.
 *
 * Flow **A** money (a merchant subscribing to RebelShops), not flow **B** (a shopper's storefront
 * discount — `src/lib/billing/coupons.ts`). See `docs/plans/platform-coupons.md` §2.
 *
 * No dependencies — no Stripe, no database — like `intro-offer.ts`, so the offer sentence, the
 * discount math and the validity rules are unit-testable and the server, operator console and
 * merchant pages all quote the same numbers. Integer cents throughout; no float arithmetic on money.
 */

import { PLATFORM_LIST_AMOUNT_CENTS, formatCents } from './intro-offer';

/**
 * A `platform_coupons` row as the application consumes it: camelCase, `readonly`, and only the
 * columns the pure model needs (see migration `042_platform_coupons.sql`, §7 of the plan). Callers
 * that need `id`, `notes`, or audit columns keep their own row type and map into this one.
 */
export interface PlatformCoupon {
  /** The code as issued, for display. Use {@link normalizeCouponCode} to get the lookup key. */
  readonly code: string;
  /** Human name shown in the operator console, e.g. "Launch friends, 1 year". */
  readonly name: string;
  /** 1-100. `100` means the merchant pays nothing during the discount window. */
  readonly percentOff: number;
  /** How many monthly invoices the discount covers. `null` means forever. */
  readonly durationMonths: number | null;
  /** `false` skips card collection at signup. Only meaningful at `percentOff === 100` — see §3. */
  readonly collectPaymentMethod: boolean;
  /** Redemption cap. `1` = one-time, `N` = capped at N, `null` = uncapped. */
  readonly maxRedemptions: number | null;
  /** How many redemptions (attributed + redeemed) currently count against the cap. */
  readonly redeemedCount: number;
  /** When the link itself stops working. `null` means it never expires on its own. */
  readonly redeemBy: Date | null;
  /** Whether an operator has deactivated the code. Deactivation never claws back a live discount. */
  readonly isActive: boolean;
}

/**
 * Normalize a coupon code into the canonical lookup key: uppercased and trimmed.
 *
 * Deliberately the *only* transformation — stripping internal characters or punctuation would let
 * two distinct-looking codes collide. Case and surrounding whitespace are the only variance a human
 * forwarding a code over text or email reliably introduces.
 *
 * @param code - The code as typed, pasted, or issued.
 * @returns The normalized code, matching `code_normalized` in the schema.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Round half of a cent up, deliberately — matches `computeCouponDiscountCents` in `coupons.ts` and
 * `toCents` in `money.ts`, so the same $x.xx5 boundary resolves the same way everywhere in this
 * codebase that money is derived from a percentage.
 *
 * @param listCents - Undiscounted amount, in integer cents.
 * @param percentOff - Percentage discount, 1-100.
 * @returns The discount amount in integer cents, never more than `listCents`.
 * @throws Error when `listCents` or `percentOff` are not usable integers, or `percentOff` is out
 *   of the 1-100 range.
 */
export function computeDiscountedAmountCents(listCents: number, percentOff: number): number {
  if (!Number.isInteger(listCents) || listCents < 0) {
    throw new Error('List amount must be a non-negative integer number of cents');
  }
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
    throw new Error('percentOff must be an integer between 1 and 100');
  }

  const discount = Math.round((listCents * percentOff) / 100);
  return Math.min(discount, listCents);
}

/**
 * The price actually charged per invoice once a coupon's percentage is applied.
 *
 * @param listCents - Undiscounted amount, in integer cents.
 * @param percentOff - Percentage discount, 1-100.
 * @returns `listCents` minus the discount, in integer cents. `0` at `percentOff === 100`.
 */
export function computeDiscountedPriceCents(listCents: number, percentOff: number): number {
  return listCents - computeDiscountedAmountCents(listCents, percentOff);
}

/**
 * The date a coupon's discount stops applying, mirroring `computeIntroEndDate`'s UTC-month
 * arithmetic (redeem on the 31st, land wherever `Date.UTC`'s rollover puts you — e.g. Jan 31 + 1
 * month = Mar 3 in a non-leap year) rather than a rule invented for this feature.
 *
 * @param startedAt - When the discount began (subscription start / redemption time).
 * @param durationMonths - How many months the discount covers. `null` means the discount never
 *   ends on its own ("free forever").
 * @returns The end date, or `null` when `durationMonths` is `null`.
 */
export function computeDiscountEndsAt(startedAt: Date, durationMonths: number | null): Date | null {
  if (durationMonths === null) {
    return null;
  }

  const end = new Date(startedAt.getTime());
  end.setUTCMonth(end.getUTCMonth() + durationMonths);
  return end;
}

/**
 * The human offer sentence the UI renders without doing any math of its own — the coupon
 * equivalent of `describeIntroOffer`. Money is always derived from
 * {@link PLATFORM_LIST_AMOUNT_CENTS} via {@link formatCents}; a literal price must never appear
 * here, so the sentence stays correct if the list price ever changes.
 *
 * @param coupon - The coupon to describe.
 * @returns A sentence such as `"Free for 12 months, then $19.99/month"`,
 *   `"Free forever"`, or `"50% off for 6 months, then $19.99/month"`.
 */
export function describePlatformCoupon(coupon: PlatformCoupon): string {
  const listPrice = formatCents(PLATFORM_LIST_AMOUNT_CENTS);
  const { percentOff, durationMonths } = coupon;
  const isFree = percentOff === 100;

  if (durationMonths === null) {
    return isFree ? 'Free forever' : `${percentOff}% off forever`;
  }

  const monthWord = durationMonths === 1 ? 'month' : 'months';
  const window = `for ${durationMonths} ${monthWord}`;

  if (isFree) {
    return `Free ${window}, then ${listPrice}/month`;
  }

  return `${percentOff}% off ${window}, then ${listPrice}/month`;
}

/** Why a coupon is, or is not, currently redeemable. A value the UI renders, never a bare boolean. */
export type CouponRedeemability =
  | { readonly status: 'ok' }
  | { readonly status: 'inactive' }
  | { readonly status: 'expired' }
  | { readonly status: 'exhausted' };

/**
 * Decide whether a coupon can be redeemed right now, and name the reason when it cannot.
 *
 * Order of checks matters for the message a merchant sees: a deactivated code is reported as
 * inactive even if it has also passed `redeemBy` or filled up, since deactivation is the
 * deliberate operator action and the most informative thing to say. `/join/<code>` and the
 * billing preview both render this result directly rather than re-deriving it.
 *
 * @param coupon - The coupon to check.
 * @param now - Current time; injectable for tests.
 * @returns A {@link CouponRedeemability} naming the coupon's state.
 */
export function isRedeemable(coupon: PlatformCoupon, now: Date = new Date()): CouponRedeemability {
  if (!coupon.isActive) {
    return { status: 'inactive' };
  }

  if (coupon.redeemBy !== null && coupon.redeemBy.getTime() <= now.getTime()) {
    return { status: 'expired' };
  }

  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { status: 'exhausted' };
  }

  return { status: 'ok' };
}

/**
 * Whether Checkout should collect a payment method for this coupon (§3).
 *
 * `collectPaymentMethod === false` only changes anything at `percentOff === 100`: Stripe's
 * `payment_method_collection: 'if_required'` skips collection only when the amount due today is
 * zero, so a partial discount still charges something at signup and takes a card regardless of
 * this flag. The schema forbids storing `collectPaymentMethod: false` with `percentOff < 100`
 * (`platform_coupons_no_card_needs_full_discount`), but this function does not assume that
 * constraint held — it computes the honest answer either way.
 *
 * @param coupon - The coupon to check.
 * @returns `true` when Checkout must collect a card, `false` when it can be skipped.
 */
export function requiresPaymentMethod(coupon: PlatformCoupon): boolean {
  if (coupon.collectPaymentMethod) {
    return true;
  }
  return coupon.percentOff !== 100;
}
