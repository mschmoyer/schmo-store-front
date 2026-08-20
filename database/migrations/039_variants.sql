-- Migration 039: variants — the stock-keeping unit becomes the variant, not the product.
--
-- This is step 1 of five, and it is deliberately additive: it creates the tables, backfills one
-- variant per existing product, and installs the triggers that keep the two consistent. Nothing
-- reads the new tables yet. That is what makes it shippable and reversible on its own, and it is
-- why the sync triggers below exist — without them, every product write between this migration and
-- step 2 would leave the variant rows stale, and step 2 would repoint reads at stale data.
--
-- The shape follows the commerce convention rather than inventing one, because merchants import
-- from Shopify and expect it: a product carries the marketing (name, description, images, SEO,
-- category, tags), and a variant carries everything a warehouse or a till cares about — SKU, price,
-- cost, weight, barcode, customs codes and the stock policy. A product with no meaningful choices
-- still has exactly one variant, titled "Default Title". There is no second code path for
-- "simple products": that fork is how catalogues acquire two prices for the same shirt.
--
-- Three invariants are enforced in the schema rather than in a route:
--
--   1. Every product has at least one variant. A deferred constraint trigger, so a transaction may
--      legitimately swap the default variant for real ones before it commits.
--   2. A variant's combination of option values is unique within its product. Maintained as a
--      canonical `option_key` and enforced with a plain UNIQUE — a merchant cannot create "Red /
--      Small" twice and then wonder which one the shopper bought.
--   3. An option value belongs to the option it is attached to. A composite foreign key, so
--      attaching the "Large" value to the "Colour" option is not a validation rule someone can
--      forget to write — it is a constraint violation.
--
-- Two rules govern the DDL below, both learned from deploys this migration broke.
--
-- **`CREATE TABLE IF NOT EXISTS` says nothing about the table's shape.** If the table is already
-- there — from a hand-run experiment, an earlier branch of this work, anything — the statement is a
-- silent no-op and every inline constraint in it is skipped with it. The next foreign key that
-- points at one of those constraints then fails with a message about a unique constraint that this
-- file plainly declares, which is a genuinely confusing thing to read at 2am. So the tables are
-- created bare and every constraint and index is added afterwards, guarded on `pg_constraint` and
-- `pg_indexes` by name. A pre-existing table is healed rather than assumed.
--
-- **A mirror may not be stricter than what it mirrors.** `create_default_variant()` fires on every
-- product insert, so a constraint the variant table has and `products` does not never rejects the
-- bad value — it rejects the *product write*, at creation, at ShipStation sync, and at this
-- migration's own backfill against any database already holding such a row. A non-blank-SKU CHECK
-- and a non-negative-weight CHECK each broke it that way; `products` constrains neither.
--
-- So `product_variants` carries no value constraints at all in step 1 — not even the ones `products`
-- appears to have, because a constraint that is only safe if some *other* migration definitely ran,
-- on a database this file cannot inspect, is a bet whose downside is a failed deploy rather than a
-- bad row. Uniqueness and validity belong to the step that makes the variant the system of record,
-- on data this schema has by then had a chance to report on. Step 1 mirrors, and mirroring must not
-- fail.

BEGIN;

-- Two guards the rest of the file leans on --------------------------------------------------------

/*
 * `CREATE TABLE IF NOT EXISTS` says nothing about the *shape* of a table that already exists. If one
 * of these four names is already taken — by an earlier incarnation of this work, a hand-run
 * experiment, anything — the statement is a silent no-op and the entire definition goes with it:
 * columns, constraints, defaults. The migration then fails on the first thing that references a
 * piece that was never created, describing a column or constraint you can read plainly in this file.
 * Three deploys died that way, each one statement further along than the last, because patching the
 * symptom moves the failure rather than removing it.
 *
 * So a table is only accepted if it actually has the columns this migration defines. If it does not:
 * an empty table is replaced (nothing can be lost — no code in this application has ever written
 * these tables), and one with rows in it stops the migration with a message naming the table, what
 * is missing and how many rows are at stake. Adopting an unknown table silently is how a schema
 * becomes two schemas.
 */
CREATE OR REPLACE FUNCTION pg_temp.ensure_table(p_table TEXT, p_columns TEXT[], p_ddl TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
  reg          regclass;
  missing      TEXT[];
  rows_present BIGINT;
BEGIN
  reg := to_regclass(p_table);

  IF reg IS NULL THEN
    EXECUTE p_ddl;
    RETURN;
  END IF;

  SELECT array_agg(c) INTO missing
    FROM unnest(p_columns) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = reg AND a.attname = c AND a.attnum > 0 AND NOT a.attisdropped
   );

  IF missing IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('SELECT count(*) FROM %s', p_table) INTO rows_present;

  IF rows_present > 0 THEN
    RAISE EXCEPTION
      'Table % already exists with a different shape (missing: %) and holds % row(s). Refusing to replace it. Inspect that table and drop it by hand if it is not yours.',
      p_table, array_to_string(missing, ', '), rows_present
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'Replacing empty table % — it existed but was missing: %',
    p_table, array_to_string(missing, ', ');
  EXECUTE format('DROP TABLE %s CASCADE', p_table);
  EXECUTE p_ddl;
END;
$fn$;

/*
 * `ALTER TABLE ... ADD CONSTRAINT` has no `IF NOT EXISTS`, and `DROP CONSTRAINT IF EXISTS` followed
 * by `ADD` would rewrite constraints that are already correct — on a large table that is a lock and
 * a table scan for no reason. Checking `pg_constraint` by name is the cheap, honest version.
 *
 * Both helpers live in `pg_temp` rather than `public`: this is scaffolding for one migration, and a
 * helper left behind in the schema is a helper someone else eventually depends on.
 */
CREATE OR REPLACE FUNCTION pg_temp.add_constraint_if_absent(
  p_table TEXT, p_name TEXT, p_definition TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = p_table::regclass AND conname = p_name
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', p_table, p_name, p_definition);
  END IF;
END;
$fn$;

-- The four tables, each accepted only if it has the shape defined here --------------------------

SELECT pg_temp.ensure_table(
  'public.product_options',
  ARRAY['id','store_id','product_id','name','position','created_at','updated_at'],
  $ddl$
  CREATE TABLE public.product_options (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID NOT NULL,
    product_id UUID NOT NULL,
    name       VARCHAR(100) NOT NULL,
    -- Capped at three axes by a CHECK below. Beyond that the variant count stops being something a
    -- merchant can hold in their head or manage in a grid, and every platform that allows more
    -- regrets it.
    position   SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  $ddl$);

SELECT pg_temp.ensure_table(
  'public.product_option_values',
  ARRAY['id','store_id','option_id','value','position','created_at'],
  $ddl$
  CREATE TABLE public.product_option_values (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id   UUID NOT NULL,
    option_id  UUID NOT NULL,
    value      VARCHAR(255) NOT NULL,
    position   SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  $ddl$);

SELECT pg_temp.ensure_table(
  'public.product_variants',
  ARRAY['id','store_id','product_id','title','position','option_key','sku','barcode','base_price',
        'sale_price','cost_price','weight','weight_unit','requires_shipping','hs_code',
        'country_of_origin','track_inventory','allow_backorder','low_stock_threshold',
        'reorder_point','shipstation_product_id','image_media_id','is_active','created_at',
        'updated_at'],
  $ddl$
  CREATE TABLE public.product_variants (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id               UUID NOT NULL,
    product_id             UUID NOT NULL,

    -- Display name assembled from the option values ("Small / Red"), or "Default Title" for the
    -- implicit single variant. Stored rather than derived because order line items snapshot it and
    -- the storefront renders it on every card.
    title                  VARCHAR(255) NOT NULL DEFAULT 'Default Title',
    position               SMALLINT NOT NULL DEFAULT 1,

    -- Canonical, order-independent identity of the option tuple. Empty string for a variant with no
    -- options, which is why invariant 2's UNIQUE also caps a product at one implicit default.
    option_key             TEXT NOT NULL DEFAULT '',

    -- What the warehouse and the till care about. No value CHECKs — see the header.
    sku                    VARCHAR(255) NOT NULL,
    barcode                VARCHAR(255),
    base_price             NUMERIC(10,2) NOT NULL,
    sale_price             NUMERIC(10,2),
    cost_price             NUMERIC(10,2),
    weight                 NUMERIC(8,2),
    weight_unit            VARCHAR(10) NOT NULL DEFAULT 'lb',
    requires_shipping      BOOLEAN NOT NULL DEFAULT TRUE,
    hs_code                VARCHAR(16),
    country_of_origin      CHAR(2),

    -- Stock policy travels with the stock-keeping unit, not with the marketing page.
    track_inventory        BOOLEAN NOT NULL DEFAULT TRUE,
    allow_backorder        BOOLEAN NOT NULL DEFAULT FALSE,
    low_stock_threshold    INTEGER,
    reorder_point          INTEGER,

    shipstation_product_id VARCHAR(255),
    image_media_id         UUID,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  $ddl$);

SELECT pg_temp.ensure_table(
  'public.variant_option_values',
  ARRAY['store_id','variant_id','option_id','value_id'],
  $ddl$
  CREATE TABLE public.variant_option_values (
    store_id   UUID NOT NULL,
    variant_id UUID NOT NULL,
    option_id  UUID NOT NULL,
    value_id   UUID NOT NULL,
    PRIMARY KEY (variant_id, option_id)
  )
  $ddl$);

-- Constraints, added only where absent -----------------------------------------------------------

-- `product_media` predates the composite-key convention migration 026 established, so there was
-- nothing for a variant image reference to point at that also carried the store. Adding it here
-- rather than pointing at the bare primary key: a variant must not be able to borrow another
-- merchant's photograph, and a constraint settles that for every code path, written and unwritten.
SELECT pg_temp.add_constraint_if_absent(
  'public.product_media', 'product_media_id_store_id_key', 'UNIQUE (id, store_id)');

SELECT pg_temp.add_constraint_if_absent(
  'public.product_options', 'product_options_store_id_fkey',
  'FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_options', 'product_options_position_check', 'CHECK (position BETWEEN 1 AND 3)');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_options', 'product_options_name_not_blank', $q$CHECK (btrim(name) <> '')$q$);
SELECT pg_temp.add_constraint_if_absent(
  'public.product_options', 'product_options_id_store_id_key', 'UNIQUE (id, store_id)');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_options', 'product_options_product_id_store_id_fkey',
  'FOREIGN KEY (product_id, store_id) REFERENCES public.products(id, store_id) ON DELETE CASCADE');

SELECT pg_temp.add_constraint_if_absent(
  'public.product_option_values', 'product_option_values_store_id_fkey',
  'FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_option_values', 'product_option_values_not_blank',
  $q$CHECK (btrim(value) <> '')$q$);
SELECT pg_temp.add_constraint_if_absent(
  'public.product_option_values', 'product_option_values_id_store_id_key', 'UNIQUE (id, store_id)');
-- The target of invariant 3's composite key: a value row is reachable only through its own option.
SELECT pg_temp.add_constraint_if_absent(
  'public.product_option_values', 'product_option_values_id_option_id_key', 'UNIQUE (id, option_id)');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_option_values', 'product_option_values_option_id_store_id_fkey',
  'FOREIGN KEY (option_id, store_id) REFERENCES public.product_options(id, store_id) ON DELETE CASCADE');

SELECT pg_temp.add_constraint_if_absent(
  'public.product_variants', 'product_variants_store_id_fkey',
  'FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_variants', 'product_variants_id_store_id_key', 'UNIQUE (id, store_id)');
SELECT pg_temp.add_constraint_if_absent(
  'public.product_variants', 'product_variants_product_id_store_id_fkey',
  'FOREIGN KEY (product_id, store_id) REFERENCES public.products(id, store_id) ON DELETE CASCADE');
/*
 * No `ON DELETE` action, which means NO ACTION: deleting a photograph a variant still points at is
 * refused. The column-list form (`SET NULL (image_media_id)`) would read better but needs
 * PostgreSQL 15, and a migration that runs on someone else's database should not carry a version
 * floor it cannot check. `deleteMedia` already detaches media from products inside one transaction;
 * the step that lets a merchant attach an image to a variant extends it to do the same here.
 */
SELECT pg_temp.add_constraint_if_absent(
  'public.product_variants', 'product_variants_image_media_id_store_id_fkey',
  'FOREIGN KEY (image_media_id, store_id) REFERENCES public.product_media(id, store_id)');

/*
 * Invariant 2, deferred to commit — and that is not a weakening.
 *
 * `option_key` is maintained by a trigger on `variant_option_values`, so a variant is necessarily
 * inserted before the rows that give it its identity. Every variant in a four-row grid therefore
 * carries the empty key for the length of one statement, and so does the auto-created default they
 * are replacing. Checked immediately, creating any multi-variant product is a unique violation
 * against itself; checked at commit, only the state the merchant actually asked for is tested. The
 * trade is that this constraint cannot serve as an ON CONFLICT arbiter.
 */
SELECT pg_temp.add_constraint_if_absent(
  'public.product_variants', 'product_variants_product_option_key',
  'UNIQUE (store_id, product_id, option_key) DEFERRABLE INITIALLY DEFERRED');

SELECT pg_temp.add_constraint_if_absent(
  'public.variant_option_values', 'variant_option_values_store_id_fkey',
  'FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE');
SELECT pg_temp.add_constraint_if_absent(
  'public.variant_option_values', 'variant_option_values_variant_id_store_id_fkey',
  'FOREIGN KEY (variant_id, store_id) REFERENCES public.product_variants(id, store_id) ON DELETE CASCADE');
SELECT pg_temp.add_constraint_if_absent(
  'public.variant_option_values', 'variant_option_values_option_id_store_id_fkey',
  'FOREIGN KEY (option_id, store_id) REFERENCES public.product_options(id, store_id) ON DELETE CASCADE');
-- Invariant 3: the value must belong to the option it is filed under.
SELECT pg_temp.add_constraint_if_absent(
  'public.variant_option_values', 'variant_option_values_value_id_option_id_fkey',
  'FOREIGN KEY (value_id, option_id) REFERENCES public.product_option_values(id, option_id) ON DELETE CASCADE');

-- Indexes ----------------------------------------------------------------------------------------

-- Case-insensitive: "Colour" and "colour" are one axis, not two.
CREATE UNIQUE INDEX IF NOT EXISTS product_options_product_name_key
  ON public.product_options (store_id, product_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS product_options_product_position_key
  ON public.product_options (store_id, product_id, position);

CREATE UNIQUE INDEX IF NOT EXISTS product_option_values_option_value_key
  ON public.product_option_values (store_id, option_id, lower(value));

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants (store_id, product_id, position);
/*
 * Deliberately not UNIQUE. A SKU should name one sellable unit per store, and with variants that
 * unit is the variant — but enforcing it here breaks two things at once. The auto-created default
 * variant holds the product's SKU, so the first real variant that keeps it (what a Shopify import
 * does, and what a merchant does) collides with the ghost it is replacing. And the empty string is
 * not NULL, so a store that does not use SKUs gets exactly one blank-SKU variant and cannot save a
 * three-colour tee. Both belong to the step that adds the variant editor, which can choose the SKU
 * semantics — a nullable column for "unset", or a partial index — with a merchant-facing duplicate
 * report behind it.
 */
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants (store_id, sku);
-- Also not UNIQUE, and for the same reason: it would only be safe if migration 026's per-store
-- uniqueness on `products.shipstation_product_id` definitely ran on the database being migrated,
-- which this file has no way to confirm.
CREATE INDEX IF NOT EXISTS idx_product_variants_shipstation
  ON public.product_variants (store_id, shipstation_product_id)
  WHERE shipstation_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_variant_option_values_value
  ON public.variant_option_values (store_id, value_id);

-- Invariant 2's maintenance: the canonical option key --------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_variant_option_key(p_variant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  /*
   * Ordered by option id rather than by option position, so the key is stable when a merchant
   * reorders their option axes. Reordering "Size, Colour" to "Colour, Size" must not make every
   * existing variant look like a new combination and collide with itself.
   */
  UPDATE public.product_variants v
     SET option_key = COALESCE((
           SELECT string_agg(vov.option_id::text || ':' || vov.value_id::text, '|' ORDER BY vov.option_id)
             FROM public.variant_option_values vov
            WHERE vov.variant_id = v.id
         ), ''),
         updated_at = NOW()
   WHERE v.id = p_variant_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_variant_option_key(UUID) IS
  'Recompute a variant''s canonical option_key from its option value rows.';

CREATE OR REPLACE FUNCTION public.trg_refresh_variant_option_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    /*
     * On a cascade delete the variant row is already gone; the UPDATE simply matches nothing.
     * Guarding on existence would be a second query for no benefit.
     */
    PERFORM public.refresh_variant_option_key(OLD.variant_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_variant_option_key(NEW.variant_id);
  IF TG_OP = 'UPDATE' AND NEW.variant_id <> OLD.variant_id THEN
    PERFORM public.refresh_variant_option_key(OLD.variant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variant_option_values_key ON public.variant_option_values;
CREATE TRIGGER trg_variant_option_values_key
  AFTER INSERT OR UPDATE OR DELETE ON public.variant_option_values
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_variant_option_key();

-- Backfill: one variant per existing product ------------------------------------------------------

INSERT INTO public.product_variants (
  store_id, product_id, title, position, option_key,
  sku, barcode, base_price, sale_price, cost_price,
  weight, weight_unit, requires_shipping, hs_code, country_of_origin,
  track_inventory, allow_backorder, low_stock_threshold, reorder_point,
  shipstation_product_id, is_active, created_at, updated_at
)
SELECT
  p.store_id, p.id, 'Default Title', 1, '',
  p.sku, p.barcode, p.base_price, p.sale_price, p.cost_price,
  p.weight, COALESCE(p.weight_unit, 'lb'), COALESCE(p.requires_shipping, TRUE),
  p.hs_code, p.country_of_origin,
  COALESCE(p.track_inventory, TRUE), COALESCE(p.allow_backorder, FALSE),
  p.low_stock_threshold, p.reorder_point,
  /*
   * `p.is_active`, not TRUE. Hardcoding it meant every draft and every archived product carried a
   * purchasable variant, waiting for step 2 to repoint reads at it — the exact class of divergence
   * the bridge triggers exist to prevent, in the one column the bridge had forgotten.
   */
  p.shipstation_product_id, COALESCE(p.is_active, FALSE),
  COALESCE(p.created_at, NOW()), NOW()
  FROM public.products p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.store_id = p.store_id
 );

-- The bridge: keep the implicit variant and its product in step until step 2 repoints the writes --

CREATE OR REPLACE FUNCTION public.create_default_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  /*
   * Every product gets its default variant the moment it is created, from any path — the admin
   * form, the CSV import, the ShipStation sync, a seed script, a psql session. That is what lets
   * invariant 1 hold without a single line of application code changing in this step.
   *
   * A caller that wants real options inserts them and their variants, then deletes this row. The
   * ">= 1 variant" check is deferred to commit precisely so that sequence is legal.
   */
  INSERT INTO public.product_variants (
    store_id, product_id, title, position, option_key,
    sku, barcode, base_price, sale_price, cost_price,
    weight, weight_unit, requires_shipping, hs_code, country_of_origin,
    track_inventory, allow_backorder, low_stock_threshold, reorder_point,
    shipstation_product_id, is_active
  ) VALUES (
    NEW.store_id, NEW.id, 'Default Title', 1, '',
    NEW.sku, NEW.barcode, NEW.base_price, NEW.sale_price, NEW.cost_price,
    NEW.weight, COALESCE(NEW.weight_unit, 'lb'), COALESCE(NEW.requires_shipping, TRUE),
    NEW.hs_code, NEW.country_of_origin,
    COALESCE(NEW.track_inventory, TRUE), COALESCE(NEW.allow_backorder, FALSE),
    NEW.low_stock_threshold, NEW.reorder_point,
    NEW.shipstation_product_id, COALESCE(NEW.is_active, FALSE)
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.create_default_variant() IS
  'Give every newly created product its implicit "Default Title" variant.';

DROP TRIGGER IF EXISTS trg_products_default_variant ON public.products;
CREATE TRIGGER trg_products_default_variant
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.create_default_variant();

CREATE OR REPLACE FUNCTION public.sync_default_variant_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  variant_count INTEGER;
BEGIN
  /*
   * Mirror the product's stock-keeping columns onto its variant, but *only* while the product has
   * exactly one variant and that variant carries no options. The moment a merchant adds real
   * options this becomes a no-op, and the variant rows become the truth — which is the state step 2
   * hands over to.
   *
   * Without this bridge, a price edit landing between this migration and step 2 would leave the
   * variant holding the old price, and step 2 would switch reads over to it silently.
   */
  SELECT COUNT(*) INTO variant_count
    FROM public.product_variants v
   WHERE v.product_id = NEW.id AND v.store_id = NEW.store_id;

  IF variant_count <> 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_variants v
     SET sku                    = NEW.sku,
         barcode                = NEW.barcode,
         base_price             = NEW.base_price,
         sale_price             = NEW.sale_price,
         cost_price             = NEW.cost_price,
         weight                 = NEW.weight,
         weight_unit            = COALESCE(NEW.weight_unit, 'lb'),
         requires_shipping      = COALESCE(NEW.requires_shipping, TRUE),
         hs_code                = NEW.hs_code,
         country_of_origin      = NEW.country_of_origin,
         track_inventory        = COALESCE(NEW.track_inventory, TRUE),
         allow_backorder        = COALESCE(NEW.allow_backorder, FALSE),
         low_stock_threshold    = NEW.low_stock_threshold,
         reorder_point          = NEW.reorder_point,
         shipstation_product_id = NEW.shipstation_product_id,
         is_active              = COALESCE(NEW.is_active, FALSE),
         updated_at             = NOW()
   WHERE v.product_id = NEW.id
     AND v.store_id = NEW.store_id
     AND v.option_key = '';

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_default_variant_from_product() IS
  'Bridge for step 1: mirror product columns onto its single optionless variant.';

DROP TRIGGER IF EXISTS trg_products_sync_default_variant ON public.products;
CREATE TRIGGER trg_products_sync_default_variant
  AFTER UPDATE OF sku, barcode, base_price, sale_price, cost_price, weight, weight_unit,
                  requires_shipping, hs_code, country_of_origin, track_inventory, allow_backorder,
                  low_stock_threshold, reorder_point, shipstation_product_id, is_active, status
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_default_variant_from_product();

-- Invariant 1: every product has at least one variant --------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_product_has_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_product UUID;
  target_store   UUID;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    target_product := NEW.id;
    target_store   := NEW.store_id;
  ELSE
    target_product := OLD.product_id;
    target_store   := OLD.store_id;
  END IF;

  /*
   * A product that no longer exists has nothing to assert about, and both triggers reach this state
   * legitimately.
   *
   * Deleting a product cascades its variants away — that is the merchant removing the product, not
   * removing its last variant. And because the check is deferred, the INSERT arm runs at commit,
   * long after a transaction that created a product and then deleted it again has done both. An
   * import that rolls a row back by hand, or an admin creating and immediately discarding a draft,
   * would otherwise fail at COMMIT with a message about an invariant neither had violated.
   */
  IF NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = target_product AND p.store_id = target_store
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_variants v
     WHERE v.product_id = target_product AND v.store_id = target_store
  ) THEN
    RAISE EXCEPTION 'Every product must have at least one variant (product %)', target_product
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.assert_product_has_variant() IS
  'Deferred check that a product never commits with zero variants.';

DROP TRIGGER IF EXISTS trg_products_variant_required ON public.products;
CREATE CONSTRAINT TRIGGER trg_products_variant_required
  AFTER INSERT ON public.products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_product_has_variant();

DROP TRIGGER IF EXISTS trg_variants_last_one ON public.product_variants;
CREATE CONSTRAINT TRIGGER trg_variants_last_one
  AFTER DELETE ON public.product_variants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_product_has_variant();

-- Prove the backfill, in the migration rather than in a comment -----------------------------------

DO $$
DECLARE
  orphans   INTEGER;
  mismatched INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphans
    FROM public.products p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.store_id = p.store_id
   );

  SELECT COUNT(*) INTO mismatched
    FROM public.products p
    JOIN public.product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
   WHERE v.option_key = ''
     AND (v.sku IS DISTINCT FROM p.sku OR v.base_price IS DISTINCT FROM p.base_price);

  IF orphans > 0 THEN
    RAISE EXCEPTION 'Variant backfill left % product(s) with no variant', orphans;
  END IF;
  IF mismatched > 0 THEN
    RAISE EXCEPTION 'Variant backfill left % variant(s) disagreeing with their product', mismatched;
  END IF;

  RAISE NOTICE 'Variant backfill verified: every product has a variant carrying its SKU and price.';
END;
$$;

COMMIT;
