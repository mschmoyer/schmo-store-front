-- Migration 001: Initial database schema
-- Creates the complete multi-tenant e-commerce platform schema
-- Version: 1.0.0
-- Date: 2025-07-04

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create version tracking table
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
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    store_name VARCHAR(255) NOT NULL,
    store_slug VARCHAR(255) UNIQUE NOT NULL,
    store_description TEXT,
    hero_title VARCHAR(255),
    hero_description TEXT,
    domain VARCHAR(255) UNIQUE,
    subdomain VARCHAR(100) UNIQUE,
    theme_name VARCHAR(50) DEFAULT 'default',
    custom_css TEXT,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    
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

-- Store Integrations table
CREATE TABLE IF NOT EXISTS public.store_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL, -- 'shipengine', 'stripe'
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

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    shipstation_product_id VARCHAR(255) UNIQUE,
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
    UNIQUE(store_id, slug)
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

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('001', 'Initial database schema with all tables')
ON CONFLICT (version) DO NOTHING;

COMMIT;