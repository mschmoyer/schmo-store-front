/**
 * The `/admin` and `/admin/billing` alert ladder for a platform coupon's free window, as one pure
 * function of `(discountEndsAt, hasPaymentMethod, now, status)`.
 *
 * `docs/plans/platform-coupons.md` §5.1 specifies the ladder, and §5.2 explains why grace has to be
 * computed here rather than left to Stripe: with a card on file, Stripe's own dunning retries *are*
 * the grace period, and `isEntitled()` already counts `past_due` as entitled — a second,
 * product-level grace on top would give the merchant two clocks that disagree, so this module never
 * produces a grace state when a card is on file. Without a card, dunning retries against nothing,
 * so grace has to be a product decision, which is what {@link PLATFORM_DISCOUNT_GRACE_DAYS} is.
 *
 * This module owns both {@link PLATFORM_DISCOUNT_GRACE_DAYS} and
 * {@link PLATFORM_DISCOUNT_WARNING_DAYS} so the dashboard and the billing page read the same
 * constants instead of two screens quietly disagreeing about what day it is (§5.1).
 *
 * Zero dependencies — no Stripe, no database — like `intro-offer.ts` and `platform-coupons.ts`.
 *
 * ## A resolved ambiguity
 *
 * §5.1's table has a row for "coupon attributed, not yet subscribed", whose alert is about the
 * *reservation* lapsing (§6's 30-day attribution window) — a different clock from
 * `discount_ends_at`, which does not exist yet for a redemption that has not happened. That row is
 * out of scope for this function: it owns the free-window ladder only, keyed off a coupon that has
 * actually been **redeemed**. Callers pass `status` so this function can say `nothing-to-say` for
 * `'attributed'` and `'released'` redemptions rather than being asked to guess at a discount that
 * is not yet (or no longer) live; the reservation banner is a separate, simpler concern (a single
 * date, no card/no-card split) that belongs to whatever code reads the attribution row directly.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many days after `discount_ends_at` a no-card redemption is still shown as "in grace" rather
 * than "grace exhausted". Applies only when no payment method is on file — see the file header.
 * Proposed value from §5.2.
 */
export const PLATFORM_DISCOUNT_GRACE_DAYS = 14;

/**
 * How many days before `discount_ends_at` the dashboard starts saying anything at all. Outside this
 * window the ladder is silent on purpose (§5.1: "quiet for eleven months, clear for the last one").
 */
export const PLATFORM_DISCOUNT_WARNING_DAYS = 30;

/**
 * The lifecycle state of a coupon redemption, mirroring the `status` column of
 * `platform_coupon_redemptions` (§7). Defined locally rather than imported so this module stays
 * dependency-free; it is a narrow, stable vocabulary unlikely to drift from the schema.
 */
export type RedemptionStatus = 'attributed' | 'redeemed' | 'released';

/** Nothing to render — outside the warning window, the offer is forever, or there is no live discount. */
export interface DiscountNoticeNothing {
  readonly state: 'nothing-to-say';
}

/** Card on file, window closing within {@link PLATFORM_DISCOUNT_WARNING_DAYS}. Purely informational. */
export interface DiscountNoticeInformational {
  readonly state: 'informational';
  /** When the free window closes. */
  readonly discountEndsAt: Date;
  /** Whole days remaining until `discountEndsAt`, rounded up (0 means it closes today). */
  readonly daysRemaining: number;
  /** Informational alerts can be dismissed per browser — see §5.1. */
  readonly dismissible: true;
}

/** No card on file, window closing within {@link PLATFORM_DISCOUNT_WARNING_DAYS}. A task, not a notice. */
export interface DiscountNoticeActionable {
  readonly state: 'actionable';
  /** When the free window closes. */
  readonly discountEndsAt: Date;
  /** Whole days remaining until `discountEndsAt`, rounded up (0 means it closes today). */
  readonly daysRemaining: number;
  /** Actionable alerts (no payment method) are never dismissible. */
  readonly dismissible: false;
}

/** No card on file, window has closed, still inside the grace period. */
export interface DiscountNoticeInGrace {
  readonly state: 'in-grace';
  /** When the free window closed. */
  readonly discountEndsAt: Date;
  /** The instant grace ends: `discountEndsAt + PLATFORM_DISCOUNT_GRACE_DAYS` days. */
  readonly graceEndsAt: Date;
  /** Whole days remaining until `graceEndsAt`, rounded up. */
  readonly daysRemainingInGrace: number;
  readonly dismissible: false;
}

/** No card on file, window closed, and the grace period has run out. Still not a locked door — §5.2. */
export interface DiscountNoticeGraceExhausted {
  readonly state: 'grace-exhausted';
  /** When the free window closed. */
  readonly discountEndsAt: Date;
  /** The instant grace ended. */
  readonly graceEndsAt: Date;
  readonly dismissible: false;
}

/** Everything {@link resolveDiscountNotice} can return. */
export type DiscountNotice =
  | DiscountNoticeNothing
  | DiscountNoticeInformational
  | DiscountNoticeActionable
  | DiscountNoticeInGrace
  | DiscountNoticeGraceExhausted;

/**
 * Round a millisecond duration up to whole days, never negative.
 *
 * @param ms - Duration in milliseconds.
 * @returns Whole days, rounded up, floored at 0.
 */
function daysUp(ms: number): number {
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

/**
 * Resolve which alert (if any) `/admin` and `/admin/billing` should render for a platform
 * coupon's free window, per §5.1 and §5.2 of the plan.
 *
 * Boundary conventions, chosen to match {@link isRedeemable}'s "the boundary instant already
 * counts" style in `platform-coupons.ts`:
 *  - The warning window is inclusive: exactly 30 days remaining warns, 31 does not.
 *  - Grace is inclusive of its end: at the exact instant `graceEndsAt` arrives, grace has run out.
 *
 * @param discountEndsAt - When the free window closes. `null` means the discount never ends
 *   ("free forever"), which is always `nothing-to-say`.
 * @param hasPaymentMethod - Whether the merchant has a card on file. Determines whether a closing
 *   window is informational or actionable, and whether grace applies at all (§5.2: with a card,
 *   Stripe's own dunning is the grace).
 * @param now - Current time; injectable for tests.
 * @param status - The redemption's lifecycle state. Only `'redeemed'` can produce a notice here;
 *   see the file header for why `'attributed'` and `'released'` are out of scope.
 * @returns The {@link DiscountNotice} to render.
 */
export function resolveDiscountNotice(
  discountEndsAt: Date | null,
  hasPaymentMethod: boolean,
  now: Date,
  status: RedemptionStatus
): DiscountNotice {
  if (status !== 'redeemed' || discountEndsAt === null) {
    return { state: 'nothing-to-say' };
  }

  const msUntilEnd = discountEndsAt.getTime() - now.getTime();
  const windowIsOpen = msUntilEnd > 0;

  if (windowIsOpen) {
    const daysRemaining = daysUp(msUntilEnd);
    if (daysRemaining > PLATFORM_DISCOUNT_WARNING_DAYS) {
      return { state: 'nothing-to-say' };
    }

    return hasPaymentMethod
      ? { state: 'informational', discountEndsAt, daysRemaining, dismissible: true }
      : { state: 'actionable', discountEndsAt, daysRemaining, dismissible: false };
  }

  // The window has closed.
  if (hasPaymentMethod) {
    // Stripe already charged the card automatically. Nothing for the dashboard to say.
    return { state: 'nothing-to-say' };
  }

  const graceEndsAt = new Date(discountEndsAt.getTime() + PLATFORM_DISCOUNT_GRACE_DAYS * MS_PER_DAY);
  const msUntilGraceEnds = graceEndsAt.getTime() - now.getTime();

  if (msUntilGraceEnds > 0) {
    return {
      state: 'in-grace',
      discountEndsAt,
      graceEndsAt,
      daysRemainingInGrace: daysUp(msUntilGraceEnds),
      dismissible: false,
    };
  }

  return { state: 'grace-exhausted', discountEndsAt, graceEndsAt, dismissible: false };
}
