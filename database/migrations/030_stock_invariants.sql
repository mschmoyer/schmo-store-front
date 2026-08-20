-- Migration 030: make the ledger's invariants maintain themselves.
--
-- Migrations 027 and 029 established two rules — every store has a stock location, and every change
-- to on-hand goes through the ledger — and enforced both with one-time backfills. A backfill only
-- holds until the next row is inserted. A store created after the migration ran had no location, so
-- the seed failed outright with "has no default inventory location"; and any code still writing
-- `products.stock_quantity` directly put the projection ahead of the ledger until something else
-- corrected it.
--
-- Both become triggers here, which is the difference between a rule that was true once and a rule
-- that is true.
--
-- The second trigger is the load-bearing one. Rather than hunting down every writer of
-- `stock_quantity` across the sync, the seed, the import and half a dozen routes — and trusting
-- that nobody adds another — a direct write to the column is *translated into a ledger movement*.
-- Legacy code keeps working, the ledger stays complete, and the balance stays reconcilable. Callers
-- that want to say why stock moved should still call `post_inventory_movement`; this is the safety
-- net for the ones that do not.

BEGIN;

-- Every store has somewhere to keep stock ------------------------------------------------------

/**
 * Give a new store its default inventory location.
 *
 * Single-location merchants never see the concept, but every balance needs a location to hang from,
 * so one is created the moment the store is.
 */
CREATE OR REPLACE FUNCTION public.create_default_inventory_location()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.inventory_locations (store_id, code, name, is_default, priority)
  VALUES (NEW.id, 'DEFAULT', 'Main location', true, 0)
  ON CONFLICT (store_id, code) DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_default_inventory_location ON public.stores;
CREATE TRIGGER trg_create_default_inventory_location
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.create_default_inventory_location();

-- Catch any store that still lacks one, including ones created between 027 and now.
INSERT INTO public.inventory_locations (store_id, code, name, is_default, priority)
SELECT s.id, 'DEFAULT', 'Main location', true, 0
  FROM public.stores s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.inventory_locations l WHERE l.store_id = s.id AND l.is_default
 )
ON CONFLICT (store_id, code) DO NOTHING;

-- Direct writes to the projection become ledger movements ---------------------------------------

/**
 * Translate a direct write to `products.stock_quantity` into a stock movement.
 *
 * The column is a projection of the ledger, so a write to it is a statement of intent — "this
 * product should hold 50 units" — with no record of what moved or why. This turns that intent into
 * the movement that realises it, tagged `sync_correction` so it is distinguishable in reporting
 * from a merchant who counted a shelf.
 *
 * Recursion terminates on arithmetic rather than on a depth guard: the projection trigger writes
 * `stock_quantity` back after the movement, which fires this trigger again, which computes a delta
 * of zero and does nothing. That is a stronger guarantee than `pg_trigger_depth()`, because it also
 * covers the case where two writers race.
 */
CREATE OR REPLACE FUNCTION public.translate_direct_stock_write()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_total INTEGER;
  v_delta INTEGER;
BEGIN
  SELECT COALESCE(SUM(on_hand), 0) INTO v_ledger_total
    FROM public.inventory_levels
   WHERE product_id = NEW.id AND store_id = NEW.store_id;

  v_delta := COALESCE(NEW.stock_quantity, 0) - v_ledger_total;

  IF v_delta = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.post_inventory_movement(
    p_store_id       => NEW.store_id,
    p_product_id     => NEW.id,
    p_delta          => v_delta,
    -- An insert is an opening balance; a later write is a correction against what the ledger holds.
    p_reason         => CASE WHEN TG_OP = 'INSERT'
                             THEN 'initial_stock'::inventory_reason
                             ELSE 'sync_correction'::inventory_reason END,
    p_location_id    => NULL,
    p_reference_type => 'projection',
    p_reference_id   => NULL,
    p_actor_user_id  => NULL,
    p_note           => CASE WHEN TG_OP = 'INSERT'
                             THEN 'Opening stock recorded when the product was created'
                             ELSE 'Balance set directly rather than through a recorded movement' END
  );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_translate_direct_stock_write ON public.products;
CREATE TRIGGER trg_translate_direct_stock_write
  AFTER INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW
  -- Untracked products have no balance to keep, and a null quantity is not a statement about one.
  WHEN (NEW.track_inventory AND NEW.stock_quantity IS NOT NULL)
  EXECUTE FUNCTION public.translate_direct_stock_write();

-- Reconcile anything that drifted before the trigger existed.
WITH drift AS (
  SELECT p.id AS product_id, p.store_id,
         COALESCE(p.stock_quantity, 0) - COALESCE((
           SELECT SUM(l.on_hand) FROM public.inventory_levels l
            WHERE l.product_id = p.id AND l.store_id = p.store_id
         ), 0) AS delta
    FROM public.products p
   WHERE p.track_inventory
)
SELECT public.post_inventory_movement(
         d.store_id, d.product_id, d.delta::int, 'sync_correction'::inventory_reason,
         NULL, 'migration', NULL, NULL,
         'Reconciling the stock projection with the ledger'
       )
  FROM drift d
 WHERE d.delta <> 0;

INSERT INTO public.schema_migrations (version, description)
VALUES ('030', 'Default location per store and direct stock writes translated into ledger movements, both by trigger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
