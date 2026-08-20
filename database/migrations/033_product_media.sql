-- 033: A place for product images to actually live.
--
-- `ImageGalleryManager` has always accepted file uploads, and has never stored one. Its upload
-- handler ran `URL.createObjectURL(file)` — a `blob:` URL scoped to the browser tab that created
-- it — pushed that string into `gallery_images`, and showed a green "Images uploaded" toast. The
-- image rendered, so the merchant believed it. It was gone on reload, and the row in the database
-- pointed at a URL that had never resolved for anyone else and never would.
--
-- Bytes go in Postgres rather than an object store. That is a real trade-off and the reasoning is
-- worth recording, because the instinct is to reach for S3:
--
--   * Catalogue images are small and few. A product has under ten, each a few hundred KB. A large
--     store is a few hundred MB — a size Postgres is entirely comfortable with, stored out of line
--     in TOAST so it never bloats a `SELECT` that does not ask for `bytes`.
--   * `DATABASE_URL` is the only variable in this platform with no working fallback. Every other
--     integration degrades to a labelled "not configured" state. Putting media behind a second
--     mandatory credential would make image upload the second thing that cannot degrade, on a
--     screen where "not configured" is indistinguishable from the lie we are removing.
--   * It is testable here. A bucket we cannot reach from a session container is a backend nobody
--     can verify, and this file exists because a feature nobody verified shipped for a year.
--
-- Content is addressed by its SHA-256, so the same file uploaded twice is stored once and its URL
-- is genuinely immutable — which is what lets the serving route set a one-year cache header
-- honestly rather than optimistically.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  -- SHA-256 of the bytes, hex. Uploading the same image twice returns the first row.
  checksum      CHAR(64) NOT NULL,

  content_type  VARCHAR(64) NOT NULL,
  byte_size     INTEGER NOT NULL CHECK (byte_size > 0),

  -- Read from the file's own header at upload, so the storefront can reserve the right box before
  -- the image arrives instead of reflowing the page around it.
  width         INTEGER CHECK (width > 0),
  height        INTEGER CHECK (height > 0),

  -- The name the merchant's file had. Shown when picking from the library; never used as a path.
  filename      VARCHAR(255),

  -- Alt text lives with the image rather than with the product that happens to use it, so it is
  -- written once and follows the image everywhere.
  alt_text      VARCHAR(500),

  bytes         BYTEA NOT NULL,

  uploaded_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per distinct file per store. Scoped to the store deliberately: deduplicating across
-- tenants would mean one merchant's delete could remove another's image, and would leak the fact
-- that two stores hold the same file.
CREATE UNIQUE INDEX IF NOT EXISTS product_media_store_checksum_key
  ON public.product_media (store_id, checksum);

CREATE INDEX IF NOT EXISTS product_media_store_created_idx
  ON public.product_media (store_id, created_at DESC);

-- Only the formats a browser renders as an image without argument. SVG is deliberately absent:
-- it is a document that can carry script, and serving one from the platform's own origin would
-- hand any merchant an XSS against their own admin. The upload route also checks the magic bytes,
-- because a content-type header is a claim by the uploader.
ALTER TABLE public.product_media
  DROP CONSTRAINT IF EXISTS product_media_content_type_check;
ALTER TABLE public.product_media
  ADD CONSTRAINT product_media_content_type_check
  CHECK (content_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp'));

COMMENT ON TABLE public.product_media IS
  'Uploaded product images, content-addressed by SHA-256 and scoped to one store.';
COMMENT ON COLUMN public.product_media.bytes IS
  'The image itself. TOAST keeps it out of line, so queries that do not select it do not read it.';

INSERT INTO public.schema_migrations (version, description)
VALUES ('033', 'Product media: somewhere for uploaded images to actually live')
ON CONFLICT (version) DO NOTHING;

COMMIT;
