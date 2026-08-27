/**
 * Resolution and idempotent provisioning of the Stripe Coupon behind one `platform_coupons` row
 * (flow **A** — a merchant subscribing to RebelShops; see `docs/plans/platform-coupons.md` §3).
 *
 * Mirrors the resolve-or-create shape in `stripe/prices.ts`'s `ensureIntroCoupon`, with the one
 * difference §3 rule 3 calls out explicitly: the intro coupon is a single well-known object, but a
 * platform coupon is one of potentially hundreds, created by an operator through a form rather than
 * hand-provisioned once. So an existing Stripe coupon whose economics disagree with our row is never
 * silently reused — it throws, because coupons are immutable in Stripe and reusing the wrong one
 * means charging the wrong amount on a real invoice.
 *
 * This is flow A's own module, separate from `stripe/discounts.ts` (flow B — ephemeral, per-session,
 * one-time storefront coupons for a shopper's discount code). Do not merge the two; see the module
 * map in this directory's `CLAUDE.md`.
 */

import type Stripe from 'stripe';
import { getStripe } from './client';
import { db } from '@/lib/database/connection';
import { requiresPaymentMethod } from '@/lib/billing/platform-coupons';
import { setStripeCouponId, type PlatformCouponRecord, type Queryable } from '@/lib/platform/coupons';

/**
 * The fields this module reads off a `platform_coupons` row. Re-exported as an alias of
 * {@link PlatformCouponRecord} (rather than a narrower `Pick`) so a caller can pass the record it
 * already has from `platform/coupons.ts` straight through, and so it structurally satisfies
 * `billing/platform-coupons.ts`'s `PlatformCoupon` for the {@link requiresPaymentMethod} call inside
 * {@link deriveSubscriptionParams}.
 */
export type StripeCouponSource = PlatformCouponRecord;

/**
 * Build the deterministic Stripe Coupon id for a platform coupon.
 *
 * Deriving the id from our own UUID — rather than letting Stripe assign one — is what makes
 * {@link ensureStripeCouponFor} safe to retry: two concurrent callers resolving the same row compute
 * the same id, so at most one `coupons.create` succeeds and a repeat is a lookup, never a second
 * object.
 *
 * @param platformCouponId - The `platform_coupons.id` UUID.
 * @returns A stable, human-legible Stripe Coupon id.
 */
export function deriveStripeCouponId(platformCouponId: string): string {
  return `rebelshops-platform-coupon-${platformCouponId}`;
}

/**
 * The pure object {@link ensureStripeCouponFor} would send to `stripe.coupons.create`. Exported
 * separately so the shaping rules can be unit-tested without a Stripe client, and so
 * {@link ensureStripeCouponFor} has exactly one definition of that shape to build its create call
 * from — never a second, drifting copy.
 *
 * Per plan §3:
 * - `percent_off` comes straight from the row.
 * - `duration` is `'forever'` when `durationMonths` is `null`, else `'repeating'` with
 *   `duration_in_months` set.
 * - `metadata` records what this coupon is and which row it backs, so a coupon found by browsing
 *   the Stripe dashboard is traceable back to us.
 *
 * **`max_redemptions` is never set here — plan §3 rule 1, deliberately.** Setting it would give
 * Stripe a second counter that drifts from our redemption ledger the moment a checkout session is
 * attached and then abandoned (the discount would be "used" in Stripe's eyes without a completed
 * subscription on ours). Our ledger — `platform_coupon_redemptions`, gated by the `BEFORE INSERT`
 * trigger described in plan §7 — is what enforces the cap; Stripe's job here is only to price the
 * discount once it has already been allowed. If you are reading this because the cap seems to not be
 * enforced, look at the ledger and its trigger, not at this coupon.
 *
 * @param coupon - The `platform_coupons` row to describe.
 * @returns The `stripe.coupons.create` params for this row.
 */
export function describeStripeCouponFor(coupon: StripeCouponSource): Stripe.CouponCreateParams {
  const params: Stripe.CouponCreateParams = {
    id: deriveStripeCouponId(coupon.id),
    name: coupon.name,
    percent_off: coupon.percentOff,
    duration: coupon.durationMonths === null ? 'forever' : 'repeating',
    metadata: {
      managed_by: 'rebelshops',
      scope: 'platform_signup',
      platform_coupon_id: coupon.id,
      code: coupon.code,
    },
  };

  if (coupon.durationMonths !== null) {
    params.duration_in_months = coupon.durationMonths;
  }

  return params;
}

/**
 * Narrow an unknown Stripe error to "the object does not exist".
 *
 * Duplicated from `stripe/prices.ts` rather than shared — each module in this directory owns its own
 * copy of this narrow-and-check, the way `discounts.ts` and `prices.ts` already do not import from
 * one another.
 *
 * @param error - The thrown value.
 * @returns `true` for Stripe `resource_missing` errors.
 */
function isResourceMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: string; statusCode?: number };
  return candidate.code === 'resource_missing' || candidate.statusCode === 404;
}

/**
 * Assert that a Stripe coupon's economics match the `platform_coupons` row it is supposed to back.
 *
 * @param coupon - The row.
 * @param existing - The Stripe coupon retrieved for it.
 * @throws Error naming both sides' `percent_off` / `duration` when they disagree.
 */
function assertEconomicsMatch(coupon: StripeCouponSource, existing: Stripe.Coupon): void {
  const expectedDuration: Stripe.Coupon.Duration =
    coupon.durationMonths === null ? 'forever' : 'repeating';

  const matches =
    existing.percent_off === coupon.percentOff &&
    existing.duration === expectedDuration &&
    (expectedDuration === 'forever' || existing.duration_in_months === coupon.durationMonths);

  if (matches) {
    return;
  }

  const describe = (percentOff: number | null, duration: string, durationInMonths: number | null) =>
    `percent_off=${percentOff}, duration=${duration}` +
    (duration === 'repeating' ? ` for ${durationInMonths} months` : '');

  throw new Error(
    `Stripe coupon ${existing.id} does not match platform coupon "${coupon.code}" ` +
      `(expected ${describe(coupon.percentOff, expectedDuration, coupon.durationMonths)}; ` +
      `Stripe has ${describe(existing.percent_off ?? null, existing.duration, existing.duration_in_months ?? null)}). ` +
      'Coupons are immutable - deactivate this platform coupon and issue a new one rather than ' +
      'editing its economics.'
  );
}

/**
 * Resolve-or-create the one Stripe Coupon backing a `platform_coupons` row, and persist its id.
 *
 * - If the row already has `stripeCouponId`, it is retrieved. A `resource_missing` response (the
 *   coupon was deleted from the Stripe dashboard) is treated as "not provisioned yet" rather than an
 *   error: a replacement is created and the new id is persisted, so a coupon deleted out-of-band
 *   cannot permanently wedge the feature.
 * - Otherwise it is created fresh, at the deterministic id from {@link deriveStripeCouponId}, and the
 *   id is persisted via `setStripeCouponId`.
 * - Either way, a retrieved coupon's economics are checked against the row via
 *   {@link assertEconomicsMatch} before it is returned — see that function and plan §3 rule 3.
 *
 * @param coupon - The `platform_coupons` row to resolve.
 * @param stripe - Optional Stripe client. Defaults to the shared lazy singleton.
 * @param executor - The query surface used to persist a newly-resolved id. Defaults to the real
 *   database; tests inject a fake `Queryable` the same way `platform/coupons.ts` itself does.
 * @returns The resolved Stripe Coupon.
 * @throws Error when an existing coupon's economics disagree with the row's.
 */
export async function ensureStripeCouponFor(
  coupon: StripeCouponSource,
  stripe: Stripe = getStripe('ensureStripeCouponFor'),
  executor: Queryable = db
): Promise<Stripe.Coupon> {
  if (coupon.stripeCouponId) {
    try {
      const existing = await stripe.coupons.retrieve(coupon.stripeCouponId);
      assertEconomicsMatch(coupon, existing);
      return existing;
    } catch (error) {
      if (!isResourceMissing(error)) {
        throw error;
      }
      // Fall through: the stored id no longer resolves to anything in Stripe. Recreate below and
      // persist whatever id comes back, so a dashboard deletion self-heals on next use instead of
      // failing every checkout for this coupon forever.
    }
  }

  const created = await stripe.coupons.create(describeStripeCouponFor(coupon));
  await setStripeCouponId(coupon.id, created.id, executor);
  return created;
}

/** What {@link deriveSubscriptionParams} hands to a Checkout Session for one platform coupon. */
export interface PlatformCouponSubscriptionParams {
  /** The single discount to attach — plan §3's "a platform coupon replaces the intro offer". */
  readonly discounts: [{ readonly coupon: string }];
  /**
   * Set to `'if_required'` only when the coupon should skip collecting a card — plan §3's
   * "Collecting a card, or not". Omitted (rather than `undefined`-valued) for the default-collection
   * case, so a caller can spread this straight into `checkout.sessions.create` params without
   * needing to filter out an explicit `undefined`.
   */
  readonly paymentMethodCollection?: 'if_required';
}

/**
 * Derive what a subscription Checkout Session needs to apply this coupon: the `discounts` entry, and
 * whether to pass `payment_method_collection: 'if_required'`.
 *
 * The card-collection decision is not re-derived here — `billing/platform-coupons.ts`'s
 * `requiresPaymentMethod` already encodes plan §3's rule that `collectPaymentMethod: false` only
 * changes anything at `percentOff === 100`, and this function defers to it rather than keeping a
 * second copy of that logic.
 *
 * @param coupon - The `platform_coupons` row, already resolved to a Stripe coupon (its
 *   `stripeCouponId` must be set — call {@link ensureStripeCouponFor} first).
 * @returns The Checkout Session params this coupon contributes.
 * @throws Error when `coupon.stripeCouponId` is not set yet.
 */
export function deriveSubscriptionParams(
  coupon: StripeCouponSource
): PlatformCouponSubscriptionParams {
  if (!coupon.stripeCouponId) {
    throw new Error(
      `Platform coupon "${coupon.code}" has no stripeCouponId yet - call ensureStripeCouponFor ` +
        'before deriveSubscriptionParams.'
    );
  }

  const params: PlatformCouponSubscriptionParams = {
    discounts: [{ coupon: coupon.stripeCouponId }],
  };

  if (!requiresPaymentMethod(coupon)) {
    return { ...params, paymentMethodCollection: 'if_required' };
  }

  return params;
}
