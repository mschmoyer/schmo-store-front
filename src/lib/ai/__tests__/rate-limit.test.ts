/**
 * Rate-limiter tests.
 *
 * Time is injected so the window boundary is crossed deterministically rather
 * than by sleeping — the same discipline the rest of this codebase uses for
 * time-dependent logic.
 */

import { rateLimit, resetRateLimits } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit within a window', () => {
    expect(rateLimit('store-a', 3, 60_000, 1000).ok).toBe(true);
    expect(rateLimit('store-a', 3, 60_000, 1001).ok).toBe(true);
    expect(rateLimit('store-a', 3, 60_000, 1002)).toMatchObject({ ok: true, remaining: 0 });
  });

  it('blocks once the limit is reached, and reports a retry-after', () => {
    for (const t of [0, 1, 2]) rateLimit('store-b', 3, 60_000, t);
    const blocked = rateLimit('store-b', 3, 60_000, 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    for (const t of [0, 1, 2]) rateLimit('store-c', 3, 60_000, t);
    expect(rateLimit('store-c', 3, 60_000, 3).ok).toBe(false);
    expect(rateLimit('store-c', 3, 60_000, 60_001).ok).toBe(true);
  });

  it('keeps keys independent', () => {
    for (const t of [0, 1, 2]) rateLimit('store-d', 3, 60_000, t);
    expect(rateLimit('store-d', 3, 60_000, 3).ok).toBe(false);
    expect(rateLimit('store-e', 3, 60_000, 3).ok).toBe(true);
  });
});
