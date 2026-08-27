/**
 * The signup coupon cookie's name and lifetime, and nothing else.
 *
 * This is a two-constant module on purpose. The name used to live in `state.ts`, which is the
 * onboarding state machine and therefore imports `session.ts`, which imports `jose`. That meant
 * `/join/[code]` — a route that only needs to know what to call a cookie — transitively pulled in
 * the whole JWT stack, and its tests could not run in either environment: jsdom has no `Request`
 * global for the route handler, and Node cannot parse `jose`'s ESM through this repo's
 * `transformIgnorePatterns`.
 *
 * That is the same shape of accidental coupling that took the customizer's preview pane down when
 * `JWT_SECRET` validation moved to module scope (see the note in `jwt-secret.ts`). A constant with
 * no dependencies belongs in a module with no dependencies.
 *
 * The cookie carries the **code**, never a claim or a token. It is a hint that is re-validated
 * against the database at every attach, so a forged or stale value is worth exactly nothing on its
 * own — see `docs/plans/platform-coupons.md` §11, invariant 4.
 */

/** Name of the cookie carrying a pending signup coupon code. */
export const PLATFORM_COUPON_COOKIE = 'rs_platform_coupon';

/**
 * How long the cookie survives, in seconds (30 days).
 *
 * Deliberately longer than a browsing session: a friend may click the link, get distracted, and
 * come back days later. It is shorter than nothing at all so a stale code does not follow someone
 * around forever.
 */
export const PLATFORM_COUPON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
