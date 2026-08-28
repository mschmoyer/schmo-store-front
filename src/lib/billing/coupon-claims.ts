/**
 * The platform-coupon claim lifecycle (flow A signup coupons — see `docs/plans/platform-coupons.md`
 * §6). Every state transition a `platform_coupon_redemptions` row can go through lives in this
 * module and nowhere else: no other file writes `status`, `redeemed_at`, `released_at` or
 * `release_reason`.
 *
 * ```
 *               signup with a code          subscription created with the coupon
 *   (none) ─────────────────────────► attributed ─────────────────────────────► redeemed
 *                                         │
 *                                         │ 30 days unattributed, subscribed without the code,
 *                                         │ or an operator releases it
 *                                         ▼
 *                                      released
 * ```
 *
 * `redeemed` and `released` are terminal — neither transition reverses, and releasing a `redeemed`
 * claim is refused (see {@link releaseClaim}) rather than misrepresenting a paid redemption as an
 * expired reservation.
 *
 * Pre-checks here exist for a good error message; the `BEFORE INSERT` trigger (plan §7) is the
 * actual race guard. A `RAISE` from it, or a unique-index violation, is caught and translated into
 * the same typed reason a pre-check failure would produce — a caller never sees a raw Postgres error
 * string (`CLAUDE.md` "Secrets"/"Honest results").
 *
 * Every write takes an injectable `Queryable`, defaulting to the real `db`, so tests exercise the
 * real transition logic and SQL shape rather than mocking this module away.
 *
 * Does not touch `platform_coupons` except to read the columns that gate a new attribution.
 * Creating, listing and deactivating coupons is `src/lib/platform/coupons.ts`.
 */

import { db } from '@/lib/database/connection';
import { PLATFORM_CLAIM_RESERVATION_DAYS } from './coupon-windows';

/**
 * The minimal query surface every function here needs. `db` (the real connection manager) and a
 * `pg` `PoolClient` both satisfy this shape, and so does a test double — see the module note.
 */
export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

/** How a claim reached the database. Matches `platform_coupon_redemptions.source`'s CHECK. */
export type PlatformCouponClaimSource = 'link' | 'billing_form' | 'operator';

/** Where a claim sits in §6's state machine. Matches `platform_coupon_redemptions.status`'s CHECK. */
export type PlatformCouponClaimStatus = 'attributed' | 'redeemed' | 'released';

/** The `attributed` state, named once so nobody types the string at a call site. */
export const CLAIM_STATUS_ATTRIBUTED: PlatformCouponClaimStatus = 'attributed';
/** The `redeemed` state. */
export const CLAIM_STATUS_REDEEMED: PlatformCouponClaimStatus = 'redeemed';
/** The `released` state. */
export const CLAIM_STATUS_RELEASED: PlatformCouponClaimStatus = 'released';

/**
 * Whether a claim still holds capacity against its coupon's `max_redemptions`.
 *
 * `attributed` and `redeemed` both count (§6's table); only `released` gives the seat back. This is
 * the same rule the schema's partial unique indexes encode (`WHERE status <> 'released'`), named
 * here so the two cannot drift.
 *
 * @param status - The claim's status.
 * @returns `true` for `attributed` or `redeemed`.
 */
export function isLiveClaim(status: PlatformCouponClaimStatus): boolean {
  return status !== CLAIM_STATUS_RELEASED;
}

/**
 * The "still live" predicate as SQL, for queries against `platform_coupon_redemptions` that this
 * module runs directly (unaliased — every call site here queries the table alone, never joined).
 *
 * @returns `"status <> 'released'"`.
 */
function liveClaimSql(): string {
  return "status <> 'released'";
}

/** Default reservation window: how long an `attributed` claim holds its seat with nobody subscribing. */
export { PLATFORM_CLAIM_RESERVATION_DAYS } from './coupon-windows';

/** `release_reason` written by the reservation sweep. */
export const RELEASE_REASON_RESERVATION_EXPIRED = 'reservation_expired';

/** A `platform_coupon_redemptions` row as the application consumes it. */
export interface PlatformCouponClaimRecord {
  readonly id: string;
  readonly couponId: string;
  readonly userId: string;
  readonly storeId: string | null;
  readonly status: PlatformCouponClaimStatus;
  readonly source: PlatformCouponClaimSource;
  readonly attributedAt: Date;
  readonly redeemedAt: Date | null;
  readonly releasedAt: Date | null;
  readonly releaseReason: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly stripeCouponId: string | null;
  readonly discountEndsAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Raw `platform_coupon_redemptions` row shape. */
interface PlatformCouponClaimRow extends Record<string, unknown> {
  id: string;
  coupon_id: string;
  user_id: string;
  store_id: string | null;
  status: string;
  source: string;
  attributed_at: Date;
  redeemed_at: Date | null;
  released_at: Date | null;
  release_reason: string | null;
  stripe_subscription_id: string | null;
  stripe_coupon_id: string | null;
  discount_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert a raw row into a {@link PlatformCouponClaimRecord}.
 *
 * @param row - The database row.
 * @returns The normalized record.
 */
function toRecord(row: PlatformCouponClaimRow): PlatformCouponClaimRecord {
  return {
    id: row.id,
    couponId: row.coupon_id,
    userId: row.user_id,
    storeId: row.store_id,
    status: row.status as PlatformCouponClaimStatus,
    source: row.source as PlatformCouponClaimSource,
    attributedAt: row.attributed_at,
    redeemedAt: row.redeemed_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCouponId: row.stripe_coupon_id,
    discountEndsAt: row.discount_ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, coupon_id, user_id, store_id, status, source, attributed_at, redeemed_at, released_at,
  release_reason, stripe_subscription_id, stripe_coupon_id, discount_ends_at, created_at, updated_at
`;

/** Postgres SQLSTATE for a unique-index violation. */
const PG_UNIQUE_VIOLATION = '23505';
/** Postgres SQLSTATE for a bare `RAISE EXCEPTION` inside a function or trigger. */
const PG_RAISED_EXCEPTION = 'P0001';

/**
 * Read the SQLSTATE off a thrown value, the way `pg` attaches it.
 *
 * @param error - Whatever was caught.
 * @returns The code, or `undefined` when `error` carries none.
 */
function pgErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Read the message off a thrown value.
 *
 * @param error - Whatever was caught.
 * @returns The message, or `''` when there is none.
 */
function pgErrorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';
}

/** Input to {@link attributeCoupon}. */
export interface AttributeCouponInput {
  /** The coupon being claimed. */
  couponId: string;
  /** The user claiming it — normally the account just created at onboarding. */
  userId: string;
  /** The store, when one already exists. `null` before {@link backfillStoreId} runs. */
  storeId?: string | null;
  /** Where the code came from, for the redemptions tab. */
  source: PlatformCouponClaimSource;
}

/**
 * Why {@link attributeCoupon} did or did not create a claim. `'ok'` is a value in this same union
 * (not a boolean flag) so a caller cannot check `.ok` without also being forced to look at
 * `.reason` — see {@link AttributeCouponResult}.
 */
export type AttributeCouponReason = 'ok' | 'exhausted' | 'inactive' | 'expired' | 'already_claimed';

/**
 * The result of {@link attributeCoupon}. A route renders this to a human — see §4A/§9 of the plan —
 * so every failure is a named reason, never a Postgres error string.
 */
export type AttributeCouponResult =
  | { reason: 'ok'; claim: PlatformCouponClaimRecord }
  | { reason: Exclude<AttributeCouponReason, 'ok'> };

/** Row shape of the pre-check read against `platform_coupons`. */
interface CouponGateRow extends Record<string, unknown> {
  is_active: boolean;
  redeem_by: Date | string | null;
  max_redemptions: number | null;
  redeemed_count: number;
}

/**
 * Translate a failed insert into a typed reason.
 *
 * Reached only when {@link attributeCoupon}'s pre-checks already passed, so a `RAISE` here almost
 * always means a concurrent insert won the capacity race. Migration 042's
 * `platform_coupon_redemptions_check_capacity()` trigger prefixes each of its four failures with a
 * greppable tag — `platform_coupon_not_found`, `_inactive`, `_expired`, `_exhausted` — so this
 * matches those tags rather than sniffing free text. A message carrying none of them (should not
 * happen against that trigger) degrades to the conservative default, `'exhausted'`. The raw error is
 * logged server-side, never returned.
 *
 * @param error - Whatever the insert threw.
 * @returns A failure {@link AttributeCouponResult}.
 * @throws The original error when it is not one of the two codes understood here — an unrecognised
 *   failure is an operational fault, should 500, not be reported as a coupon problem.
 */
function mapAttributeInsertError(error: unknown): AttributeCouponResult {
  const code = pgErrorCode(error);

  if (code === PG_UNIQUE_VIOLATION) {
    // Either `idx_pcr_one_per_user_per_coupon` or `idx_pcr_one_live_per_user` — both describe the
    // same fact to the caller: this user already holds a live claim.
    return { reason: 'already_claimed' };
  }

  if (code === PG_RAISED_EXCEPTION) {
    const message = pgErrorMessage(error);
    if (message.includes('platform_coupon_expired')) {
      return { reason: 'expired' };
    }
    if (
      message.includes('platform_coupon_inactive') ||
      message.includes('platform_coupon_not_found')
    ) {
      return { reason: 'inactive' };
    }
    if (message.includes('platform_coupon_exhausted')) {
      return { reason: 'exhausted' };
    }
    console.error(
      '[coupon-claims] attributeCoupon: unrecognised trigger refusal, treating as exhausted:',
      error
    );
    return { reason: 'exhausted' };
  }

  throw error;
}

/**
 * Reserve a coupon for a user: the `(none) → attributed` transition in §6.
 *
 * Written at `POST /api/onboarding/account`, immediately after the user row exists. Idempotent in
 * the sense the state machine requires — a second call for a user who already holds a live claim on
 * *any* coupon is refused as `already_claimed` rather than creating a second row, because the schema
 * allows exactly one live claim per user (`idx_pcr_one_live_per_user`).
 *
 * @param input - The coupon, the user, the store (if known yet) and where the code came from.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The typed outcome — see {@link AttributeCouponResult}.
 */
export async function attributeCoupon(
  input: AttributeCouponInput,
  executor: Queryable = db
): Promise<AttributeCouponResult> {
  const gate = await executor.query<CouponGateRow>(
    `SELECT is_active, redeem_by, max_redemptions, redeemed_count
       FROM platform_coupons
      WHERE id = $1`,
    [input.couponId]
  );

  const coupon = gate.rows[0];
  // A coupon id that does not resolve behaves like an inactive one — 'inactive' is the closest of
  // the five named reasons to "this code does not work" without inventing a sixth.
  if (!coupon || coupon.is_active !== true) {
    return { reason: 'inactive' };
  }

  if (coupon.redeem_by && new Date(coupon.redeem_by).getTime() <= Date.now()) {
    return { reason: 'expired' };
  }

  if (coupon.max_redemptions !== null && coupon.redeemed_count >= coupon.max_redemptions) {
    return { reason: 'exhausted' };
  }

  const existingLiveClaim = await executor.query<{ id: string }>(
    `SELECT id FROM platform_coupon_redemptions WHERE user_id = $1 AND ${liveClaimSql()} LIMIT 1`,
    [input.userId]
  );
  if (existingLiveClaim.rows[0]) {
    return { reason: 'already_claimed' };
  }

  try {
    const inserted = await executor.query<PlatformCouponClaimRow>(
      `INSERT INTO platform_coupon_redemptions (coupon_id, user_id, store_id, status, source)
       VALUES ($1, $2, $3, 'attributed', $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.couponId, input.userId, input.storeId ?? null, input.source]
    );

    const row = inserted.rows[0];
    if (!row) {
      // No RAISE, no conflict, still nothing back — treat as a lost race, not an opaque error.
      return { reason: 'exhausted' };
    }
    return { reason: 'ok', claim: toRecord(row) };
  } catch (error) {
    return mapAttributeInsertError(error);
  }
}

/**
 * The live claim for a user, if any.
 *
 * Used by billing checkout to decide precedence between a code typed at billing, a claim attributed
 * at signup, and the standard intro offer (plan §3). At most one row can ever match, because
 * `idx_pcr_one_live_per_user` forbids a second.
 *
 * @param userId - The user to look up.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The live claim, or `null` when the user holds none.
 */
export async function resolveActiveClaim(
  userId: string,
  executor: Queryable = db
): Promise<PlatformCouponClaimRecord | null> {
  const result = await executor.query<PlatformCouponClaimRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM platform_coupon_redemptions
      WHERE user_id = $1 AND ${liveClaimSql()}
      LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** Input to {@link markRedeemed}. */
export interface MarkRedeemedInput {
  /** The user whose subscription just carried the coupon. */
  userId: string;
  stripeSubscriptionId: string;
  stripeCouponId: string;
  /** When the free window closes. `null` for a `duration_months IS NULL` (forever) coupon. */
  discountEndsAt: Date | null;
  /**
   * The `platform_coupon_id` read off Stripe metadata, when available — checkout writes this to
   * both the Checkout Session and the subscription's metadata specifically so this function can
   * confirm it (staff-review finding 14). When supplied, it must match the live claim's own
   * `coupon_id` or the transition is refused as {@link MarkRedeemedResult}'s `'coupon_mismatch'`
   * rather than silently redeeming whatever live claim this user holds. Omit only when there is
   * genuinely no coupon id to check — no call site currently does.
   */
  expectedCouponId?: string | null;
}

/**
 * The result of {@link markRedeemed}.
 *
 * `'already_redeemed'` is success, not failure — the field name is `reason`, not `ok`, precisely so
 * a caller cannot collapse "already redeemed" and "nothing to redeem" into the same falsy check.
 * `'coupon_mismatch'` is a refusal: the live claim exists, but for a different coupon than the one
 * Stripe attached (finding 14) — the transition is never applied.
 */
export type MarkRedeemedResult =
  | { reason: 'ok'; claim: PlatformCouponClaimRecord }
  | { reason: 'already_redeemed'; claim: PlatformCouponClaimRecord }
  | { reason: 'no_active_claim' }
  | { reason: 'coupon_mismatch'; claim: PlatformCouponClaimRecord };

/**
 * Confirm a reservation: the `attributed → redeemed` transition in §6.
 *
 * Called from the Stripe webhook once a subscription carrying the coupon exists. **Idempotent**: a
 * redelivered webhook for the same subscription returns the already-redeemed row rather than
 * raising or writing a duplicate.
 *
 * @param input - The user and the Stripe facts the webhook just learned.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The typed outcome — see {@link MarkRedeemedResult}.
 */
export async function markRedeemed(
  input: MarkRedeemedInput,
  executor: Queryable = db
): Promise<MarkRedeemedResult> {
  const existing = await executor.query<PlatformCouponClaimRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM platform_coupon_redemptions
      WHERE user_id = $1 AND ${liveClaimSql()}
      LIMIT 1`,
    [input.userId]
  );

  const row = existing.rows[0];
  if (!row) {
    return { reason: 'no_active_claim' };
  }

  if (input.expectedCouponId && row.coupon_id !== input.expectedCouponId) {
    return { reason: 'coupon_mismatch', claim: toRecord(row) };
  }

  if (row.status === CLAIM_STATUS_REDEEMED) {
    return { reason: 'already_redeemed', claim: toRecord(row) };
  }

  // liveClaimSql() already excludes 'released', so the only other status here is 'attributed';
  // `AND status = 'attributed'` guards against a concurrent redemption winning first.
  const updated = await executor.query<PlatformCouponClaimRow>(
    `UPDATE platform_coupon_redemptions
        SET status = 'redeemed',
            redeemed_at = NOW(),
            stripe_subscription_id = $2,
            stripe_coupon_id = $3,
            discount_ends_at = $4,
            updated_at = NOW()
      WHERE id = $1 AND status = 'attributed'
      RETURNING ${SELECT_COLUMNS}`,
    [row.id, input.stripeSubscriptionId, input.stripeCouponId, input.discountEndsAt]
  );

  const updatedRow = updated.rows[0];
  if (updatedRow) {
    return { reason: 'ok', claim: toRecord(updatedRow) };
  }

  // Lost the race: another call redeemed this row between the SELECT and this UPDATE — re-read
  // and report the true, already-successful outcome rather than a bogus failure.
  const recheck = await executor.query<PlatformCouponClaimRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupon_redemptions WHERE id = $1`,
    [row.id]
  );
  const recheckRow = recheck.rows[0];
  return recheckRow
    ? { reason: 'already_redeemed', claim: toRecord(recheckRow) }
    : { reason: 'no_active_claim' };
}

/**
 * The result of {@link releaseClaim}.
 *
 * `'illegal_transition'` is the refusal invariant 11.5's neighbour asks for: releasing a `redeemed`
 * claim would misrepresent money that actually changed hands as a reservation that quietly expired,
 * so it is refused rather than applied.
 */
export type ReleaseClaimResult =
  | { reason: 'ok'; claim: PlatformCouponClaimRecord }
  | { reason: 'already_released'; claim: PlatformCouponClaimRecord }
  | { reason: 'not_found' }
  | { reason: 'illegal_transition' };

/**
 * Release one claim: the `attributed → released` transition in §6, or a no-op when it is already
 * there.
 *
 * Used by the operator console and by {@link releaseExpiredClaims} for the cron sweep. Refuses to
 * release a `redeemed` claim — see {@link ReleaseClaimResult}.
 *
 * @param id - The claim's id.
 * @param releaseReason - A short label for the ledger — e.g. `'reservation_expired'`,
 *                         `'operator_released'`, `'subscribed_without_code'`.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The typed outcome — see {@link ReleaseClaimResult}.
 */
export async function releaseClaim(
  id: string,
  releaseReason: string,
  executor: Queryable = db
): Promise<ReleaseClaimResult> {
  const existing = await executor.query<PlatformCouponClaimRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupon_redemptions WHERE id = $1`,
    [id]
  );
  const row = existing.rows[0];
  if (!row) {
    return { reason: 'not_found' };
  }
  if (row.status === CLAIM_STATUS_RELEASED) {
    return { reason: 'already_released', claim: toRecord(row) };
  }
  if (row.status === CLAIM_STATUS_REDEEMED) {
    return { reason: 'illegal_transition' };
  }

  const updated = await executor.query<PlatformCouponClaimRow>(
    `UPDATE platform_coupon_redemptions
        SET status = 'released', released_at = NOW(), release_reason = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'attributed'
      RETURNING ${SELECT_COLUMNS}`,
    [id, releaseReason]
  );

  const updatedRow = updated.rows[0];
  if (updatedRow) {
    return { reason: 'ok', claim: toRecord(updatedRow) };
  }

  // Lost a race against a concurrent transition on the same row — re-read and report what
  // actually happened.
  const recheck = await executor.query<PlatformCouponClaimRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupon_redemptions WHERE id = $1`,
    [id]
  );
  const recheckRow = recheck.rows[0];
  if (!recheckRow) {
    return { reason: 'not_found' };
  }
  if (recheckRow.status === CLAIM_STATUS_REDEEMED) {
    return { reason: 'illegal_transition' };
  }
  return { reason: 'already_released', claim: toRecord(recheckRow) };
}

/** What {@link releaseExpiredClaims} did. */
export interface ReleaseExpiredClaimsResult {
  /** How many reservations were released. */
  releasedCount: number;
  /** The claims that were released, newest-attributed first is not guaranteed — see the query. */
  claims: PlatformCouponClaimRecord[];
}

/**
 * The cron sweep: release every `attributed` claim older than the reservation window.
 *
 * Nothing is deleted — the released row stays in the ledger so "clicked 40 times, redeemed twice"
 * stays answerable, and a friend who returns after the window re-attributes against the freed seat.
 *
 * A single `UPDATE … RETURNING` rather than select-then-loop: one round trip, one atomic statement,
 * so no row can be read as still-attributed by a concurrent {@link attributeCoupon} check and then
 * released out from under it mid-sweep.
 *
 * @param olderThanDays - Reservation age threshold in days. Defaults to
 *                         {@link PLATFORM_CLAIM_RESERVATION_DAYS}.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns How many claims were released, and the claims themselves.
 */
export async function releaseExpiredClaims(
  olderThanDays: number = PLATFORM_CLAIM_RESERVATION_DAYS,
  executor: Queryable = db
): Promise<ReleaseExpiredClaimsResult> {
  const result = await executor.query<PlatformCouponClaimRow>(
    `UPDATE platform_coupon_redemptions
        SET status = 'released',
            released_at = NOW(),
            release_reason = $1,
            updated_at = NOW()
      WHERE status = 'attributed'
        AND attributed_at <= NOW() - ($2 || ' days')::interval
      RETURNING ${SELECT_COLUMNS}`,
    [RELEASE_REASON_RESERVATION_EXPIRED, olderThanDays]
  );

  const claims = result.rows.map(toRecord);
  return { releasedCount: claims.length, claims };
}

/**
 * Learn a claim's store once onboarding creates one.
 *
 * A coupon is attributed to a user at account creation, before a store exists (§6); this fills
 * `store_id` in afterward, at `POST /api/onboarding/store`. Only fills a currently-`NULL`
 * `store_id`, so a repeat call is a safe no-op rather than an overwrite.
 *
 * @param userId - The user whose claim should learn its store.
 * @param storeId - The store that was just created.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The updated claim, or `null` when the user has no live claim with a still-empty
 *          `store_id` to backfill.
 */
export async function backfillStoreId(
  userId: string,
  storeId: string,
  executor: Queryable = db
): Promise<PlatformCouponClaimRecord | null> {
  const result = await executor.query<PlatformCouponClaimRow>(
    `UPDATE platform_coupon_redemptions
        SET store_id = $2, updated_at = NOW()
      WHERE user_id = $1 AND ${liveClaimSql()} AND store_id IS NULL
      RETURNING ${SELECT_COLUMNS}`,
    [userId, storeId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}
