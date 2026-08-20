-- Migration 026: make cross-tenant references impossible at the schema level.
--
-- Two defects, both of which let one merchant's data reach another's storefront.
--
-- `products.category_id` referenced `categories(id)` with no store predicate, so an admin request
-- carrying another tenant's category uuid attached it successfully. The storefront's product query
-- then joined `categories c ON c.id = p.category_id` — also unscoped — and rendered the other
-- merchant's category name in the breadcrumb, the page title and the JSON-LD. A validation check in
-- the route would fix today's path; a composite foreign key fixes every path, including the ones
-- not written yet. That is the difference worth paying a migration for.
--
-- `products.shipstation_product_id` was globally UNIQUE. Two merchants whose ShipStation accounts
-- emit the same product id could not both import it: the second merchant's row hit the constraint,
-- the sync's `ON CONFLICT ... WHERE store_id = $1` guard correctly declined to steal the row, and
-- the product was skipped with no error and no count. The merchant saw a successful sync with a
-- product missing from it. Uniqueness is per store, because the identifier is per ShipStation
-- account, which is per store.

BEGIN;

-- Composite keys the child tables can point at ------------------------------------------------

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_id_store_id_key;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_id_store_id_key UNIQUE (id, store_id);

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_id_store_id_key;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_id_store_id_key UNIQUE (id, store_id);

-- Sever any cross-tenant links that already exist, so the new constraints can be created.
-- Nulling is the only safe repair: the reference was never legitimate, and guessing which
-- same-named category in the correct store was "meant" would invent data.
UPDATE public.products p
   SET category_id = NULL
 WHERE p.category_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.categories c
      WHERE c.id = p.category_id AND c.store_id = p.store_id
   );

UPDATE public.products p
   SET supplier_id = NULL
 WHERE p.supplier_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.suppliers s
      WHERE s.id = p.supplier_id AND s.store_id = p.store_id
   );

-- Categories nest. A child in another tenant's tree is the same defect one level up.
UPDATE public.categories c
   SET parent_id = NULL
 WHERE c.parent_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.categories p
      WHERE p.id = c.parent_id AND p.store_id = c.store_id
   );

-- Store-scoped foreign keys -------------------------------------------------------------------

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_store_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_store_fkey
  FOREIGN KEY (category_id, store_id)
  REFERENCES public.categories (id, store_id)
  ON DELETE SET NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_supplier_id_fkey;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_supplier_store_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_supplier_store_fkey
  FOREIGN KEY (supplier_id, store_id)
  REFERENCES public.suppliers (id, store_id)
  ON DELETE SET NULL;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_parent_store_fkey;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_parent_store_fkey
  FOREIGN KEY (parent_id, store_id)
  REFERENCES public.categories (id, store_id)
  ON DELETE SET NULL;

-- Per-store ShipStation identity ----------------------------------------------------------------

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_shipstation_product_id_key;

-- A partial unique index rather than a constraint: many products legitimately have no ShipStation
-- id (anything the merchant created here), and NULLs in a plain UNIQUE would be permitted anyway —
-- being explicit documents the intent and keeps the index small.
DROP INDEX IF EXISTS idx_products_store_shipstation_id;
CREATE UNIQUE INDEX idx_products_store_shipstation_id
  ON public.products (store_id, shipstation_product_id)
  WHERE shipstation_product_id IS NOT NULL;

-- Value constraints ----------------------------------------------------------------------------
--
-- Prices that the application already believes are true, now enforced where they cannot be
-- bypassed by a route that forgot to check.

-- Repair rows that would fail the checks before adding them.
UPDATE public.products SET base_price = 0 WHERE base_price < 0;
UPDATE public.products SET cost_price = NULL WHERE cost_price < 0;
UPDATE public.products SET sale_price = NULL WHERE sale_price IS NOT NULL AND sale_price > base_price;
UPDATE public.products SET stock_quantity = 0 WHERE stock_quantity IS NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_base_price_non_negative;
ALTER TABLE public.products
  ADD CONSTRAINT products_base_price_non_negative CHECK (base_price >= 0);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cost_price_non_negative;
ALTER TABLE public.products
  ADD CONSTRAINT products_cost_price_non_negative CHECK (cost_price IS NULL OR cost_price >= 0);

-- A "sale" price above the regular price is a mispriced product, not a promotion. Equality is
-- allowed: merchants do set them equal while staging a sale that has not started.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sale_price_not_above_base;
ALTER TABLE public.products
  ADD CONSTRAINT products_sale_price_not_above_base
  CHECK (sale_price IS NULL OR sale_price <= base_price);

INSERT INTO public.schema_migrations (version, description)
VALUES ('026', 'Store-scoped foreign keys, per-store ShipStation product identity, price constraints')
ON CONFLICT (version) DO NOTHING;

COMMIT;
