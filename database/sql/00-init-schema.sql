-- Database Schema for Multi-Tenant E-commerce Platform
-- Version: 1.0.0
-- Description: Complete database schema supporting multi-store, multi-tenant architecture

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Schema Migrations table - tracks applied migrations
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- =================
-- 1. PUBLIC SCHEMA - SHARED RESOURCES
-- =================

-- Users table - Global user management
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Stores table - Store management
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    store_name VARCHAR(255) NOT NULL,
    store_slug VARCHAR(255) UNIQUE NOT NULL,
    store_description TEXT,
    hero_title VARCHAR(255),
    hero_description TEXT,
    domain VARCHAR(255) UNIQUE,
    subdomain VARCHAR(100) UNIQUE,
    theme_name VARCHAR(50) DEFAULT 'default',
    theme_id VARCHAR(50) DEFAULT 'default', -- For backward compatibility
    custom_css TEXT,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    
    -- Admin Authentication (for admin-only stores)
    admin_email VARCHAR(255),
    admin_password_hash VARCHAR(255),
    
    -- Store Settings
    currency VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    allow_guest_checkout BOOLEAN DEFAULT true,
    
    -- SEO Settings
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    -- Analytics
    google_analytics_id VARCHAR(50),
    facebook_pixel_id VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store Analytics Summary table
CREATE TABLE IF NOT EXISTS public.store_analytics_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Traffic Metrics
    unique_visitors INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0,
    avg_session_duration INTEGER DEFAULT 0, -- in seconds
    
    -- E-commerce Metrics
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    avg_order_value DECIMAL(10,2) DEFAULT 0,
    
    -- Product Metrics
    products_viewed INTEGER DEFAULT 0,
    products_added_to_cart INTEGER DEFAULT 0,
    cart_abandonment_rate DECIMAL(5,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, date)
);

-- Global Configuration table
CREATE TABLE IF NOT EXISTS public.global_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================
-- 2. STORE-SPECIFIC TABLES
-- =================

-- Store Integrations table
CREATE TABLE IF NOT EXISTS public.store_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL, -- 'shipstation', 'stripe'
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    configuration JSONB,
    auto_sync_enabled BOOLEAN DEFAULT false,
    auto_sync_interval VARCHAR(20) DEFAULT '1hour', -- '10min', '1hour', '1day'
    sync_frequency VARCHAR(20) DEFAULT 'daily', -- Legacy field - '10min', '1hour', 'daily'
    last_sync_at TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'syncing', 'completed', 'failed'
    sync_error_message TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, integration_type)
);

-- Sync History table
CREATE TABLE IF NOT EXISTS public.sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL,
    sync_type VARCHAR(50) NOT NULL, -- 'full_import', 'inventory_update', 'scheduled_sync'
    status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
    products_synced INTEGER DEFAULT 0,
    products_updated INTEGER DEFAULT 0,
    products_created INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER
);

-- Categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    parent_id UUID REFERENCES public.categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, slug)
);

-- Store Categories table (for admin system compatibility)
CREATE TABLE IF NOT EXISTS public.store_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_name VARCHAR(255) NOT NULL,
    is_visible BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Sessions table
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    shipstation_product_id VARCHAR(255),
    sku VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    
    -- Descriptions
    short_description TEXT,
    long_description TEXT,
    description_html TEXT, -- Rich HTML content
    
    -- Pricing
    base_price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    
    -- Inventory
    track_inventory BOOLEAN DEFAULT true,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    allow_backorder BOOLEAN DEFAULT false,
    
    -- Physical Properties
    weight DECIMAL(8,2),
    weight_unit VARCHAR(10) DEFAULT 'lb',
    length DECIMAL(8,2),
    width DECIMAL(8,2),
    height DECIMAL(8,2),
    dimension_unit VARCHAR(10) DEFAULT 'in',
    
    -- Categories and Tags
    category_id UUID REFERENCES public.categories(id),
    tags TEXT[], -- Array of tags
    
    -- Images
    featured_image_url VARCHAR(500),
    gallery_images TEXT[], -- Array of image URLs
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    -- Shipping
    requires_shipping BOOLEAN DEFAULT true,
    shipping_class VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_digital BOOLEAN DEFAULT false,
    
    -- Override Settings (Store-specific customizations)
    override_name VARCHAR(500),
    override_description TEXT,
    override_price DECIMAL(10,2),
    override_images TEXT[],
    discount_type VARCHAR(20), -- 'percentage', 'fixed'
    discount_value DECIMAL(10,2),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    
    UNIQUE(store_id, sku),
    UNIQUE(store_id, slug),
    -- Fix ShipStation constraint - allow same shipstation_product_id across different stores
    CONSTRAINT products_store_shipstation_unique UNIQUE (store_id, shipstation_product_id)
);

-- Product Overrides table (for admin system compatibility)
CREATE TABLE IF NOT EXISTS public.product_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL, -- ShipStation product ID
    custom_description TEXT,
    is_visible BOOLEAN DEFAULT true,
    discount_type VARCHAR(20) CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value DECIMAL(10,2),
    custom_images JSONB,
    seo_title VARCHAR(255),
    seo_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, product_id)
);

-- Inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    available INTEGER DEFAULT 0,
    on_hand INTEGER DEFAULT 0,
    allocated INTEGER DEFAULT 0,
    warehouse_id VARCHAR(255),
    warehouse_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, sku, warehouse_id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    
    -- Customer Information
    customer_email VARCHAR(255) NOT NULL,
    customer_first_name VARCHAR(100) NOT NULL,
    customer_last_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    
    -- Shipping Address
    shipping_first_name VARCHAR(100) NOT NULL,
    shipping_last_name VARCHAR(100) NOT NULL,
    shipping_address_line1 VARCHAR(255) NOT NULL,
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(20) NOT NULL,
    shipping_country VARCHAR(2) DEFAULT 'US',
    
    -- Billing Address (optional - can be same as shipping)
    billing_first_name VARCHAR(100),
    billing_last_name VARCHAR(100),
    billing_address_line1 VARCHAR(255),
    billing_address_line2 VARCHAR(255),
    billing_city VARCHAR(100),
    billing_state VARCHAR(100),
    billing_postal_code VARCHAR(20),
    billing_country VARCHAR(2) DEFAULT 'US',
    
    -- Order Totals
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Payment Information
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_transaction_id VARCHAR(255),
    
    -- Shipping Information
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(100),
    estimated_delivery_date DATE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled',
    
    -- External Integration IDs
    shipstation_order_id VARCHAR(255),
    shipengine_shipment_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    UNIQUE(store_id, order_number)
);

-- Order Items table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    
    -- Product Details at Time of Order
    product_sku VARCHAR(255) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    product_image_url VARCHAR(500),
    
    -- Pricing
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Discounts
    discount_type VARCHAR(20), -- 'percentage', 'fixed'
    discount_value DECIMAL(10,2),
    discount_amount DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blog Posts table
CREATE TABLE IF NOT EXISTS public.blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    featured_image_url VARCHAR(500),
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    -- Publishing
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'published', 'scheduled'
    published_at TIMESTAMP,
    scheduled_for TIMESTAMP,
    
    -- Tags and Categories
    tags TEXT[], -- Array of tags
    category VARCHAR(100),
    
    -- Analytics
    view_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, slug)
);

-- Coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Discount Configuration
    discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed_amount', 'free_shipping'
    discount_value DECIMAL(10,2) NOT NULL,
    
    -- Usage Limits
    usage_limit INTEGER, -- NULL = unlimited
    usage_limit_per_customer INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    
    -- Conditions
    minimum_order_amount DECIMAL(10,2),
    maximum_discount_amount DECIMAL(10,2),
    
    -- Product/Category Restrictions
    applicable_product_ids UUID[],
    applicable_category_ids UUID[],
    excluded_product_ids UUID[],
    excluded_category_ids UUID[],
    
    -- Validity Period
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, code)
);

-- Coupon Usage table
CREATE TABLE IF NOT EXISTS public.coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_email VARCHAR(255) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(coupon_id, order_id)
);

-- Page Analytics table
CREATE TABLE IF NOT EXISTS public.page_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    page_path VARCHAR(500) NOT NULL,
    page_title VARCHAR(500),
    
    -- Session Information
    session_id VARCHAR(255),
    visitor_id VARCHAR(255),
    user_agent TEXT,
    ip_address INET,
    
    -- Referrer Information
    referrer_url VARCHAR(500),
    referrer_domain VARCHAR(255),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    
    -- Geographic Data
    country VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),
    
    -- Engagement Metrics
    time_on_page INTEGER, -- seconds
    bounce BOOLEAN DEFAULT false,
    
    -- E-commerce Events
    event_type VARCHAR(50), -- 'page_view', 'product_view', 'add_to_cart', 'purchase'
    product_id UUID,
    event_value DECIMAL(10,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store Configuration table
CREATE TABLE IF NOT EXISTS public.store_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    config_key VARCHAR(255) NOT NULL,
    config_value TEXT,
    config_type VARCHAR(50) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- Can be accessed by frontend
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, config_key)
);

-- Inventory Logs table
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    
    -- Inventory Change
    change_type VARCHAR(50) NOT NULL, -- 'restock', 'sale', 'adjustment', 'return'
    quantity_change INTEGER NOT NULL, -- Positive for increase, negative for decrease
    quantity_after INTEGER NOT NULL,
    
    -- Reference Information
    reference_type VARCHAR(50), -- 'order', 'manual', 'import'
    reference_id UUID, -- Could be order_id, etc.
    
    -- Additional Information
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Visitors table - Simple IP-based visitor tracking per store
CREATE TABLE IF NOT EXISTS public.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    visited_date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_agent TEXT,
    page_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one entry per IP per day per store
    UNIQUE(store_id, ip_address, visited_date)
);

-- =================
-- 3. INDEXES FOR PERFORMANCE
-- =================

-- Store indexes
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(store_slug);
CREATE INDEX IF NOT EXISTS idx_stores_owner ON public.stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_stores_active ON public.stores(is_active);

-- Store integration indexes
CREATE INDEX IF NOT EXISTS idx_store_integrations_store_id ON public.store_integrations(store_id);
CREATE INDEX IF NOT EXISTS idx_store_integrations_type ON public.store_integrations(integration_type);

-- Product indexes  
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
-- ShipStation product ID index for better performance on lookups (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_products_shipstation_product_id 
    ON public.products (shipstation_product_id) 
    WHERE shipstation_product_id IS NOT NULL;

-- Product override indexes
CREATE INDEX IF NOT EXISTS idx_product_overrides_store_id ON public.product_overrides(store_id);
CREATE INDEX IF NOT EXISTS idx_product_overrides_product_id ON public.product_overrides(product_id);

-- Store category indexes
CREATE INDEX IF NOT EXISTS idx_store_categories_store_id ON public.store_categories(store_id);

-- Blog post indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_store_id ON public.blog_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts(status, published_at);

-- Admin session indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON public.admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_store_id ON public.admin_sessions(store_id);

-- Order indexes
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at);

-- Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON public.inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON public.inventory(sku);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_page_analytics_store_id ON public.page_analytics(store_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_created ON public.page_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_visitors_store_date ON public.visitors(store_id, visited_date);

-- =================
-- 4. FUNCTIONS AND TRIGGERS
-- =================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_stores_updated_at 
    BEFORE UPDATE ON public.stores 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_integrations_updated_at 
    BEFORE UPDATE ON public.store_integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON public.products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_overrides_updated_at 
    BEFORE UPDATE ON public.product_overrides 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_categories_updated_at 
    BEFORE UPDATE ON public.store_categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at 
    BEFORE UPDATE ON public.blog_posts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON public.categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_config_updated_at 
    BEFORE UPDATE ON public.store_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON public.orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at 
    BEFORE UPDATE ON public.inventory 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial migration record
INSERT INTO public.schema_migrations (version, description) 
VALUES ('00-init-schema', 'Initial database schema with multi-tenant support and admin system')
ON CONFLICT (version) DO NOTHING;