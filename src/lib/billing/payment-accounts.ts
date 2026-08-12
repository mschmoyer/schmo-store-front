/**
 * Persistence for Stripe Connect accounts (flow B).
 */

import { db } from '@/lib/database/connection';
import type { ConnectAccountStatus, ConnectOnboardingStatus } from '@/lib/stripe/connect';

/** A `payment_accounts` row as the application consumes it. */
export interface PaymentAccountRecord {
  readonly id: string;
  readonly storeId: string;
  readonly stripeAccountId: string;
  readonly accountType: string;
  readonly country: string;
  readonly defaultCurrency: string;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly detailsSubmitted: boolean;
  readonly onboardingStatus: ConnectOnboardingStatus;
  readonly requirementsCurrentlyDue: string[];
  readonly disabledReason: string | null;
  readonly applicationFeeBps: number;
  readonly lastSyncedAt: Date | null;
}

/** Raw `payment_accounts` row shape. */
interface PaymentAccountRow extends Record<string, unknown> {
  id: string;
  store_id: string;
  stripe_account_id: string;
  account_type: string;
  country: string;
  default_currency: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: string;
  requirements_currently_due: string[] | null;
  requirements_disabled_reason: string | null;
  application_fee_bps: number;
  last_synced_at: Date | null;
}

const SELECT_COLUMNS = `
  id, store_id, stripe_account_id, account_type, country, default_currency,
  charges_enabled, payouts_enabled, details_submitted, onboarding_status,
  requirements_currently_due, requirements_disabled_reason, application_fee_bps, last_synced_at
`;

/**
 * Convert a raw row into a {@link PaymentAccountRecord}.
 *
 * @param row - The database row.
 * @returns The normalized record.
 */
function toRecord(row: PaymentAccountRow): PaymentAccountRecord {
  const status = row.onboarding_status;
  const onboardingStatus: ConnectOnboardingStatus =
    status === 'complete' || status === 'pending' || status === 'restricted'
      ? status
      : 'not_started';

  return {
    id: row.id,
    storeId: row.store_id,
    stripeAccountId: row.stripe_account_id,
    accountType: row.account_type,
    country: row.country,
    defaultCurrency: row.default_currency,
    chargesEnabled: row.charges_enabled === true,
    payoutsEnabled: row.payouts_enabled === true,
    detailsSubmitted: row.details_submitted === true,
    onboardingStatus,
    requirementsCurrentlyDue: row.requirements_currently_due ?? [],
    disabledReason: row.requirements_disabled_reason,
    applicationFeeBps: row.application_fee_bps ?? 0,
    lastSyncedAt: row.last_synced_at,
  };
}

/**
 * Load a store's Connect account.
 *
 * @param storeId - The store id.
 * @returns The account record, or `null` when the store has not started onboarding.
 */
export async function getPaymentAccountForStore(
  storeId: string
): Promise<PaymentAccountRecord | null> {
  const result = await db.query<PaymentAccountRow>(
    `SELECT ${SELECT_COLUMNS} FROM payment_accounts WHERE store_id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Load a Connect account by its Stripe id.
 *
 * @param stripeAccountId - The Stripe account id.
 * @returns The account record, or `null`.
 */
export async function getPaymentAccountByStripeId(
  stripeAccountId: string
): Promise<PaymentAccountRecord | null> {
  const result = await db.query<PaymentAccountRow>(
    `SELECT ${SELECT_COLUMNS} FROM payment_accounts WHERE stripe_account_id = $1`,
    [stripeAccountId]
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Create the local record for a newly created connected account.
 *
 * @param storeId - The store the account belongs to.
 * @param stripeAccountId - The Stripe account id.
 * @param country - The account's country.
 * @returns The stored record.
 */
export async function createPaymentAccount(
  storeId: string,
  stripeAccountId: string,
  country = 'US'
): Promise<PaymentAccountRecord> {
  const applicationFeeBps = Number.parseInt(
    process.env.STRIPE_APPLICATION_FEE_BPS ?? '0',
    10
  );

  const result = await db.query<PaymentAccountRow>(
    `INSERT INTO payment_accounts
        (store_id, stripe_account_id, account_type, country, onboarding_status,
         onboarding_started_at, application_fee_bps)
     VALUES ($1, $2, 'express', $3, 'not_started', NOW(), $4)
     ON CONFLICT (store_id) DO UPDATE
        SET stripe_account_id = EXCLUDED.stripe_account_id,
            onboarding_started_at = COALESCE(payment_accounts.onboarding_started_at, NOW()),
            updated_at = NOW()
     RETURNING ${SELECT_COLUMNS}`,
    [storeId, stripeAccountId, country, Number.isFinite(applicationFeeBps) ? applicationFeeBps : 0]
  );

  return toRecord(result.rows[0]);
}

/**
 * Write a fresh capability snapshot for a connected account.
 *
 * @param status - The normalized status from Stripe.
 * @returns The updated record, or `null` when the account is unknown locally.
 */
export async function savePaymentAccountStatus(
  status: ConnectAccountStatus
): Promise<PaymentAccountRecord | null> {
  const result = await db.query<PaymentAccountRow>(
    `UPDATE payment_accounts
        SET charges_enabled = $2,
            payouts_enabled = $3,
            details_submitted = $4,
            onboarding_status = $5::varchar,
            requirements_currently_due = $6,
            requirements_disabled_reason = $7,
            country = $8,
            default_currency = $9,
            onboarding_completed_at = CASE
              WHEN $5::varchar = 'complete' THEN COALESCE(onboarding_completed_at, NOW())
              ELSE onboarding_completed_at
            END,
            last_synced_at = NOW(),
            updated_at = NOW()
      WHERE stripe_account_id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [
      status.stripeAccountId,
      status.chargesEnabled,
      status.payoutsEnabled,
      status.detailsSubmitted,
      status.onboardingStatus,
      status.requirementsCurrentlyDue,
      status.disabledReason,
      status.country,
      status.defaultCurrency,
    ]
  );

  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Compute the platform application fee for a storefront charge.
 *
 * @param totalCents - The charge amount in cents.
 * @param applicationFeeBps - Take rate in basis points.
 * @returns The fee in cents, never more than the charge itself.
 */
export function computeApplicationFeeCents(
  totalCents: number,
  applicationFeeBps: number
): number {
  if (!Number.isFinite(applicationFeeBps) || applicationFeeBps <= 0) {
    return 0;
  }
  return Math.min(totalCents, Math.round((totalCents * applicationFeeBps) / 10_000));
}
