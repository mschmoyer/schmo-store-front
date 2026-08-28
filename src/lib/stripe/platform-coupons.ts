/**
 * Resolve-or-create the Stripe Coupon behind one `platform_coupons` row (flow A — a merchant
 * subscribing to RebelShops). Unlike the intro coupon (`stripe/prices.ts`), a platform coupon is
 * one of many operator-created rows rather than a single well-known object: an existing Stripe
 * coupon whose economics disagree with its row is never silently reused — it throws, because
 * coupons are immutable in Stripe and reusing the wrong one means charging the wrong amount on a
 * real invoice.
 *
 * Flow A's own module, separate from `stripe/discounts.ts` (flow B — ephemeral storefront coupons).
 * Do not merge the two; see this directory's `CLAUDE.md`.
 */

import type Stripe from 'stripe';
import { getStripe } from './client';
import { db } from '@/lib/database/connection';
import { requiresPaymentMethod } from '@/lib/billing/platform-coupons';
import { setStripeCouponId, type PlatformCouponRecord, type Queryable } from '@/lib/platform/coupons';

/**
 * Fields this module reads off a `platform_coupons` row. Aliased to {@link PlatformCouponRecord}
 * rather than narrowed via `Pick`, so a caller's existing record passes straight through and still
 * satisfies `billing/platform-coupons.ts`'s `PlatformCoupon` shape for {@link requiresPaymentMethod}.
 */
export type StripeCouponSource = PlatformCouponRecord;

/**
 * Build the deterministic Stripe Coupon id for a platform coupon.
 *
 * Derived from our own UUID rather than letting Stripe assign one, so {@link ensureStripeCouponFor}
 * is safe to retry: two concurrent callers resolving the same row compute the same id, so at most
 * one `coupons.create` succeeds and a repeat is a lookup, never a second object.
 *
 * @param platformCouponId - The `platform_coupons.id` UUID.
 * @returns A stable, human-legible Stripe Coupon id.
 */
export function deriveStripeCouponId(platformCouponId: string): string {
  return `rebelshops-platform-coupon-${platformCouponId}`;
}

/**
 * The pure object {@link ensureStripeCouponFor} sends to `stripe.coupons.create`. Exported
 * separately so the shaping rules are unit-testable without a Stripe client, and so there is one
 * definition of the shape rather than a second, drifting copy.
 *
 * `duration` is `'forever'` when `durationMonths` is `null`, else `'repeating'` with
 * `duration_in_months` set. `metadata` traces a coupon found in the Stripe dashboard back to us.
 *
 * **`max_redemptions` is never set here, deliberately.** It would give Stripe a second counter
 * that drifts from our redemption ledger the moment a checkout session is attached and then
 * abandoned (the discount reads "used" in Stripe with no completed subscription on our side). The
 * ledger — `platform_coupon_redemptions`, gated by a `BEFORE INSERT` trigger — enforces the cap;
 * Stripe only prices the discount once it's already allowed. If the cap seems unenforced, look at
 * the ledger and its trigger, not this coupon.
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
 * Duplicated from `stripe/prices.ts` rather than shared — each module in this directory keeps its
 * own copy, as `discounts.ts` and `prices.ts` already do.
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
 *   coupon was deleted from the Stripe dashboard) is treated as "not provisioned yet": a replacement
 *   is created and the new id persisted, so an out-of-band deletion cannot permanently wedge this.
 * - Otherwise it is created fresh, at the deterministic id from {@link deriveStripeCouponId}, and the
 *   id is persisted via `setStripeCouponId`.
 * - Either way, a retrieved coupon's economics are checked against the row via
 *   {@link assertEconomicsMatch} before it is returned.
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
      // Fall through: recreate below and persist the new id, so a dashboard deletion self-heals
      // on next use instead of failing every checkout for this coupon forever.
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
   * Set to `'if_required'` only when the coupon should skip collecting a card. Omitted (rather
   * than `undefined`-valued) for the default case, so a caller can spread this straight into
   * `checkout.sessions.create` params without filtering out an explicit `undefined`.
   */
  readonly paymentMethodCollection?: 'if_required';
}

/**
 * Derive what a subscription Checkout Session needs to apply this coupon: the `discounts` entry, and
 * whether to pass `payment_method_collection: 'if_required'`.
 *
 * Defers to `billing/platform-coupons.ts`'s `requiresPaymentMethod` for the card-collection
 * decision rather than keeping a second copy of that logic.
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
