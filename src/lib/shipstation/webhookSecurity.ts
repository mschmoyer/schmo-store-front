/**
 * Authentication and tenant resolution for inbound ShipStation webhooks.
 *
 * The old handler read `x-shipstation-signature` and then ignored it, and resolved orders with no
 * `store_id` predicate at all — so any unauthenticated caller could mark any store's order shipped
 * with attacker-chosen tracking data (audit P0-7). This module is the fix, and it is deliberately
 * built on what ShipStation's own contract supports rather than on a signing scheme we wish it had.
 *
 * Three checks, in order:
 *
 * 1. **Path token.** The webhook URL is per-store: `/api/shipstation/webhook/<token>`, where the
 *    token is 192 bits of randomness. ShipStation webhooks carry no field identifying our tenant,
 *    so the store identity has to be in something we control — the URL. Resolving the store from
 *    the token is what makes every downstream query store-scoped.
 * 2. **Shared secret header.** `POST /v2/environment/webhooks` accepts an array of custom
 *    `headers` (see `docs/shipstation-api-openapi.yaml`, `create_webhook_request_body`). We
 *    register the webhook with `x-rebelshops-webhook-secret` set to a per-store random secret,
 *    stored AES-256-GCM encrypted. ShipStation replays that header on every delivery, so this is a
 *    real credential the sender actually possesses, compared in constant time.
 * 3. **Body signature, when present.** If the request carries `x-shipstation-signature`, it must be
 *    a valid HMAC-SHA256 of the raw body under the same secret. This finally gives
 *    `verifyWebhookSignature` — implemented since day one with zero call sites — a caller.
 *
 * Failing any check yields 401 with a generic reason; we never tell an unauthenticated caller
 * which check failed, or whether a token corresponds to a real store.
 */

import crypto from 'crypto';
import { db } from '@/lib/database/connection';
import { decryptSecret, encryptSecret, generateToken, timingSafeEqualString } from './crypto';

/** Header ShipStation is told to send, carrying the per-store shared secret. */
export const WEBHOOK_SECRET_HEADER = 'x-rebelshops-webhook-secret';

/** Header carrying an optional HMAC-SHA256 of the raw request body. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-shipstation-signature';

/** Outcome of authenticating an inbound webhook. */
export type WebhookAuthResult =
  | { ok: true; storeId: string; integrationId: string }
  | { ok: false; status: 401 | 503; reason: string };

/** Columns needed to authenticate a webhook. */
type WebhookAuthRow = {
  id: string;
  store_id: string;
  webhook_secret_encrypted: string | null;
};

/**
 * Compute the HMAC-SHA256 signature of a webhook body.
 *
 * @param rawBody - Exact bytes received, before JSON parsing.
 * @param secret - The store's webhook secret.
 * @returns Lowercase hex digest.
 */
export function computeWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex');
}

/**
 * Verify a webhook body signature in constant time.
 *
 * Accepts hex or base64 encodings, since senders differ.
 *
 * @param rawBody - Exact bytes received.
 * @param signature - Value of the signature header.
 * @param secret - The store's webhook secret.
 * @returns True when the signature matches.
 */
export function verifyWebhookBodySignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expectedHex = computeWebhookSignature(rawBody, secret);
  const candidate = signature.trim().replace(/^sha256=/i, '');

  if (timingSafeEqualString(candidate.toLowerCase(), expectedHex)) {
    return true;
  }

  // Some senders base64-encode the same digest.
  const expectedBase64 = Buffer.from(expectedHex, 'hex').toString('base64');
  return timingSafeEqualString(candidate, expectedBase64);
}

/**
 * Fetch, or lazily create, a store's webhook secret.
 *
 * Creating on demand means an integration that predates this module still ends up with a real
 * secret the first time the merchant opens the integrations screen or registers a webhook.
 *
 * @param storeId - Store UUID.
 * @returns The plaintext secret.
 * @throws {ShipStationKeyError} When the encryption key is unavailable.
 * @throws {Error} When the store has no ShipStation integration row.
 */
export async function getOrCreateWebhookSecret(storeId: string): Promise<string> {
  const existing = await db.query<{ id: string; webhook_secret_encrypted: string | null }>(
    `SELECT id, webhook_secret_encrypted
       FROM store_integrations
      WHERE store_id = $1 AND integration_type = 'shipstation'
      LIMIT 1`,
    [storeId]
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error(`No ShipStation integration for store ${storeId}`);
  }

  if (row.webhook_secret_encrypted) {
    return decryptSecret(row.webhook_secret_encrypted);
  }

  const secret = generateToken(32);
  await db.query(`UPDATE store_integrations SET webhook_secret_encrypted = $1 WHERE id = $2`, [
    encryptSecret(secret),
    row.id
  ]);

  return secret;
}

/**
 * Fetch, or lazily create, a store's webhook URL token.
 *
 * @param storeId - Store UUID.
 * @returns The token embedded in the store's webhook URL.
 * @throws {Error} When the store has no ShipStation integration row.
 */
export async function getOrCreateWebhookToken(storeId: string): Promise<string> {
  const existing = await db.query<{ id: string; webhook_token: string | null }>(
    `SELECT id, webhook_token
       FROM store_integrations
      WHERE store_id = $1 AND integration_type = 'shipstation'
      LIMIT 1`,
    [storeId]
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error(`No ShipStation integration for store ${storeId}`);
  }

  if (row.webhook_token) {
    return row.webhook_token;
  }

  const token = generateToken();
  await db.query(`UPDATE store_integrations SET webhook_token = $1 WHERE id = $2`, [token, row.id]);

  return token;
}

/**
 * Authenticate an inbound webhook and resolve the owning store.
 *
 * @param token - Token taken from the request path.
 * @param headers - Request headers, as a lookup function (case-insensitive keys expected).
 * @param rawBody - Exact request body bytes.
 * @returns The resolved store, or a refusal with an HTTP status.
 */
export async function authenticateWebhook(
  token: string,
  headers: { get(name: string): string | null },
  rawBody: string
): Promise<WebhookAuthResult> {
  const generic = { ok: false as const, status: 401 as const, reason: 'Webhook authentication failed' };

  if (!token || token.length < 16) {
    return generic;
  }

  let row: WebhookAuthRow | undefined;
  try {
    const result = await db.query<WebhookAuthRow>(
      `SELECT id, store_id, webhook_secret_encrypted
         FROM store_integrations
        WHERE integration_type = 'shipstation'
          AND is_active = true
          AND webhook_token = $1
        LIMIT 1`,
      [token]
    );
    row = result.rows[0];
  } catch (error) {
    console.error('Webhook store lookup failed:', error);
    return { ok: false, status: 503, reason: 'Webhook processing temporarily unavailable' };
  }

  if (!row) {
    return generic;
  }

  if (!row.webhook_secret_encrypted) {
    // Provisioned URL but no secret yet: refuse rather than accept an unauthenticated caller.
    console.warn(
      `Rejected ShipStation webhook for store ${row.store_id}: no webhook secret provisioned`
    );
    return generic;
  }

  let secret: string;
  try {
    secret = decryptSecret(row.webhook_secret_encrypted);
  } catch (error) {
    console.error('Cannot decrypt webhook secret:', error);
    return { ok: false, status: 503, reason: 'Webhook processing temporarily unavailable' };
  }

  const presentedSecret = headers.get(WEBHOOK_SECRET_HEADER);
  if (!presentedSecret || !timingSafeEqualString(presentedSecret, secret)) {
    return generic;
  }

  const signature = headers.get(WEBHOOK_SIGNATURE_HEADER);
  if (signature && !verifyWebhookBodySignature(rawBody, signature, secret)) {
    return generic;
  }

  return { ok: true, storeId: row.store_id, integrationId: row.id };
}
