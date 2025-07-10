-- Migration 013: Move targeting logic from discounts to coupons
-- This correctly implements the coupon-targeting model where:
-- - Discounts define the discount calculation (percentage/fixed amount)
-- - Coupons define the targeting rules (what products/categories it applies to)

BEGIN;

-- Step 1: Add targeting columns to coupons table
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applies_to VARCHAR(50) DEFAULT 'entire_order';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applicable_product_ids UUID[];
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applicable_category_ids UUID[];

-- Step 2: Migrate existing targeting data from discounts to coupons (if discounts table exists)
-- For each coupon, copy the targeting from its linked discount
DO $$
BEGIN
    -- Check if discounts table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'discounts') THEN
        UPDATE coupons 
        SET 
            applies_to = COALESCE(d.applies_to, 'entire_order'),
            applicable_product_ids = d.applicable_product_ids,
            applicable_category_ids = d.applicable_category_ids
        FROM discounts d 
        WHERE coupons.discount_id = d.id;
    ELSE
        -- If discounts table doesn't exist, just ensure coupons have default values
        UPDATE coupons 
        SET applies_to = COALESCE(applies_to, 'entire_order')
        WHERE applies_to IS NULL;
    END IF;
END $$;

-- Step 3: Add constraints for new coupon targeting
ALTER TABLE coupons ADD CONSTRAINT coupons_applies_to_check 
    CHECK (applies_to IN ('entire_order', 'specific_products', 'specific_categories'));

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupons_applies_to ON coupons(applies_to);
CREATE INDEX IF NOT EXISTS idx_coupons_product_targeting ON coupons USING GIN (applicable_product_ids)
    WHERE applicable_product_ids IS NOT NULL AND array_length(applicable_product_ids, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_coupons_category_targeting ON coupons USING GIN (applicable_category_ids)
    WHERE applicable_category_ids IS NOT NULL AND array_length(applicable_category_ids, 1) > 0;

-- Step 5: Remove targeting columns from discounts table (commented for safety)
-- These can be dropped later after confirming the migration worked
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applies_to;
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applicable_product_ids;
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applicable_category_ids;

-- Step 6: Record migration in schema_migrations table
INSERT INTO schema_migrations (version, description) 
VALUES ('013', 'Move targeting logic from discounts to coupons')
ON CONFLICT (version) DO NOTHING;

COMMIT;