/**
 * Basic authentication for the ShipStation **Custom Store** feed.
 *
 * @channel custom-store
 *
 * ShipStation calls our one endpoint with `Authorization: Basic base64(user:pass)` and nothing
 * else — no tenant identifier, no signature, no custom header (see
 * `docs/shipstation-custom-store.md` §1, "Authentication"). The credential *is* the tenant
 * selector, which is why the username carries a uniqueness constraint and why every lookup here
 * resolves exactly one row.
 *
 * This module replaces `auth.ts`, which could not authenticate anyone and would have been unsafe
 * if it could:
 *
 *   - It **looped every active integration row across every tenant** and returned the first
 *     credential that matched. With no uniqueness on the username, two stores sharing one could
 *     serve each other's orders (audit P1-8). Here the store comes from a single indexed lookup.
 *   - It compared `shipstation_password_hash` against `Buffer.from(password).toString('base64')`.
 *     Base64 is an encoding, not a hash; the column name claimed a protection the storage did not
 *     provide, and its own comment admitted as much.
 *   - It offered an `x-api-key` / `x-api-secret` scheme that appears nowhere in ShipStation's
 *     contract. Invented auth surface is attack surface, so it is gone.
 *
 * **Why the secret is encrypted rather than hashed.** We generate it — 24 bytes from
 * `crypto.randomBytes` — so it is not a human-chosen password and the offline brute-force attack
 * bcrypt exists to slow down does not apply. Encrypting instead lets a merchant who lost the value
 * read it back, rather than being forced to regenerate and silently break a live ShipStation
 * connection until they notice imports have stopped. The comparison is still constant-time.
 *
 * Storage rides on the existing AES-256-GCM helpers in `crypto.ts`, so the Custom Store secret
 * inherits the same fail-closed behaviour as every other credential: without
 * `SHIPSTATION_ENCRYPTION_KEY` nothing can be read or written.
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/database/connection';
import { decryptSecret, encryptSecret } from './crypto';

/** Bytes of entropy in a generated Custom Store secret. */
const SECRET_BYTES = 24;

/** Longest `Authorization` header we will even attempt to parse. */
const MAX_AUTH_HEADER_BYTES = 4096;

/** Outcome of authenticating an inbound Custom Store request. */
export type CustomStoreAuthResult =
  | { ok: true; storeId: string; integrationId: string; username: string }
  | { ok: false; reason: string };

/** A merchant's Custom Store connection details, as shown in the admin UI. */
export interface CustomStoreCredentials {
  /** Username ShipStation sends. Not secret. */
  username: string;
  /** Secret ShipStation sends. Shown to the merchant so they can paste it. */
  password: string;
  /** Whether the feed is currently accepting requests for this store. */
  enabled: boolean;
}

/** Columns this module reads from `store_integrations`. */
interface CustomStoreRow extends Record<string, unknown> {
  id: string;
  store_id: string;
  shipstation_username: string | null;
  custom_store_password_encrypted: string | null;
  custom_store_enabled: boolean | null;
}

/**
 * Compare two strings in constant time.
 *
 * Length is compared first because `timingSafeEqual` throws on a mismatch; a burn comparison keeps
 * the cost of the early exit roughly constant, and the secret is fixed-length in practice anyway.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when the values are byte-identical.
 * @channel custom-store
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parse an `Authorization: Basic` header.
 *
 * Deliberately strict, and never throws: a malformed header is an unauthenticated request, not a
 * 500. Note that the password may itself contain colons, so only the *first* colon separates the
 * two halves — splitting on every colon would reject legitimate secrets.
 *
 * @param header - Raw header value, or null when absent.
 * @returns The decoded pair, or null when the header is missing or unusable.
 * @channel custom-store
 */
export function parseBasicAuthHeader(header: string | null): { username: string; password: string } | null {
  if (!header || header.length > MAX_AUTH_HEADER_BYTES) {
    return null;
  }

  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/.exec(header.trim());
  if (!match) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf(':');
  if (separator <= 0) {
    return null;
  }

  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * Build the username ShipStation will send for a store.
 *
 * Derived from the store id rather than random so it is stable across regenerations — a merchant
 * who rotates their secret should not also have to change the username in ShipStation.
 *
 * **The whole id, never a prefix.** An earlier version truncated to 16 hex characters, which looked
 * tidy and was a cross-tenant bug: UUIDs generated in a batch commonly share a long prefix and
 * differ only at the end, so the seeded demo stores `...440001` and `...440002` both derived
 * `store_650e8400e29b41d4`. Whichever store issued credentials second would have taken the first
 * store's username and then served its orders. The unique index from migration 024 caught it as a
 * constraint violation instead, which is exactly what that index is for — but the derivation has to
 * be collision-free on its own.
 *
 * @param storeId - Store UUID.
 * @returns A username unique to this store.
 * @channel custom-store
 */
export function buildCustomStoreUsername(storeId: string): string {
  return `store_${storeId.replace(/-/g, '')}`;
}

/**
 * Generate a fresh Custom Store secret.
 *
 * @returns A URL-safe secret with {@link SECRET_BYTES} bytes of entropy.
 * @channel custom-store
 */
export function generateCustomStoreSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/**
 * Create or rotate a store's Custom Store credentials.
 *
 * Rotating invalidates the previous secret immediately, which breaks the merchant's ShipStation
 * connection until they paste the new one. Callers must say so before offering the action.
 *
 * @param storeId - Store UUID.
 * @returns The credentials to display, exactly as persisted.
 * @throws {ShipStationKeyError} When `SHIPSTATION_ENCRYPTION_KEY` is not configured.
 * @channel custom-store
 */
export async function issueCustomStoreCredentials(storeId: string): Promise<CustomStoreCredentials> {
  const username = buildCustomStoreUsername(storeId);
  const password = generateCustomStoreSecret();
  const encrypted = encryptSecret(password);

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM store_integrations
      WHERE store_id = $1 AND integration_type = 'shipstation'
      LIMIT 1`,
    [storeId]
  );

  if (existing.rows[0]) {
    await db.query(
      `UPDATE store_integrations
          SET shipstation_username = $2,
              custom_store_password_encrypted = $3,
              custom_store_enabled = true,
              updated_at = NOW()
        WHERE id = $1 AND store_id = $4`,
      [existing.rows[0].id, username, encrypted, storeId]
    );
  } else {
    await db.query(
      `INSERT INTO store_integrations
         (store_id, integration_type, shipstation_username,
          custom_store_password_encrypted, custom_store_enabled, is_active, created_at, updated_at)
       VALUES ($1, 'shipstation', $2, $3, true, true, NOW(), NOW())`,
      [storeId, username, encrypted]
    );
  }

  return { username, password, enabled: true };
}

/**
 * Read a store's Custom Store credentials for redisplay.
 *
 * @param storeId - Store UUID.
 * @returns The credentials, or null when none have been issued.
 * @throws {ShipStationKeyError} When `SHIPSTATION_ENCRYPTION_KEY` is not configured.
 * @channel custom-store
 */
export async function getCustomStoreCredentials(storeId: string): Promise<CustomStoreCredentials | null> {
  const result = await db.query<CustomStoreRow>(
    `SELECT id, store_id, shipstation_username, custom_store_password_encrypted, custom_store_enabled
       FROM store_integrations
      WHERE store_id = $1 AND integration_type = 'shipstation'
      LIMIT 1`,
    [storeId]
  );

  const row = result.rows[0];
  if (!row?.shipstation_username || !row.custom_store_password_encrypted) {
    return null;
  }

  return {
    username: row.shipstation_username,
    password: decryptSecret(row.custom_store_password_encrypted),
    enabled: row.custom_store_enabled ?? false,
  };
}

/**
 * Turn the Custom Store feed off for a store without destroying its credentials.
 *
 * @param storeId - Store UUID.
 * @returns Nothing.
 * @channel custom-store
 */
export async function setCustomStoreEnabled(storeId: string, enabled: boolean): Promise<void> {
  await db.query(
    `UPDATE store_integrations
        SET custom_store_enabled = $2, updated_at = NOW()
      WHERE store_id = $1 AND integration_type = 'shipstation'`,
    [storeId, enabled]
  );
}

/**
 * Authenticate an inbound ShipStation Custom Store request.
 *
 * One indexed lookup by username, then a constant-time comparison of the secret. Every failure
 * returns the same generic reason: an unauthenticated caller learns nothing about which check
 * failed, or whether a username corresponds to a real store.
 *
 * @param request - Incoming request.
 * @returns The resolved store on success, or a generic failure.
 * @channel custom-store
 */
export async function authenticateCustomStoreRequest(request: NextRequest): Promise<CustomStoreAuthResult> {
  const generic = { ok: false as const, reason: 'Invalid credentials' };

  const parsed = parseBasicAuthHeader(request.headers.get('authorization'));
  if (!parsed) {
    return generic;
  }

  let result;
  try {
    result = await db.query<CustomStoreRow>(
      `SELECT id, store_id, shipstation_username, custom_store_password_encrypted, custom_store_enabled
         FROM store_integrations
        WHERE shipstation_username = $1
          AND integration_type = 'shipstation'
        LIMIT 1`,
      [parsed.username]
    );
  } catch {
    // A lookup failure must not be distinguishable from a wrong password.
    return generic;
  }

  const row = result.rows[0];
  if (!row || !row.custom_store_password_encrypted || row.custom_store_enabled !== true) {
    return generic;
  }

  let stored: string;
  try {
    stored = decryptSecret(row.custom_store_password_encrypted);
  } catch {
    // Missing encryption key or a tampered ciphertext. Fail closed, and say nothing about why.
    return generic;
  }

  if (!constantTimeEquals(parsed.password, stored)) {
    return generic;
  }

  return {
    ok: true,
    storeId: row.store_id,
    integrationId: row.id,
    username: row.shipstation_username ?? parsed.username,
  };
}

/**
 * Record a Custom Store authentication attempt.
 *
 * This is what makes "last poll received" answerable in the admin UI, which matters more than it
 * looks: ShipStation's polling cadence is not a fixed interval a merchant can predict (spec §4,
 * "Importing orders"), so the timestamp of the last successful call is the only honest evidence
 * the integration is alive.
 *
 * Never records the username or secret — a failed attempt logs that it failed, nothing more.
 *
 * @param result - Outcome of authentication.
 * @param operation - What was being attempted, e.g. `export` or `shipnotify`.
 * @returns Nothing. Logging failures are swallowed: they must never fail the request.
 * @channel custom-store
 */
export async function logCustomStoreAuthAttempt(
  result: CustomStoreAuthResult,
  operation: string
): Promise<void> {
  if (!result.ok) {
    return;
  }

  try {
    await db.query(
      `INSERT INTO integration_logs
         (store_id, integration_type, operation, status, request_data, execution_time_ms, created_at)
       VALUES ($1, 'shipstation', $2, 'success', $3, 0, CURRENT_TIMESTAMP)`,
      [result.storeId, `custom_store_${operation}`, JSON.stringify({ channel: 'custom-store' })]
    );
  } catch {
    // Observability is not worth failing a ShipStation poll over.
  }
}
