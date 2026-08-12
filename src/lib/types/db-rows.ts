/**
 * Row shapes returned by `db.query` for the application's Postgres tables.
 *
 * These mirror the physical columns (names, nullability and driver-level JS
 * types) rather than the higher-level domain models in `./database.ts`. Pass
 * them as the generic argument to `query<Row>(...)` so result rows are typed at
 * the boundary instead of being narrowed at every use site.
 *
 * Notes on driver types:
 * - `numeric`/`decimal` columns come back from `pg` as strings, not numbers.
 * - `bigint` results of `COUNT(*)` also come back as strings.
 * - Nullable columns are typed `| null`.
 */

/** Row of `public.store_integrations`. */
export type StoreIntegrationRow = {
  id: string;
  store_id: string;
  integration_type: string;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  configuration: Record<string, unknown> | null;
  auto_sync_enabled: boolean | null;
  auto_sync_interval: string | null;
  sync_frequency: string | null;
  last_sync_at: Date | null;
  sync_status: string | null;
  sync_error_message: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  shipstation_username: string | null;
  shipstation_password_hash: string | null;
  shipstation_auth_enabled: boolean | null;
};

/** A `COUNT(*)`/`COUNT(x)` projection. `pg` returns bigint columns as strings. */
export type CountRow = {
  count: string;
};
