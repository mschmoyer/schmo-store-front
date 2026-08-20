-- Migration 027: a real inventory ledger.
--
-- Until now stock was a single mutable integer, `products.stock_quantity`, written by five
-- different things that disagreed about what it meant: the ShipStation sync overwrote it with
-- *available* (already net of allocation), an order trigger subtracted from it as *on hand*, a PO
-- receipt added to it as *on hand*, an admin adjustment set it absolutely, and a soft-delete
-- ignored it. `inventory_logs` recorded some of those movements, but the *client* supplied the
-- delta and nothing checked it against the balance, and negative results were silently clamped to
-- zero while the unclamped delta was logged. Summing the log therefore could not reproduce the
-- stored quantity — which means it was never an audit trail, just a list of assertions.
--
-- What replaces it:
--
--   `inventory_locations`   where stock physically is. One default per store, so single-warehouse
--                           merchants never see the concept, but the dimension exists from day one
--                           rather than being retrofitted through every query later.
--   `inventory_levels`      the balance per (product, location), split into the five quantities a
--                           merchant actually needs to tell apart. `available` is generated, so it
--                           cannot drift from its own definition.
--   `inventory_transactions` the append-only ledger. UPDATE and DELETE are refused by trigger.
--                           `balance_after` is written by the posting function from the value the
--                           atomic update returned, so `balance_after = previous + delta` holds by
--                           construction and the ledger always replays to the balance.
--
-- `products.stock_quantity` survives as a maintained projection of on-hand across locations. Every
-- storefront query, the cart, and a good deal of reporting read it, and rewriting all of that in
-- the same change as the model beneath it would be two risky migrations pretending to be one. It
-- is now written *only* by trigger from `inventory_levels`; nothing else may set it.

BEGIN;

-- Reason codes ---------------------------------------------------------------------------------
--
-- A closed vocabulary. `change_type VARCHAR(50)` accumulated six undocumented values across four
-- writers; nobody could enumerate what a movement could be, so nobody could report on it. Every
-- movement now says why it happened, and "why" is the column shrinkage investigations start from.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_reason') THEN
    CREATE TYPE inventory_reason AS ENUM (
      'initial_stock',    -- opening balance when a product or location is first stocked
      'sale',             -- shipped to a customer
      'return_to_stock',  -- came back saleable
      'po_receipt',       -- received against a purchase order
      'transfer_in',      -- arrived from another location
      'transfer_out',     -- left for another location
      'cycle_count',      -- recount adjusted the book to the shelf
      'damage',           -- unsaleable through damage
      'shrinkage',        -- missing, cause unknown
      'expiry',           -- passed its date
      'sample',           -- given away deliberately
      'write_off',        -- deliberately removed from valuation
      'correction',       -- a human fixing a known data error
      'sync_correction'   -- reconciling against what ShipStation reports
    );
  END IF;
END$$;

-- `products` needs a composite key before anything can carry a store-scoped foreign key to it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_id_store_id_key'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_id_store_id_key UNIQUE (id, store_id);
  END IF;
END$$;

-- Locations ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  location_type VARCHAR(32) NOT NULL DEFAULT 'warehouse',

  -- How this maps upstream. Both nullable: a location can exist here with no ShipStation twin.
  shipstation_warehouse_id VARCHAR(255),
  shipstation_location_id VARCHAR(255),

  -- Whether stock here can be promised to a shopper. A transit or quarantine location cannot.
  is_fulfillable BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- Lower sorts first when choosing where to fulfil from.
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (store_id, code),
  -- Lets child tables carry a store-scoped foreign key, the same guard migration 026 applied to
  -- categories and suppliers.
  UNIQUE (id, store_id),
  CONSTRAINT inventory_locations_type_check
    CHECK (location_type IN ('warehouse', 'store', 'transit', 'quarantine', 'virtual'))
);

-- Exactly one default per store, enforced rather than assumed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default
  ON public.inventory_locations (store_id) WHERE is_default;

-- Every store gets a default location so single-location merchants never meet the concept.
INSERT INTO public.inventory_locations (store_id, code, name, is_default, priority)
SELECT s.id, 'DEFAULT', 'Main location', true, 0
  FROM public.stores s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.inventory_locations l WHERE l.store_id = s.id AND l.is_default
 );

-- Balances -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,

  -- Physically present, saleable or not.
  on_hand INTEGER NOT NULL DEFAULT 0,
  -- Sold but not yet shipped. Still on the shelf; not available to promise.
  committed INTEGER NOT NULL DEFAULT 0,
  -- Held by an in-flight checkout. Released when the hold expires.
  reserved INTEGER NOT NULL DEFAULT 0,
  -- Present but not saleable: damaged, quarantined, awaiting inspection.
  unavailable INTEGER NOT NULL DEFAULT 0,
  -- On order and not yet arrived. Not part of availability; part of planning.
  incoming INTEGER NOT NULL DEFAULT 0,

  /*
   * Available-to-promise, generated so it cannot disagree with its own definition. Every screen
   * and every oversell check reads this one column rather than each re-deriving the arithmetic
   * slightly differently, which is how the platform ended up with a checkout that consulted
   * ShipStation's `available` and a grid that showed a different number entirely.
   */
  available INTEGER GENERATED ALWAYS AS (on_hand - committed - reserved - unavailable) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (store_id, product_id, location_id),
  FOREIGN KEY (product_id, store_id) REFERENCES public.products (id, store_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, store_id) REFERENCES public.inventory_locations (id, store_id) ON DELETE CASCADE,

  -- These four are counts of physical things. Negative is always a bug, unlike on_hand, which is
  -- allowed to go negative so an oversell surfaces instead of being clamped away.
  CONSTRAINT inventory_levels_non_negative
    CHECK (committed >= 0 AND reserved >= 0 AND unavailable >= 0 AND incoming >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_levels_product
  ON public.inventory_levels (store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_levels_location
  ON public.inventory_levels (store_id, location_id);
-- The "what is short" view: negative or zero availability, cheapest as a partial index.
CREATE INDEX IF NOT EXISTS idx_inventory_levels_short
  ON public.inventory_levels (store_id, available) WHERE available <= 0;

-- The ledger -----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,
  -- Denormalised so the ledger stays readable after a product is renamed or removed. A movement
  -- record that can only be understood by joining to a mutable row is not an audit trail.
  sku VARCHAR(255) NOT NULL,

  reason inventory_reason NOT NULL,
  -- Signed. Never zero: a movement of nothing is not a movement, and the old code wrote
  -- `quantity_change: 0` rows to record a product being discontinued.
  delta INTEGER NOT NULL,
  -- On-hand at this location immediately after this movement, as returned by the atomic update.
  balance_after INTEGER NOT NULL,

  -- Cost at the moment of the movement, for valuation that does not depend on today's cost price.
  unit_cost NUMERIC(12, 4),

  reference_type VARCHAR(32),
  reference_id UUID,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (product_id, store_id) REFERENCES public.products (id, store_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, store_id) REFERENCES public.inventory_locations (id, store_id),
  CONSTRAINT inventory_transactions_delta_not_zero CHECK (delta <> 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_product_time
  ON public.inventory_transactions (store_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_reason
  ON public.inventory_transactions (store_id, reason, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_reference
  ON public.inventory_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

/*
 * Append-only, enforced.
 *
 * A ledger that can be edited is a spreadsheet. Permissions alone would not do it — the
 * application connects as the owner — so the refusal lives in a trigger, which applies to every
 * connection including a psql session. Deliberate reversals are posted as an opposing entry, which
 * is what double-entry has always done and leaves the mistake visible.
 */
CREATE OR REPLACE FUNCTION public.inventory_transactions_are_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'inventory_transactions is append-only; post a reversing entry instead of a % ', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_transactions_immutable ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.inventory_transactions_are_immutable();

-- The one write path ---------------------------------------------------------------------------

/*
 * Post a movement: update the balance and record why, atomically.
 *
 * This is the only supported way to change on-hand. It takes a *delta and a reason*, never an
 * absolute quantity — an absolute set cannot say what moved, and the old API accepted both a new
 * quantity and an unrelated `quantity_change` from the browser with nothing reconciling them.
 *
 * The balance update is a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so it is atomic
 * against concurrent callers: two simultaneous sales of the last unit serialise on the row rather
 * than both reading 1 and both writing 0.
 *
 * On-hand is allowed to go negative. Clamping is what hid oversells before — seven units of real
 * discrepancy erased, and a ledger that no longer replayed. A negative balance is a fact worth
 * surfacing, and the admin has a view for it.
 *
 * @returns The ledger row that was written.
 */
CREATE OR REPLACE FUNCTION public.post_inventory_movement(
  p_store_id UUID,
  p_product_id UUID,
  p_delta INTEGER,
  p_reason inventory_reason,
  p_location_id UUID DEFAULT NULL,
  p_reference_type VARCHAR DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL
) RETURNS public.inventory_transactions AS $$
DECLARE
  v_location_id UUID;
  v_sku VARCHAR(255);
  v_cost NUMERIC(12, 4);
  v_balance INTEGER;
  v_row public.inventory_transactions;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'A movement of zero units is not a movement'
      USING ERRCODE = 'check_violation';
  END IF;

  v_location_id := COALESCE(
    p_location_id,
    (SELECT id FROM public.inventory_locations
      WHERE store_id = p_store_id AND is_default LIMIT 1)
  );

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Store % has no default inventory location', p_store_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Resolving the SKU here also proves the product belongs to the store, so no caller can post a
  -- movement into a tenant it does not own even by passing a valid uuid.
  SELECT sku, cost_price INTO v_sku, v_cost
    FROM public.products
   WHERE id = p_product_id AND store_id = p_store_id;

  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Product % is not in store %', p_product_id, p_store_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.inventory_levels (store_id, product_id, location_id, on_hand)
  VALUES (p_store_id, p_product_id, v_location_id, p_delta)
  ON CONFLICT (store_id, product_id, location_id) DO UPDATE
    SET on_hand = public.inventory_levels.on_hand + EXCLUDED.on_hand,
        updated_at = NOW()
  RETURNING on_hand INTO v_balance;

  INSERT INTO public.inventory_transactions (
    store_id, product_id, location_id, sku, reason, delta, balance_after,
    unit_cost, reference_type, reference_id, actor_user_id, note
  ) VALUES (
    p_store_id, p_product_id, v_location_id, v_sku, p_reason, p_delta, v_balance,
    COALESCE(p_unit_cost, v_cost), p_reference_type, p_reference_id, p_actor_user_id, p_note
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- Keeping the legacy column true ----------------------------------------------------------------

/*
 * `products.stock_quantity` becomes a read-only projection: total on-hand across every location.
 *
 * Roughly forty queries read it — the storefront, the cart's oversell check, the reports. Changing
 * all of them in this migration would make one change out of two, and the risky half would be the
 * one nobody could review. Instead the column keeps meaning what those queries assume, and gains a
 * single writer.
 */
CREATE OR REPLACE FUNCTION public.project_stock_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_store_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  v_store_id := COALESCE(NEW.store_id, OLD.store_id);

  UPDATE public.products p
     SET stock_quantity = COALESCE((
           SELECT SUM(l.on_hand)::int
             FROM public.inventory_levels l
            WHERE l.product_id = v_product_id AND l.store_id = v_store_id
         ), 0),
         updated_at = NOW()
   WHERE p.id = v_product_id AND p.store_id = v_store_id
     -- Skip the write when nothing changed, so this does not churn `updated_at` across the
     -- catalogue on every sync pass.
     AND p.stock_quantity IS DISTINCT FROM COALESCE((
           SELECT SUM(l.on_hand)::int
             FROM public.inventory_levels l
            WHERE l.product_id = v_product_id AND l.store_id = v_store_id
         ), 0);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_stock_quantity ON public.inventory_levels;
CREATE TRIGGER trg_project_stock_quantity
  AFTER INSERT OR UPDATE OF on_hand OR DELETE ON public.inventory_levels
  FOR EACH ROW EXECUTE FUNCTION public.project_stock_quantity();

-- Backfill --------------------------------------------------------------------------------------
--
-- Seed each product's current quantity as its opening balance at the default location, and post a
-- matching ledger entry so the ledger replays to the balance from its very first row. The entry is
-- reason `initial_stock` and says plainly where the number came from — it is a migration artefact,
-- not a movement anyone made, and pretending otherwise would be the same dishonesty this table
-- exists to end.

INSERT INTO public.inventory_levels (store_id, product_id, location_id, on_hand)
SELECT p.store_id, p.id, l.id, COALESCE(p.stock_quantity, 0)
  FROM public.products p
  JOIN public.inventory_locations l ON l.store_id = p.store_id AND l.is_default
 WHERE NOT EXISTS (
   SELECT 1 FROM public.inventory_levels il
    WHERE il.product_id = p.id AND il.location_id = l.id
 )
ON CONFLICT (store_id, product_id, location_id) DO NOTHING;

INSERT INTO public.inventory_transactions (
  store_id, product_id, location_id, sku, reason, delta, balance_after, unit_cost,
  reference_type, note
)
SELECT il.store_id, il.product_id, il.location_id, p.sku, 'initial_stock', il.on_hand, il.on_hand,
       p.cost_price, 'migration',
       'Opening balance carried over from products.stock_quantity when the ledger was introduced'
  FROM public.inventory_levels il
  JOIN public.products p ON p.id = il.product_id AND p.store_id = il.store_id
 WHERE il.on_hand <> 0
   AND NOT EXISTS (
     SELECT 1 FROM public.inventory_transactions t
      WHERE t.product_id = il.product_id AND t.location_id = il.location_id
   );

-- Purchase order lifecycle ----------------------------------------------------------------------
--
-- The status vocabulary had no `draft` and no `partially_received`, so an order with 3 of 100 units
-- in was indistinguishable from one nobody had touched, and the code that advances status only
-- moved to `delivered` once every line was complete — leaving partial receipts stuck forever.

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'pending', 'approved', 'shipped',
    'partially_received', 'delivered', 'closed', 'cancelled'
  ));

-- Where a receipt landed, so incoming can be netted per location.
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_items_pending
  ON public.purchase_order_items (purchase_order_id) WHERE quantity_pending > 0;

/*
 * The old trigger that added receipts straight onto `products.stock_quantity`.
 *
 * It has to go: `stock_quantity` is now a projection, so a second writer would be overwritten by
 * the projection trigger on the next movement and the units would silently vanish. Receiving posts
 * through `post_inventory_movement` instead, which is also the only way the receipt reaches the
 * ledger.
 */
DROP TRIGGER IF EXISTS trigger_update_inventory_on_po_receipt ON public.purchase_order_items;
DROP TRIGGER IF EXISTS update_inventory_on_po_receipt_trigger ON public.purchase_order_items;

INSERT INTO public.schema_migrations (version, description)
VALUES ('027', 'Append-only inventory ledger, locations, on-hand/committed/reserved/incoming split, PO lifecycle states')
ON CONFLICT (version) DO NOTHING;

COMMIT;
