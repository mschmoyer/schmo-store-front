-- Database Indexes for Performance Optimization
-- Version: 1.0.0
-- Description: Comprehensive indexing strategy for multi-tenant e-commerce platform

-- =================
-- PUBLIC SCHEMA INDEXES
-- =================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON public.users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON public.users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users(last_login);

-- Stores table indexes
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_stores_store_slug ON public.stores(store_slug);
CREATE INDEX IF NOT EXISTS idx_stores_subdomain ON public.stores(subdomain);
CREATE INDEX IF NOT EXISTS idx_stores_domain ON public.stores(domain);
CREATE INDEX IF NOT EXISTS idx_stores_is_active ON public.stores(is_active);
CREATE INDEX IF NOT EXISTS idx_stores_is_public ON public.stores(is_public);
CREATE INDEX IF NOT EXISTS idx_stores_created_at ON public.stores(created_at);

-- Store Analytics Summary table indexes
CREATE INDEX IF NOT EXISTS idx_store_analytics_store_id ON public.store_analytics_summary(store_id);
CREATE INDEX IF NOT EXISTS idx_store_analytics_date ON public.store_analytics_summary(date);
CREATE INDEX IF NOT EXISTS idx_store_analytics_store_date ON public.store_analytics_summary(store_id, date);

-- Global Configuration table indexes
CREATE INDEX IF NOT EXISTS idx_global_config_key ON public.global_config(config_key);

-- =================
-- STORE-SPECIFIC TABLE INDEXES
-- =================

-- Store Integrations table indexes
CREATE INDEX IF NOT EXISTS idx_store_integrations_store_id ON public.store_integrations(store_id);
CREATE INDEX IF NOT EXISTS idx_store_integrations_type ON public.store_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_store_integrations_sync_status ON public.store_integrations(sync_status);
CREATE INDEX IF NOT EXISTS idx_store_integrations_is_active ON public.store_integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_store_integrations_last_sync_at ON public.store_integrations(last_sync_at);

-- Sync History table indexes
CREATE INDEX IF NOT EXISTS idx_sync_history_store_id ON public.sync_history(store_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON public.sync_history(status);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON public.sync_history(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_history_integration_type ON public.sync_history(integration_type);
CREATE INDEX IF NOT EXISTS idx_sync_history_sync_type ON public.sync_history(sync_type);

-- Categories table indexes
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON public.categories(sort_order);

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_shipstation_product_id ON public.products(shipstation_product_id);
CREATE INDEX IF NOT EXISTS idx_products_base_price ON public.products(base_price);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON public.products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_published_at ON public.products(published_at);
CREATE INDEX IF NOT EXISTS idx_products_track_inventory ON public.products(track_inventory);
CREATE INDEX IF NOT EXISTS idx_products_name_search ON public.products USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_products_description_search ON public.products USING gin(to_tsvector('english', coalesce(long_description, '')));
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING gin(tags);

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(store_id, order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON public.orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_shipstation_order_id ON public.orders(shipstation_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_shipped_at ON public.orders(shipped_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON public.orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON public.orders(total_amount);

-- Order Items table indexes
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON public.order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_sku ON public.order_items(product_sku);

-- Blog Posts table indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_store_id ON public.blog_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled_for ON public.blog_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_view_count ON public.blog_posts(view_count);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON public.blog_posts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_blog_posts_title_search ON public.blog_posts USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_blog_posts_content_search ON public.blog_posts USING gin(to_tsvector('english', content));

-- Coupons table indexes
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(store_id, code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON public.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_valid_from ON public.coupons(valid_from);
CREATE INDEX IF NOT EXISTS idx_coupons_valid_until ON public.coupons(valid_until);
CREATE INDEX IF NOT EXISTS idx_coupons_discount_type ON public.coupons(discount_type);

-- Coupon Usage table indexes
CREATE INDEX IF NOT EXISTS idx_coupon_usage_store_id ON public.coupon_usage(store_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_id ON public.coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON public.coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_customer_email ON public.coupon_usage(customer_email);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_used_at ON public.coupon_usage(used_at);

-- Page Analytics table indexes
CREATE INDEX IF NOT EXISTS idx_page_analytics_store_id ON public.page_analytics(store_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_page_path ON public.page_analytics(page_path);
CREATE INDEX IF NOT EXISTS idx_page_analytics_session_id ON public.page_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_visitor_id ON public.page_analytics(visitor_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_event_type ON public.page_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_page_analytics_product_id ON public.page_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_created_at ON public.page_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_page_analytics_date ON public.page_analytics(date(created_at));
CREATE INDEX IF NOT EXISTS idx_page_analytics_store_date ON public.page_analytics(store_id, date(created_at));

-- Store Configuration table indexes
CREATE INDEX IF NOT EXISTS idx_store_config_store_id ON public.store_config(store_id);
CREATE INDEX IF NOT EXISTS idx_store_config_key ON public.store_config(store_id, config_key);
CREATE INDEX IF NOT EXISTS idx_store_config_is_public ON public.store_config(is_public);

-- Inventory Logs table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_logs_store_id ON public.inventory_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON public.inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_change_type ON public.inventory_logs(change_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON public.inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference_type ON public.inventory_logs(reference_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference_id ON public.inventory_logs(reference_id);

-- =================
-- COMPOSITE INDEXES FOR COMMON QUERIES
-- =================

-- Products filtering and sorting
CREATE INDEX IF NOT EXISTS idx_products_store_active_featured ON public.products(store_id, is_active, is_featured);
CREATE INDEX IF NOT EXISTS idx_products_store_category_active ON public.products(store_id, category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_store_price_range ON public.products(store_id, base_price, is_active);

-- Orders reporting
CREATE INDEX IF NOT EXISTS idx_orders_store_date_status ON public.orders(store_id, date(created_at), status);
CREATE INDEX IF NOT EXISTS idx_orders_store_customer_date ON public.orders(store_id, customer_email, created_at);

-- Analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_store_date_event ON public.page_analytics(store_id, date(created_at), event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_store_product_date ON public.page_analytics(store_id, product_id, date(created_at));

-- Blog posts queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_store_status_published ON public.blog_posts(store_id, status, published_at);

-- Inventory tracking
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_date ON public.inventory_logs(product_id, date(created_at));

-- =================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- =================

-- Active records only
CREATE INDEX IF NOT EXISTS idx_products_active_only ON public.products(store_id, created_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stores_active_only ON public.stores(created_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_categories_active_only ON public.categories(store_id, sort_order) WHERE is_active = true;

-- Published content only
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_only ON public.blog_posts(store_id, published_at) WHERE status = 'published';

-- Pending orders only
CREATE INDEX IF NOT EXISTS idx_orders_pending_only ON public.orders(store_id, created_at) WHERE status = 'pending';

-- Low stock products
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON public.products(store_id, stock_quantity) WHERE track_inventory = true AND stock_quantity <= low_stock_threshold;

-- =================
-- UNIQUE CONSTRAINTS (Additional)
-- =================

-- Ensure unique email verification tokens when not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_verification_token_unique ON public.users(email_verification_token) WHERE email_verification_token IS NOT NULL;

-- Ensure unique password reset tokens when not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password_reset_token_unique ON public.users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- =================
-- PERFORMANCE MONITORING INDEXES
-- =================

-- For monitoring query performance
CREATE INDEX IF NOT EXISTS idx_pg_stat_statements_query ON pg_stat_statements(query) WHERE calls > 100;