-- 023_order_item_unit_cost.sql
--
-- Snapshot the cost of goods onto each order line at the moment the order is written.
--
-- Why
-- ---
-- Gross profit is currently only derivable by joining `order_items` back to
-- `products.cost_price` — which is the *current* cost. The moment a supplier
-- raises a price, every historical margin in the application silently rewrites
-- itself: last quarter's 48% becomes 41% with no order having changed. A
-- merchant cannot reconcile a month they already closed.
--
-- `order_items.unit_cost` fixes that by recording the cost that applied when
-- the line was sold. Reporting reads COALESCE(oi.unit_cost, p.cost_price) so
-- rows written before this migration still resolve, and rows written after it
-- are immutable.
--
-- How the snapshot happens
-- ------------------------
-- With a BEFORE INSERT trigger rather than in application code. There are two
-- separate order-writing paths today (`src/lib/billing/orders.ts` for Stripe
-- checkout and `src/app/api/orders/route.ts` for the direct order API) and any
-- future path — an import, a seed, a ShipStation pull — would be a third place
-- to remember. Putting it in the database means no insert can forget. An
-- explicit non-null `unit_cost` supplied by the caller is always respected, so
-- a backfill or a corrected historical import can still set its own value.
--
-- The runner wraps this file in one transaction; do not add BEGIN/COMMIT.
-- Every statement is guarded so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2);

COMMENT ON COLUMN order_items.unit_cost IS
  'Cost of goods per unit at the time the order was placed. Snapshotted from '
  'products.cost_price by trigger_snapshot_order_item_unit_cost. NULL only for '
  'rows written before migration 023 whose product had no cost on file.';

-- Reporting filters profit queries on "has a cost we can trust", so index the
-- populated rows only — the partial index stays small as unpriced lines age out.
CREATE INDEX IF NOT EXISTS idx_order_items_unit_cost
  ON order_items (product_id)
  WHERE unit_cost IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. The snapshot trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trigger_snapshot_order_item_unit_cost()
RETURNS TRIGGER AS $$
BEGIN
  -- Respect a cost the caller set deliberately (backfills, corrected imports).
  IF NEW.unit_cost IS NULL THEN
    SELECT p.cost_price INTO NEW.unit_cost
      FROM products p
     WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_order_item_unit_cost ON order_items;
CREATE TRIGGER snapshot_order_item_unit_cost
  BEFORE INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_snapshot_order_item_unit_cost();

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------
--
-- Existing lines get today's cost. That is the best estimate available and it
-- is what the reporting join already assumed; the difference is that from now
-- on the value stops moving.

UPDATE order_items oi
   SET unit_cost = p.cost_price
  FROM products p
 WHERE p.id = oi.product_id
   AND oi.unit_cost IS NULL
   AND p.cost_price IS NOT NULL;
