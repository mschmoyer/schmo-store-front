-- Migration: Convert existing coupons table to use discount_id structure
-- This migration separates coupons from discounts properly

BEGIN;

-- Step 1: Create a backup of existing coupons
CREATE TABLE coupons_backup AS SELECT * FROM coupons;

-- Step 2: First, clear any existing sample data that might conflict
DELETE FROM coupons WHERE code IN ('WELCOME10', 'FREESHIP', 'BIGSALE25');
DELETE FROM discounts WHERE name IN ('Welcome Discount', 'Free Shipping', 'Big Sale');

-- Step 3: Insert existing coupon data into discounts table
-- Each coupon becomes a discount with a linked coupon
INSERT INTO discounts (
    id, store_id, name, description, discount_type, discount_value,
    minimum_order_amount, maximum_discount_amount, start_date, end_date,
    max_uses, max_uses_per_customer, current_uses, is_active,
    applies_to, applicable_product_ids, applicable_category_ids
)
SELECT 
    gen_random_uuid(), -- new ID for discount
    store_id,
    name,
    description,
    discount_type,
    discount_value,
    COALESCE(minimum_order_amount, 0),
    maximum_discount_amount,
    valid_from,
    valid_until,
    usage_limit,
    COALESCE(usage_limit_per_customer, 1),
    COALESCE(used_count, 0),
    COALESCE(is_active, true),
    'entire_order', -- default applies_to
    applicable_product_ids,
    applicable_category_ids
FROM coupons_backup;

-- Step 4: Drop the existing coupons table
DROP TABLE coupons CASCADE;

-- Step 5: Recreate coupons table with proper structure
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER, -- Maximum total uses for this specific coupon
    max_uses_per_customer INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, code) -- Ensure coupon codes are unique per store
);

-- Step 6: Insert coupons that link to the discounts we just created
INSERT INTO coupons (
    store_id, discount_id, code, description, is_active,
    start_date, end_date, max_uses, max_uses_per_customer, current_uses
)
SELECT 
    cb.store_id,
    d.id as discount_id,
    cb.code,
    cb.description,
    COALESCE(cb.is_active, true),
    cb.valid_from,
    cb.valid_until,
    cb.usage_limit,
    COALESCE(cb.usage_limit_per_customer, 1),
    COALESCE(cb.used_count, 0)
FROM coupons_backup cb
JOIN discounts d ON d.store_id = cb.store_id 
    AND d.name = cb.name 
    AND d.discount_type = cb.discount_type 
    AND d.discount_value = cb.discount_value;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(store_id, code);
CREATE INDEX IF NOT EXISTS idx_coupons_discount_id ON coupons(discount_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active) WHERE is_active = true;

-- Step 8: Create trigger to update updated_at timestamp
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Drop backup table (comment out for safety)
-- DROP TABLE coupons_backup;

COMMIT;