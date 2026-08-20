-- Migration 032: stop the hourly sync from deleting the merchant's work.
--
-- `syncProductsPage` upserts with `DO UPDATE SET name, short_description, base_price,
-- featured_image_url, is_active, category_id`. Every one of those columns is also editable in the
-- admin. So a merchant who spends an afternoon writing product copy, pricing it and choosing what
-- to publish loses all of it at the top of the next hour, silently, with no record that it
-- happened and no way to tell why.
--
-- ShipStation is a fulfilment system. It knows a SKU, a name for a packing slip, a customs value
-- and a thumbnail. It has no opinion about how a product is *merchandised*, and treating its
-- answer as authoritative for merchandising fields is the mistake. But "never sync anything" is
-- equally wrong: on the first import those fields are all a merchant has, and a warehouse that
-- corrects a product's name should be able to reach a store that has not overridden it.
--
-- `field_locks` resolves both. A field a merchant has edited is locked, and the sync leaves it
-- alone; a field they have not touched still tracks upstream. The admin shows the lock, so
-- ownership is visible rather than something to be discovered when work disappears.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS field_locks TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.products.field_locks IS
  'Column names the merchant has edited. The ShipStation sync will not overwrite these. Written by the admin API, read by the sync.';

-- GIN so the sync's `= ANY(field_locks)` checks and the "which products are overridden" view stay
-- cheap once a catalogue has thousands of rows.
CREATE INDEX IF NOT EXISTS idx_products_field_locks
  ON public.products USING GIN (field_locks);

/*
 * Lock a field, idempotently.
 *
 * A function rather than inline SQL because both the admin API and the bulk endpoints need it, and
 * because getting the array union subtly wrong — appending a duplicate every save until the array
 * has four hundred copies of `name` — is the obvious failure mode.
 */
CREATE OR REPLACE FUNCTION public.lock_product_fields(
  p_store_id UUID,
  p_product_id UUID,
  p_fields TEXT[]
) RETURNS TEXT[] AS $$
DECLARE
  v_locks TEXT[];
BEGIN
  UPDATE public.products
     SET field_locks = ARRAY(SELECT DISTINCT unnest(field_locks || p_fields))
   WHERE id = p_product_id AND store_id = p_store_id
   RETURNING field_locks INTO v_locks;

  RETURN COALESCE(v_locks, '{}');
END;
$$ LANGUAGE plpgsql;

/*
 * Release a field back to ShipStation's control.
 *
 * The other half of making ownership visible: a merchant who overrode a description by accident,
 * or who wants the warehouse's name back, needs one click rather than a support ticket. The next
 * sync restores the upstream value.
 */
CREATE OR REPLACE FUNCTION public.unlock_product_fields(
  p_store_id UUID,
  p_product_id UUID,
  p_fields TEXT[]
) RETURNS TEXT[] AS $$
DECLARE
  v_locks TEXT[];
BEGIN
  UPDATE public.products
     SET field_locks = ARRAY(SELECT f FROM unnest(field_locks) f WHERE NOT (f = ANY(p_fields)))
   WHERE id = p_product_id AND store_id = p_store_id
   RETURNING field_locks INTO v_locks;

  RETURN COALESCE(v_locks, '{}');
END;
$$ LANGUAGE plpgsql;

-- Backfill --------------------------------------------------------------------------------------
--
-- Products already diverging from what a bare import would have produced were edited by someone.
-- Locking those now is the difference between this migration protecting existing work and
-- protecting only work done after it.
--
-- The test has to be conservative: there is no record of what ShipStation last sent, so the only
-- evidence available is a value that an import could not have created. A description ShipStation
-- has no field for, a sale price it cannot express, an SEO field, a gallery — each of those is
-- unambiguously a merchant's.

UPDATE public.products
   SET field_locks = ARRAY(SELECT DISTINCT unnest(field_locks || locked))
  FROM (
    SELECT id,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN NULLIF(TRIM(COALESCE(long_description, '')), '') IS NOT NULL
                  THEN 'long_description' END,
             CASE WHEN NULLIF(TRIM(COALESCE(description_html, '')), '') IS NOT NULL
                  THEN 'description_html' END,
             CASE WHEN sale_price IS NOT NULL THEN 'sale_price' END,
             CASE WHEN cost_price IS NOT NULL THEN 'cost_price' END,
             CASE WHEN override_price IS NOT NULL THEN 'override_price' END,
             CASE WHEN NULLIF(TRIM(COALESCE(meta_title, '')), '') IS NOT NULL THEN 'meta_title' END,
             CASE WHEN NULLIF(TRIM(COALESCE(meta_description, '')), '') IS NOT NULL
                  THEN 'meta_description' END,
             CASE WHEN gallery_images IS NOT NULL AND array_length(gallery_images, 1) > 0
                  THEN 'gallery_images' END,
             CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 'tags' END,
             CASE WHEN NULLIF(TRIM(COALESCE(vendor, '')), '') IS NOT NULL THEN 'vendor' END,
             -- A product deliberately taken off sale must not be republished by the next sync.
             CASE WHEN status <> 'active' THEN 'status' END
           ], NULL) AS locked
      FROM public.products
  ) evidence
 WHERE public.products.id = evidence.id
   AND array_length(evidence.locked, 1) > 0;

INSERT INTO public.schema_migrations (version, description)
VALUES ('032', 'Per-field ownership between ShipStation and the merchant, so the sync stops reverting edits')
ON CONFLICT (version) DO NOTHING;

COMMIT;
