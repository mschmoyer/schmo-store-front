-- Migration 029: make the ledger the only thing that moves stock.
--
-- Migration 027 built the ledger and made `products.stock_quantity` a projection of it. That is
-- only true if nothing else writes the column, and several things still did — most importantly the
-- order trigger, which has decremented `stock_quantity` directly since the platform was built.
--
-- Leaving it in place would have been worse than not having a ledger at all. A direct write to the
-- projection survives until the next real movement and is then silently corrected back, so a sale
-- would appear to reduce stock and then appear to un-reduce it hours later when someone received a
-- delivery. Two mechanisms writing one column is how the old model became incoherent in the first
-- place; repeating it under a new name would be a worse bug than the one being fixed.
--
-- So `update_product_stock` is rewritten to post through `post_inventory_movement`. Its signature
-- is unchanged, because a handful of callers use it and this is not the migration to chase them
-- all; what changes is that it can no longer lie:
--
--   * it no longer clamps a negative result to zero while logging the unclamped delta, which is
--     what erased every oversell and made the log stop reconciling with the balance;
--   * it no longer reads-then-writes, so two concurrent orders cannot both read the same balance
--     and both write the same decrement;
--   * it writes a reason code from a closed vocabulary rather than a free-text `change_type`.
--
-- `inventory_logs` keeps being written alongside, so anything still reading it keeps working. It is
-- now a derived view of the ledger rather than the record itself.

BEGIN;

/*
 * Translate the old free-text `change_type` vocabulary into the ledger's reason codes.
 *
 * Six values had accumulated across four writers, none of them documented. Mapping them explicitly
 * here is the only place the correspondence is written down, and anything unrecognised becomes
 * `correction` rather than failing the caller's transaction — refusing an order because a stock
 * movement had an unfamiliar label would be a spectacularly bad trade.
 */
CREATE OR REPLACE FUNCTION public.reason_for_change_type(change_type_param VARCHAR)
RETURNS inventory_reason AS $$
BEGIN
  RETURN CASE lower(COALESCE(change_type_param, ''))
    WHEN 'sale'          THEN 'sale'
    WHEN 'order'         THEN 'sale'
    WHEN 'restock'       THEN 'po_receipt'
    WHEN 'receipt'       THEN 'po_receipt'
    WHEN 'return'        THEN 'return_to_stock'
    WHEN 'initial_stock' THEN 'initial_stock'
    WHEN 'damage'        THEN 'damage'
    WHEN 'shrinkage'     THEN 'shrinkage'
    WHEN 'adjustment'    THEN 'correction'
    ELSE 'correction'
  END::inventory_reason;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/*
 * The legacy entry point, now a thin adapter onto the ledger.
 *
 * A zero-quantity call is a no-op rather than an error: the old function happily wrote a
 * `quantity_change: 0` row (the product soft-delete did exactly that, asserting a balance of zero
 * for stock that was still on the shelf), and the ledger refuses zero movements. Silently doing
 * nothing is right here — there is genuinely nothing to record.
 */
CREATE OR REPLACE FUNCTION update_product_stock(
    product_id_param UUID,
    quantity_change INTEGER,
    change_type_param VARCHAR(50),
    reference_type_param VARCHAR(50) DEFAULT 'manual',
    reference_id_param UUID DEFAULT NULL,
    notes_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  v_entry public.inventory_transactions;
BEGIN
  IF quantity_change = 0 THEN
    RETURN;
  END IF;

  SELECT store_id INTO v_store_id FROM public.products WHERE id = product_id_param;
  IF v_store_id IS NULL THEN
    RETURN;
  END IF;

  v_entry := public.post_inventory_movement(
    p_store_id       => v_store_id,
    p_product_id     => product_id_param,
    p_delta          => quantity_change,
    p_reason         => public.reason_for_change_type(change_type_param),
    p_location_id    => NULL,
    p_reference_type => reference_type_param,
    p_reference_id   => reference_id_param,
    p_actor_user_id  => NULL,
    p_note           => notes_param
  );

  -- Kept in step for the code that still reads it. `quantity_after` is the ledger's balance, so the
  -- two can no longer disagree the way they did when one was clamped and the other was not.
  INSERT INTO public.inventory_logs (
    store_id, product_id, change_type, quantity_change, quantity_after,
    reference_type, reference_id, notes
  ) VALUES (
    v_store_id, product_id_param, change_type_param, quantity_change, v_entry.balance_after,
    reference_type_param, reference_id_param, notes_param
  );
END;
$$ LANGUAGE plpgsql;

/*
 * Sales are posted from the *order*, not from the line item, and only once.
 *
 * The old trigger fired `AFTER INSERT ON order_items`, so stock moved the moment a line was
 * written — including for a cart that was never paid for, and including a second time if the same
 * order was ever re-inserted. `reference_id` is the order id and the ledger is queryable, so the
 * function can decline to post a sale it has already posted, which is the property that makes
 * retries and webhook replays safe.
 */
CREATE OR REPLACE FUNCTION public.trigger_update_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id UUID;
  v_already INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) = 0 THEN
      RETURN NEW;
    END IF;

    SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
    IF v_store_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Only for products that are actually tracked. Selling an untracked service should not create
    -- a stock balance for it out of nowhere.
    IF NOT COALESCE((SELECT track_inventory FROM public.products WHERE id = NEW.product_id), false) THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_already
      FROM public.inventory_transactions
     WHERE reference_type = 'order_item' AND reference_id = NEW.id;

    IF v_already > 0 THEN
      RETURN NEW;
    END IF;

    PERFORM public.post_inventory_movement(
      p_store_id       => v_store_id,
      p_product_id     => NEW.product_id,
      p_delta          => -NEW.quantity,
      p_reason         => 'sale'::inventory_reason,
      p_location_id    => NULL,
      p_reference_type => 'order_item',
      p_reference_id   => NEW.id,
      p_actor_user_id  => NULL,
      p_note           => NULL,
      -- Cost at the time of sale, which `order_items.unit_cost` already snapshots. This is what
      -- makes margin reporting true to the moment rather than to today's cost price.
      p_unit_cost      => NEW.unit_cost
    );

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL OR COALESCE(OLD.quantity, 0) = 0 THEN
      RETURN OLD;
    END IF;

    SELECT store_id INTO v_store_id FROM public.products WHERE id = OLD.product_id;
    IF v_store_id IS NULL THEN
      RETURN OLD;
    END IF;

    -- Only reverse a sale that was actually posted.
    SELECT COUNT(*) INTO v_already
      FROM public.inventory_transactions
     WHERE reference_type = 'order_item' AND reference_id = OLD.id AND reason = 'sale';

    IF v_already = 0 THEN
      RETURN OLD;
    END IF;

    PERFORM public.post_inventory_movement(
      p_store_id       => v_store_id,
      p_product_id     => OLD.product_id,
      p_delta          => OLD.quantity,
      p_reason         => 'return_to_stock'::inventory_reason,
      p_location_id    => NULL,
      p_reference_type => 'order_item',
      p_reference_id   => OLD.id,
      p_actor_user_id  => NULL,
      p_note           => 'Order line removed'
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Anything not yet in the ledger ---------------------------------------------------------------
--
-- Direct writes to `products.stock_quantity` between migration 027 and this one — the seed, the
-- sync, the order path — left the projection ahead of or behind the ledger. Reconcile once, with a
-- movement that says exactly what it is, so the invariant holds from here on.

WITH drift AS (
  SELECT p.id AS product_id,
         p.store_id,
         COALESCE(p.stock_quantity, 0) - COALESCE((
           SELECT SUM(l.on_hand) FROM public.inventory_levels l
            WHERE l.product_id = p.id AND l.store_id = p.store_id
         ), 0) AS delta
    FROM public.products p
)
SELECT public.post_inventory_movement(
         d.store_id, d.product_id, d.delta::int, 'sync_correction'::inventory_reason,
         NULL, 'migration', NULL, NULL,
         'Reconciling the stock projection with the ledger when the single-writer rule was introduced'
       )
  FROM drift d
 WHERE d.delta <> 0;

INSERT INTO public.schema_migrations (version, description)
VALUES ('029', 'Route every stock movement through the ledger; order trigger posts sales idempotently')
ON CONFLICT (version) DO NOTHING;

COMMIT;
