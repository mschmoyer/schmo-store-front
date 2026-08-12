/**
 * Persistence for platform subscriptions (flow A).
 *
 * Stripe is the source of truth; these tables are a queryable local mirror so the admin UI can
 * render without a round trip and so the app keeps working during a Stripe outage.
 */

import type Stripe from 'stripe';
import { db } from '../database/connection';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  computeIntroEndDate,
} from './intro-offer';

/** A subscription row as the application consumes it. */
export interface SubscriptionRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly storeId: string | null;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly stripePriceId: string | null;
  readonly planKey: string;
  readonly status: string;
  readonly currency: string;
  readonly unitAmountCents: number | null;
  readonly introAmountCents: number | null;
  readonly introMonths: number;
  readonly introEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly canceledAt: Date | null;
  readonly latestInvoiceId: string | null;
  readonly lastPaymentStatus: string | null;
}

/** Statuses that entitle a merchant to the product. */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Whether a subscription status grants access to the product.
 *
 * `past_due` is included deliberately: Stripe retries a failed payment for days, and locking the
 * merchant out of their own storefront during that window is worse than the missed revenue.
 *
 * @param status - The Stripe subscription status.
 * @returns `true` when the merchant should keep access.
 */
export function isEntitled(status: string | null | undefined): boolean {
  return status ? ENTITLED_STATUSES.has(status) : false;
}

/** Raw `subscriptions` row shape. */
interface SubscriptionRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  store_id: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  plan_key: string;
  status: string;
  currency: string;
  unit_amount: number | null;
  intro_amount: number | null;
  intro_months: number | null;
  intro_ends_at: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean | null;
  canceled_at: Date | null;
  latest_invoice_id: string | null;
  last_payment_status: string | null;
}

/**
 * Convert a raw row into a {@link SubscriptionRecord}.
 *
 * @param row - The database row.
 * @returns The normalized record.
 */
function toRecord(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    storeId: row.store_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    planKey: row.plan_key,
    status: row.status,
    currency: row.currency,
    unitAmountCents: row.unit_amount,
    introAmountCents: row.intro_amount,
    introMonths: row.intro_months ?? 0,
    introEndsAt: row.intro_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    canceledAt: row.canceled_at,
    latestInvoiceId: row.latest_invoice_id,
    lastPaymentStatus: row.last_payment_status,
  };
}

const SELECT_COLUMNS = `
  id, owner_id, store_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  plan_key, status, currency, unit_amount, intro_amount, intro_months, intro_ends_at,
  current_period_start, current_period_end, cancel_at_period_end, canceled_at,
  latest_invoice_id, last_payment_status
`;

/**
 * Get the most relevant subscription for a store owner.
 *
 * Prefers an entitled subscription; otherwise returns the most recently created one so the UI can
 * explain a canceled or failed state.
 *
 * @param ownerId - The store owner's user id.
 * @returns The subscription, or `null` when the owner has never subscribed.
 */
export async function getSubscriptionForOwner(
  ownerId: string
): Promise<SubscriptionRecord | null> {
  const result = await db.query<SubscriptionRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM subscriptions
      WHERE owner_id = $1
      ORDER BY (status IN ('active','trialing','past_due')) DESC, created_at DESC
      LIMIT 1`,
    [ownerId]
  );

  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Look up the Stripe customer id previously created for an owner.
 *
 * @param ownerId - The store owner's user id.
 * @returns The Stripe customer id, or `null`.
 */
export async function getBillingCustomerId(ownerId: string): Promise<string | null> {
  const result = await db.query<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM billing_customers WHERE owner_id = $1`,
    [ownerId]
  );
  return result.rows[0]?.stripe_customer_id ?? null;
}

/**
 * Record the Stripe customer for an owner.
 *
 * @param ownerId - The store owner's user id.
 * @param stripeCustomerId - The Stripe customer id.
 * @param email - The customer's email, stored for support lookups.
 * @returns Nothing.
 */
export async function saveBillingCustomerId(
  ownerId: string,
  stripeCustomerId: string,
  email: string | null
): Promise<void> {
  await db.query(
    `INSERT INTO billing_customers (owner_id, stripe_customer_id, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (owner_id) DO UPDATE
        SET stripe_customer_id = EXCLUDED.stripe_customer_id,
            email = COALESCE(EXCLUDED.email, billing_customers.email),
            updated_at = NOW()`,
    [ownerId, stripeCustomerId, email]
  );
}

/**
 * Extract the recurring price from a Stripe subscription.
 *
 * @param subscription - The Stripe subscription.
 * @returns The first subscription item's price, or `null`.
 */
function firstPrice(subscription: Stripe.Subscription): Stripe.Price | null {
  return subscription.items?.data?.[0]?.price ?? null;
}

/**
 * Convert a Stripe UNIX timestamp to a `Date`.
 *
 * @param seconds - Seconds since the epoch, or nullish.
 * @returns A `Date`, or `null`.
 */
function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/**
 * Read the current period bounds from a subscription.
 *
 * Newer Stripe API versions carry `current_period_start`/`current_period_end` on the subscription
 * item rather than the subscription, so both locations are checked.
 *
 * @param subscription - The Stripe subscription.
 * @returns The period start and end.
 */
function readPeriod(subscription: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
    | undefined;

  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    start: toDate(item?.current_period_start ?? legacy.current_period_start),
    end: toDate(item?.current_period_end ?? legacy.current_period_end),
  };
}

/**
 * Read the active intro discount, if any, from a Stripe subscription.
 *
 * @param subscription - The Stripe subscription.
 * @returns The coupon and discount ids plus the intro length.
 */
function readIntroDiscount(subscription: Stripe.Subscription): {
  couponId: string | null;
  discountId: string | null;
  months: number;
  amountOff: number | null;
} {
  const discounts = (subscription.discounts ?? []) as Array<string | Stripe.Discount>;
  const discount = discounts.find(
    (entry): entry is Stripe.Discount => typeof entry !== 'string'
  );

  if (!discount?.coupon) {
    return { couponId: null, discountId: null, months: 0, amountOff: null };
  }

  return {
    couponId: discount.coupon.id,
    discountId: discount.id,
    months: discount.coupon.duration_in_months ?? 0,
    amountOff: discount.coupon.amount_off ?? null,
  };
}

/**
 * Insert or update the local mirror of a Stripe subscription.
 *
 * Called from `customer.subscription.*` webhooks and from the status endpoint's on-demand sync.
 * The owner id is read from subscription metadata (set at checkout) and falls back to the existing
 * row, so a webhook that arrives with no metadata cannot orphan the record.
 *
 * @param subscription - The Stripe subscription object.
 * @param fallback - Owner/store ids to use when subscription metadata is missing.
 * @returns The stored {@link SubscriptionRecord}, or `null` when no owner can be determined.
 */
export async function upsertSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  fallback: { ownerId?: string | null; storeId?: string | null } = {}
): Promise<SubscriptionRecord | null> {
  const metadata = subscription.metadata ?? {};
  const ownerId = metadata.owner_id || fallback.ownerId || (await lookupOwnerId(subscription.id));

  if (!ownerId) {
    return null;
  }

  const storeId = metadata.store_id || fallback.storeId || null;
  const price = firstPrice(subscription);
  const period = readPeriod(subscription);
  const intro = readIntroDiscount(subscription);
  const startedAt = toDate(subscription.start_date) ?? new Date();

  const unitAmount = price?.unit_amount ?? PLATFORM_LIST_AMOUNT_CENTS;
  const introMonths = intro.months || (intro.couponId ? PLATFORM_INTRO_MONTHS : 0);
  const introAmount =
    intro.amountOff !== null
      ? Math.max(0, unitAmount - intro.amountOff)
      : intro.couponId
        ? PLATFORM_INTRO_AMOUNT_CENTS
        : null;

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const result = await db.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
        owner_id, store_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        plan_key, status, currency, unit_amount, intro_amount,
        intro_coupon_id, intro_discount_id, intro_months, intro_started_at, intro_ends_at,
        trial_start, trial_end, current_period_start, current_period_end,
        cancel_at_period_end, cancel_at, canceled_at, ended_at, latest_invoice_id, metadata
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25
     )
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        store_id             = COALESCE(EXCLUDED.store_id, subscriptions.store_id),
        stripe_customer_id   = EXCLUDED.stripe_customer_id,
        stripe_price_id      = EXCLUDED.stripe_price_id,
        status               = EXCLUDED.status,
        currency             = EXCLUDED.currency,
        unit_amount          = EXCLUDED.unit_amount,
        intro_amount         = EXCLUDED.intro_amount,
        intro_coupon_id      = EXCLUDED.intro_coupon_id,
        intro_discount_id    = EXCLUDED.intro_discount_id,
        intro_months         = EXCLUDED.intro_months,
        intro_ends_at        = EXCLUDED.intro_ends_at,
        trial_start          = EXCLUDED.trial_start,
        trial_end            = EXCLUDED.trial_end,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end   = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        cancel_at            = EXCLUDED.cancel_at,
        canceled_at          = EXCLUDED.canceled_at,
        ended_at             = EXCLUDED.ended_at,
        latest_invoice_id    = COALESCE(EXCLUDED.latest_invoice_id, subscriptions.latest_invoice_id),
        updated_at           = NOW()
     RETURNING ${SELECT_COLUMNS}`,
    [
      ownerId,
      storeId,
      customerId,
      subscription.id,
      price?.id ?? null,
      metadata.plan_key || 'rebelshops_standard',
      subscription.status,
      price?.currency ?? 'usd',
      unitAmount,
      introAmount,
      intro.couponId,
      intro.discountId,
      introMonths,
      introMonths > 0 ? startedAt : null,
      introMonths > 0 ? computeIntroEndDate(startedAt, introMonths) : null,
      toDate(subscription.trial_start),
      toDate(subscription.trial_end),
      period.start,
      period.end,
      subscription.cancel_at_period_end === true,
      toDate(subscription.cancel_at),
      toDate(subscription.canceled_at),
      toDate(subscription.ended_at),
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : (subscription.latest_invoice?.id ?? null),
      JSON.stringify(metadata),
    ]
  );

  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Find the owner recorded against an existing subscription.
 *
 * @param stripeSubscriptionId - The Stripe subscription id.
 * @returns The owner's user id, or `null`.
 */
async function lookupOwnerId(stripeSubscriptionId: string): Promise<string | null> {
  const result = await db.query<{ owner_id: string }>(
    `SELECT owner_id FROM subscriptions WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  return result.rows[0]?.owner_id ?? null;
}

/**
 * Record the result of an invoice payment attempt against the subscription mirror.
 *
 * @param stripeSubscriptionId - The subscription the invoice belongs to.
 * @param invoiceId - The Stripe invoice id.
 * @param paymentStatus - `paid` or `failed`.
 * @param error - Failure detail, when known.
 * @returns Nothing.
 */
export async function recordInvoiceOutcome(
  stripeSubscriptionId: string,
  invoiceId: string | null,
  paymentStatus: 'paid' | 'failed',
  error: string | null = null
): Promise<void> {
  await db.query(
    `UPDATE subscriptions
        SET last_payment_status = $2,
            last_payment_error = $3,
            latest_invoice_id = COALESCE($4, latest_invoice_id),
            updated_at = NOW()
      WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId, paymentStatus, error, invoiceId]
  );
}

/**
 * Mark a subscription as canceled locally.
 *
 * @param stripeSubscriptionId - The Stripe subscription id.
 * @param canceledAt - When Stripe canceled it.
 * @returns Nothing.
 */
export async function markSubscriptionCanceled(
  stripeSubscriptionId: string,
  canceledAt: Date
): Promise<void> {
  await db.query(
    `UPDATE subscriptions
        SET status = 'canceled',
            canceled_at = COALESCE(canceled_at, $2),
            ended_at = COALESCE(ended_at, $2),
            updated_at = NOW()
      WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId, canceledAt]
  );
}
