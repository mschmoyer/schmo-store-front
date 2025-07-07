-- Development seed data for multi-tenant e-commerce platform
-- This file contains sample data for development and testing

-- Clear existing data (in reverse dependency order)
DELETE FROM public.coupon_usage;
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.inventory_logs;
DELETE FROM public.page_analytics;
DELETE FROM public.blog_posts;
DELETE FROM public.coupons;
DELETE FROM public.products;
DELETE FROM public.categories;
DELETE FROM public.store_config;
DELETE FROM public.sync_history;
DELETE FROM public.store_integrations;
DELETE FROM public.store_analytics_summary;
DELETE FROM public.stores;
DELETE FROM public.users;
DELETE FROM public.global_config;

-- Insert global configuration
INSERT INTO public.global_config (config_key, config_value, description, is_encrypted) VALUES
('platform_name', 'Schmo Store Platform', 'Name of the e-commerce platform', false),
('default_currency', 'USD', 'Default currency for new stores', false),
('max_stores_per_user', '10', 'Maximum number of stores per user', false),
('email_verification_required', 'true', 'Whether email verification is required', false),
('maintenance_mode', 'false', 'Platform maintenance mode', false),
('max_upload_size', '10485760', 'Maximum file upload size in bytes (10MB)', false);

-- Insert demo users
INSERT INTO public.users (id, email, password_hash, first_name, last_name, email_verified, is_active) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'demo@schmostore.com', '$2b$10$rQkKm2rU6lzjVwjTBJEhE.TwXRQJ1L2NVPW2X3ZQJZ6E8dGZcH8bO', 'Demo', 'User', true, true),
('550e8400-e29b-41d4-a716-446655440002', 'store.owner@example.com', '$2b$10$rQkKm2rU6lzjVwjTBJEhE.TwXRQJ1L2NVPW2X3ZQJZ6E8dGZcH8bO', 'Store', 'Owner', true, true),
('550e8400-e29b-41d4-a716-446655440003', 'another.user@example.com', '$2b$10$rQkKm2rU6lzjVwjTBJEhE.TwXRQJ1L2NVPW2X3ZQJZ6E8dGZcH8bO', 'Another', 'User', true, true);

-- Insert demo stores
INSERT INTO public.stores (id, owner_id, store_name, store_slug, store_description, hero_title, hero_description, theme_name, currency, is_active, is_public, allow_guest_checkout, meta_title, meta_description) VALUES
('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'Demo Electronics Store', 'demo-electronics', 'Your one-stop shop for quality electronics and gadgets', 'Welcome to Demo Electronics', 'Discover the latest in technology and electronics with unbeatable prices and quality service.', 'default', 'USD', true, true, true, 'Demo Electronics - Quality Tech at Great Prices', 'Shop the latest electronics, smartphones, laptops, and gadgets at Demo Electronics. Free shipping on orders over $50!'),
('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'Artisan Craft Corner', 'artisan-craft', 'Handmade crafts and artisan goods', 'Handcrafted with Love', 'Unique, handmade items created by talented artisans from around the world.', 'default', 'USD', true, true, true, 'Artisan Craft Corner - Handmade with Love', 'Discover unique handmade crafts, jewelry, pottery, and artisan goods. Each piece tells a story.'),
('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 'Fitness Pro Shop', 'fitness-pro', 'Professional fitness equipment and accessories', 'Achieve Your Fitness Goals', 'Professional-grade fitness equipment and accessories for home and commercial use.', 'default', 'USD', true, false, true, 'Fitness Pro Shop - Professional Fitness Equipment', 'High-quality fitness equipment, supplements, and accessories. Get fit with the pros!');

-- The initialize_store_data function will be called automatically by trigger
-- But let's add some custom store configurations

-- Insert store analytics summary (sample historical data)
INSERT INTO public.store_analytics_summary (store_id, date, unique_visitors, page_views, bounce_rate, avg_session_duration, total_orders, total_revenue, conversion_rate, avg_order_value, products_viewed, products_added_to_cart, cart_abandonment_rate) VALUES
('650e8400-e29b-41d4-a716-446655440001', CURRENT_DATE - INTERVAL '1 day', 150, 450, 35.5, 180, 12, 2400.00, 8.0, 200.00, 89, 25, 48.0),
('650e8400-e29b-41d4-a716-446655440001', CURRENT_DATE - INTERVAL '2 days', 120, 380, 40.0, 165, 8, 1600.00, 6.7, 200.00, 72, 18, 55.6),
('650e8400-e29b-41d4-a716-446655440002', CURRENT_DATE - INTERVAL '1 day', 85, 220, 45.3, 120, 5, 350.00, 5.9, 70.00, 45, 12, 58.3),
('650e8400-e29b-41d4-a716-446655440003', CURRENT_DATE - INTERVAL '1 day', 95, 285, 38.9, 200, 7, 980.00, 7.4, 140.00, 68, 15, 53.3);

-- Insert categories for each store
INSERT INTO public.categories (id, store_id, name, slug, description, sort_order, is_active) VALUES
-- Demo Electronics Store categories
('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'Smartphones', 'smartphones', 'Latest smartphones and mobile devices', 1, true),
('750e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'Laptops', 'laptops', 'Laptops and portable computers', 2, true),
('750e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440001', 'Accessories', 'accessories', 'Phone cases, chargers, and tech accessories', 3, true),
-- Artisan Craft Corner categories
('750e8400-e29b-41d4-a716-446655440004', '650e8400-e29b-41d4-a716-446655440002', 'Jewelry', 'jewelry', 'Handmade jewelry and accessories', 1, true),
('750e8400-e29b-41d4-a716-446655440005', '650e8400-e29b-41d4-a716-446655440002', 'Pottery', 'pottery', 'Ceramic and clay creations', 2, true),
('750e8400-e29b-41d4-a716-446655440006', '650e8400-e29b-41d4-a716-446655440002', 'Textiles', 'textiles', 'Handwoven fabrics and textile art', 3, true),
-- Fitness Pro Shop categories
('750e8400-e29b-41d4-a716-446655440007', '650e8400-e29b-41d4-a716-446655440003', 'Cardio Equipment', 'cardio-equipment', 'Treadmills, bikes, and cardio machines', 1, true),
('750e8400-e29b-41d4-a716-446655440008', '650e8400-e29b-41d4-a716-446655440003', 'Strength Training', 'strength-training', 'Weights, machines, and strength equipment', 2, true),
('750e8400-e29b-41d4-a716-446655440009', '650e8400-e29b-41d4-a716-446655440003', 'Supplements', 'supplements', 'Protein powders and nutritional supplements', 3, true);

-- Insert sample products
INSERT INTO public.products (id, store_id, sku, name, slug, short_description, long_description, base_price, sale_price, stock_quantity, low_stock_threshold, category_id, tags, featured_image_url, is_active, is_featured, requires_shipping) VALUES
-- Demo Electronics Store products
('850e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'PHONE-001', 'Latest Smartphone Pro', 'latest-smartphone-pro', 'Premium smartphone with advanced features', 'Experience the latest in mobile technology with our flagship smartphone featuring a stunning display, powerful processor, and professional-grade camera system.', 899.99, 799.99, 25, 5, '750e8400-e29b-41d4-a716-446655440001', ARRAY['smartphone', 'mobile', 'premium'], '/images/smartphone-pro.jpg', true, true, true),
('850e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'LAPTOP-001', 'Ultra-Light Laptop', 'ultra-light-laptop', 'Lightweight laptop perfect for professionals', 'High-performance laptop designed for professionals on the go. Features long battery life, fast SSD storage, and a beautiful high-resolution display.', 1299.99, null, 15, 3, '750e8400-e29b-41d4-a716-446655440002', ARRAY['laptop', 'computer', 'portable'], '/images/laptop-ultra.jpg', true, true, true),
('850e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440001', 'CASE-001', 'Premium Phone Case', 'premium-phone-case', 'Protective case with style', 'Durable phone case that combines protection with style. Made from premium materials with precise cutouts for all ports and buttons.', 29.99, 24.99, 100, 20, '750e8400-e29b-41d4-a716-446655440003', ARRAY['case', 'protection', 'accessory'], '/images/phone-case.jpg', true, false, true),

-- Artisan Craft Corner products
('850e8400-e29b-41d4-a716-446655440004', '650e8400-e29b-41d4-a716-446655440002', 'JEWELRY-001', 'Handcrafted Silver Necklace', 'handcrafted-silver-necklace', 'Beautiful silver necklace made by local artisans', 'This stunning silver necklace is handcrafted by skilled artisans using traditional techniques. Each piece is unique and comes with a certificate of authenticity.', 149.99, null, 8, 2, '750e8400-e29b-41d4-a716-446655440004', ARRAY['jewelry', 'silver', 'handmade', 'necklace'], '/images/silver-necklace.jpg', true, true, true),
('850e8400-e29b-41d4-a716-446655440005', '650e8400-e29b-41d4-a716-446655440002', 'POTTERY-001', 'Ceramic Coffee Mug Set', 'ceramic-coffee-mug-set', 'Set of 4 handmade ceramic mugs', 'Beautiful set of 4 ceramic coffee mugs, each with unique glazing and patterns. Perfect for your morning coffee or as a thoughtful gift.', 89.99, 79.99, 12, 3, '750e8400-e29b-41d4-a716-446655440005', ARRAY['pottery', 'ceramic', 'mugs', 'coffee'], '/images/ceramic-mugs.jpg', true, true, true),

-- Fitness Pro Shop products
('850e8400-e29b-41d4-a716-446655440006', '650e8400-e29b-41d4-a716-446655440003', 'CARDIO-001', 'Professional Treadmill', 'professional-treadmill', 'Commercial-grade treadmill for serious runners', 'Professional treadmill designed for commercial gyms and serious home fitness enthusiasts. Features advanced cushioning, multiple workout programs, and robust construction.', 2999.99, 2799.99, 5, 1, '750e8400-e29b-41d4-a716-446655440007', ARRAY['treadmill', 'cardio', 'running', 'fitness'], '/images/treadmill-pro.jpg', true, true, true),
('850e8400-e29b-41d4-a716-446655440007', '650e8400-e29b-41d4-a716-446655440003', 'WEIGHTS-001', 'Adjustable Dumbbell Set', 'adjustable-dumbbell-set', 'Space-saving adjustable dumbbells', 'Complete dumbbell set that adjusts from 5 to 50 pounds per dumbbell. Perfect for home workouts with minimal space requirements.', 599.99, null, 20, 5, '750e8400-e29b-41d4-a716-446655440008', ARRAY['dumbbells', 'weights', 'strength', 'adjustable'], '/images/adjustable-dumbbells.jpg', true, false, true);

-- Insert sample orders
INSERT INTO public.orders (id, store_id, order_number, customer_email, customer_first_name, customer_last_name, customer_phone, shipping_first_name, shipping_last_name, shipping_address_line1, shipping_city, shipping_state, shipping_postal_code, shipping_country, subtotal, tax_amount, shipping_amount, total_amount, payment_method, payment_status, status, fulfillment_status) VALUES
('950e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'DEMO-000001', 'customer1@example.com', 'John', 'Doe', '+1-555-0123', 'John', 'Doe', '123 Main Street', 'Anytown', 'CA', '90210', 'US', 799.99, 64.00, 9.99, 873.98, 'credit_card', 'completed', 'completed', 'fulfilled'),
('950e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'DEMO-000002', 'customer2@example.com', 'Jane', 'Smith', '+1-555-0124', 'Jane', 'Smith', '456 Oak Avenue', 'Springfield', 'IL', '62701', 'US', 1299.99, 104.00, 0.00, 1403.99, 'credit_card', 'completed', 'shipped', 'partial'),
('950e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440002', 'CRAFT-000001', 'artlover@example.com', 'Alice', 'Johnson', '+1-555-0125', 'Alice', 'Johnson', '789 Pine Road', 'Portland', 'OR', '97201', 'US', 149.99, 12.00, 7.99, 169.98, 'paypal', 'completed', 'processing', 'unfulfilled');

-- Insert order items
INSERT INTO public.order_items (id, store_id, order_id, product_id, product_sku, product_name, unit_price, quantity, total_price) VALUES
('A50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', '950e8400-e29b-41d4-a716-446655440001', '850e8400-e29b-41d4-a716-446655440001', 'PHONE-001', 'Latest Smartphone Pro', 799.99, 1, 799.99),
('A50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', '950e8400-e29b-41d4-a716-446655440002', '850e8400-e29b-41d4-a716-446655440002', 'LAPTOP-001', 'Ultra-Light Laptop', 1299.99, 1, 1299.99),
('A50e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440002', '950e8400-e29b-41d4-a716-446655440003', '850e8400-e29b-41d4-a716-446655440004', 'JEWELRY-001', 'Handcrafted Silver Necklace', 149.99, 1, 149.99);

-- Insert sample coupons
INSERT INTO public.coupons (id, store_id, code, name, description, discount_type, discount_value, usage_limit, usage_limit_per_customer, minimum_order_amount, valid_from, valid_until, is_active) VALUES
('B50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'WELCOME10', 'Welcome Discount', 'Welcome new customers with 10% off', 'percentage', 10.00, 100, 1, 50.00, NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', true),
('B50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'SAVE50', 'Save $50', 'Get $50 off orders over $500', 'fixed_amount', 50.00, 50, 1, 500.00, NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', true),
('B50e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440002', 'HANDMADE15', 'Artisan Special', '15% off all handmade items', 'percentage', 15.00, null, 2, null, NOW() - INTERVAL '7 days', NOW() + INTERVAL '60 days', true);

-- Insert sample blog posts
INSERT INTO public.blog_posts (id, store_id, title, slug, content, excerpt, status, published_at, tags, category, view_count) VALUES
('C50e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'The Future of Mobile Technology', 'future-mobile-technology', 'Mobile technology continues to evolve at an unprecedented pace. In this post, we explore the latest trends and innovations that are shaping the future of smartphones and mobile devices...', 'Exploring the latest trends in mobile technology and what to expect in the coming years.', 'published', NOW() - INTERVAL '5 days', ARRAY['technology', 'mobile', 'smartphones'], 'Technology', 234),
('C50e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'Choosing the Right Laptop for Your Needs', 'choosing-right-laptop', 'With so many laptop options available, it can be overwhelming to choose the right one. This comprehensive guide will help you understand the key factors to consider...', 'A complete guide to selecting the perfect laptop for your specific needs and budget.', 'published', NOW() - INTERVAL '10 days', ARRAY['laptops', 'buying-guide', 'technology'], 'Buying Guides', 156),
('C50e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440002', 'The Art of Handcrafted Jewelry', 'art-handcrafted-jewelry', 'There is something truly special about handcrafted jewelry. Each piece tells a unique story and carries the passion and skill of its creator...', 'Discover the beauty and craftsmanship behind handmade jewelry pieces.', 'published', NOW() - INTERVAL '3 days', ARRAY['jewelry', 'handmade', 'artisan', 'crafts'], 'Crafts', 89),
('C50e8400-e29b-41d4-a716-446655440004', '650e8400-e29b-41d4-a716-446655440003', 'Building Your Home Gym on a Budget', 'building-home-gym-budget', 'Creating an effective home gym doesnt have to break the bank. With smart planning and the right equipment choices, you can build a comprehensive workout space...', 'Tips and tricks for creating an effective home gym without spending a fortune.', 'published', NOW() - INTERVAL '7 days', ARRAY['fitness', 'home-gym', 'budget', 'equipment'], 'Fitness Tips', 178);

-- Insert sample page analytics
INSERT INTO public.page_analytics (store_id, page_path, page_title, session_id, visitor_id, event_type, product_id, created_at) VALUES
('650e8400-e29b-41d4-a716-446655440001', '/', 'Demo Electronics Store - Home', 'sess_001', 'visitor_001', 'page_view', null, NOW() - INTERVAL '2 hours'),
('650e8400-e29b-41d4-a716-446655440001', '/products/latest-smartphone-pro', 'Latest Smartphone Pro - Demo Electronics', 'sess_001', 'visitor_001', 'product_view', '850e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '2 hours'),
('650e8400-e29b-41d4-a716-446655440001', '/cart', 'Shopping Cart - Demo Electronics', 'sess_001', 'visitor_001', 'add_to_cart', '850e8400-e29b-41d4-a716-446655440001', NOW() - INTERVAL '1 hour'),
('650e8400-e29b-41d4-a716-446655440002', '/', 'Artisan Craft Corner - Home', 'sess_002', 'visitor_002', 'page_view', null, NOW() - INTERVAL '3 hours'),
('650e8400-e29b-41d4-a716-446655440002', '/products/handcrafted-silver-necklace', 'Handcrafted Silver Necklace - Artisan Craft', 'sess_002', 'visitor_002', 'product_view', '850e8400-e29b-41d4-a716-446655440004', NOW() - INTERVAL '2.5 hours');

-- Insert store integrations (sample)
INSERT INTO public.store_integrations (store_id, integration_type, auto_sync_enabled, sync_frequency, sync_status, is_active) VALUES
('650e8400-e29b-41d4-a716-446655440001', 'shipstation', false, 'daily', 'pending', false),
('650e8400-e29b-41d4-a716-446655440001', 'stripe', true, 'daily', 'completed', true),
('650e8400-e29b-41d4-a716-446655440002', 'stripe', true, 'daily', 'completed', true);

-- Insert sync history
INSERT INTO public.sync_history (store_id, integration_type, sync_type, status, products_synced, products_updated, products_created, started_at, completed_at, duration_seconds) VALUES
('650e8400-e29b-41d4-a716-446655440001', 'system', 'store_initialization', 'completed', 0, 0, 0, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 2),
('650e8400-e29b-41d4-a716-446655440002', 'system', 'store_initialization', 'completed', 0, 0, 0, NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days', 1),
('650e8400-e29b-41d4-a716-446655440003', 'system', 'store_initialization', 'completed', 0, 0, 0, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', 1);

-- Insert sample inventory logs
INSERT INTO public.inventory_logs (store_id, product_id, change_type, quantity_change, quantity_after, reference_type, notes) VALUES
('650e8400-e29b-41d4-a716-446655440001', '850e8400-e29b-41d4-a716-446655440001', 'restock', 50, 25, 'manual', 'Initial stock from supplier'),
('650e8400-e29b-41d4-a716-446655440001', '850e8400-e29b-41d4-a716-446655440001', 'sale', -1, 24, 'order', 'Sale to customer'),
('650e8400-e29b-41d4-a716-446655440001', '850e8400-e29b-41d4-a716-446655440002', 'restock', 20, 15, 'manual', 'Initial stock from supplier'),
('650e8400-e29b-41d4-a716-446655440001', '850e8400-e29b-41d4-a716-446655440002', 'sale', -1, 14, 'order', 'Sale to customer');

-- Update the analytics summary for today
UPDATE public.store_analytics_summary 
SET 
  unique_visitors = unique_visitors + 15,
  page_views = page_views + 45,
  products_viewed = products_viewed + 8,
  products_added_to_cart = products_added_to_cart + 2
WHERE store_id IN (
  '650e8400-e29b-41d4-a716-446655440001',
  '650e8400-e29b-41d4-a716-446655440002',
  '650e8400-e29b-41d4-a716-446655440003'
) AND date = CURRENT_DATE;

-- Insert today's analytics if they don't exist
INSERT INTO public.store_analytics_summary (store_id, date, unique_visitors, page_views, total_orders, total_revenue, products_viewed, products_added_to_cart)
SELECT store_id, CURRENT_DATE, 25, 75, 2, 450.00, 15, 4
FROM (VALUES 
  ('650e8400-e29b-41d4-a716-446655440001'::UUID),
  ('650e8400-e29b-41d4-a716-446655440002'::UUID),
  ('650e8400-e29b-41d4-a716-446655440003'::UUID)
) AS stores(store_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_analytics_summary 
  WHERE store_analytics_summary.store_id = stores.store_id 
  AND date = CURRENT_DATE
);

-- Insert additional custom store configurations
INSERT INTO public.store_config (store_id, config_key, config_value, config_type, description, is_public) VALUES
-- Demo Electronics Store custom configs
('650e8400-e29b-41d4-a716-446655440001', 'featured_categories', '["smartphones", "laptops"]', 'json', 'Categories to feature on homepage', true),
('650e8400-e29b-41d4-a716-446655440001', 'shipping_free_threshold', '75.00', 'number', 'Free shipping threshold', true),
('650e8400-e29b-41d4-a716-446655440001', 'return_policy_days', '30', 'number', 'Return policy in days', true),

-- Artisan Craft Corner custom configs
('650e8400-e29b-41d4-a716-446655440002', 'artisan_spotlight', 'true', 'boolean', 'Show artisan spotlight section', true),
('650e8400-e29b-41d4-a716-446655440002', 'custom_packaging', 'true', 'boolean', 'Offer custom gift packaging', true),
('650e8400-e29b-41d4-a716-446655440002', 'shipping_free_threshold', '50.00', 'number', 'Free shipping threshold', true),

-- Fitness Pro Shop custom configs
('650e8400-e29b-41d4-a716-446655440003', 'assembly_service', 'true', 'boolean', 'Offer equipment assembly service', true),
('650e8400-e29b-41d4-a716-446655440003', 'warranty_extended', 'true', 'boolean', 'Offer extended warranty', true),
('650e8400-e29b-41d4-a716-446655440003', 'shipping_free_threshold', '200.00', 'number', 'Free shipping threshold', true);

COMMIT;