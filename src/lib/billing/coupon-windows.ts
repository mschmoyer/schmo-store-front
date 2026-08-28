/**
 * The two clocks a signup coupon runs on, as plain numbers with no dependencies.
 *
 * Both used to live in `coupon-claims.ts`, which imports `pg` at module scope — a client component
 * quoting one of these dates would have dragged the Postgres driver into the browser bundle. See
 * `docs/plans/platform-coupons.md` §5.1, "Two clocks, not one".
 *
 *  - **Reservation** runs from `attributed_at`, before anyone has subscribed, and decides when an
 *    unredeemed claim releases its seat back to the coupon.
 *  - **Discount** runs from `discount_ends_at`, which does not exist until a redemption closes, and
 *    decides when the merchant starts being charged.
 *
 * Both happen to be 30 days today; that's coincidence, not a reason to fold them into one number.
 */

/**
 * How long an `attributed` claim holds its seat with nobody subscribing.
 *
 * Re-exported by `coupon-claims.ts` as `PLATFORM_CLAIM_RESERVATION_DAYS`; this module is the
 * single definition.
 */
export const PLATFORM_CLAIM_RESERVATION_DAYS = 30;

/**
 * How many days before `discount_ends_at` the merchant starts being warned.
 *
 * Re-exported by `discount-notice.ts` as `PLATFORM_DISCOUNT_WARNING_DAYS`. Equal to the reservation
 * window by coincidence, not by design.
 */
export const PLATFORM_DISCOUNT_WARNING_DAYS = 30;

/**
 * How long after a discount window closes the merchant is still nudged rather than left alone.
 *
 * Messaging only — nothing here disables a storefront for non-payment. See
 * `docs/plans/platform-coupons.md` §5.2.
 */
export const PLATFORM_DISCOUNT_GRACE_DAYS = 14;
