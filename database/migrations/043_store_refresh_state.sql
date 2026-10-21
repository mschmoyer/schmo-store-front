-- Migration 043: per-store "refresh on visit" throttle.
--
-- Production runs on Neon, which scales a compute to zero after a few minutes idle. Vercel Cron
-- used to drain `job_queue` every five minutes and schedule a ShipStation sync for every store every
-- hour, which kept the database awake around the clock for stores nobody was looking at. The
-- product has very little traffic, so nearly all of that compute was spent on nobody.
--
-- The replacement does the background work when somebody actually visits a storefront: the layout
-- schedules `refreshStoreIfStale(storeId)` (src/lib/services/storeRefresh.ts) with Next's `after()`,
-- and that drains the store's queued jobs, schedules a ShipStation sync when the last one is old,
-- and takes the day's inventory snapshot. A single daily cron remains as a safety net.
--
-- **This table is the throttle.** A store refreshes at most once per interval, and the claim is one
-- atomic statement against this row:
--
--   INSERT ... ON CONFLICT (store_id) DO UPDATE SET last_refreshed_at = NOW()
--    WHERE store_refresh_state.last_refreshed_at < NOW() - <interval>
--   RETURNING store_id
--
-- A row back means this caller won; no row means someone else refreshed recently. The conflicting
-- row is locked for the duration of the upsert, so exactly one of any number of concurrent visitors
-- across any number of Vercel instances wins. Losers pay that one statement and nothing else.
--
-- **Why a dedicated table rather than a column on `stores`.** `stores` carries a
-- `BEFORE UPDATE` trigger, `set_timestamp_stores` (migration 003), that rewrites `stores.updated_at`
-- on every update. Writing a throttle timestamp to `stores` every ten minutes would make
-- `updated_at` mean "somebody looked at the storefront" instead of "the merchant changed their
-- store", and would take a row lock on the hottest tenant row in the schema — the one every
-- storefront request reads — on every refresh. A separate narrow row has neither problem.
-- Deliberately no `updated_at` trigger here either: `last_refreshed_at` is the only timestamp the
-- claim needs, and it is set explicitly.
--
-- `last_finished_at` / `last_result` are written once the refresh completes (best-effort) so an
-- operator can see what the last visit-driven refresh actually did, per step, without log access.
-- A refresh that died mid-way leaves `last_finished_at` older than `last_refreshed_at`, which is
-- itself the signal.
--
-- Guarded so a re-run is a no-op. The runner wraps this file in a transaction; no BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS store_refresh_state (
  store_id          UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  last_refreshed_at TIMESTAMPTZ NOT NULL,
  last_finished_at  TIMESTAMPTZ,
  last_result       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE store_refresh_state IS
  'Throttle for the visit-driven per-store refresh (src/lib/services/storeRefresh.ts). One row per '
  'store; claimed atomically by an upsert guarded on last_refreshed_at. See migration 043.';
COMMENT ON COLUMN store_refresh_state.last_refreshed_at IS
  'When the most recent refresh was claimed (not finished). The throttle compares against this.';
COMMENT ON COLUMN store_refresh_state.last_finished_at IS
  'When the most recent refresh finished and recorded last_result. Older than last_refreshed_at '
  'means the last refresh is still running or died before recording.';
COMMENT ON COLUMN store_refresh_state.last_result IS
  'Per-step outcome of the most recent finished refresh (StoreRefreshResult, JSON). Diagnostic only.';
