/**
 * The platform operator's reads and writes on signup coupons (flow A — see
 * `docs/plans/platform-coupons.md`). This is the console's own module: `/platform/coupons` creates,
 * lists, edits and deactivates coupons through the functions here, and lists redemptions across
 * every merchant through {@link listRedemptions}.
 *
 * Two things are deliberately **not** here. The coupon *lifecycle* — attribute, redeem, release —
 * is `src/lib/billing/coupon-claims.ts`; this module only ever reads the redemption ledger, never
 * transitions a row through it. And code *normalisation* and the offer sentence are
 * `src/lib/billing/platform-coupons.ts`, imported rather than re-implemented, so there is exactly
 * one definition of "what does `code_normalized` mean" in the codebase.
 *
 * **This module owns the coupon-status vocabulary** — `active` / `inactive` / `expired` /
 * `exhausted` — the way `src/lib/platform/customers.ts` owns "received". A coupon's displayed
 * status is derived once, by {@link derivePlatformCouponStatus}, and both {@link listPlatformCoupons}'
 * filtering and its counts read through that single function. Two screens independently deciding
 * what "expired" means is exactly the defect `customers.ts` documents happening three times already
 * on this console; the fix here is the same seam.
 *
 * **Demo exclusion follows the console's existing rule.** {@link listRedemptions} defaults to
 * excluding `stores.is_demo` and reuses {@link realStorePredicate}, {@link buildPagination} and
 * {@link describeScope} from `platform/customers.ts` rather than re-deciding what "demo" or
 * "pagination" mean — see `docs/platform-admin.md`.
 *
 * **Every write takes an injectable `Queryable`, defaulting to the real `db`** — see the `Queryable`
 * note in `coupon-claims.ts`, which this module mirrors rather than importing (a read/report module
 * depending on a lifecycle module's plumbing type would be a stranger dependency than the small
 * duplication).
 */

import { db } from '@/lib/database/connection';
import { normalizeCouponCode } from '@/lib/billing/platform-coupons';
import {
  buildPagination,
  describeScope,
  realStorePredicate,
  type PaginationEnvelope,
  type PlatformScope,
} from '@/lib/platform/customers';
import type {
  PlatformCouponClaimSource,
  PlatformCouponClaimStatus,
} from '@/lib/billing/coupon-claims';

/**
 * The minimal query surface every function here needs. `db` and a `pg` `PoolClient` both satisfy
 * this shape, and so does a test double.
 */
export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

/** Postgres SQLSTATE for a unique-index violation. */
const PG_UNIQUE_VIOLATION = '23505';

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
 * Coerce a Postgres scalar (often a `bigint`-as-string from `COUNT(*)`) to a real number.
 *
 * @param value - Whatever the driver produced for the column.
 * @returns The numeric value, or `0` for null, empty or unparseable input.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** A `platform_coupons` row as the application consumes it. */
export interface PlatformCouponRecord {
  readonly id: string;
  /** As issued, for display — case and punctuation preserved. */
  readonly code: string;
  /** `upper(trim(code))` — the lookup key. Never shown; see {@link normalizeCouponCode}. */
  readonly codeNormalized: string;
  readonly name: string;
  readonly notes: string | null;
  readonly percentOff: number;
  /** `null` means the discount runs forever. */
  readonly durationMonths: number | null;
  readonly collectPaymentMethod: boolean;
  /** `null` means uncapped. */
  readonly maxRedemptions: number | null;
  /** Trigger-maintained rollup of live (`attributed` + `redeemed`) claims. */
  readonly redeemedCount: number;
  readonly redeemBy: Date | null;
  readonly isActive: boolean;
  readonly stripeCouponId: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Raw `platform_coupons` row shape. */
interface PlatformCouponRow extends Record<string, unknown> {
  id: string;
  code: string;
  code_normalized: string;
  name: string;
  notes: string | null;
  percent_off: number;
  duration_months: number | null;
  collect_payment_method: boolean;
  max_redemptions: number | null;
  redeemed_count: number;
  redeem_by: Date | null;
  is_active: boolean;
  stripe_coupon_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert a raw row into a {@link PlatformCouponRecord}.
 *
 * @param row - The database row.
 * @returns The normalized record.
 */
function toRecord(row: PlatformCouponRow): PlatformCouponRecord {
  return {
    id: row.id,
    code: row.code,
    codeNormalized: row.code_normalized,
    name: row.name,
    notes: row.notes,
    percentOff: row.percent_off,
    durationMonths: row.duration_months,
    collectPaymentMethod: row.collect_payment_method,
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    redeemBy: row.redeem_by,
    isActive: row.is_active,
    stripeCouponId: row.stripe_coupon_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, code, code_normalized, name, notes, percent_off, duration_months, collect_payment_method,
  max_redemptions, redeemed_count, redeem_by, is_active, stripe_coupon_id, created_by,
  created_at, updated_at
`;

/** Input to {@link createPlatformCoupon}. */
export interface CreatePlatformCouponInput {
  /** As the operator typed it. Normalised internally via {@link normalizeCouponCode}. */
  code: string;
  name: string;
  notes?: string | null;
  /** 1-100. */
  percentOff: number;
  /** `null` (or omitted) means the discount runs forever. */
  durationMonths?: number | null;
  /** Defaults to `true` — see plan §2/§3. `false` is only meaningful at `percentOff === 100`. */
  collectPaymentMethod?: boolean;
  /** `null` (or omitted) means uncapped. */
  maxRedemptions?: number | null;
  redeemBy?: Date | null;
}

/**
 * The result of {@link createPlatformCoupon}. A duplicate code is a field error on the console's
 * create form, not a 500 — see the module note and `CLAUDE.md`'s rule against a raw database error
 * reaching a response.
 */
export type CreatePlatformCouponResult =
  | { reason: 'ok'; coupon: PlatformCouponRecord }
  | { reason: 'duplicate_code' };

/**
 * Create a platform coupon.
 *
 * The percent-off / duration / card-collection economics are set here and nowhere else — see
 * {@link updatePlatformCoupon}, which refuses to touch them. `redeemed_count` starts at `0` and
 * `stripe_coupon_id` starts `NULL`; the latter is filled in once, lazily, by
 * `src/lib/stripe/platform-coupons.ts` (phase 2), via {@link setStripeCouponId}.
 *
 * @param input - The coupon to create.
 * @param createdByUserId - The operator creating it, for `created_by`.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The created coupon, or a typed `duplicate_code` refusal when `code_normalized` collides
 *          (Postgres `23505` on `idx_platform_coupons_code`) — never a thrown database error.
 */
export async function createPlatformCoupon(
  input: CreatePlatformCouponInput,
  createdByUserId: string,
  executor: Queryable = db
): Promise<CreatePlatformCouponResult> {
  const codeNormalized = normalizeCouponCode(input.code);

  try {
    const result = await executor.query<PlatformCouponRow>(
      `INSERT INTO platform_coupons (
          code, code_normalized, name, notes, percent_off, duration_months,
          collect_payment_method, max_redemptions, redeem_by, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.code.trim(),
        codeNormalized,
        input.name,
        input.notes ?? null,
        input.percentOff,
        input.durationMonths ?? null,
        input.collectPaymentMethod ?? true,
        input.maxRedemptions ?? null,
        input.redeemBy ?? null,
        createdByUserId,
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('platform_coupons insert returned no row');
    }
    return { reason: 'ok', coupon: toRecord(row) };
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      return { reason: 'duplicate_code' };
    }
    throw error;
  }
}

/**
 * Look up a coupon by its issued code.
 *
 * @param code - The code as a user typed or clicked it. Normalised via {@link normalizeCouponCode}
 *               before matching `code_normalized`, so case and surrounding whitespace never matter.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The coupon, or `null` when no such code exists.
 */
export async function getPlatformCouponByCode(
  code: string,
  executor: Queryable = db
): Promise<PlatformCouponRecord | null> {
  const result = await executor.query<PlatformCouponRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupons WHERE code_normalized = $1`,
    [normalizeCouponCode(code)]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Look up a coupon by id.
 *
 * @param id - The coupon's id.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The coupon, or `null` when no such id exists.
 */
export async function getPlatformCouponById(
  id: string,
  executor: Queryable = db
): Promise<PlatformCouponRecord | null> {
  const result = await executor.query<PlatformCouponRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupons WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * The coupon-status vocabulary this console shows: `active`, `inactive`, `expired`, `exhausted`.
 *
 * Exactly one of these applies to any coupon at any moment, in this priority order — a deactivated
 * coupon reads as `inactive` even past its `redeem_by`, because an operator who flipped the switch
 * already knows why it stopped working and does not need a second, contradictory reason.
 */
export type PlatformCouponStatus = 'active' | 'inactive' | 'expired' | 'exhausted';

/** Every value {@link PlatformCouponStatus} can take, for building the operator's filter tabs. */
export const PLATFORM_COUPON_STATUSES: readonly PlatformCouponStatus[] = [
  'active',
  'inactive',
  'expired',
  'exhausted',
];

/**
 * Derive a coupon's displayed status.
 *
 * The single definition behind both {@link listPlatformCoupons}' `active`/`expired`/`exhausted`
 * filters and its counts, so the tab a coupon is filed under and the count on that tab's label can
 * never disagree — the exact failure mode `platform/customers.ts` documents for "received" and
 * "customized" happening on this same console before a function owned the word.
 *
 * @param coupon - The fields needed to decide: whether the switch is on, when the link dies, and
 *                 how much capacity remains.
 * @param now - Current time; injectable for tests.
 * @returns The one status that applies.
 */
export function derivePlatformCouponStatus(
  coupon: Pick<PlatformCouponRecord, 'isActive' | 'redeemBy' | 'maxRedemptions' | 'redeemedCount'>,
  now: Date = new Date()
): PlatformCouponStatus {
  if (!coupon.isActive) {
    return 'inactive';
  }
  if (coupon.redeemBy && coupon.redeemBy.getTime() <= now.getTime()) {
    return 'expired';
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return 'exhausted';
  }
  return 'active';
}

/** Filters {@link listPlatformCoupons} accepts. `'all'` applies no filter. */
export type PlatformCouponFilter = PlatformCouponStatus | 'all';

/** One coupon on the console's list, with its derived status attached. */
export interface PlatformCouponListItem extends PlatformCouponRecord {
  readonly status: PlatformCouponStatus;
}

/** What {@link listPlatformCoupons} returns. */
export interface PlatformCouponListResult {
  coupons: PlatformCouponListItem[];
  /**
   * Live counts by status, over **every** coupon regardless of the requested filter — what the
   * tabs' own labels need ("Active (4)", "Expired (2)") so a tab's count does not disappear the
   * moment its own filter is applied.
   */
  counts: Record<PlatformCouponStatus, number>;
}

/**
 * List platform coupons, optionally narrowed to one status.
 *
 * Fetches every coupon and derives status in application code via
 * {@link derivePlatformCouponStatus} rather than duplicating the same three conditions as a second,
 * SQL-shaped definition — the coupons table is operator-issued and small (tens to low hundreds of
 * rows, not the tenancy-wide scale `platform/customers.ts` pages against), so one query plus an
 * in-memory filter is the simpler correct answer here.
 *
 * @param filter - `'active' | 'inactive' | 'expired' | 'exhausted' | 'all'`. Defaults to `'all'`.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The matching coupons (newest first) and live counts across the whole set.
 */
export async function listPlatformCoupons(
  filter: PlatformCouponFilter = 'all',
  executor: Queryable = db
): Promise<PlatformCouponListResult> {
  const result = await executor.query<PlatformCouponRow>(
    `SELECT ${SELECT_COLUMNS} FROM platform_coupons ORDER BY created_at DESC`
  );

  const now = new Date();
  const withStatus: PlatformCouponListItem[] = result.rows.map((row) => {
    const record = toRecord(row);
    return { ...record, status: derivePlatformCouponStatus(record, now) };
  });

  const counts: Record<PlatformCouponStatus, number> = {
    active: 0,
    inactive: 0,
    expired: 0,
    exhausted: 0,
  };
  for (const coupon of withStatus) {
    counts[coupon.status] += 1;
  }

  const coupons = filter === 'all' ? withStatus : withStatus.filter((c) => c.status === filter);

  return { coupons, counts };
}

/**
 * The fields {@link updatePlatformCoupon} may actually change.
 *
 * `percentOff`, `durationMonths` and `collectPaymentMethod` are present in this type **only** so an
 * attempt to set them can be detected and named in the refusal below — they are never written to
 * the database by this function. Plan §11 invariant 5 makes them immutable once anyone has
 * redeemed; this function goes one step further and never accepts them at all, because nothing in
 * the module map gives an operator a legitimate reason to edit a coupon's economics after creation
 * — a code with a wrong percentage before anyone has redeemed it is deactivated and replaced, not
 * patched, the same way the schema gives coupons no `DELETE` (see the module note).
 */
export interface PlatformCouponPatch {
  name?: string;
  notes?: string | null;
  redeemBy?: Date | null;
  isActive?: boolean;
  /** Never written. See the interface note. */
  percentOff?: number;
  /** Never written. See the interface note. */
  durationMonths?: number | null;
  /** Never written. See the interface note. */
  collectPaymentMethod?: boolean;
}

/** Fields of {@link PlatformCouponPatch} that {@link updatePlatformCoupon} refuses outright. */
const IMMUTABLE_ECONOMICS_FIELDS = ['percentOff', 'durationMonths', 'collectPaymentMethod'] as const;

/**
 * The result of {@link updatePlatformCoupon}. `economics_immutable` names every offending field so
 * the console can point at the right one rather than rejecting the whole form.
 */
export type UpdatePlatformCouponResult =
  | { reason: 'ok'; coupon: PlatformCouponRecord }
  | { reason: 'not_found' }
  | { reason: 'economics_immutable'; fields: readonly string[] };

/**
 * Edit a coupon's non-economic fields: name, notes, `redeem_by`, `is_active`.
 *
 * Refuses — with a typed reason, never a thrown error — any patch that touches `percentOff`,
 * `durationMonths` or `collectPaymentMethod`, whether or not the coupon has been redeemed yet. See
 * {@link PlatformCouponPatch}.
 *
 * @param id - The coupon to edit.
 * @param patch - The fields to change. Omitted fields are left as they are.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The updated coupon, `not_found` when `id` does not exist, or `economics_immutable` when
 *          the patch tried to change the coupon's economics.
 */
export async function updatePlatformCoupon(
  id: string,
  patch: PlatformCouponPatch,
  executor: Queryable = db
): Promise<UpdatePlatformCouponResult> {
  const attemptedEconomicsFields = IMMUTABLE_ECONOMICS_FIELDS.filter(
    (field) => patch[field] !== undefined
  );
  if (attemptedEconomicsFields.length > 0) {
    return { reason: 'economics_immutable', fields: attemptedEconomicsFields };
  }

  const sets: string[] = [];
  const params: unknown[] = [id];

  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    sets.push(`notes = $${params.length}`);
  }
  if (patch.redeemBy !== undefined) {
    params.push(patch.redeemBy);
    sets.push(`redeem_by = $${params.length}`);
  }
  if (patch.isActive !== undefined) {
    params.push(patch.isActive);
    sets.push(`is_active = $${params.length}`);
  }

  if (sets.length === 0) {
    const existing = await getPlatformCouponById(id, executor);
    return existing ? { reason: 'ok', coupon: existing } : { reason: 'not_found' };
  }

  const result = await executor.query<PlatformCouponRow>(
    `UPDATE platform_coupons
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    params
  );

  const row = result.rows[0];
  return row ? { reason: 'ok', coupon: toRecord(row) } : { reason: 'not_found' };
}

/**
 * Deactivate a coupon. There is no delete — see the module note and plan §3 rule 2: a coupon with
 * redemption history cannot be deleted (`ON DELETE RESTRICT`), and deactivating stops new
 * redemptions without touching anyone already on the offer (invariant 6).
 *
 * @param id - The coupon to deactivate.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The deactivated coupon, or `null` when `id` does not exist.
 */
export async function deactivatePlatformCoupon(
  id: string,
  executor: Queryable = db
): Promise<PlatformCouponRecord | null> {
  const result = await executor.query<PlatformCouponRow>(
    `UPDATE platform_coupons
        SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [id]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Record the Stripe Coupon resolved for a platform coupon.
 *
 * Written once, by `src/lib/stripe/platform-coupons.ts`'s resolve-or-create (phase 2). Plan §3 rule
 * 2: a Stripe coupon is never deleted, so once this is set it is never cleared, only (in principle)
 * replaced — which does not happen in the current design.
 *
 * @param id - The platform coupon.
 * @param stripeCouponId - The Stripe Coupon id it resolves to.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The updated coupon, or `null` when `id` does not exist.
 */
export async function setStripeCouponId(
  id: string,
  stripeCouponId: string,
  executor: Queryable = db
): Promise<PlatformCouponRecord | null> {
  const result = await executor.query<PlatformCouponRow>(
    `UPDATE platform_coupons
        SET stripe_coupon_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [id, stripeCouponId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * The redemption-ledger statuses, exactly as `platform_coupon_redemptions.status` stores them, and
 * the SQL predicates over them for {@link listRedemptions} — this module's read-side ownership of
 * the vocabulary `coupon-claims.ts` writes. Aliased to `pcr`, the alias every query in this module
 * joins the table under.
 */
export const REDEMPTION_ATTRIBUTED_PREDICATE = "pcr.status = 'attributed'";
export const REDEMPTION_REDEEMED_PREDICATE = "pcr.status = 'redeemed'";
export const REDEMPTION_RELEASED_PREDICATE = "pcr.status = 'released'";

/** Parameters {@link listRedemptions} accepts. Every field is optional; an empty object lists all. */
export interface ListRedemptionsFilter {
  /** Narrow to one ledger state. Omit for every state. */
  status?: PlatformCouponClaimStatus;
  /** Narrow to one coupon's redemptions — the console's coupon detail view. */
  couponId?: string;
  /** Include seeded demo stores. Defaults to `false`, like every other list on this console. */
  includeDemo?: boolean;
  /** 1-based. Defaults to `1`. */
  page?: number;
  /** Defaults to `25`, capped at `100`. */
  pageSize?: number;
}

/** One row on the operator's redemptions tab. */
export interface PlatformRedemptionListItem {
  id: string;
  status: PlatformCouponClaimStatus;
  source: PlatformCouponClaimSource;
  attributedAt: Date;
  redeemedAt: Date | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  stripeSubscriptionId: string | null;
  stripeCouponId: string | null;
  discountEndsAt: Date | null;
  coupon: { id: string; code: string; name: string };
  user: { id: string; email: string; name: string };
  /** `null` before onboarding creates a store — see `coupon-claims.ts`'s `backfillStoreId`. */
  store: { id: string; name: string; isDemo: boolean } | null;
}

/** What {@link listRedemptions} returns. */
export interface PlatformRedemptionListResult {
  redemptions: PlatformRedemptionListItem[];
  pagination: PaginationEnvelope;
  /** What this list actually counted — see `describeScope` in `platform/customers.ts`. */
  scope: PlatformScope;
}

/** Raw shape of the redemptions-list join. */
interface RedemptionRow extends Record<string, unknown> {
  id: string;
  status: string;
  source: string;
  attributed_at: Date;
  redeemed_at: Date | null;
  released_at: Date | null;
  release_reason: string | null;
  stripe_subscription_id: string | null;
  stripe_coupon_id: string | null;
  discount_ends_at: Date | null;
  coupon_id: string;
  coupon_code: string;
  coupon_name: string;
  user_id: string;
  user_email: string;
  user_first_name: string | null;
  user_last_name: string | null;
  store_id: string | null;
  store_name: string | null;
  store_is_demo: boolean | null;
}

/**
 * Convert a joined row into a {@link PlatformRedemptionListItem}.
 *
 * @param row - The database row.
 * @returns The normalized list item.
 */
function toRedemptionListItem(row: RedemptionRow): PlatformRedemptionListItem {
  const fullName = [row.user_first_name, row.user_last_name].filter(Boolean).join(' ').trim();
  return {
    id: row.id,
    status: row.status as PlatformCouponClaimStatus,
    source: row.source as PlatformCouponClaimSource,
    attributedAt: row.attributed_at,
    redeemedAt: row.redeemed_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCouponId: row.stripe_coupon_id,
    discountEndsAt: row.discount_ends_at,
    coupon: { id: row.coupon_id, code: row.coupon_code, name: row.coupon_name },
    user: { id: row.user_id, email: row.user_email, name: fullName || row.user_email },
    store: row.store_id
      ? { id: row.store_id, name: row.store_name ?? '', isDemo: row.store_is_demo === true }
      : null,
  };
}

/**
 * The operator's redemptions tab: every redemption across every coupon, newest-attributed first.
 *
 * Joins `platform_coupons`, `users` and (optionally missing, hence `LEFT JOIN`) `stores` — a claim
 * attributed at signup has no store until `backfillStoreId` runs. Demo stores are excluded by
 * default via {@link realStorePredicate}, exactly like every other list on `/platform`
 * (`docs/platform-admin.md`); a `LEFT JOIN`-missing store passes that predicate on its own (`NULL
 * IS DISTINCT FROM TRUE` is `TRUE`), so a redemption with no store yet is correctly never treated as
 * a demo row.
 *
 * @param filter - Narrowing and paging options. See {@link ListRedemptionsFilter}.
 * @param executor - The query surface to run against. Defaults to the real database.
 * @returns The page of redemptions, its pagination envelope, and the scope this list counted.
 */
export async function listRedemptions(
  filter: ListRedemptionsFilter = {},
  executor: Queryable = db
): Promise<PlatformRedemptionListResult> {
  const includeDemo = filter.includeDemo ?? false;
  const page = Math.max(1, Math.trunc(filter.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filter.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [realStorePredicate('s', includeDemo)];
  const params: unknown[] = [];

  if (filter.status) {
    params.push(filter.status);
    conditions.push(`pcr.status = $${params.length}`);
  }
  if (filter.couponId) {
    params.push(filter.couponId);
    conditions.push(`pcr.coupon_id = $${params.length}`);
  }

  const whereSql = `WHERE ${conditions.join(' AND ')}`;
  const fromSql = `
    FROM platform_coupon_redemptions pcr
    JOIN platform_coupons pc ON pc.id = pcr.coupon_id
    JOIN users u ON u.id = pcr.user_id
    LEFT JOIN stores s ON s.id = pcr.store_id
    ${whereSql}
  `;

  const countResult = await executor.query<{ total: string }>(
    `SELECT COUNT(*)::bigint AS total ${fromSql}`,
    params
  );
  const total = toNumber(countResult.rows[0]?.total);
  const pagination = buildPagination(page, pageSize, total);

  const rowsResult = await executor.query<RedemptionRow>(
    `SELECT pcr.id, pcr.status, pcr.source, pcr.attributed_at, pcr.redeemed_at, pcr.released_at,
            pcr.release_reason, pcr.stripe_subscription_id, pcr.stripe_coupon_id,
            pcr.discount_ends_at,
            pc.id AS coupon_id, pc.code AS coupon_code, pc.name AS coupon_name,
            u.id AS user_id, u.email AS user_email,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            s.id AS store_id, s.store_name AS store_name, s.is_demo AS store_is_demo
       ${fromSql}
      ORDER BY pcr.attributed_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  return {
    redemptions: rowsResult.rows.map(toRedemptionListItem),
    pagination,
    scope: await describeScope(includeDemo),
  };
}
