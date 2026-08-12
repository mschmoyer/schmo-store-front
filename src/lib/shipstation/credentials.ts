/**
 * The one place that reads and writes ShipStation credentials.
 *
 * Consolidates what used to be five copies of `Buffer.from(x, 'base64')` scattered across route
 * handlers and services (audit P0-9). Everything here is store-scoped: no function in this module
 * can be called without naming a store, which is what makes the cross-tenant lookups in the old
 * auth path (P1-8) impossible to reintroduce by accident.
 *
 * Rows written before migration 022 hold base64-tagged values. They are transparently upgraded to
 * AES-256-GCM the first time they are read with a key configured, so the fleet self-heals without
 * a separate backfill job.
 */

import { db } from '@/lib/database/connection';
import {
  decryptSecret,
  encryptSecret,
  generateToken,
  isLegacyCiphertext,
  upgradeCiphertext
} from './crypto';

/** Columns this module reads from `store_integrations`. */
type IntegrationRow = {
  id: string;
  store_id: string;
  is_active: boolean | null;
  configuration: Record<string, unknown> | null;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  webhook_token: string | null;
  webhook_secret_encrypted: string | null;
  webhook_id: string | null;
  webhook_registered_at: Date | null;
  credentials_encryption_version: number | null;
  auto_sync_enabled: boolean | null;
  auto_sync_interval: string | null;
  last_sync_at: Date | null;
  sync_status: string | null;
  sync_error_message: string | null;
};

const SELECT_COLUMNS = `
  id,
  store_id,
  is_active,
  configuration,
  api_key_encrypted,
  api_secret_encrypted,
  webhook_token,
  webhook_secret_encrypted,
  webhook_id,
  webhook_registered_at,
  credentials_encryption_version,
  auto_sync_enabled,
  auto_sync_interval,
  last_sync_at,
  sync_status,
  sync_error_message
`;

/** A store's ShipStation integration, with secrets decrypted. */
export interface ShipStationIntegration {
  id: string;
  storeId: string;
  isActive: boolean;
  apiKey: string | null;
  apiSecret: string | null;
  configuration: Record<string, unknown>;
  webhookToken: string | null;
  webhookId: string | null;
  webhookRegisteredAt: Date | null;
  autoSyncEnabled: boolean;
  autoSyncInterval: string;
  lastSyncAt: Date | null;
  syncStatus: string | null;
  syncErrorMessage: string | null;
}

/** Non-secret summary safe to hand to an admin UI. */
export interface ShipStationIntegrationSummary {
  id: string | null;
  storeId: string;
  isActive: boolean;
  connected: boolean;
  apiKeyMasked: string | null;
  webhookUrl: string | null;
  webhookRegistered: boolean;
  autoSyncEnabled: boolean;
  autoSyncInterval: string;
  lastSyncAt: string | null;
  syncStatus: string | null;
  syncErrorMessage: string | null;
}

/**
 * Mask an API key for display. Shows only the last four characters.
 *
 * Deliberately narrower than the old debug logging, which printed the first six *and* last four of
 * a live key on every call (audit P1-7).
 *
 * @param apiKey - Plaintext key.
 * @returns A masked representation.
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return '••••';
  }
  return `••••••••${apiKey.slice(-4)}`;
}

/**
 * Re-encrypt any legacy-format column on a row and persist the upgrade.
 *
 * @param row - Row just read from the database.
 * @returns Nothing; failures are logged and swallowed so a read never fails on an upgrade.
 */
async function upgradeRowEncryption(row: IntegrationRow): Promise<void> {
  const updates: string[] = [];
  const values: unknown[] = [];

  try {
    if (row.api_key_encrypted && isLegacyCiphertext(row.api_key_encrypted)) {
      const upgraded = upgradeCiphertext(row.api_key_encrypted);
      if (upgraded) {
        values.push(upgraded);
        updates.push(`api_key_encrypted = $${values.length}`);
      }
    }

    if (row.api_secret_encrypted && isLegacyCiphertext(row.api_secret_encrypted)) {
      const upgraded = upgradeCiphertext(row.api_secret_encrypted);
      if (upgraded) {
        values.push(upgraded);
        updates.push(`api_secret_encrypted = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      return;
    }

    values.push(row.id);
    await db.query(
      `UPDATE store_integrations
         SET ${updates.join(', ')}, credentials_encryption_version = 1, updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );

    console.info(`ShipStation credentials re-encrypted for store ${row.store_id}`);
  } catch (error) {
    console.error('Failed to upgrade ShipStation credential encryption:', error);
  }
}

/**
 * Read the raw integration row for a store.
 *
 * @param storeId - Store UUID.
 * @param options - `activeOnly` restricts to enabled integrations.
 * @returns The row, or null.
 */
async function readRow(
  storeId: string,
  options: { activeOnly?: boolean } = {}
): Promise<IntegrationRow | null> {
  const result = await db.query<IntegrationRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM store_integrations
      WHERE store_id = $1
        AND integration_type = 'shipstation'
        ${options.activeOnly ? 'AND is_active = true' : ''}
      LIMIT 1`,
    [storeId]
  );

  return result.rows[0] ?? null;
}

/**
 * Convert a row to the decrypted domain object.
 *
 * @param row - Database row.
 * @returns The integration with secrets in plaintext.
 * @throws {ShipStationKeyError} When the encryption key is unavailable.
 */
function toIntegration(row: IntegrationRow): ShipStationIntegration {
  return {
    id: row.id,
    storeId: row.store_id,
    isActive: row.is_active ?? false,
    apiKey: row.api_key_encrypted ? decryptSecret(row.api_key_encrypted) : null,
    apiSecret: row.api_secret_encrypted ? decryptSecret(row.api_secret_encrypted) : null,
    configuration: row.configuration ?? {},
    webhookToken: row.webhook_token,
    webhookId: row.webhook_id,
    webhookRegisteredAt: row.webhook_registered_at,
    autoSyncEnabled: row.auto_sync_enabled ?? false,
    autoSyncInterval: row.auto_sync_interval ?? '1hour',
    lastSyncAt: row.last_sync_at,
    syncStatus: row.sync_status,
    syncErrorMessage: row.sync_error_message
  };
}

/**
 * Load a store's ShipStation integration with credentials decrypted.
 *
 * @param storeId - Store UUID.
 * @param options - `activeOnly` restricts to enabled integrations.
 * @returns The integration, or null when the store has none.
 * @throws {ShipStationKeyError} When the encryption key is unavailable.
 */
export async function getIntegration(
  storeId: string,
  options: { activeOnly?: boolean } = {}
): Promise<ShipStationIntegration | null> {
  const row = await readRow(storeId, options);
  if (!row) {
    return null;
  }

  const integration = toIntegration(row);
  await upgradeRowEncryption(row);

  return integration;
}

/**
 * Load a store's integration as a display summary, never exposing secrets.
 *
 * Unlike {@link getIntegration}, this tolerates a missing encryption key: it reports
 * `connected: true` from the presence of the stored ciphertext without trying to read it, so the
 * admin screen can render a useful state and a clear banner rather than a 500.
 *
 * @param storeId - Store UUID.
 * @param baseUrl - Absolute origin used to build the merchant's webhook URL.
 * @returns A summary; a store with no integration row still gets a well-formed "not connected".
 */
export async function getIntegrationSummary(
  storeId: string,
  baseUrl: string
): Promise<ShipStationIntegrationSummary> {
  const row = await readRow(storeId);

  if (!row) {
    return {
      id: null,
      storeId,
      isActive: false,
      connected: false,
      apiKeyMasked: null,
      webhookUrl: null,
      webhookRegistered: false,
      autoSyncEnabled: false,
      autoSyncInterval: '1hour',
      lastSyncAt: null,
      syncStatus: null,
      syncErrorMessage: null
    };
  }

  let apiKeyMasked: string | null = null;
  if (row.api_key_encrypted) {
    const configuredMask = row.configuration?.apiKeyMasked;
    if (typeof configuredMask === 'string') {
      apiKeyMasked = configuredMask;
    } else {
      try {
        apiKeyMasked = maskApiKey(decryptSecret(row.api_key_encrypted));
      } catch {
        apiKeyMasked = '•••• (unreadable — encryption key not configured)';
      }
    }
  }

  return {
    id: row.id,
    storeId: row.store_id,
    isActive: row.is_active ?? false,
    connected: Boolean(row.api_key_encrypted),
    apiKeyMasked,
    webhookUrl: row.webhook_token ? buildWebhookUrl(baseUrl, row.webhook_token) : null,
    webhookRegistered: Boolean(row.webhook_id),
    autoSyncEnabled: row.auto_sync_enabled ?? false,
    autoSyncInterval: row.auto_sync_interval ?? '1hour',
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
    syncStatus: row.sync_status,
    syncErrorMessage: row.sync_error_message
  };
}

/**
 * Build the per-store webhook URL ShipStation should be pointed at.
 *
 * The store identity lives in the path because ShipStation webhooks carry no tenant of ours
 * (audit P0-7). The token is unguessable and is only half the check — the body signature is the
 * other half, verified in `webhookSecurity.ts`.
 *
 * @param baseUrl - Absolute origin, e.g. `https://rebelshops.com`.
 * @param token - The store's webhook token.
 * @returns Absolute webhook URL.
 */
export function buildWebhookUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/shipstation/webhook/${token}`;
}

/** Fields accepted when a merchant connects or updates ShipStation. */
export interface SaveCredentialsInput {
  storeId: string;
  /** Plaintext API key. Omit to leave the stored key unchanged. */
  apiKey?: string;
  /** Plaintext API secret. Omit to leave unchanged. */
  apiSecret?: string;
  isActive: boolean;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: string;
  /** Merged into the existing `configuration` JSONB. */
  configuration?: Record<string, unknown>;
}

/**
 * Create or update a store's ShipStation credentials, encrypted at rest.
 *
 * Always ensures the store has a webhook token, so the merchant is never shown a webhook URL that
 * does not yet exist.
 *
 * @param input - Credentials and settings to persist.
 * @returns The resulting integration id and webhook token.
 * @throws {ShipStationKeyError} When the encryption key is unavailable.
 */
export async function saveCredentials(
  input: SaveCredentialsInput
): Promise<{ id: string; webhookToken: string }> {
  const existing = await readRow(input.storeId);

  const encryptedApiKey =
    input.apiKey === undefined || input.apiKey === ''
      ? existing?.api_key_encrypted ?? null
      : encryptSecret(input.apiKey);

  const encryptedApiSecret =
    input.apiSecret === undefined || input.apiSecret === ''
      ? existing?.api_secret_encrypted ?? null
      : encryptSecret(input.apiSecret);

  const webhookToken = existing?.webhook_token ?? generateToken();

  // Keep a mask in configuration so the summary endpoint can render without touching the key.
  const plaintextForMask =
    input.apiKey && input.apiKey !== ''
      ? input.apiKey
      : encryptedApiKey
        ? decryptSecret(encryptedApiKey)
        : null;

  const configuration = {
    ...(existing?.configuration ?? {}),
    ...(input.configuration ?? {}),
    ...(plaintextForMask ? { apiKeyMasked: maskApiKey(plaintextForMask) } : {})
  };

  if (existing) {
    await db.query(
      `UPDATE store_integrations
          SET api_key_encrypted = $1,
              api_secret_encrypted = $2,
              configuration = $3,
              is_active = $4,
              auto_sync_enabled = $5,
              auto_sync_interval = $6,
              webhook_token = $7,
              credentials_encryption_version = 1,
              updated_at = NOW()
        WHERE id = $8`,
      [
        encryptedApiKey,
        encryptedApiSecret,
        JSON.stringify(configuration),
        input.isActive,
        input.autoSyncEnabled ?? existing.auto_sync_enabled ?? false,
        input.autoSyncInterval ?? existing.auto_sync_interval ?? '1hour',
        webhookToken,
        existing.id
      ]
    );

    return { id: existing.id, webhookToken };
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO store_integrations (
       store_id, integration_type, api_key_encrypted, api_secret_encrypted, configuration,
       is_active, auto_sync_enabled, auto_sync_interval, webhook_token,
       credentials_encryption_version, created_at, updated_at
     ) VALUES ($1, 'shipstation', $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
     RETURNING id`,
    [
      input.storeId,
      encryptedApiKey,
      encryptedApiSecret,
      JSON.stringify(configuration),
      input.isActive,
      input.autoSyncEnabled ?? false,
      input.autoSyncInterval ?? '1hour',
      webhookToken
    ]
  );

  return { id: inserted.rows[0].id, webhookToken };
}

/**
 * Remove a store's ShipStation integration.
 *
 * @param storeId - Store UUID.
 * @returns Nothing.
 */
export async function deleteIntegration(storeId: string): Promise<void> {
  await db.query(
    `DELETE FROM store_integrations WHERE store_id = $1 AND integration_type = 'shipstation'`,
    [storeId]
  );
}

/**
 * Record the outcome of a sync run against the integration row.
 *
 * @param storeId - Store UUID.
 * @param status - `running`, `completed` or `failed`.
 * @param errorMessage - Failure detail, when relevant.
 * @returns Nothing.
 */
export async function recordSyncStatus(
  storeId: string,
  status: 'running' | 'completed' | 'failed',
  errorMessage?: string | null
): Promise<void> {
  await db.query(
    `UPDATE store_integrations
        SET sync_status = $1,
            sync_error_message = $2,
            last_sync_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE last_sync_at END,
            updated_at = NOW()
      WHERE store_id = $3 AND integration_type = 'shipstation'`,
    [status, errorMessage ?? null, storeId]
  );
}

/**
 * List stores whose ShipStation integration is active and has a stored API key.
 *
 * The audit's P0-4a: the previous implementation joined a nonexistent `integrations` table and
 * selected a nonexistent `s.name`, threw, was swallowed by a catch, and returned `[]` forever —
 * which is why `sync_logs` had zero rows. This version is checked against the live schema
 * (`store_integrations`, `stores.store_name`) and, critically, does **not** swallow errors: a
 * broken query must be visible, not silently mean "no work to do".
 *
 * @returns One entry per store eligible for scheduled sync.
 */
export async function getActiveShipStationStores(): Promise<
  Array<{ id: string; name: string; integrationId: string }>
> {
  const result = await db.query<{ id: string; name: string; integration_id: string }>(
    `SELECT s.id, s.store_name AS name, i.id AS integration_id
       FROM stores s
       JOIN store_integrations i ON i.store_id = s.id
      WHERE i.integration_type = 'shipstation'
        AND i.is_active = true
        AND i.api_key_encrypted IS NOT NULL
        AND i.api_key_encrypted <> ''
      ORDER BY s.store_name`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    integrationId: row.integration_id
  }));
}
