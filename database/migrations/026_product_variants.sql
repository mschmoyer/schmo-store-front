-- Migration 026: Product options and variants
--
-- The single most-cited gap in the adversarial merchant review: five of six
-- merchant reviewers were blocked by it, and two named it "the one thing"
-- independently. An apparel shop's 140 SKUs are ~2,100 size/colour
-- combinations; a coffee roaster's one bag is grind x size; a jeweller's one
-- ring is six sizes in three metals. Without variants each of those becomes a
-- separate top-level product with its own slug and its own tile in the grid,
-- so one overshirt appears in the catalogue fifteen times.
--
-- Shape, and why:
--
--   * **Three option axes, in flat `option1..3` columns.** This is the Shopify
--     model and it is the right trade. An EAV table would be more general and
--     would turn every variant lookup into a join-and-pivot; three columns are
--     indexable, and the fourth axis essentially does not occur in retail.
--     `product_options` carries the axis names and their ordered values, so
--     the storefront can render selectors without reading every variant row.
--
--   * **`price` is NULLable and NULL means "inherit the product".** A merchant
--     with one price across ten sizes sets it once. Copying the product price
--     into every variant would make a price change a ten-row update that any
--     failure could leave half-applied, and would silently stop inheriting the
--     day someone edited the product.
--
--   * **`NULLS NOT DISTINCT` on the option combination.** Postgres treats NULLs
--     as distinct in a unique index by default, so a product with one option
--     axis (option2 and option3 NULL) could otherwise hold unlimited duplicate
--     rows for the same size. PG15+ only, and this deployment is 16.
--
--   * **`order_items` gets `variant_id` plus a denormalised title.** The id is
--     the join for fulfilment; the title is what an order confirmation from
--     three years ago must still be able to say after the variant has been
--     deleted. Order history is a record of what happened, not a live view.
--
-- Idempotent: safe to run repeatedly.

BEGIN;

-- ---------------------------------------------------------------------------
-- Option axes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    -- "Size", "Colour", "Grind". Merchant-facing, shown as the selector label.
    name        VARCHAR(60) NOT NULL,
    -- Which of option1/option2/option3 on the variant this axis fills.
    position    SMALLINT NOT NULL,
    -- Ordered choices: ['XS','S','M','L']. Order is merchandising, not data --
    -- sizes must read small-to-large, and no sort function knows that.
    values      TEXT[] NOT NULL DEFAULT '{}',
    -- Per-value presentation, keyed by value:
    --   {"Alpine Green": {"swatch": "#4a5d4f", "image": "https://..."}}
    -- Lets a colour axis render as swatches instead of a dropdown, which is
    -- the difference between an apparel PDP and a form.
    value_meta  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_options_position_check CHECK (position BETWEEN 1 AND 3),
    CONSTRAINT product_options_value_meta_object_check CHECK (jsonb_typeof(value_meta) = 'object'),
    CONSTRAINT product_options_product_position_key UNIQUE (product_id, position),
    CONSTRAINT product_options_product_name_key UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_options_product
    ON public.product_options (product_id, position);

CREATE INDEX IF NOT EXISTS idx_product_options_store
    ON public.product_options (store_id);

COMMENT ON TABLE public.product_options IS
    'Option axes for a product (Size, Colour, Grind). At most three, matching product_variants.option1..3.';
COMMENT ON COLUMN public.product_options.values IS
    'Ordered list of choices. Order is merchandising -- sizes must read small-to-large.';
COMMENT ON COLUMN public.product_options.value_meta IS
    'Per-value presentation keyed by value: {"Green": {"swatch": "#3f6b4a", "image": "..."}}.';

-- ---------------------------------------------------------------------------
-- Variants.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

    sku             VARCHAR(255) NOT NULL,
    -- The chosen value on each axis, matching product_options.position.
    option1         VARCHAR(120),
    option2         VARCHAR(120),
    option3         VARCHAR(120),

    -- NULL means "inherit from the product". See the header.
    price           DECIMAL(10,2),
    sale_price      DECIMAL(10,2),
    cost_price      DECIMAL(10,2),

    stock_quantity  INTEGER NOT NULL DEFAULT 0,
    -- NULL inherits products.track_inventory.
    track_inventory BOOLEAN,
    allow_backorder BOOLEAN,

    -- Selecting a colour should change the photograph.
    image_url       VARCHAR(500),

    weight          DECIMAL(8,2),
    -- Display order in the selector, independent of insertion order.
    position        SMALLINT NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Set when the variant came from an upstream catalogue rather than by hand.
    shipstation_product_id VARCHAR(255),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_variants_price_nonneg CHECK (price IS NULL OR price >= 0),
    CONSTRAINT product_variants_sale_price_nonneg CHECK (sale_price IS NULL OR sale_price >= 0),
    -- A SKU is what the warehouse picks by. It must be unique per store, and
    -- it must not collide with a top-level product's SKU either -- enforced in
    -- application code, since the two live in different tables.
    CONSTRAINT product_variants_store_sku_key UNIQUE (store_id, sku),
    -- NULLS NOT DISTINCT: without it, a one-axis product could hold unlimited
    -- duplicate rows for the same size, because option2/option3 are NULL and
    -- Postgres counts NULLs as distinct.
    CONSTRAINT product_variants_combination_key
        UNIQUE NULLS NOT DISTINCT (product_id, option1, option2, option3)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
    ON public.product_variants (product_id, position);

CREATE INDEX IF NOT EXISTS idx_product_variants_store
    ON public.product_variants (store_id);

-- The storefront only ever renders sellable variants.
CREATE INDEX IF NOT EXISTS idx_product_variants_active
    ON public.product_variants (product_id)
    WHERE is_active;

COMMENT ON TABLE public.product_variants IS
    'One purchasable combination of a product''s options. NULL price/track_inventory inherit from the product.';
COMMENT ON COLUMN public.product_variants.price IS
    'NULL means inherit products.base_price, so a merchant with one price across ten sizes sets it once.';

DROP TRIGGER IF EXISTS trg_product_options_updated_at ON public.product_options;
CREATE TRIGGER trg_product_options_updated_at
    BEFORE UPDATE ON public.product_options
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Order lines carry the variant.
--
-- `variant_id` is ON DELETE SET NULL rather than CASCADE or RESTRICT: deleting
-- a discontinued variant must not delete the orders that bought it, and must
-- not be blocked forever by them either. `variant_title` is what survives.
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS variant_title VARCHAR(400);

CREATE INDEX IF NOT EXISTS idx_order_items_variant
    ON public.order_items (variant_id)
    WHERE variant_id IS NOT NULL;

COMMENT ON COLUMN public.order_items.variant_id IS
    'The variant bought. NULL for a product with no options, or for a variant deleted since.';
COMMENT ON COLUMN public.order_items.variant_title IS
    'Denormalised "Alpine Green / Medium" at time of order. An order confirmation from three years ago must still read correctly after the variant is gone.';

-- ---------------------------------------------------------------------------
-- Products gain a cached option count.
--
-- The catalogue grid needs to know "does this product have options?" for every
-- card on the page, and asking product_variants per card is the N+1 the
-- listing query exists to avoid. Maintained by trigger so it cannot drift.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variant_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.variant_count IS
    'Cached count of active variants, maintained by trigger. 0 means the product is sold as a single SKU.';

CREATE OR REPLACE FUNCTION public.refresh_product_variant_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $refresh$
DECLARE
    target UUID;
BEGIN
    target := COALESCE(NEW.product_id, OLD.product_id);

    UPDATE public.products p
       SET variant_count = (
             SELECT COUNT(*) FROM public.product_variants v
              WHERE v.product_id = target AND v.is_active
           )
     WHERE p.id = target;

    RETURN NULL;
END
$refresh$;

COMMENT ON FUNCTION public.refresh_product_variant_count() IS
    'Keeps products.variant_count in step with product_variants. AFTER trigger, returns NULL.';

DROP TRIGGER IF EXISTS trg_product_variants_count ON public.product_variants;
CREATE TRIGGER trg_product_variants_count
    AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.refresh_product_variant_count();

-- Backfill, so re-running this migration on a database that already has
-- variants leaves the cache correct rather than stale at zero.
UPDATE public.products p
   SET variant_count = COALESCE(counts.n, 0)
  FROM (
        SELECT product_id, COUNT(*) FILTER (WHERE is_active) AS n
          FROM public.product_variants
         GROUP BY product_id
       ) AS counts
 WHERE p.id = counts.product_id
   AND p.variant_count IS DISTINCT FROM COALESCE(counts.n, 0);

INSERT INTO public.schema_migrations (version, description)
VALUES ('026', 'Product options and variants, variant-aware order lines')
ON CONFLICT (version) DO NOTHING;

COMMIT;
