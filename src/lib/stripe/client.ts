/**
 * Lazily-constructed Stripe SDK singleton.
 *
 * Nothing in this module runs at import time. The app must build and render with no Stripe
 * environment variables set at all, so the only way to get a `Stripe` instance is to call
 * {@link getStripe} (which throws a typed, explainable error) or {@link tryGetStripe} (which
 * returns `null` so callers can degrade to a "payments not configured" state).
 */

import Stripe from 'stripe';
import { assertServerOnly } from './server-only';

/**
 * Pinned Stripe API version. Matches the version bundled with `stripe@22.x` typings, so the
 * request/response shapes the SDK types describe are the shapes the API actually returns.
 * Bumping this is a deliberate, reviewed change - never let it float.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia' as const;

/** Identifies RebelShops in the Stripe dashboard's "integrations" view and in request logs. */
const APP_INFO: Stripe.AppInfo = {
  name: 'RebelShops',
  version: '1.0.0',
  url: 'https://rebelshops.com',
};

/** Error thrown whenever Stripe is required but no secret key is configured. */
export class StripeNotConfiguredError extends Error {
  public readonly code = 'STRIPE_NOT_CONFIGURED';

  constructor(detail?: string) {
    super(
      'Stripe is not configured. Set STRIPE_SECRET_KEY in the environment to enable payments.' +
        (detail ? ` (${detail})` : '')
    );
    this.name = 'StripeNotConfiguredError';
  }
}

let cachedClient: Stripe | null = null;
let cachedKey: string | null = null;

/**
 * Read the secret key, treating blank/whitespace values as absent.
 *
 * @returns The trimmed secret key, or `null` when it is not set.
 */
function readSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

/**
 * Whether a Stripe secret key is present in the environment.
 *
 * @returns `true` when {@link getStripe} will succeed.
 */
export function isStripeConfigured(): boolean {
  return readSecretKey() !== null;
}

/**
 * Whether the storefront has a publishable key available for client-side Stripe usage.
 *
 * @returns `true` when `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set.
 */
export function isStripePubliclyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
}

/**
 * Get the shared Stripe client, constructing it on first use.
 *
 * @param context - Short label describing the caller, surfaced in the server-only guard error.
 * @returns The configured Stripe SDK instance.
 * @throws {StripeNotConfiguredError} When `STRIPE_SECRET_KEY` is absent.
 */
export function getStripe(context = 'The Stripe client'): Stripe {
  assertServerOnly(context);

  const key = readSecretKey();
  if (!key) {
    throw new StripeNotConfiguredError(context);
  }

  // Rebuild if the key changed (test suites and key rotation).
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: APP_INFO,
      typescript: true,
      maxNetworkRetries: 2,
    });
    cachedKey = key;
  }

  return cachedClient;
}

/**
 * Get the shared Stripe client, or `null` when Stripe is not configured.
 *
 * Prefer this in read paths (status endpoints, page loaders) so a missing key renders a
 * "payments not configured" state instead of a 500.
 *
 * @param context - Short label describing the caller.
 * @returns The Stripe SDK instance, or `null`.
 */
export function tryGetStripe(context = 'The Stripe client'): Stripe | null {
  if (!isStripeConfigured()) {
    return null;
  }
  return getStripe(context);
}

/**
 * Get the webhook signing secret used to verify inbound Stripe events.
 *
 * @returns The signing secret.
 * @throws {StripeNotConfiguredError} When `STRIPE_WEBHOOK_SECRET` is absent.
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new StripeNotConfiguredError('STRIPE_WEBHOOK_SECRET is required to verify webhooks');
  }
  return secret;
}

/**
 * Absolute base URL used to build Stripe redirect (success/cancel/return) URLs.
 *
 * @returns The app origin without a trailing slash.
 */
export function getAppBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';

  return configured.replace(/\/+$/, '');
}

/**
 * Drop the cached client. Exposed for tests that swap environment variables between cases.
 *
 * @returns Nothing.
 */
export function resetStripeClient(): void {
  cachedClient = null;
  cachedKey = null;
}
