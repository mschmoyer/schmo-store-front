-- Coupon and Discount Management Tables
-- This file contains the database schema for coupon and discount functionality

-- Create discounts table
CREATE TABLE IF NOT EXISTS discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
    minimum_order_amount DECIMAL(10,2) DEFAULT 0,
    maximum_discount_amount DECIMAL(10,2), -- For percentage discounts
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER, -- Maximum total uses across all customers
    max_uses_per_customer INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    applies_to VARCHAR(20) DEFAULT 'entire_order' CHECK (applies_to IN ('entire_order', 'specific_products', 'specific_categories')),
    applicable_product_ids UUID[], -- Array of product IDs if applies_to = 'specific_products'
    applicable_category_ids UUID[], -- Array of category IDs if applies_to = 'specific_categories'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
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

-- Create coupon_uses table to track individual uses
CREATE TABLE IF NOT EXISTS coupon_uses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    order_id UUID, -- References orders(id), nullable for manual tracking
    customer_email VARCHAR(255), -- Track by email if no user account
    user_id UUID, -- References users(id) if customer has account
    discount_amount DECIMAL(10,2) NOT NULL,
    order_total DECIMAL(10,2) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_discounts_store_id ON discounts(store_id);
CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_discounts_dates ON discounts(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(store_id, code);
CREATE INDEX IF NOT EXISTS idx_coupons_discount_id ON coupons(discount_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon_id ON coupon_uses(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_order_id ON coupon_uses(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_customer ON coupon_uses(customer_email, user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_discounts_updated_at BEFORE UPDATE ON discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for testing
INSERT INTO discounts (id, store_id, name, description, discount_type, discount_value, minimum_order_amount, is_active) 
VALUES 
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    'Welcome Discount',
    '10% off your first order',
    'percentage',
    10.00,
    25.00,
    true
),
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    'Free Shipping',
    '$5 off shipping costs',
    'fixed_amount',
    5.00,
    0.00,
    true
),
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    'Big Sale',
    '25% off orders over $100',
    'percentage',
    25.00,
    100.00,
    true
)
ON CONFLICT DO NOTHING;

-- Insert sample coupons linked to the discounts
INSERT INTO coupons (id, store_id, discount_id, code, description, is_active) 
VALUES 
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    (SELECT id FROM discounts WHERE name = 'Welcome Discount' LIMIT 1),
    'WELCOME10',
    'Use this code for 10% off your first order',
    true
),
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    (SELECT id FROM discounts WHERE name = 'Free Shipping' LIMIT 1),
    'FREESHIP',
    'Free shipping on any order',
    true
),
(
    gen_random_uuid(),
    (SELECT id FROM stores LIMIT 1),
    (SELECT id FROM discounts WHERE name = 'Big Sale' LIMIT 1),
    'BIGSALE25',
    '25% off orders over $100',
    true
)
ON CONFLICT DO NOTHING;