-- Migration 040: platform admin — the operator's view of the whole tenancy.
--
-- Everything RebelShops has stored until now answers a merchant's question: *how is my store
-- doing?* Every table carries `store_id` and every query filters on it, which is exactly right for
-- the product and leaves nobody able to answer the operator's question: *how is the platform
-- doing?* This migration adds the three things that question needs, and nothing else.
--
-- **1. A flag on the user, not a separate account table.** `users.is_admin` is a boolean on the
-- existing row rather than a `platform_admins` join table, because the alternative invites a second
-- identity: an operator would sign in twice, and the merchant admin would have no way to show the
-- "Admin" door in the sidebar without a second lookup. One user, one session, one extra column.
-- It defaults to `false` and is `NOT NULL`, so a database that has never heard of this migration
-- and one that has both answer "no" to every existing row — a grant is always a deliberate write.
--
-- **2. Storefront click events.** `visitors` already exists, but it is `UNIQUE (store_id,
-- ip_address, visited_date)`: it deliberately records *at most one row per IP per day*, which makes
-- it a unique-visitor counter and structurally unable to count clicks. `page_analytics` is closer
-- but is written only by the marketing-site tracker and stores raw `inet` addresses. Counting
-- buyer traffic onto merchant storefronts needs a table that keeps every event, so this adds one.
--
-- Two deliberate choices in its shape:
--
--   * **No raw IP.** The column is `ip_hash` — a salted SHA-256 computed in the application. An
--     operator dashboard needs "how many distinct people", not "which people", and a table of
--     shopper IPs across every merchant on the platform is a liability with no corresponding
--     feature. `visitors` keeps its `inet` column for the per-store dedupe it already does; this
--     table never learns the address.
--   * **`occurred_at` is `timestamptz`.** The older tables in this schema use naive `timestamp`,
--     which has already cost this codebase a day-boundary bug per timezone. Anything counting
--     "today" across a platform whose merchants span timezones has to know its offset.
--
-- **3. A daily rollup, maintained by trigger.** `storefront_click_daily` exists so "total buyer
-- clicks, all time, across every store" is a sum over a few thousand rows instead of a sequential
-- scan of every event ever recorded. It counts *clicks* only. It deliberately does **not** try to
-- keep a running unique-visitor count, because you cannot increment a distinct-count without
-- keeping the set: a trigger that added 1 to `unique_visitors` on every insert would produce a
-- number that looks like a distinct count, is not one, and drifts further from the truth every day.
-- Uniques are computed from `storefront_click_events` over an explicit window, where they are real.
--
-- **4. An audit trail.** A platform admin can read every merchant's numbers. That power is worth
-- recording, so `platform_admin_audit` keeps who looked at what. It is append-only by convention
-- and cascades on the admin's deletion.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The admin flag
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.is_admin IS
  'Platform operator. Grants read access to every store''s data through /platform. Never set by '
  'onboarding or any user-facing route — only by scripts/grant-admin.js or a deliberate SQL write.';

-- Partial: the index exists to find the handful of admins, never to scan the many non-admins.
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = TRUE;

-- ---------------------------------------------------------------------------
-- 2. Storefront click events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS storefront_click_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type       VARCHAR(32) NOT NULL DEFAULT 'storefront_view',
  path             VARCHAR(512),
  product_id       UUID,
  visitor_id       VARCHAR(64),
  session_id       VARCHAR(64),
  referrer_domain  VARCHAR(255),
  utm_source       VARCHAR(128),
  utm_medium       VARCHAR(128),
  utm_campaign     VARCHAR(128),
  country          VARCHAR(2),
  device           VARCHAR(16),
  ip_hash          CHAR(64),
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE storefront_click_events IS
  'Every buyer-side hit on a merchant storefront. Unlike `visitors` (one row per IP per day) this '
  'keeps every event, so it can answer "how many clicks" as well as "how many people".';
COMMENT ON COLUMN storefront_click_events.ip_hash IS
  'Salted SHA-256 of the client address, computed in the application. Never the address itself.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_click_events_store_fk') THEN
    ALTER TABLE storefront_click_events
      ADD CONSTRAINT storefront_click_events_store_fk
      FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE;
  END IF;

  -- The product is a nice-to-have dimension, not a dependency: deleting a product must not delete
  -- the record that somebody looked at it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_click_events_product_fk') THEN
    ALTER TABLE storefront_click_events
      ADD CONSTRAINT storefront_click_events_product_fk
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_click_events_type_ck') THEN
    ALTER TABLE storefront_click_events
      ADD CONSTRAINT storefront_click_events_type_ck
      CHECK (event_type IN (
        'storefront_view',   -- a buyer landed on any storefront page
        'product_view',      -- ... specifically a product detail page
        'add_to_cart',
        'checkout_start',
        'outbound_click'     -- an operator or marketing surface sent traffic to the store
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_click_events_store_time
  ON storefront_click_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_time
  ON storefront_click_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_store_type_time
  ON storefront_click_events (store_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_store_visitor
  ON storefront_click_events (store_id, visitor_id);

-- ---------------------------------------------------------------------------
-- 3. The daily rollup
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS storefront_click_daily (
  store_id    UUID NOT NULL,
  day         DATE NOT NULL,
  event_type  VARCHAR(32) NOT NULL,
  clicks      BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, day, event_type)
);

COMMENT ON TABLE storefront_click_daily IS
  'Click counts per store per UTC day, maintained by trigger from storefront_click_events. Counts '
  'only. Distinct visitors are not incrementable and are computed from the event table instead.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_click_daily_store_fk') THEN
    ALTER TABLE storefront_click_daily
      ADD CONSTRAINT storefront_click_daily_store_fk
      FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_click_daily_day ON storefront_click_daily (day DESC);

CREATE OR REPLACE FUNCTION roll_up_storefront_click() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO storefront_click_daily (store_id, day, event_type, clicks, updated_at)
  VALUES (NEW.store_id, (NEW.occurred_at AT TIME ZONE 'UTC')::date, NEW.event_type, 1, NOW())
  ON CONFLICT (store_id, day, event_type)
  DO UPDATE SET clicks = storefront_click_daily.clicks + 1, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roll_up_storefront_click ON storefront_click_events;
CREATE TRIGGER trg_roll_up_storefront_click
  AFTER INSERT ON storefront_click_events
  FOR EACH ROW EXECUTE FUNCTION roll_up_storefront_click();

-- Rebuild from source. Safe to run at any time; used by the backfill below and available to an
-- operator who suspects the rollup has drifted.
CREATE OR REPLACE FUNCTION rebuild_storefront_click_daily() RETURNS BIGINT AS $$
DECLARE
  rows_written BIGINT;
BEGIN
  DELETE FROM storefront_click_daily;
  INSERT INTO storefront_click_daily (store_id, day, event_type, clicks, updated_at)
  SELECT store_id, (occurred_at AT TIME ZONE 'UTC')::date, event_type, COUNT(*), NOW()
  FROM storefront_click_events
  GROUP BY 1, 2, 3;
  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$ LANGUAGE plpgsql;

-- A database that already had events (from a re-run, or a branch that created the table by hand)
-- gets a correct rollup rather than one that starts counting from today.
SELECT rebuild_storefront_click_daily();

-- ---------------------------------------------------------------------------
-- 4. The audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_admin_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL,
  action         VARCHAR(64) NOT NULL,
  target_type    VARCHAR(32),
  target_id      UUID,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_admin_audit_user_fk') THEN
    ALTER TABLE platform_admin_audit
      ADD CONSTRAINT platform_admin_audit_user_fk
      FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON platform_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_user ON platform_admin_audit (admin_user_id, created_at DESC);

COMMIT;
