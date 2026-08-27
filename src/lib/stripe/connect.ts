/**
 * Stripe Connect: account creation, onboarding links, and status refresh.
 *
 * RebelShops is the platform; each merchant store gets its own **Express** connected account so
 * shopper funds settle to the merchant, not to us. Storefront charges are created on the platform
 * with `on_behalf_of` + `transfer_data.destination` pointing at the merchant account (see
 * `src/app/api/checkout/session/route.ts`).
 */

import type Stripe from 'stripe';
import { getAppBaseUrl, getStripe } from './client';

/** Snapshot of a connected account's capability state. */
export interface ConnectAccountStatus {
  readonly stripeAccountId: string;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly detailsSubmitted: boolean;
  /** 'not_started' | 'pending' | 'complete' | 'restricted' */
  readonly onboardingStatus: ConnectOnboardingStatus;
  readonly requirementsCurrentlyDue: string[];
  readonly disabledReason: string | null;
  readonly country: string;
  readonly defaultCurrency: string;
}

/** Lifecycle of a merchant's Connect onboarding. */
export type ConnectOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

/** Inputs for {@link createConnectedAccount}. */
export interface CreateConnectedAccountInput {
  readonly storeId: string;
  readonly storeName: string;
  readonly storeSlug: string;
  readonly ownerEmail?: string;
  readonly country?: string;
}

/**
 * Public storefront URL for a store, or `undefined` when this deployment is not reachable from
 * the internet.
 *
 * Stripe validates `business_profile.url` and rejects anything it cannot resolve. A local
 * `http://localhost:3000` origin therefore failed `accounts.create` outright with "Not a valid
 * URL", which made Connect onboarding impossible to exercise in development — the one environment
 * where you most want to exercise it. Omitting the field is legal: Stripe collects the business
 * URL during onboarding instead, so the merchant is asked rather than the call failing.
 *
 * @param storeSlug - The store's slug.
 * @returns An absolute storefront URL, or `undefined` when the base URL is not publicly resolvable.
 */
function publicStoreUrl(storeSlug: string): string | undefined {
  const baseUrl = getAppBaseUrl();

  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }

  // A hostname with no dot cannot resolve publicly, which covers `localhost` and container names.
  const isLocal =
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    !hostname.includes('.');

  return isLocal ? undefined : `${baseUrl}/store/${storeSlug}`;
}

/**
 * Create an Express connected account for a store.
 *
 * @param input - Store identity used for the account's metadata and business profile.
 * @param stripe - Optional Stripe client.
 * @returns The newly created Stripe account.
 */
export async function createConnectedAccount(
  input: CreateConnectedAccountInput,
  stripe: Stripe = getStripe('createConnectedAccount')
): Promise<Stripe.Account> {
  const storefrontUrl = publicStoreUrl(input.storeSlug);

  return await stripe.accounts.create({
    type: 'express',
    country: input.country ?? 'US',
    email: input.ownerEmail,
    business_profile: {
      name: input.storeName,
      // Omitted rather than sent as localhost; see publicStoreUrl.
      ...(storefrontUrl ? { url: storefrontUrl } : {}),
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      store_id: input.storeId,
      store_slug: input.storeSlug,
      managed_by: 'rebelshops',
    },
  });
}

/**
 * Generate a fresh Account Link for onboarding or for resuming an incomplete onboarding.
 *
 * Account Links are single-use and short-lived; always mint a new one rather than storing the URL.
 *
 * @param stripeAccountId - The connected account id.
 * @param type - `account_onboarding` for first-time setup, `account_update` to edit details.
 * @param stripe - Optional Stripe client.
 * @returns The account link, including the `url` to redirect the merchant to.
 */
export async function createOnboardingLink(
  stripeAccountId: string,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding',
  stripe: Stripe = getStripe('createOnboardingLink')
): Promise<Stripe.AccountLink> {
  const baseUrl = getAppBaseUrl();

  // Stripe preserves query strings on these URLs, so the account id round-trips back to us. It is
  // an identifier, not a credential, and both handlers verify it against `payment_accounts`.
  const account = encodeURIComponent(stripeAccountId);

  return await stripe.accountLinks.create({
    account: stripeAccountId,
    type,
    refresh_url: `${baseUrl}/api/connect/refresh?account=${account}`,
    return_url: `${baseUrl}/api/connect/return?account=${account}`,
  });
}

/**
 * Create a login link to the merchant's Express dashboard.
 *
 * @param stripeAccountId - The connected account id.
 * @param stripe - Optional Stripe client.
 * @returns The login link.
 */
export async function createExpressDashboardLink(
  stripeAccountId: string,
  stripe: Stripe = getStripe('createExpressDashboardLink')
): Promise<Stripe.LoginLink> {
  return await stripe.accounts.createLoginLink(stripeAccountId);
}

/**
 * Fetch the current state of a connected account from Stripe.
 *
 * @param stripeAccountId - The connected account id.
 * @param stripe - Optional Stripe client.
 * @returns A normalized {@link ConnectAccountStatus}.
 */
export async function refreshAccountStatus(
  stripeAccountId: string,
  stripe: Stripe = getStripe('refreshAccountStatus')
): Promise<ConnectAccountStatus> {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return summarizeAccount(account);
}

/**
 * Normalize a Stripe account object into the shape persisted in `payment_accounts`.
 *
 * @param account - A Stripe account, e.g. from `account.updated`.
 * @returns A normalized {@link ConnectAccountStatus}.
 */
export function summarizeAccount(account: Stripe.Account): ConnectAccountStatus {
  const requirements = account.requirements;
  const currentlyDue = requirements?.currently_due ?? [];
  const disabledReason = requirements?.disabled_reason ?? null;

  return {
    stripeAccountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    onboardingStatus: deriveOnboardingStatus(account),
    requirementsCurrentlyDue: [...currentlyDue],
    disabledReason: typeof disabledReason === 'string' ? disabledReason : null,
    country: account.country ?? 'US',
    defaultCurrency: account.default_currency ?? 'usd',
  };
}

/**
 * Whether the configured Stripe secret key targets live mode.
 *
 * Stripe `Account` objects carry no `livemode` flag, so the key prefix is the reliable signal.
 *
 * @returns `true` when the key is a live-mode key.
 */
export function isLiveMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

/**
 * Derive the coarse onboarding lifecycle state from a Stripe account.
 *
 * @param account - The Stripe account.
 * @returns The {@link ConnectOnboardingStatus}.
 */
export function deriveOnboardingStatus(account: Stripe.Account): ConnectOnboardingStatus {
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
    return 'complete';
  }
  if (account.requirements?.disabled_reason) {
    return 'restricted';
  }
  if (account.details_submitted) {
    return 'pending';
  }
  return 'not_started';
}

/**
 * Whether a store can accept live storefront payments through its connected account.
 *
 * @param status - The account status snapshot.
 * @returns `true` when charges are enabled.
 */
export function canAcceptCharges(status: Pick<ConnectAccountStatus, 'chargesEnabled'>): boolean {
  return status.chargesEnabled;
}
