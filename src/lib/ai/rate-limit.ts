/**
 * A small fixed-window rate limiter for the AI endpoints.
 *
 * The AI routes call a paid model on behalf of a merchant, so an unbounded
 * caller is both a cost and a denial-of-service risk — the goal for this
 * feature was "LIMITED SECURE", and a limit is the "limited" half. This keeps a
 * per-key count in a fixed time window in process memory.
 *
 * The honest limitation, stated rather than hidden: this is per-instance. On a
 * multi-instance deployment a caller could get up to `limit` requests per
 * instance per window, not `limit` globally. That is acceptable for the abuse
 * this guards against — one merchant hammering "generate my page" — and avoids a
 * database round trip on every call. A shared-store limiter (Redis, a table)
 * would be the upgrade if these endpoints ever face untrusted volume; the
 * signature here does not change if it does.
 */

/** One key's usage within the current window. */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** Whether this request is allowed. */
  ok: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window resets, for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Record a hit against a key and report whether it is within the limit.
 *
 * `nowMs` is injectable so the limiter can be tested deterministically; the
 * scripts in this codebase cannot call `Date.now()` under the workflow runtime,
 * and a test should not sleep to cross a window boundary.
 *
 * @param key - The thing being limited, e.g. a store id plus a route name
 * @param limit - Maximum hits allowed per window
 * @param windowMs - Window length in milliseconds
 * @param nowMs - Current time; defaults to `Date.now()`
 * @returns Whether the hit is allowed, with remaining and reset information
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || nowMs >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds };
}

/**
 * Clear all recorded windows. For tests only.
 * @returns Nothing
 */
export function resetRateLimits(): void {
  windows.clear();
}
