// TypeScript types for database entities
// Generated from PostgreSQL schema for multi-tenant e-commerce platform

// =================
// BASE TYPES
// =================

export type UUID = string;
export type Timestamp = Date;

// =================
// USER MANAGEMENT
// =================

export interface User {
  id: UUID;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  email_verification_token?: string;
  password_reset_token?: string;
  password_reset_expires?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_login?: Timestamp;
  is_active: boolean;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  email_verified?: boolean;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  email_verified?: boolean;
  email_verification_token?: string;
  password_reset_token?: string;
  password_reset_expires?: Timestamp;
  last_login?: Timestamp;
  is_active?: boolean;
}

// =================
// STORE MANAGEMENT
// =================

export interface Store {
  id: UUID;
  owner_id: UUID;
  store_name: string;
  store_slug: string;
  store_description?: string;
  hero_title?: string;
  hero_description?: string;
  domain?: string;
  subdomain?: string;
  theme_name: string;
  custom_css?: string;
  logo_url?: string;
  favicon_url?: string;
  currency: string;
  timezone: string;
  is_active: boolean;
  is_public: boolean;
  allow_guest_checkout: boolean;
  meta_title?: string;
  meta_description?: string;
  google_analytics_id?: string;
  facebook_pixel_id?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateStoreInput {
  owner_id: UUID;
  store_name: string;
  store_slug: string;
  store_description?: string;
  hero_title?: string;
  hero_description?: string;
  domain?: string;
  subdomain?: string;
  theme_name?: string;
  custom_css?: string;
  logo_url?: string;
  favicon_url?: string;
  currency?: string;
  timezone?: string;
  is_public?: boolean;
  allow_guest_checkout?: boolean;
  meta_title?: string;
  meta_description?: string;
  google_analytics_id?: string;
  facebook_pixel_id?: string;
}

export interface UpdateStoreInput {
  store_name?: string;
  store_description?: string;
  hero_title?: string;
  hero_description?: string;
  domain?: string;
  subdomain?: string;
  theme_name?: string;
  custom_css?: string;
  logo_url?: string;
  favicon_url?: string;
  currency?: string;
  timezone?: string;
  is_active?: boolean;
  is_public?: boolean;
  allow_guest_checkout?: boolean;
  meta_title?: string;
  meta_description?: string;
  google_analytics_id?: string;
  facebook_pixel_id?: string;
}

// =================
// ANALYTICS
// =================

export interface StoreAnalyticsSummary {
  id: UUID;
  store_id: UUID;
  date: Date;
  unique_visitors: number;
  page_views: number;
  bounce_rate: number;
  avg_session_duration: number;
  total_orders: number;
  total_revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  products_viewed: number;
  products_added_to_cart: number;
  cart_abandonment_rate: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PageAnalytics {
  id: UUID;
  store_id: UUID;
  page_path: string;
  page_title?: string;
  session_id?: string;
  visitor_id?: string;
  user_agent?: string;
  ip_address?: string;
  referrer_url?: string;
  referrer_domain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  country?: string;
  region?: string;
  city?: string;
  time_on_page?: number;
  bounce: boolean;
  event_type?: string;
  product_id?: UUID;
  event_value?: number;
  created_at: Timestamp;
}

export type AnalyticsEventType = 'page_view' | 'product_view' | 'add_to_cart' | 'purchase';

export interface CreateAnalyticsEventInput {
  store_id: UUID;
  page_path: string;
  page_title?: string;
  session_id?: string;
  visitor_id?: string;
  user_agent?: string;
  ip_address?: string;
  referrer_url?: string;
  referrer_domain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  country?: string;
  region?: string;
  city?: string;
  time_on_page?: number;
  bounce?: boolean;
  event_type?: AnalyticsEventType;
  product_id?: UUID;
  event_value?: number;
}

// =================
// CONFIGURATION
// =================

export interface GlobalConfig {
  id: UUID;
  config_key: string;
  config_value?: string;
  description?: string;
  is_encrypted: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StoreConfig {
  id: UUID;
  store_id: UUID;
  config_key: string;
  config_value?: string;
  config_type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  is_public: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateStoreConfigInput {
  store_id: UUID;
  config_key: string;
  config_value?: string;
  config_type?: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  is_public?: boolean;
}

// =================
// INTEGRATIONS
// =================

export interface StoreIntegration {
  id: UUID;
  store_id: UUID;
  integration_type: 'shipstation' | 'stripe' | string;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  configuration?: Record<string, unknown>;
  auto_sync_enabled: boolean;
  sync_frequency: '10min' | '1hour' | 'daily';
  last_sync_at?: Timestamp;
  sync_status: 'pending' | 'syncing' | 'completed' | 'failed';
  sync_error_message?: string;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SyncHistory {
  id: UUID;
  store_id: UUID;
  integration_type: string;
  sync_type: 'full_import' | 'inventory_update' | 'scheduled_sync';
  status: 'started' | 'completed' | 'failed';
  products_synced: number;
  products_updated: number;
  products_created: number;
  error_message?: string;
  started_at: Timestamp;
  completed_at?: Timestamp;
  duration_seconds?: number;
}

export interface CreateStoreIntegrationInput {
  store_id: UUID;
  integration_type: string;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  configuration?: Record<string, unknown>;
  auto_sync_enabled?: boolean;
  sync_frequency?: '10min' | '1hour' | 'daily';
  is_active?: boolean;
}

// =================
// PRODUCTS
// =================

export interface Category {
  id: UUID;
  store_id: UUID;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  parent_id?: UUID;
  sort_order: number;
  is_active: boolean;
  meta_title?: string;
  meta_description?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Product {
  id: UUID;
  store_id: UUID;
  shipstation_product_id?: string;
  sku: string;
  name: string;
  slug: string;
  short_description?: string;
  long_description?: string;
  description_html?: string;
  base_price: number;
  sale_price?: number;
  cost_price?: number;
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  allow_backorder: boolean;
  weight?: number;
  weight_unit: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit: string;
  category_id?: UUID;
  tags: string[];
  featured_image_url?: string;
  gallery_images: string[];
  meta_title?: string;
  meta_description?: string;
  requires_shipping: boolean;
  shipping_class?: string;
  is_active: boolean;
  is_featured: boolean;
  is_digital: boolean;
  override_name?: string;
  override_description?: string;
  override_price?: number;
  override_images: string[];
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  published_at?: Timestamp;
}

export interface CreateProductInput {
  store_id: UUID;
  shipstation_product_id?: string;
  sku: string;
  name: string;
  slug: string;
  short_description?: string;
  long_description?: string;
  description_html?: string;
  base_price: number;
  sale_price?: number;
  cost_price?: number;
  track_inventory?: boolean;
  stock_quantity?: number;
  low_stock_threshold?: number;
  allow_backorder?: boolean;
  weight?: number;
  weight_unit?: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit?: string;
  category_id?: UUID;
  tags?: string[];
  featured_image_url?: string;
  gallery_images?: string[];
  meta_title?: string;
  meta_description?: string;
  requires_shipping?: boolean;
  shipping_class?: string;
  is_active?: boolean;
  is_featured?: boolean;
  is_digital?: boolean;
  override_name?: string;
  override_description?: string;
  override_price?: number;
  override_images?: string[];
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  published_at?: Timestamp;
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: UUID;
}

export interface InventoryLog {
  id: UUID;
  store_id: UUID;
  product_id: UUID;
  change_type: 'restock' | 'sale' | 'adjustment' | 'return';
  quantity_change: number;
  quantity_after: number;
  reference_type?: 'order' | 'manual' | 'import';
  reference_id?: UUID;
  notes?: string;
  created_at: Timestamp;
}

// =================
// ORDERS
// =================

export interface Order {
  id: UUID;
  store_id: UUID;
  order_number: string;
  customer_email: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone?: string;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  billing_first_name?: string;
  billing_last_name?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_city?: string;
  billing_state?: string;
  billing_postal_code?: string;
  billing_country?: string;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method?: string;
  payment_status: string;
  payment_transaction_id?: string;
  shipping_method?: string;
  tracking_number?: string;
  estimated_delivery_date?: Date;
  status: string;
  fulfillment_status: string;
  shipstation_order_id?: string;
  shipengine_shipment_id?: string;
  stripe_payment_intent_id?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  shipped_at?: Timestamp;
  delivered_at?: Timestamp;
}

export interface OrderItem {
  id: UUID;
  store_id: UUID;
  order_id: UUID;
  product_id: UUID;
  product_sku: string;
  product_name: string;
  product_image_url?: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  discount_amount: number;
  created_at: Timestamp;
}

export interface CreateOrderInput {
  store_id: UUID;
  customer_email: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone?: string;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country?: string;
  billing_first_name?: string;
  billing_last_name?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_city?: string;
  billing_state?: string;
  billing_postal_code?: string;
  billing_country?: string;
  subtotal: number;
  tax_amount?: number;
  shipping_amount?: number;
  discount_amount?: number;
  total_amount: number;
  payment_method?: string;
  payment_status?: string;
  payment_transaction_id?: string;
  shipping_method?: string;
  tracking_number?: string;
  estimated_delivery_date?: Date;
  status?: string;
  fulfillment_status?: string;
  shipstation_order_id?: string;
  shipengine_shipment_id?: string;
  stripe_payment_intent_id?: string;
  items: CreateOrderItemInput[];
}

export interface CreateOrderItemInput {
  product_id: UUID;
  product_sku: string;
  product_name: string;
  product_image_url?: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  discount_amount?: number;
}

// =================
// COUPONS
// =================

export interface Coupon {
  id: UUID;
  store_id: UUID;
  code: string;
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping';
  discount_value: number;
  usage_limit?: number;
  usage_limit_per_customer: number;
  used_count: number;
  minimum_order_amount?: number;
  maximum_discount_amount?: number;
  applicable_product_ids: UUID[];
  applicable_category_ids: UUID[];
  excluded_product_ids: UUID[];
  excluded_category_ids: UUID[];
  valid_from?: Timestamp;
  valid_until?: Timestamp;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CouponUsage {
  id: UUID;
  store_id: UUID;
  coupon_id: UUID;
  order_id: UUID;
  customer_email: string;
  discount_amount: number;
  used_at: Timestamp;
}

export interface CreateCouponInput {
  store_id: UUID;
  code: string;
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping';
  discount_value: number;
  usage_limit?: number;
  usage_limit_per_customer?: number;
  minimum_order_amount?: number;
  maximum_discount_amount?: number;
  applicable_product_ids?: UUID[];
  applicable_category_ids?: UUID[];
  excluded_product_ids?: UUID[];
  excluded_category_ids?: UUID[];
  valid_from?: Timestamp;
  valid_until?: Timestamp;
  is_active?: boolean;
}

export interface CouponValidationResult {
  is_valid: boolean;
  coupon_id?: UUID;
  discount_amount: number;
  error_message?: string;
}

// =================
// BLOG
// =================

export interface BlogPost {
  id: UUID;
  store_id: UUID;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  meta_title?: string;
  meta_description?: string;
  status: 'draft' | 'published' | 'scheduled';
  published_at?: Timestamp;
  scheduled_for?: Timestamp;
  tags: string[];
  category?: string;
  view_count: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateBlogPostInput {
  store_id: UUID;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  meta_title?: string;
  meta_description?: string;
  status?: 'draft' | 'published' | 'scheduled';
  published_at?: Timestamp;
  scheduled_for?: Timestamp;
  tags?: string[];
  category?: string;
}

export interface UpdateBlogPostInput extends Partial<CreateBlogPostInput> {
  id: UUID;
}

// =================
// QUERY FILTERS
// =================

export interface ProductFilters {
  category_id?: UUID;
  is_active?: boolean;
  is_featured?: boolean;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  tags?: string[];
  search?: string;
  sort_by?: 'name' | 'price' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface OrderFilters {
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  customer_email?: string;
  start_date?: Date;
  end_date?: Date;
  sort_by?: 'created_at' | 'total_amount' | 'order_number';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BlogPostFilters {
  status?: 'draft' | 'published' | 'scheduled';
  category?: string;
  tags?: string[];
  search?: string;
  sort_by?: 'created_at' | 'published_at' | 'title' | 'view_count';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// =================
// API RESPONSES
// =================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface DatabaseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AnalyticsSummaryResponse {
  total_orders: number;
  total_revenue: number;
  total_visitors: number;
  total_page_views: number;
  avg_order_value: number;
  conversion_rate: number;
}

// =================
// UTILITY TYPES
// =================

export type CreateInput<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;
export type UpdateInput<T> = Partial<CreateInput<T>> & { id: UUID };
export type DatabaseEntity = User | Store | Product | Order | BlogPost | Coupon;

// =================
// ENVIRONMENT TYPES
// =================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
}