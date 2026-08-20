-- 028 — a media library, and image columns wide enough for real URLs
--
-- Every image field on the platform was a URL text box, and two of them widened
-- a merchant's own catalogue into a trap: featured_image_url, logo_url and
-- favicon_url are VARCHAR(500), so a data: URI or a long signed CDN URL failed
-- the whole write with a raw Postgres "value too long" error leaked to the
-- client. This widens the image columns to TEXT and adds a store_media table for
-- uploaded assets, so a merchant can put their own photographs on their shop
-- instead of only pasting URLs to images they already host somewhere.
--
-- Re-runnable: IF NOT EXISTS on the table and index, and ALTER TYPE TEXT is a
-- no-op once applied.

ALTER TABLE public.products      ALTER COLUMN featured_image_url TYPE TEXT;
ALTER TABLE public.stores        ALTER COLUMN logo_url           TYPE TEXT;
ALTER TABLE public.stores        ALTER COLUMN favicon_url        TYPE TEXT;

-- product_variants.image_url is VARCHAR(500) too (migration 026).
ALTER TABLE public.product_variants ALTER COLUMN image_url TYPE TEXT;

CREATE TABLE IF NOT EXISTS public.store_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,
  url          TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type VARCHAR(64) NOT NULL,
  bytes        BIGINT NOT NULL,
  alt          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A store's library, newest first, is the common read.
CREATE INDEX IF NOT EXISTS idx_store_media_store
  ON public.store_media (store_id, created_at DESC);

-- One row per stored object within a store.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_media_store_key
  ON public.store_media (store_id, storage_key);
