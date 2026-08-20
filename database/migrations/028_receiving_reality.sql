-- Migration 028: let the receiving schema describe what actually happens on a loading dock.
--
-- Migration 027 widened the purchase order status vocabulary but only on `purchase_orders`. The
-- history table kept the old five, so the first real partial receipt failed on a check constraint
-- while writing its own audit entry — the receipt would have been recorded and then rolled back for
-- want of a word to describe it.
--
-- The second change is the interesting one. `CHECK (quantity_received <= quantity)` made it
-- impossible to record receiving more units than were ordered. Suppliers over-ship: they round up
-- to a case, they make good on a previous short, they simply make a mistake. Under the old
-- constraint a merchant who unloaded 105 units against an order for 100 could either not record the
-- delivery at all, or quietly edit the order to say 105 were ordered — destroying the evidence that
-- anything unusual happened, which is exactly what a supplier-performance record exists to keep.
--
-- So over-receipt is permitted and reported. `quantity_pending` floors at zero, because "how many
-- are still coming" can never sensibly be negative; the over-receipt itself is visible as
-- `quantity_received > quantity` and is surfaced per line by the receive endpoint.

BEGIN;

-- Status vocabulary, matched to `purchase_orders` -----------------------------------------------

ALTER TABLE public.purchase_order_status_history
  DROP CONSTRAINT IF EXISTS purchase_order_status_history_new_status_check;
ALTER TABLE public.purchase_order_status_history
  ADD CONSTRAINT purchase_order_status_history_new_status_check
  CHECK (new_status IN (
    'draft', 'pending', 'approved', 'shipped',
    'partially_received', 'delivered', 'closed', 'cancelled'
  ));

-- `old_status` is nullable for the first entry in an order's life and otherwise carries the same
-- vocabulary. It had no constraint at all, which meant history could record a transition out of a
-- status that never existed.
ALTER TABLE public.purchase_order_status_history
  DROP CONSTRAINT IF EXISTS purchase_order_status_history_old_status_check;
ALTER TABLE public.purchase_order_status_history
  ADD CONSTRAINT purchase_order_status_history_old_status_check
  CHECK (old_status IS NULL OR old_status IN (
    'draft', 'pending', 'approved', 'shipped',
    'partially_received', 'delivered', 'closed', 'cancelled'
  ));

-- Over-receipt ---------------------------------------------------------------------------------

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_check;

-- Rebuild `quantity_pending` so it floors at zero. A generated column's expression cannot be
-- altered in place, so it is dropped and recreated; it holds no data of its own.
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS quantity_pending;
ALTER TABLE public.purchase_order_items
  ADD COLUMN quantity_pending INTEGER
  GENERATED ALWAYS AS (GREATEST(quantity - quantity_received, 0)) STORED;

COMMENT ON COLUMN public.purchase_order_items.quantity_pending IS
  'Units still expected. Floors at zero: an over-receipt is visible as quantity_received > quantity, not as negative pending.';

-- The index from 027 referenced the column that was just recreated.
DROP INDEX IF EXISTS idx_po_items_pending;
CREATE INDEX idx_po_items_pending
  ON public.purchase_order_items (purchase_order_id) WHERE quantity_pending > 0;

-- Receiving records ----------------------------------------------------------------------------
--
-- One index the receive path needs and a comment recording what the table is for, since it went
-- five migrations without a single row being written to it.

CREATE INDEX IF NOT EXISTS idx_po_receiving_store_date
  ON public.purchase_order_receiving (received_date DESC, purchase_order_id);

COMMENT ON TABLE public.purchase_order_receiving IS
  'One row per delivery against a purchase order line. Partial deliveries are separate rows, which is what makes a split shipment legible after the fact.';

INSERT INTO public.schema_migrations (version, description)
VALUES ('028', 'Purchase order status history vocabulary, over-receipt allowed with pending floored at zero')
ON CONFLICT (version) DO NOTHING;

COMMIT;
