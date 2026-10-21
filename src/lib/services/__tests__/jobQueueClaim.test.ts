/**
 * @jest-environment node
 */

/**
 * Guards for the job queue's claim statement.
 *
 * The visit-driven refresh drains one store's jobs at a time, so the claim must carry a store
 * predicate when — and only when — it is asked to. A scoped claim that silently dropped the
 * predicate would let one storefront's visit run every tenant's queued work inside its request; an
 * unscoped claim that gained one would stop the daily cron draining anything.
 *
 * `buildClaimJobsQuery` is the exact SQL `claimJobs` runs, so this tests the real text rather than
 * a mock of the database. Parameter casts are pinned because this codebase has already shipped two
 * `inconsistent types deduced for parameter` failures (see src/lib/shipstation/CLAUDE.md, rule 9).
 */

import {
  buildClaimJobsQuery,
  buildRecoverStaleJobsQuery,
  STALE_PROCESSING_MINUTES
} from '../jobQueueService';

const STORE = '650e8400-e29b-41d4-a716-446655440001';

describe('buildClaimJobsQuery', () => {
  it('claims across every store when no store is given', () => {
    const { text, values } = buildClaimJobsQuery(25);

    expect(text).not.toContain('store_id');
    expect(text).not.toContain('$2');
    expect(values).toEqual([25]);
  });

  it('restricts the claim to one store, cast to uuid, when a store is given', () => {
    const { text, values } = buildClaimJobsQuery(10, STORE);

    expect(text).toContain('AND store_id = $2::uuid');
    expect(values).toEqual([10, STORE]);
  });

  it('keeps the claim safe for concurrent drains either way', () => {
    for (const { text } of [buildClaimJobsQuery(5), buildClaimJobsQuery(5, STORE)]) {
      expect(text).toContain('FOR UPDATE SKIP LOCKED');
      expect(text).toContain("status IN ('pending', 'retrying')");
      expect(text).toContain('LIMIT $1::int');
    }
  });
});

describe('buildRecoverStaleJobsQuery', () => {
  it('only touches rows stuck in processing past the cutoff, with explicit casts', () => {
    const { text, values } = buildRecoverStaleJobsQuery(STALE_PROCESSING_MINUTES);

    expect(text).toContain("WHERE status = 'processing'");
    expect(text).toContain('started_at < NOW() - make_interval(mins => $1::int)');
    expect(text).not.toContain('store_id');
    expect(values).toEqual([STALE_PROCESSING_MINUTES]);
  });

  it('counts the killed run as an attempt and fails the job when attempts run out', () => {
    const { text } = buildRecoverStaleJobsQuery(15);

    expect(text).toContain('attempts = COALESCE(attempts, 0) + 1');
    expect(text).toMatch(/>= COALESCE\(max_attempts, 3\) THEN 'failed'\s+ELSE 'retrying'/);
  });

  it('restricts recovery to one store when asked', () => {
    const { text, values } = buildRecoverStaleJobsQuery(15, STORE);

    expect(text).toContain('AND store_id = $2::uuid');
    expect(values).toEqual([15, STORE]);
  });

  it('cannot reclaim a job that may still be running under the longest maxDuration (300 s)', () => {
    expect(STALE_PROCESSING_MINUTES * 60).toBeGreaterThan(300);
  });
});
