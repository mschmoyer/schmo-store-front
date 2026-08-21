-- Migration 041: mark demo stores, so the operator console can leave them out.
--
-- `scripts/seed-demo.js` creates three fully-populated storefronts — Basecamp Audio, Fernwood
-- Goods and Ironline Fitness — with orders, catalogues, inventory and, since migration 040, weeks
-- of synthetic click history. They exist so a developer or a demo has something real-looking to
-- work against, and they are excellent for that.
--
-- They are poison in a platform metric. `/platform` exists to answer "how is the platform doing",
-- and every one of its figures — merchants, GMV, buyer clicks, fulfilment rate — is wrong the
-- moment invented merchants are counted alongside real ones. Worse, it is wrong in the flattering
-- direction: the demo data is deliberately healthy, so it drags every rate upward and makes a
-- platform with two struggling merchants look like a platform with five comfortable ones. The
-- console's entire justification is that its numbers can be trusted.
--
-- **Why a column rather than a list of ids in the query.** The three seeded UUIDs are fixed and it
-- is tempting to hardcode them. That fails the first time somebody seeds a fourth demo store, or
-- clones production into staging and wants the copies marked, or runs a sales demo from a real
-- deployment. A row that knows what it is stays correct; a list in a `WHERE` clause somewhere only
-- stays correct until the next person adds data.
--
-- **The flag is set by the seed, never by the product.** Nothing a merchant can do makes their
-- store a demo store, and nothing about being a demo store changes how the storefront behaves —
-- these stores still render, still take orders, still sync. The column decides one thing only:
-- whether the operator console counts them.
--
-- The backfill below names the three seeded ids because they already exist in every database this
-- migration will meet. New demo stores get the flag from the seed itself.

BEGIN;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN stores.is_demo IS
  'Seeded demonstration store. Excluded from /platform metrics by default so invented merchants '
  'never inflate a platform figure. Set by scripts/seed-demo.js; never by any user-facing route.';

-- Partial, and on the small side of the predicate: the index exists to find the handful of demo
-- stores, never to scan the many real ones.
CREATE INDEX IF NOT EXISTS idx_stores_is_demo ON stores (is_demo) WHERE is_demo = TRUE;

-- The three stores scripts/seed-demo.js has always created, by their fixed ids.
UPDATE stores
   SET is_demo = TRUE
 WHERE id IN (
   '650e8400-e29b-41d4-a716-446655440001',  -- Basecamp Audio   (demo-electronics)
   '650e8400-e29b-41d4-a716-446655440002',  -- Fernwood Goods   (artisan-craft)
   '650e8400-e29b-41d4-a716-446655440003'   -- Ironline Fitness (fitness-pro)
 )
   AND is_demo IS DISTINCT FROM TRUE;

COMMIT;
