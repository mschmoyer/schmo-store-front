-- Migration 025: Custom storefront pages and merchant-authored navigation
--
-- Two gaps that every vertical hit, found by walking real merchant scenarios
-- through the builder:
--
--   1. A store could compose exactly one page -- its home page. There was no
--      About, no Shipping & Returns, no Size Guide, no Contact, no lookbook and
--      no landing page. `storefront_themes.sections` is a single ordered list
--      and the only route that renders it is `/store/[storeSlug]`. Policy pages
--      are not a nicety: a shop that cannot state its returns policy cannot
--      legally trade in most of its markets, and Stripe asks for the URL.
--
--   2. Navigation was hardcoded. `StoreHeader.buildNav` returned "Shop all"
--      plus the first four categories by `sort_order`, so a merchant could not
--      add a link, rename one, reorder them, or point the header at a page they
--      had just written. The footer did the same thing separately.
--
-- Both are modelled the same way the theme already is, because that model is
-- good: one row per (store, status), draft and published coexisting, so a
-- merchant edits without breaking the live shop and publishes atomically.
--
-- Navigation rides on `storefront_themes` rather than getting its own table.
-- It is small, there is exactly one per store, and it must publish in the same
-- transaction as the sections that link to it -- publishing a nav that points
-- at an unpublished page is precisely the inconsistency a separate table would
-- have allowed.
--
-- Idempotent: safe to run repeatedly. Existing rows are never overwritten.

BEGIN;

-- ---------------------------------------------------------------------------
-- Navigation, alongside the theme it publishes with.
-- ---------------------------------------------------------------------------

ALTER TABLE public.storefront_themes
    ADD COLUMN IF NOT EXISTS navigation JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'storefront_themes_navigation_object_check'
    ) THEN
        ALTER TABLE public.storefront_themes
            ADD CONSTRAINT storefront_themes_navigation_object_check
            CHECK (jsonb_typeof(navigation) = 'object');
    END IF;
END
$$;

COMMENT ON COLUMN public.storefront_themes.navigation IS
    'StoreNavigation (src/lib/storefront-theme/navigation.ts): header and footer menus. Empty object means "derive the default menu from categories", which is what every store did before this column existed.';

-- ---------------------------------------------------------------------------
-- Custom pages.
--
-- A page is a title, a slug and an ordered Section[] -- the same section list
-- the home page uses, rendered through the same registry. That is the whole
-- point: adding pages needed no new rendering primitives, only a route and a
-- place to keep the list.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    slug          VARCHAR(160) NOT NULL,
    status        VARCHAR(16) NOT NULL,
    title         VARCHAR(200) NOT NULL,
    sections      JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo           JSONB NOT NULL DEFAULT '{}'::jsonb,
    version       INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at  TIMESTAMPTZ,
    CONSTRAINT store_pages_status_check CHECK (status IN ('draft', 'published')),
    CONSTRAINT store_pages_sections_array_check CHECK (jsonb_typeof(sections) = 'array'),
    CONSTRAINT store_pages_seo_object_check CHECK (jsonb_typeof(seo) = 'object'),
    -- Slugs are lowercase, URL-safe and never collide with a first-class store
    -- route. The application enforces the reserved-word list; this enforces the
    -- character set, which is the half that must hold even against a bad writer.
    CONSTRAINT store_pages_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT store_pages_store_slug_status_key UNIQUE (store_id, slug, status)
);

CREATE INDEX IF NOT EXISTS idx_store_pages_store_id
    ON public.store_pages (store_id);

-- The storefront's read path: every published page for one store, and the
-- lookup of a single published page by slug.
CREATE INDEX IF NOT EXISTS idx_store_pages_published
    ON public.store_pages (store_id, slug)
    WHERE status = 'published';

COMMENT ON TABLE public.store_pages IS
    'Merchant-authored storefront pages. One draft row and one published row per (store, slug), mirroring storefront_themes.';
COMMENT ON COLUMN public.store_pages.sections IS
    'Ordered Section[] (src/lib/storefront-theme/types.ts), rendered through the same registry as the home page. Unknown types are dropped at render time.';
COMMENT ON COLUMN public.store_pages.seo IS
    'PageSeo: optional metaTitle / metaDescription / noindex overrides.';
COMMENT ON COLUMN public.store_pages.version IS
    'Monotonic revision counter, bumped on every write.';

DROP TRIGGER IF EXISTS trg_store_pages_updated_at ON public.store_pages;
CREATE TRIGGER trg_store_pages_updated_at
    BEFORE UPDATE ON public.store_pages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.schema_migrations (version, description)
VALUES ('025', 'Custom storefront pages and merchant-authored header/footer navigation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
