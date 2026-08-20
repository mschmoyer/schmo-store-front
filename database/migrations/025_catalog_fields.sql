-- Migration 025: catalogue fields the storefront and admin need but ShipStation does not carry.
--
-- ShipStation V2 is the source of truth for identity and logistics — SKU, name, weight, dimensions,
-- customs data, warehouse stock. It has no opinion about how a product is *merchandised*: it does
-- not know what brand it belongs to, whether it is a draft, or whether the listing is good enough
-- to publish. Those fields have to live here, and they have to survive a sync that overwrites the
-- ShipStation-owned ones. See `src/lib/shipstation/CLAUDE.md` for the ownership matrix.
--
-- The one computed column, `completeness_score`, exists so the admin can sort and filter by "which
-- listings are unfinished" without a correlated subquery per row. A merchant who has just imported
-- 800 SKUs from ShipStation has 800 rows with no image, no description and no category; the single
-- most valuable thing the catalogue page can do is rank them by how much work is left.

BEGIN;

-- Merchandising -------------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor VARCHAR(255),
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(255);

COMMENT ON COLUMN public.products.vendor IS
  'Brand or manufacturer. Local-only: ShipStation V2 has no vendor concept on a product.';
COMMENT ON COLUMN public.products.product_type IS
  'Merchant-defined product type used for grouping and smart collections. Local-only.';

-- Lifecycle -----------------------------------------------------------------------------------
--
-- `is_active` is a two-state flag, and two states are not enough. A product that has never been
-- published and a product that was deliberately retired are both `is_active = false`, so the
-- catalogue cannot distinguish "unfinished draft" from "discontinued last season" — and retiring a
-- seasonal product looks identical to a half-finished import. `status` is the real lifecycle;
-- `is_active` is kept in lockstep by a trigger below so that every existing storefront query
-- (`WHERE is_active = true`) keeps working unchanged.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
    CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
  END IF;
END$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status product_status,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  -- Scheduled publishing: a product with a future `publish_at` goes live when the cron sweeps it.
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

-- Backfill from the flag that has been carrying this meaning until now.
UPDATE public.products
   SET status = CASE WHEN is_active THEN 'active'::product_status ELSE 'draft'::product_status END
 WHERE status IS NULL;

ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'draft'::product_status;
ALTER TABLE public.products ALTER COLUMN status SET NOT NULL;

/*
 * Keep `is_active` and `status` consistent no matter which one a writer sets.
 *
 * Both directions matter. New code sets `status`; a good deal of existing code (the storefront
 * queries, the bulk list/unlist action, the sync) sets `is_active`. Without this trigger the two
 * drift apart and the storefront starts disagreeing with the admin about what is published — the
 * exact class of bug this codebase has shipped before with sales figures.
 */
CREATE OR REPLACE FUNCTION public.sync_product_status_flags()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert, whichever the caller supplied non-default wins; status is authoritative on a tie.
    IF NEW.status IS NULL THEN
      NEW.status := CASE WHEN COALESCE(NEW.is_active, false) THEN 'active' ELSE 'draft' END;
    END IF;
    NEW.is_active := (NEW.status = 'active');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- status changed: it wins.
    NEW.is_active := (NEW.status = 'active');
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    -- only the legacy flag changed: derive status, but never clobber an explicit archive.
    IF NEW.is_active THEN
      NEW.status := 'active';
    ELSIF OLD.status <> 'archived' THEN
      NEW.status := 'draft';
    END IF;
  END IF;

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := NOW();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_status_flags ON public.products;
CREATE TRIGGER trg_sync_product_status_flags
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_status_flags();

-- Inventory policy ----------------------------------------------------------------------------

ALTER TABLE public.products
  -- Where restocking decisions come from. `reorder_point` overrides `low_stock_threshold` for
  -- planning; the threshold stays the display/alerting trigger.
  ADD COLUMN IF NOT EXISTS reorder_point INTEGER,
  ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS safety_stock INTEGER,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- Country of origin completes the customs triple with hs_code and weight.
  ADD COLUMN IF NOT EXISTS country_of_origin CHAR(2);

COMMENT ON COLUMN public.products.reorder_point IS
  'Stock level at which a purchase order should be raised. NULL falls back to low_stock_threshold.';
COMMENT ON COLUMN public.products.lead_time_days IS
  'Supplier lead time used by reorder-point maths. NULL falls back to the supplier default.';

-- Catalogue completeness ----------------------------------------------------------------------
--
-- Eight equally-weighted checks, expressed as a stored generated column so the value is maintained
-- by Postgres on write and is indexable. Anything referenced here must be immutable per-row —
-- no NOW(), no subqueries — which is why "has been ordered" and similar are not part of the score.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS completeness_score SMALLINT
  GENERATED ALWAYS AS (
    (CASE WHEN COALESCE(NULLIF(TRIM(featured_image_url), ''), NULL) IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN COALESCE(NULLIF(TRIM(long_description), ''),
                        NULLIF(TRIM(short_description), '')) IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN base_price IS NOT NULL AND base_price > 0 THEN 1 ELSE 0 END)
  + (CASE WHEN cost_price IS NOT NULL AND cost_price > 0 THEN 1 ELSE 0 END)
  + (CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN weight IS NOT NULL AND weight > 0 THEN 1 ELSE 0 END)
  + (CASE WHEN COALESCE(NULLIF(TRIM(meta_title), ''),
                        NULLIF(TRIM(meta_description), '')) IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 ELSE 0 END)
  ) STORED;

COMMENT ON COLUMN public.products.completeness_score IS
  'How many of the eight listing-quality checks this product passes (0-8). Generated; do not write.';

-- Slug history --------------------------------------------------------------------------------
--
-- Renaming a product changes its slug, and every link and search result pointing at the old one
-- 404s. Keeping the history lets the storefront answer with a 301 instead of losing the traffic.

CREATE TABLE IF NOT EXISTS public.product_slug_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_slug_history_product
  ON public.product_slug_history (product_id);

-- Indexes -------------------------------------------------------------------------------------
--
-- The catalogue page's default view is "this store, newest first"; its saved views filter on
-- status and stock. Each index below backs a view the admin actually offers.

CREATE INDEX IF NOT EXISTS idx_products_store_status
  ON public.products (store_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_store_updated
  ON public.products (store_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_store_completeness
  ON public.products (store_id, completeness_score);

CREATE INDEX IF NOT EXISTS idx_products_store_vendor
  ON public.products (store_id, vendor) WHERE vendor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_store_type
  ON public.products (store_id, product_type) WHERE product_type IS NOT NULL;

-- Tag filtering is array-overlap (`tags && ARRAY[...]`), which only a GIN index can serve.
CREATE INDEX IF NOT EXISTS idx_products_tags_gin
  ON public.products USING GIN (tags);

-- Admin search is a substring match on identifiers and name. Trigram indexes are what make
-- `ILIKE '%partial-sku%'` fast; without them every keystroke is a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON public.products USING GIN (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN (name gin_trgm_ops);

-- Stock views: "low stock" and "out of stock" are the two most-clicked filters on the page.
CREATE INDEX IF NOT EXISTS idx_products_store_stock
  ON public.products (store_id, stock_quantity) WHERE track_inventory = true;

-- Scheduled publishing sweep looks only at rows waiting to go live.
CREATE INDEX IF NOT EXISTS idx_products_publish_at
  ON public.products (publish_at) WHERE publish_at IS NOT NULL AND status = 'draft';

INSERT INTO public.schema_migrations (version, description)
VALUES ('025', 'Catalogue merchandising fields, product lifecycle status, completeness score, slug history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
