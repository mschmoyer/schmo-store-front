-- Migration 003: Database functions and triggers
-- Creates utility functions, stored procedures, and triggers
-- Version: 1.0.0
-- Date: 2025-07-04

BEGIN;

-- =================
-- UTILITY FUNCTIONS
-- =================

-- Function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number(store_id_param UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    order_count INTEGER;
    order_prefix VARCHAR(10);
    order_number VARCHAR(50);
BEGIN
    -- Get current order count for the store
    SELECT COUNT(*) INTO order_count
    FROM public.orders
    WHERE store_id = store_id_param;
    
    -- Generate order prefix based on store (first 3 chars of store_id)
    SELECT LEFT(REPLACE(store_id_param::TEXT, '-', ''), 6) INTO order_prefix;
    
    -- Generate order number with padding
    order_number := UPPER(order_prefix) || '-' || LPAD((order_count + 1)::TEXT, 6, '0');
    
    RETURN order_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate order total
CREATE OR REPLACE FUNCTION calculate_order_total(order_id_param UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    total_amount DECIMAL(10,2);
BEGIN
    SELECT SUM(total_price) INTO total_amount
    FROM public.order_items
    WHERE order_id = order_id_param;
    
    RETURN COALESCE(total_amount, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check product stock
CREATE OR REPLACE FUNCTION check_product_stock(product_id_param UUID, quantity_needed INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    current_stock INTEGER;
    track_inventory_flag BOOLEAN;
    allow_backorder_flag BOOLEAN;
BEGIN
    SELECT stock_quantity, track_inventory, allow_backorder
    INTO current_stock, track_inventory_flag, allow_backorder_flag
    FROM public.products
    WHERE id = product_id_param;
    
    -- If inventory tracking is disabled, always allow
    IF NOT track_inventory_flag THEN
        RETURN TRUE;
    END IF;
    
    -- If backorders are allowed, always allow
    IF allow_backorder_flag THEN
        RETURN TRUE;
    END IF;
    
    -- Check if we have enough stock
    RETURN current_stock >= quantity_needed;
END;
$$ LANGUAGE plpgsql;

-- Function to update product stock
CREATE OR REPLACE FUNCTION update_product_stock(
    product_id_param UUID,
    quantity_change INTEGER,
    change_type_param VARCHAR(50),
    reference_type_param VARCHAR(50) DEFAULT 'manual',
    reference_id_param UUID DEFAULT NULL,
    notes_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    current_stock INTEGER;
    new_stock INTEGER;
    store_id_param UUID;
BEGIN
    -- Get current stock and store_id
    SELECT stock_quantity, store_id INTO current_stock, store_id_param
    FROM public.products
    WHERE id = product_id_param;
    
    -- Calculate new stock
    new_stock := current_stock + quantity_change;
    
    -- Ensure stock doesn't go negative
    IF new_stock < 0 THEN
        new_stock := 0;
    END IF;
    
    -- Update product stock
    UPDATE public.products
    SET stock_quantity = new_stock, updated_at = CURRENT_TIMESTAMP
    WHERE id = product_id_param;
    
    -- Log the inventory change
    INSERT INTO public.inventory_logs (
        store_id, product_id, change_type, quantity_change, quantity_after,
        reference_type, reference_id, notes
    )
    VALUES (
        store_id_param, product_id_param, change_type_param, quantity_change, new_stock,
        reference_type_param, reference_id_param, notes_param
    );
END;
$$ LANGUAGE plpgsql;

-- Function to initialize store data
CREATE OR REPLACE FUNCTION initialize_store_data(store_id_param UUID)
RETURNS VOID AS $$
DECLARE
    default_category_id UUID;
BEGIN
    -- Insert default store configuration
    INSERT INTO public.store_config (store_id, config_key, config_value, config_type, description)
    VALUES 
        (store_id_param, 'auto_sync_enabled', 'false', 'boolean', 'Enable automatic synchronization with external services'),
        (store_id_param, 'sync_frequency', 'daily', 'string', 'Frequency of automatic synchronization'),
        (store_id_param, 'inventory_threshold', '10', 'number', 'Low stock threshold for inventory alerts'),
        (store_id_param, 'seo_enabled', 'true', 'boolean', 'Enable SEO optimization features'),
        (store_id_param, 'analytics_enabled', 'true', 'boolean', 'Enable analytics tracking'),
        (store_id_param, 'guest_checkout_enabled', 'true', 'boolean', 'Allow guest checkout'),
        (store_id_param, 'email_notifications_enabled', 'true', 'boolean', 'Enable email notifications'),
        (store_id_param, 'currency_symbol', '$', 'string', 'Currency symbol for display'),
        (store_id_param, 'tax_rate', '0.0875', 'number', 'Default tax rate'),
        (store_id_param, 'shipping_rate', '9.99', 'number', 'Default shipping rate')
    ON CONFLICT (store_id, config_key) DO NOTHING;
    
    -- Create default category
    INSERT INTO public.categories (store_id, name, slug, description, is_active, sort_order)
    VALUES (store_id_param, 'All Products', 'all-products', 'Default category for all products', true, 0)
    RETURNING id INTO default_category_id;
    
    -- Log store initialization
    INSERT INTO public.sync_history (store_id, integration_type, sync_type, status, started_at, completed_at, duration_seconds)
    VALUES (store_id_param, 'system', 'store_initialization', 'completed', NOW(), NOW(), 0);
    
    -- Create initial analytics summary record
    INSERT INTO public.store_analytics_summary (store_id, date)
    VALUES (store_id_param, CURRENT_DATE)
    ON CONFLICT (store_id, date) DO NOTHING;
    
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error initializing store data: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to get product display price (considering overrides)
CREATE OR REPLACE FUNCTION get_product_display_price(product_id_param UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    base_price DECIMAL(10,2);
    sale_price DECIMAL(10,2);
    override_price DECIMAL(10,2);
    discount_type VARCHAR(20);
    discount_value DECIMAL(10,2);
    final_price DECIMAL(10,2);
BEGIN
    SELECT p.base_price, p.sale_price, p.override_price, p.discount_type, p.discount_value
    INTO base_price, sale_price, override_price, discount_type, discount_value
    FROM public.products p
    WHERE p.id = product_id_param;
    
    -- Start with override price if set, otherwise base price
    final_price := COALESCE(override_price, base_price);
    
    -- Apply sale price if lower
    IF sale_price IS NOT NULL AND sale_price < final_price THEN
        final_price := sale_price;
    END IF;
    
    -- Apply discount if configured
    IF discount_type IS NOT NULL AND discount_value IS NOT NULL THEN
        IF discount_type = 'percentage' THEN
            final_price := final_price * (1 - discount_value / 100);
        ELSIF discount_type = 'fixed' THEN
            final_price := final_price - discount_value;
        END IF;
    END IF;
    
    -- Ensure price is not negative
    IF final_price < 0 THEN
        final_price := 0;
    END IF;
    
    RETURN final_price;
END;
$$ LANGUAGE plpgsql;

-- Function to validate coupon
CREATE OR REPLACE FUNCTION validate_coupon(
    coupon_code_param VARCHAR(100),
    store_id_param UUID,
    customer_email_param VARCHAR(255),
    order_total_param DECIMAL(10,2)
)
RETURNS TABLE(
    is_valid BOOLEAN,
    coupon_id UUID,
    discount_amount DECIMAL(10,2),
    error_message TEXT
) AS $$
DECLARE
    coupon_record RECORD;
    usage_count INTEGER;
    customer_usage_count INTEGER;
    calculated_discount DECIMAL(10,2);
BEGIN
    -- Get coupon details
    SELECT c.id, c.discount_type, c.discount_value, c.usage_limit, c.usage_limit_per_customer,
           c.used_count, c.minimum_order_amount, c.maximum_discount_amount,
           c.valid_from, c.valid_until, c.is_active
    INTO coupon_record
    FROM public.coupons c
    WHERE c.code = coupon_code_param AND c.store_id = store_id_param;
    
    -- Check if coupon exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 0::DECIMAL(10,2), 'Coupon not found'::TEXT;
        RETURN;
    END IF;
    
    -- Check if coupon is active
    IF NOT coupon_record.is_active THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Coupon is not active'::TEXT;
        RETURN;
    END IF;
    
    -- Check validity period
    IF coupon_record.valid_from IS NOT NULL AND NOW() < coupon_record.valid_from THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Coupon is not yet valid'::TEXT;
        RETURN;
    END IF;
    
    IF coupon_record.valid_until IS NOT NULL AND NOW() > coupon_record.valid_until THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Coupon has expired'::TEXT;
        RETURN;
    END IF;
    
    -- Check minimum order amount
    IF coupon_record.minimum_order_amount IS NOT NULL AND order_total_param < coupon_record.minimum_order_amount THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Order total does not meet minimum requirement'::TEXT;
        RETURN;
    END IF;
    
    -- Check usage limits
    IF coupon_record.usage_limit IS NOT NULL AND coupon_record.used_count >= coupon_record.usage_limit THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Coupon usage limit exceeded'::TEXT;
        RETURN;
    END IF;
    
    -- Check per-customer usage limit
    SELECT COUNT(*) INTO customer_usage_count
    FROM public.coupon_usage cu
    WHERE cu.coupon_id = coupon_record.id AND cu.customer_email = customer_email_param;
    
    IF customer_usage_count >= coupon_record.usage_limit_per_customer THEN
        RETURN QUERY SELECT FALSE, coupon_record.id, 0::DECIMAL(10,2), 'Customer usage limit exceeded'::TEXT;
        RETURN;
    END IF;
    
    -- Calculate discount amount
    IF coupon_record.discount_type = 'percentage' THEN
        calculated_discount := order_total_param * (coupon_record.discount_value / 100);
    ELSIF coupon_record.discount_type = 'fixed_amount' THEN
        calculated_discount := coupon_record.discount_value;
    ELSIF coupon_record.discount_type = 'free_shipping' THEN
        calculated_discount := 0; -- Handle separately in application
    ELSE
        calculated_discount := 0;
    END IF;
    
    -- Apply maximum discount limit
    IF coupon_record.maximum_discount_amount IS NOT NULL AND calculated_discount > coupon_record.maximum_discount_amount THEN
        calculated_discount := coupon_record.maximum_discount_amount;
    END IF;
    
    -- Ensure discount doesn't exceed order total
    IF calculated_discount > order_total_param THEN
        calculated_discount := order_total_param;
    END IF;
    
    RETURN QUERY SELECT TRUE, coupon_record.id, calculated_discount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get store analytics summary
CREATE OR REPLACE FUNCTION get_store_analytics_summary(
    store_id_param UUID,
    start_date_param DATE,
    end_date_param DATE
)
RETURNS TABLE(
    total_orders INTEGER,
    total_revenue DECIMAL(10,2),
    total_visitors INTEGER,
    total_page_views INTEGER,
    avg_order_value DECIMAL(10,2),
    conversion_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(sas.total_orders), 0)::INTEGER as total_orders,
        COALESCE(SUM(sas.total_revenue), 0)::DECIMAL(10,2) as total_revenue,
        COALESCE(SUM(sas.unique_visitors), 0)::INTEGER as total_visitors,
        COALESCE(SUM(sas.page_views), 0)::INTEGER as total_page_views,
        COALESCE(AVG(sas.avg_order_value), 0)::DECIMAL(10,2) as avg_order_value,
        COALESCE(AVG(sas.conversion_rate), 0)::DECIMAL(5,2) as conversion_rate
    FROM public.store_analytics_summary sas
    WHERE sas.store_id = store_id_param 
    AND sas.date BETWEEN start_date_param AND end_date_param;
END;
$$ LANGUAGE plpgsql;

-- Function to update analytics summary
CREATE OR REPLACE FUNCTION update_analytics_summary(
    store_id_param UUID,
    date_param DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
    orders_count INTEGER;
    revenue_total DECIMAL(10,2);
    visitors_count INTEGER;
    page_views_count INTEGER;
    avg_order_val DECIMAL(10,2);
    conversion_rt DECIMAL(5,2);
BEGIN
    -- Calculate metrics for the date
    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO orders_count, revenue_total
    FROM public.orders
    WHERE store_id = store_id_param 
    AND date(created_at) = date_param;
    
    -- Calculate visitor metrics
    SELECT COUNT(DISTINCT visitor_id), COUNT(*)
    INTO visitors_count, page_views_count
    FROM public.page_analytics
    WHERE store_id = store_id_param 
    AND date(created_at) = date_param;
    
    -- Calculate average order value
    avg_order_val := CASE WHEN orders_count > 0 THEN revenue_total / orders_count ELSE 0 END;
    
    -- Calculate conversion rate
    conversion_rt := CASE WHEN visitors_count > 0 THEN (orders_count * 100.0) / visitors_count ELSE 0 END;
    
    -- Insert or update analytics summary
    INSERT INTO public.store_analytics_summary (
        store_id, date, total_orders, total_revenue, unique_visitors, page_views,
        avg_order_value, conversion_rate
    )
    VALUES (
        store_id_param, date_param, orders_count, revenue_total, visitors_count, page_views_count,
        avg_order_val, conversion_rt
    )
    ON CONFLICT (store_id, date)
    DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        total_revenue = EXCLUDED.total_revenue,
        unique_visitors = EXCLUDED.unique_visitors,
        page_views = EXCLUDED.page_views,
        avg_order_value = EXCLUDED.avg_order_value,
        conversion_rate = EXCLUDED.conversion_rate,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =================
-- TRIGGERS
-- =================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at column
DROP TRIGGER IF EXISTS set_timestamp_users ON public.users;
CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_stores ON public.stores;
CREATE TRIGGER set_timestamp_stores BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_store_analytics_summary ON public.store_analytics_summary;
CREATE TRIGGER set_timestamp_store_analytics_summary BEFORE UPDATE ON public.store_analytics_summary FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_global_config ON public.global_config;
CREATE TRIGGER set_timestamp_global_config BEFORE UPDATE ON public.global_config FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_store_integrations ON public.store_integrations;
CREATE TRIGGER set_timestamp_store_integrations BEFORE UPDATE ON public.store_integrations FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_categories ON public.categories;
CREATE TRIGGER set_timestamp_categories BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_products ON public.products;
CREATE TRIGGER set_timestamp_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_orders ON public.orders;
CREATE TRIGGER set_timestamp_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_blog_posts ON public.blog_posts;
CREATE TRIGGER set_timestamp_blog_posts BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_coupons ON public.coupons;
CREATE TRIGGER set_timestamp_coupons BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_store_config ON public.store_config;
CREATE TRIGGER set_timestamp_store_config BEFORE UPDATE ON public.store_config FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Trigger to automatically initialize store data when a new store is created
CREATE OR REPLACE FUNCTION trigger_initialize_store()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM initialize_store_data(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS initialize_store_after_insert ON public.stores;
CREATE TRIGGER initialize_store_after_insert
    AFTER INSERT ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION trigger_initialize_store();

-- Trigger to update inventory when order items are created
CREATE OR REPLACE FUNCTION trigger_update_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Reduce inventory when order item is created
    IF TG_OP = 'INSERT' THEN
        PERFORM update_product_stock(
            NEW.product_id,
            -NEW.quantity,
            'sale',
            'order',
            NEW.order_id,
            'Inventory reduced due to order'
        );
        RETURN NEW;
    END IF;
    
    -- Restore inventory when order item is deleted
    IF TG_OP = 'DELETE' THEN
        PERFORM update_product_stock(
            OLD.product_id,
            OLD.quantity,
            'return',
            'order',
            OLD.order_id,
            'Inventory restored due to order cancellation'
        );
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_on_order_item_insert ON public.order_items;
CREATE TRIGGER update_inventory_on_order_item_insert
    AFTER INSERT ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_inventory_on_order();

DROP TRIGGER IF EXISTS update_inventory_on_order_item_delete ON public.order_items;
CREATE TRIGGER update_inventory_on_order_item_delete
    AFTER DELETE ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_inventory_on_order();

-- Trigger to update coupon usage count
CREATE OR REPLACE FUNCTION trigger_update_coupon_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.coupons
        SET used_count = used_count + 1
        WHERE id = NEW.coupon_id;
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE public.coupons
        SET used_count = used_count - 1
        WHERE id = OLD.coupon_id;
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_coupon_usage_count ON public.coupon_usage;
CREATE TRIGGER update_coupon_usage_count
    AFTER INSERT OR DELETE ON public.coupon_usage
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_coupon_usage();

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('003', 'Database functions, stored procedures, and triggers')
ON CONFLICT (version) DO NOTHING;

COMMIT;