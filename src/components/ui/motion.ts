/**
 * Motion constants for the handful of APIs that want a JavaScript value rather
 * than a CSS variable — Mantine's `transitionProps`, mostly.
 *
 * These mirror `--ease-out` / `--duration-*` in `globals.css`. Keeping them in
 * one module is what stops a component quietly shipping the browser's default
 * `ease` curve, which is how Modal ended up on a different curve and duration
 * from Drawer while both were doing the same gesture.
 */

/** Mirrors `--ease-out`. The only entrance/exit curve in the system. */
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Mirrors `--ease-in-out`. */
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

/** Mirrors `--duration-micro` (hover, press, tooltip). */
export const DURATION_MICRO = 120;

/** Mirrors `--duration-standard` (panels, cards, modals, drawers). */
export const DURATION_STANDARD = 220;

/** Mirrors `--duration-entrance` (first paint of a section). */
export const DURATION_ENTRANCE = 420;
