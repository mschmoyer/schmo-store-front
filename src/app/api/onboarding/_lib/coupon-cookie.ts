/**
 * The signup coupon cookie's name and lifetime, deliberately isolated with no imports: `state.ts`
 * imports `session.ts` imports `jose`, which Jest cannot parse, so a route that only needs the
 * cookie's name (`/join/[code]`) would otherwise drag in the whole JWT stack and become untestable.
 *
 * The cookie carries the code only, never a claim or token — it's re-validated against the
 * database on every use, so a forged or stale value is worth nothing on its own.
 */

/** Name of the cookie carrying a pending signup coupon code. */
export const PLATFORM_COUPON_COOKIE = 'rs_platform_coupon';

/** Cookie lifetime in seconds (30 days) — long enough that a distracted friend can come back to it. */
export const PLATFORM_COUPON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
