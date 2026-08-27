/**
 * The two clocks a signup coupon runs on, as plain numbers with no dependencies.
 *
 * Both values used to live in modules that reach the database — the reservation window in
 * `coupon-claims.ts`, which imports `pg` at module scope. A client component that needs to say
 * *"reserved until 26 September"* would therefore have dragged the Postgres driver into the browser
 * bundle, so the dashboard banner duplicated the number instead and pointed a comment at the
 * original. That works right up until someone changes one of them.
 *
 * A constant shared between a server module and a client component belongs in a module that imports
 * nothing. This is the same fix as `_lib/coupon-cookie.ts`, and the same class of bug as the
 * `JWT_SECRET` module-scope throw that took the customizer's preview pane down: the problem was
 * never the value, it was what the value's module dragged along with it.
 *
 * The two clocks are genuinely different and are deliberately named apart — see
 * `docs/plans/platform-coupons.md` §5.1, "Two clocks, not one":
 *
 *  - **Reservation** runs from `attributed_at`, before anyone has subscribed. It decides when an
 *    unredeemed claim releases its seat back to the coupon.
 *  - **Discount** runs from `discount_ends_at`, which does not exist until a redemption closes. It
 *    decides when the merchant starts being charged.
 *
 * Folding them into one number would be wrong even though both happen to be 30 days today.
 */

/**
 * How long an `attributed` claim holds its seat with nobody subscribing.
 *
 * Re-exported by `coupon-claims.ts` as `PLATFORM_CLAIM_RESERVATION_DAYS`, which is the name server
 * code should keep using; this module is the single definition behind it.
 */
export const PLATFORM_CLAIM_RESERVATION_DAYS = 30;

/**
 * How many days before `discount_ends_at` the merchant starts being warned.
 *
 * Re-exported by `discount-notice.ts` as `PLATFORM_DISCOUNT_WARNING_DAYS`. Equal to the reservation
 * window by coincidence, not by design — they answer different questions and may diverge.
 */
export const PLATFORM_DISCOUNT_WARNING_DAYS = 30;

/**
 * How long after a discount window closes the merchant is still nudged rather than left alone.
 *
 * Messaging only: nothing in this codebase disables a storefront for non-payment, and this feature
 * deliberately does not introduce that. See `docs/plans/platform-coupons.md` §5.2.
 */
export const PLATFORM_DISCOUNT_GRACE_DAYS = 14;
