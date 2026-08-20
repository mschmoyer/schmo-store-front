-- 035: What a receipt has to record for the purchase order to still mean something afterwards.
--
-- Three defects an adversarial review reproduced against the receive endpoint, all of them the
-- shape of "the receipt was written and the order it was against was quietly damaged".

BEGIN;

-- 1. The invoiced cost overwrote the ordered cost ------------------------------------------------
--
-- `receive/route.ts` did `SET unit_cost = COALESCE($2::numeric, unit_cost)` on the order line, so
-- receiving 5 units at 25.00 against a line ordered at 10.00 rewrote the line to 25.00 — while
-- `total_cost`, `purchase_orders.subtotal` and `purchase_orders.total_cost` all stayed at the
-- ordered figures. The line then read "10 x 25.00 = 100.00", which the list route and the PDF both
-- render.
--
-- It also destroyed the evidence. The gap between what a supplier quoted and what they invoiced is
-- price variance, and it is the whole content of a supplier-performance conversation — the same
-- argument migration 028 makes for keeping over-receipt visible instead of letting a merchant edit
-- the order to hide it. So the received cost is recorded on the receipt, where it belongs, and the
-- ordered cost stays put.

ALTER TABLE public.purchase_order_receiving
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2);

COMMENT ON COLUMN public.purchase_order_receiving.unit_cost IS
  'What this delivery actually cost per unit. Compare with purchase_order_items.unit_cost, which '
  'stays as ordered, to see price variance.';

-- 2. A retried receipt booked a second delivery ---------------------------------------------------
--
-- `FOR UPDATE` on the order serialised concurrent callers but deduplicated nothing, and the body
-- carried no key. Submitting the same receipt twice — a double-click, a retried request, a flaky
-- connection on a warehouse tablet — booked it twice. Reproduced: two identical POSTs against a
-- 10-unit line took `total_received` from 5 to 10 with `over_received: 0` and `warnings: []`,
-- because the phantom units stayed inside the ordered quantity. The merchant gets no signal at all,
-- and the stock is simply wrong.
--
-- The sales path already refuses this (029 keys movements on the order line so a webhook replay is
-- safe). Receiving now does the same, on a key the client supplies.

ALTER TABLE public.purchase_order_receiving
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- Partial, so the pre-existing rows and any caller that omits a key are unaffected. A key is only
-- meaningful within one purchase order.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_receiving_idempotency_key
  ON public.purchase_order_receiving (purchase_order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.purchase_order_receiving.idempotency_key IS
  'Client-supplied key making a retried receipt a no-op rather than a second delivery.';

-- 3. `delivered` could be set on an order nothing had been received against -------------------------
--
-- `PATCH /api/admin/purchase-orders/[id] {"status":"delivered"}` set the status directly, and the
-- `incoming` calculation counts every line of an order not in ('cancelled','closed','draft'). So a
-- 100-unit order marked delivered by hand kept contributing 100 units of `incoming` forever — and
-- because `needs_reorder` requires `incoming = 0`, that SKU was permanently hidden from the restock
-- worklist by a delivery that never arrived.
--
-- The status is derived from the receipts in `receive/route.ts`. This stops the other path from
-- asserting a delivery the receipts do not support; `closed` remains available for an order the
-- merchant wants out of the way without claiming its units arrived.

CREATE OR REPLACE FUNCTION public.purchase_order_status_needs_receipts()
RETURNS TRIGGER AS $$
DECLARE
  v_received INTEGER;
BEGIN
  IF NEW.status IN ('delivered', 'partially_received')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(SUM(quantity_received), 0) INTO v_received
      FROM public.purchase_order_items
     WHERE purchase_order_id = NEW.id;

    IF v_received = 0 THEN
      RAISE EXCEPTION
        'Purchase order % cannot be marked % before anything has been received against it. '
        'Receive the delivery, or close the order if it is not coming.',
        NEW.po_number, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_status_needs_receipts ON public.purchase_orders;
CREATE TRIGGER trg_po_status_needs_receipts
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_status_needs_receipts();

INSERT INTO public.schema_migrations (version, description)
VALUES ('035', 'Receipts record their own cost and a retry key; delivered status requires receipts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
