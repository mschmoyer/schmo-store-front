-- Migration: Move targeting logic from discounts to coupons
-- This correctly implements the coupon-targeting model

BEGIN;

-- Step 1: Add targeting columns to coupons table
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applies_to VARCHAR(50) DEFAULT 'entire_order';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applicable_product_ids TEXT[];
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applicable_category_ids TEXT[];

-- Step 2: Migrate existing targeting data from discounts to coupons
-- For each coupon, copy the targeting from its linked discount
UPDATE coupons 
SET 
    applies_to = COALESCE(d.applies_to, 'entire_order'),
    applicable_product_ids = d.applicable_product_ids,
    applicable_category_ids = d.applicable_category_ids
FROM discounts d 
WHERE coupons.discount_id = d.id;

-- Step 3: Remove targeting columns from discounts table
-- (Keep them temporarily for safety, can drop later)
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applies_to;
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applicable_product_ids;
-- ALTER TABLE discounts DROP COLUMN IF EXISTS applicable_category_ids;

-- Step 4: Add constraints and indexes for new coupon targeting
ALTER TABLE coupons ADD CONSTRAINT coupons_applies_to_check 
    CHECK (applies_to IN ('entire_order', 'specific_products', 'specific_categories'));

CREATE INDEX IF NOT EXISTS idx_coupons_applies_to ON coupons(applies_to);
CREATE INDEX IF NOT EXISTS idx_coupons_product_targeting ON coupons USING GIN (applicable_product_ids)
    WHERE applicable_product_ids IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_category_targeting ON coupons USING GIN (applicable_category_ids)
    WHERE applicable_category_ids IS NOT NULL;

-- Step 5: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Ensure trigger exists for coupons
DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons;
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;