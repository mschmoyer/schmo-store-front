-- 022_shipstation_hardening.sql
--
-- Schema work behind the ShipStation integration hardening pass. Addresses audit findings
-- P0-7 (webhook tenant scoping), P0-9 (credential encryption at rest), P1-3 (resumable sync runs),
-- P1-4 (cross-tenant sync_logs leak) and the order-push decoupling.
--
-- Every statement is guarded so a re-run is a no-op. The runner wraps this file in one transaction;
-- do not add BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Credential storage
-- ---------------------------------------------------------------------------

-- `credentials_encryption_version`: 0 = pre-022 base64, 1 = AES-256-GCM written by
-- src/lib/shipstation/crypto.ts. The application re-encrypts a row the first time it reads it with
-- a key configured, then stamps version 1.
ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS credentials_encryption_version SMALLINT NOT NULL DEFAULT 0;

-- Per-store webhook identity. ShipStation webhooks carry nothing identifying our tenant, so the
-- store lives in the URL (`webhook_token`) and the sender proves itself with a shared secret that
-- ShipStation replays as a custom header (`webhook_secret_encrypted`).
ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS webhook_token TEXT;

ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT;

ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS webhook_id TEXT;

ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS webhook_registered_at TIMESTAMP;

-- Tag pre-existing base64 values so the format is self-describing. The application can then tell a
-- legacy value from a real ciphertext without guessing, and upgrade it in place. Guarded on both
-- prefixes so re-running never double-tags.
UPDATE store_integrations
   SET api_key_encrypted = 'b64v0:' || api_key_encrypted
 WHERE api_key_encrypted IS NOT NULL
   AND api_key_encrypted <> ''
   AND api_key_encrypted NOT LIKE 'ssenc:v1:%'
   AND api_key_encrypted NOT LIKE 'b64v0:%';

UPDATE store_integrations
   SET api_secret_encrypted = 'b64v0:' || api_secret_encrypted
 WHERE api_secret_encrypted IS NOT NULL
   AND api_secret_encrypted <> ''
   AND api_secret_encrypted NOT LIKE 'ssenc:v1:%'
   AND api_secret_encrypted NOT LIKE 'b64v0:%';

-- Give every existing ShipStation integration a webhook token immediately, so a merchant who
-- connected before this release still has a usable per-store webhook URL to paste.
-- gen_random_bytes() needs pgcrypto, which is not guaranteed to be installed. gen_random_uuid() is
-- core and CSPRNG-backed, so hashing two of them yields a 256-bit token without a new extension.
UPDATE store_integrations
   SET webhook_token = encode(
         sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex')
 WHERE integration_type = 'shipstation'
   AND webhook_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_integrations_webhook_token
  ON store_integrations (webhook_token)
  WHERE webhook_token IS NOT NULL;

-- P1-8: the Basic-Auth path used to scan and decrypt every active row. Look up by username instead.
CREATE INDEX IF NOT EXISTS idx_store_integrations_username_lookup
  ON store_integrations (shipstation_username)
  WHERE shipstation_username IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Order fulfilment push state
-- ---------------------------------------------------------------------------

-- Order push moved out of the checkout critical path into the job queue. These columns are what
-- make a failed push visible and retriable instead of a lost sale.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_sync_error TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_sync_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_pushed_at TIMESTAMP;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipstation_shipment_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_sync_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fulfillment_sync_status_check
      CHECK (fulfillment_sync_status IN ('pending', 'queued', 'pushed', 'failed', 'not_applicable'));
  END IF;
END $$;

-- Orders that still owe ShipStation a push: the merchant-facing "needs attention" query.
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_sync_status
  ON orders (store_id, fulfillment_sync_status)
  WHERE fulfillment_sync_status IN ('pending', 'queued', 'failed');

-- Orders created before this release were never pushed and never will be retroactively; mark them
-- so they do not appear as a permanent backlog on the merchant's dashboard.
UPDATE orders
   SET fulfillment_sync_status = 'not_applicable'
 WHERE created_at < NOW()
   AND fulfillment_sync_status = 'pending'
   AND shipstation_order_id IS NULL;

UPDATE orders
   SET fulfillment_sync_status = 'pushed',
       fulfillment_pushed_at = COALESCE(fulfillment_pushed_at, updated_at)
 WHERE shipstation_order_id IS NOT NULL
   AND fulfillment_sync_status IN ('pending', 'not_applicable');

-- ---------------------------------------------------------------------------
-- 3. Job queue: tenant scoping and idempotency
-- ---------------------------------------------------------------------------

-- P1-5's fix drains this queue on a cron. Once jobs actually run, two things matter that did not
-- before: knowing which tenant a job belongs to, and not enqueuing the same unit of work twice
-- when a webhook is redelivered or a sync is triggered while one is already in flight.
ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS store_id UUID;

ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_queue_store_id_fkey'
  ) THEN
    ALTER TABLE job_queue
      ADD CONSTRAINT job_queue_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Only one *outstanding* job per dedupe key. Completed and failed rows are excluded so the same
-- logical job can be re-enqueued later (e.g. the next hourly sync of the same page).
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_dedupe_active
  ON job_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'processing', 'retrying');

CREATE INDEX IF NOT EXISTS idx_job_queue_store_id ON job_queue (store_id);

-- The drain endpoint claims work with FOR UPDATE SKIP LOCKED ordered by priority then schedule.
CREATE INDEX IF NOT EXISTS idx_job_queue_claim
  ON job_queue (status, scheduled_at)
  WHERE status IN ('pending', 'retrying');

-- ---------------------------------------------------------------------------
-- 4. Sync observability: per-tenant, resumable
-- ---------------------------------------------------------------------------

-- P1-4: sync_logs had no store_id at all, so /api/admin/sync/status could not be scoped and leaked
-- every tenant's history to every merchant admin.
ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS store_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_logs_store_id_fkey'
  ) THEN
    ALTER TABLE sync_logs
      ADD CONSTRAINT sync_logs_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sync_logs_store_id_timestamp
  ON sync_logs (store_id, timestamp DESC);

-- P1-3: a run-level record with a cursor, so a partial failure resumes from the last completed
-- page instead of restarting the catalogue from page 1.
CREATE TABLE IF NOT EXISTS sync_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  operation          VARCHAR(50) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'running',
  last_page_completed INTEGER NOT NULL DEFAULT 0,
  records_processed  INTEGER NOT NULL DEFAULT 0,
  records_added      INTEGER NOT NULL DEFAULT 0,
  records_updated    INTEGER NOT NULL DEFAULT 0,
  error_message      TEXT,
  started_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at        TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_runs_status_check'
  ) THEN
    ALTER TABLE sync_runs
      ADD CONSTRAINT sync_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sync_runs_store_started
  ON sync_runs (store_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_resumable
  ON sync_runs (store_id, operation, status)
  WHERE status = 'running';

-- ---------------------------------------------------------------------------
-- 4b. Upsert targets for the paged sync
-- ---------------------------------------------------------------------------

-- `inventory` is unique on (store_id, sku, warehouse_id), but ShipStation's account-level
-- `/v2/inventory` feed carries no warehouse, so those rows all have warehouse_id IS NULL — and NULL
-- never conflicts in a unique constraint, which meant the old "SELECT then INSERT or UPDATE" dance
-- could race into duplicates. A partial unique index gives the sync a real ON CONFLICT target.
DELETE FROM inventory a
 USING inventory b
 WHERE a.warehouse_id IS NULL
   AND b.warehouse_id IS NULL
   AND a.store_id = b.store_id
   AND a.sku = b.sku
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_store_sku_no_warehouse
  ON inventory (store_id, sku)
  WHERE warehouse_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Retire the dropped-function credential generator
-- ---------------------------------------------------------------------------

-- Migration 008 dropped generate_shipstation_username(UUID) and generate_shipstation_password(),
-- but /api/admin/integrations/shipstation/generate-credentials kept calling them and 500'd on every
-- invocation (P0-3). That route is gone. Re-assert the drop so a database restored from a pre-008
-- dump cannot resurrect the non-deterministic pair alongside the deterministic one.
DROP FUNCTION IF EXISTS generate_shipstation_username(UUID);
DROP FUNCTION IF EXISTS generate_shipstation_password();

-- Legacy tracking table, kept in step with the rest of the migration history.
INSERT INTO schema_migrations (version, description)
SELECT '022', 'ShipStation hardening: encrypted credentials, scoped webhooks, resumable sync'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '022');
