-- Migration 019: Storefront themes
--
-- Introduces the persistence layer for the storefront theme engine
-- (docs/storefront-theme-spec.md section 9).
--
-- One row per (store, status). Draft and published coexist so a merchant can
-- edit their shop without breaking the live one, then publish atomically.
--
-- This migration also carries every existing store forward: the legacy
-- `stores.theme_name` swatch is mapped onto a modern preset plus the accent
-- colour that made the old palette recognisable, and `stores.custom_css` is
-- carried into `theme -> 'custom' -> 'css'` (the engine sanitises it at render
-- time). Every existing store therefore keeps working and immediately has a
-- good-looking, fully-featured home page.
--
-- Idempotent: safe to run repeatedly. Existing rows are never overwritten, so
-- re-running cannot clobber a merchant's work.

BEGIN;

CREATE TABLE IF NOT EXISTS public.storefront_themes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    theme         JSONB NOT NULL DEFAULT '{}'::jsonb,
    sections      JSONB NOT NULL DEFAULT '[]'::jsonb,
    status        VARCHAR(16) NOT NULL,
    version       INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at  TIMESTAMPTZ,
    CONSTRAINT storefront_themes_status_check CHECK (status IN ('draft', 'published')),
    CONSTRAINT storefront_themes_theme_object_check CHECK (jsonb_typeof(theme) = 'object'),
    CONSTRAINT storefront_themes_sections_array_check CHECK (jsonb_typeof(sections) = 'array'),
    CONSTRAINT storefront_themes_store_status_key UNIQUE (store_id, status)
);

CREATE INDEX IF NOT EXISTS idx_storefront_themes_store_id
    ON public.storefront_themes (store_id);

CREATE INDEX IF NOT EXISTS idx_storefront_themes_published
    ON public.storefront_themes (store_id)
    WHERE status = 'published';

COMMENT ON TABLE public.storefront_themes IS
    'Per-store storefront theme and home-page section list. One draft row and one published row per store.';
COMMENT ON COLUMN public.storefront_themes.theme IS
    'Partial StorefrontTheme (src/lib/storefront-theme/types.ts). Deep-merged over a preset over the engine defaults.';
COMMENT ON COLUMN public.storefront_themes.sections IS
    'Ordered Section[] for the store home page. Unknown types are dropped at render time.';
COMMENT ON COLUMN public.storefront_themes.version IS
    'Monotonic revision counter, bumped on every write. Not the theme schema version.';

-- Keep updated_at honest even for writers that forget to set it.
DROP TRIGGER IF EXISTS trg_storefront_themes_updated_at ON public.storefront_themes;
CREATE TRIGGER trg_storefront_themes_updated_at
    BEFORE UPDATE ON public.storefront_themes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Backfill: map legacy stores.theme_name onto the new model.
--
-- Mirrors LEGACY_THEME_MAP in src/lib/storefront-theme/presets.ts. Keep the two
-- in sync; the unit test `presets.test.ts` asserts the TypeScript side.
--
-- This is a function rather than an inline DO block so it can be re-run at any
-- time -- after a seed, after a store import, or by hand -- and still be a
-- no-op for stores that already have rows. It returns the number of stores it
-- touched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backfill_storefront_themes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $migrate$
DECLARE
    store_row      RECORD;
    touched        INTEGER := 0;
    mapped_preset  TEXT;
    mapped_color   TEXT;
    mapped_scheme  TEXT;
    theme_json     JSONB;
    brand_json     JSONB;
    default_sections CONSTANT JSONB := '[
      {
        "id": "hero-1",
        "type": "hero",
        "enabled": true,
        "settings": {
          "eyebrow": "New arrivals",
          "heading": "Everything in stock. Shipped today.",
          "subheading": "Live inventory straight from our warehouse, so what you see is genuinely on the shelf.",
          "primaryLabel": "Shop all products",
          "primaryHref": "/products",
          "layout": "split",
          "height": "medium"
        }
      },
      {
        "id": "value-props-1",
        "type": "value-props",
        "enabled": true,
        "settings": { "style": "bar" }
      },
      {
        "id": "featured-collection-1",
        "type": "featured-collection",
        "enabled": true,
        "settings": {
          "heading": "Best sellers",
          "subheading": "What people are actually buying this month.",
          "limit": 8,
          "columns": 4
        }
      },
      {
        "id": "image-with-text-1",
        "type": "image-with-text",
        "enabled": true,
        "settings": {
          "heading": "Run by people who pack the boxes",
          "body": "We built this shop on top of our own warehouse. Stock counts are real, shipping estimates are real, and the person answering your email has held the product.",
          "imageSide": "left"
        }
      },
      {
        "id": "collection-grid-1",
        "type": "collection-grid",
        "enabled": true,
        "settings": { "heading": "Shop by category", "limit": 6, "columns": 3 }
      },
      { "id": "testimonials-1", "type": "testimonials", "enabled": true, "settings": {} },
      { "id": "newsletter-1", "type": "newsletter", "enabled": true, "settings": {} }
    ]'::jsonb;
BEGIN
    FOR store_row IN
        SELECT s.id, s.theme_name, s.custom_css
          FROM public.stores s
         WHERE NOT EXISTS (
                   SELECT 1 FROM public.storefront_themes t
                    WHERE t.store_id = s.id AND t.status = 'published'
               )
            OR NOT EXISTS (
                   SELECT 1 FROM public.storefront_themes t
                    WHERE t.store_id = s.id AND t.status = 'draft'
               )
    LOOP
        mapped_scheme := NULL;

        CASE COALESCE(store_row.theme_name, 'default')
            WHEN 'ocean'   THEN mapped_preset := 'depot';   mapped_color := '#2563eb';
            WHEN 'sunset'  THEN mapped_preset := 'fresh';   mapped_color := '#e2620f';
            WHEN 'purple'  THEN mapped_preset := 'bloom';   mapped_color := '#7c3aed';
            WHEN 'dark'    THEN mapped_preset := 'voltage'; mapped_color := '#22c55e'; mapped_scheme := 'dark';
            WHEN 'rose'    THEN mapped_preset := 'bloom';   mapped_color := '#e11d48';
            WHEN 'teal'    THEN mapped_preset := 'fresh';   mapped_color := '#0d9488';
            WHEN 'amber'   THEN mapped_preset := 'studio';  mapped_color := '#c07908';
            WHEN 'slate'   THEN mapped_preset := 'depot';   mapped_color := '#475569';
            WHEN 'crimson' THEN mapped_preset := 'marquee'; mapped_color := '#c62222';
            ELSE                mapped_preset := 'fresh';   mapped_color := '#1aa35c';
        END CASE;

        brand_json := jsonb_build_object('color', mapped_color);
        IF mapped_scheme IS NOT NULL THEN
            brand_json := brand_json || jsonb_build_object('scheme', mapped_scheme);
        END IF;

        theme_json := jsonb_build_object(
            'version', 1,
            'preset',  mapped_preset,
            'brand',   brand_json
        );

        -- Carry legacy per-store CSS forward. It is sanitised on every render,
        -- so importing it is safe; dropping it would silently break shops.
        IF store_row.custom_css IS NOT NULL AND length(btrim(store_row.custom_css)) > 0 THEN
            theme_json := theme_json || jsonb_build_object(
                'custom', jsonb_build_object('css', left(store_row.custom_css, 20000))
            );
        END IF;

        INSERT INTO public.storefront_themes (store_id, status, theme, sections, version, published_at)
        VALUES (store_row.id, 'published', theme_json, default_sections, 1, NOW())
        ON CONFLICT (store_id, status) DO NOTHING;

        INSERT INTO public.storefront_themes (store_id, status, theme, sections, version)
        VALUES (store_row.id, 'draft', theme_json, default_sections, 1)
        ON CONFLICT (store_id, status) DO NOTHING;

        touched := touched + 1;
    END LOOP;

    RETURN touched;
END
$migrate$;

COMMENT ON FUNCTION public.backfill_storefront_themes() IS
    'Gives every store without one a draft and published storefront theme, derived from its legacy stores.theme_name. Idempotent.';

SELECT public.backfill_storefront_themes();

INSERT INTO public.schema_migrations (version, description)
VALUES ('019', 'Storefront themes - per-store draft/published theme and section rows, legacy theme_name migrated')
ON CONFLICT (version) DO NOTHING;

COMMIT;
