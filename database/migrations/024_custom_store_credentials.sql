-- 024_custom_store_credentials.sql
--
-- Credential model for the ShipStation **Custom Store** channel — the channel that owns orders
-- (export + shipnotify). The V2 API channel keeps catalogue and inventory and keeps its own
-- credential (`api_key_encrypted`); the two are not interchangeable and a merchant generally has
-- both. See src/lib/shipstation/CLAUDE.md § "Two channels" and docs/shipstation-custom-store.md.
--
-- Why encryption and not a password hash: we *generate* the Custom Store secret (24 random bytes),
-- so there is no low-entropy human password to protect against offline cracking, and the merchant
-- must be able to re-read the value to paste it into ShipStation's Store Setup form. A hash would
-- force us to regenerate — and regenerating breaks a live ShipStation connection silently, which is
-- the failure mode this whole area keeps producing. Storage is AES-256-GCM under
-- SHIPSTATION_ENCRYPTION_KEY via src/lib/shipstation/crypto.ts, the same envelope as every other
-- secret on this table.
--
-- Every statement is guarded so a re-run is a no-op. The runner wraps this file in one transaction;
-- do not add BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Custom Store credential columns
-- ---------------------------------------------------------------------------

-- The Basic-auth secret ShipStation replays to us on every export and shipnotify call. Same
-- `ssenc:v1:` envelope as api_key_encrypted, so crypto.ts is still the only module that decrypts.
ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS custom_store_password_encrypted TEXT;

-- Whether this store's Custom Store feed accepts requests. Deliberately separate from `is_active`,
-- which governs the V2 API channel: a merchant can have a working order feed with no API key, or a
-- catalogue sync with no order feed, and the UI has to be able to say which.
ALTER TABLE store_integrations
  ADD COLUMN IF NOT EXISTS custom_store_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN store_integrations.custom_store_password_encrypted IS
  'Custom Store Basic-auth secret, AES-256-GCM (ssenc:v1:) under SHIPSTATION_ENCRYPTION_KEY.';

COMMENT ON COLUMN store_integrations.custom_store_enabled IS
  'Custom Store order feed accepts requests for this store. Independent of is_active (V2 API).';

-- No backfill from shipstation_auth_enabled on purpose. Pre-024 rows hold a base64 "hash" in
-- shipstation_password_hash that nothing can turn back into a usable Basic-auth secret, so
-- flipping them on would advertise a credential the server cannot honour — the P0-1 failure
-- shape. Those merchants regenerate; that is a visible, honest step.

-- ---------------------------------------------------------------------------
-- 2. Username is the tenant lookup key, so it has to be unique
-- ---------------------------------------------------------------------------

-- Auth resolves the store from the Basic-auth username in a single-row query. That is only sound
-- if a username names exactly one integration: 022 added a *non-unique* lookup index (P1-8, which
-- stopped the old code decrypting every tenant's row), and 007 added a partial index gated on
-- shipstation_auth_enabled — neither constrains uniqueness. Without the constraint two stores can
-- collide and the "one row" query silently picks whichever the planner returns first, which is a
-- cross-tenant order leak.
--
-- Any pre-existing collision is broken by nulling every duplicate but the first physical row. The
-- usernames being cleared belong to the retired auth path and cannot authenticate anything today.
UPDATE store_integrations a
   SET shipstation_username = NULL
  FROM store_integrations b
 WHERE a.shipstation_username IS NOT NULL
   AND b.shipstation_username = a.shipstation_username
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_integrations_username_unique
  ON store_integrations (shipstation_username)
  WHERE shipstation_username IS NOT NULL;

-- The 022 index covered the same column under the same predicate and is now strictly redundant:
-- the unique index above serves the lookup and enforces the constraint.
DROP INDEX IF EXISTS idx_store_integrations_username_lookup;

-- ---------------------------------------------------------------------------
-- 3. Retire the old password column
-- ---------------------------------------------------------------------------

-- RETIRED: shipstation_password_hash (migration 007). It never held a hash — the old auth path
-- wrote base64(password) and compared strings — and nothing reads it as of 024. Left in place
-- rather than dropped so a rollback to the previous deploy does not hit a missing column; drop it
-- one release after this one ships.
COMMENT ON COLUMN store_integrations.shipstation_password_hash IS
  'RETIRED by migration 024. Never a hash (base64 of the plaintext). Nothing reads this column; '
  'the Custom Store secret lives in custom_store_password_encrypted. Safe to drop one release '
  'after 024.';

COMMENT ON COLUMN store_integrations.shipstation_auth_enabled IS
  'RETIRED by migration 024. Superseded by custom_store_enabled. Nothing reads this column.';

-- Legacy tracking table, kept in step with the rest of the migration history.
INSERT INTO schema_migrations (version, description)
SELECT '024', 'Custom Store credentials: encrypted secret, unique username, enable flag'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '024');
