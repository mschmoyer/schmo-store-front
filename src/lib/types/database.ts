// Database types
export type UUID = string;
export type Timestamp = Date;

// Common structured data types
export interface Address {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  company?: string;
  phone?: string;
}

export type ConfigValue = string | number | boolean | object | null;

export interface IntegrationConfig {
  [key: string]: string | number | boolean | object | null;
}

export interface SyncError {
  message: string;
  code?: string;
  details?: object;
}

export interface EventMetadata {
  [key: string]: string | number | boolean | object | null;
}

// Core database types
export interface UserMetadata {
  preferences?: {
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
    timezone?: string;
    email_notifications?: boolean;
    sms_notifications?: boolean;
  };
  profile?: {
    bio?: string;
    website?: string;
    company?: string;
    location?: string;
    social_links?: Record<string, string>;
  };
  settings?: {
    two_factor_enabled?: boolean;
    email_frequency?: 'immediate' | 'daily' | 'weekly' | 'never';
    marketing_consent?: boolean;
  };
}

export interface User {
  id: UUID;
  email: string;
  password_hash?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  is_active: boolean;
  email_verified: boolean;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'owner';
  last_login?: Timestamp;
  metadata?: UserMetadata;
}

export interface Store {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  owner_id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
  is_active: boolean;
  theme?: string;
  domain?: string;
  logo_url?: string;
  cover_image_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  currency: string;
  tax_rate?: number;
  shipping_enabled: boolean;
  pickup_enabled: boolean;
  social_facebook?: string;
  social_instagram?: string;
  social_twitter?: string;
  analytics_enabled: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
}

export interface Product {
  id: UUID;
  store_id: UUID;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price: number;
  compare_price?: number;
  cost_price?: number;
  sku?: string;
  barcode?: string;
  track_inventory: boolean;
  inventory_quantity: number;
  allow_backorder: boolean;
  weight?: number;
  dimensions?: string;
  category_id?: UUID;
  brand?: string;
  tags?: string[];
  images?: string[];
  featured_image?: string;
  is_active: boolean;
  is_featured: boolean;
  is_digital: boolean;
  meta_title?: string;
  meta_description?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  published_at?: Timestamp;
  visibility: 'public' | 'private' | 'hidden';
  sort_order: number;
}

export interface Order {
  id: UUID;
  store_id: UUID;
  customer_id?: UUID;
  order_number: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  total_amount: number;
  currency: string;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method?: string;
  shipping_method?: string;
  customer_email: string;
  customer_phone?: string;
  billing_address?: Address;
  shipping_address?: Address;
  notes?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  shipped_at?: Timestamp;
  delivered_at?: Timestamp;
  // ShipStation Integration fields
  shipstation_order_id?: string;
  shipstation_order_key?: string;
  shipstation_order_status?: string;
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  carrier_code?: string;
  service_code?: string;
  package_code?: string;
  estimated_delivery_date?: Timestamp;
  actual_delivery_date?: Timestamp;
  shipment_cost?: number;
  shipment_weight?: number;
  shipment_dimensions?: {
    length: number;
    width: number;
    height: number;
    units: string;
  };
  label_url?: string;
  form_url?: string;
  insurance_cost?: number;
  confirmation_delivery?: boolean;
  signature_required?: boolean;
  adult_signature?: boolean;
  delivery_confirmation?: string;
  customs_items?: CustomsItem[];
  international_options?: InternationalOptions;
  advanced_options?: AdvancedOptions;
  shipment_notifications?: ShipmentNotification[];
}

export interface OrderItem {
  id: UUID;
  order_id: UUID;
  product_id: UUID;
  product_name: string;
  product_sku?: string;
  quantity: number;
  price: number;
  total: number;
  created_at: Timestamp;
}

export interface Category {
  id: UUID;
  store_id: UUID;
  name: string;
  slug: string;
  description?: string;
  parent_id?: UUID;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
  seo_title?: string;
  seo_description?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface BlogPost {
  id: UUID;
  store_id: UUID;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  featured_image?: string;
  status: 'draft' | 'published' | 'scheduled';
  published_at?: Timestamp;
  scheduled_for?: Timestamp;
  meta_title?: string;
  meta_description?: string;
  tags?: string[];
  category?: string;
  author_id: UUID;
  view_count: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Coupon {
  id: UUID;
  store_id: UUID;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimum_amount?: number;
  usage_limit?: number;
  usage_count: number;
  is_active: boolean;
  starts_at?: Timestamp;
  expires_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CouponUsage {
  id: UUID;
  coupon_id: UUID;
  order_id: UUID;
  used_at: Timestamp;
}

export interface StoreAnalyticsSummary {
  store_id: UUID;
  date: string;
  visitors: number;
  page_views: number;
  orders: number;
  revenue: number;
  conversion_rate: number;
  average_order_value: number;
  created_at: Timestamp;
}

export interface PageAnalytics {
  id: UUID;
  store_id: UUID;
  path: string;
  title?: string;
  visitors: number;
  page_views: number;
  bounce_rate: number;
  average_time: number;
  date: string;
  created_at: Timestamp;
}

export interface StoreConfig {
  id: UUID;
  store_id: UUID;
  key: string;
  value: ConfigValue;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GlobalConfig {
  id: UUID;
  key: string;
  value: ConfigValue;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StoreIntegration {
  id: UUID;
  store_id: UUID;
  provider: string;
  type: 'payment' | 'shipping' | 'analytics' | 'marketing' | 'inventory' | 'other';
  config: IntegrationConfig;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SyncHistory {
  id: UUID;
  store_id: UUID;
  integration_id: UUID;
  type: 'products' | 'orders' | 'customers' | 'inventory' | 'other';
  status: 'pending' | 'running' | 'completed' | 'failed';
  records_processed: number;
  errors?: SyncError[];
  started_at: Timestamp;
  completed_at?: Timestamp;
}

export interface InventoryLog {
  id: UUID;
  store_id: UUID;
  product_id: UUID;
  type: 'adjustment' | 'sale' | 'return' | 'transfer' | 'restock';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason?: string;
  reference_id?: UUID;
  created_at: Timestamp;
}

// Input types for creating/updating records
export interface CreateUserInput {
  email: string;
  password_hash?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  role?: 'user' | 'admin' | 'owner';
  metadata?: UserMetadata;
}

export interface UpdateUserInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  role?: 'user' | 'admin' | 'owner';
  is_active?: boolean;
  email_verified?: boolean;
  metadata?: UserMetadata;
}

export interface CreateStoreInput {
  name: string;
  slug: string;
  description?: string;
  owner_id: UUID;
  theme?: string;
  domain?: string;
  logo_url?: string;
  cover_image_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  currency?: string;
  tax_rate?: number;
  shipping_enabled?: boolean;
  pickup_enabled?: boolean;
  social_facebook?: string;
  social_instagram?: string;
  social_twitter?: string;
  analytics_enabled?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
}

export interface UpdateStoreInput {
  name?: string;
  slug?: string;
  description?: string;
  theme?: string;
  domain?: string;
  logo_url?: string;
  cover_image_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  currency?: string;
  tax_rate?: number;
  shipping_enabled?: boolean;
  pickup_enabled?: boolean;
  social_facebook?: string;
  social_instagram?: string;
  social_twitter?: string;
  analytics_enabled?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  is_active?: boolean;
}

export interface CreateProductInput {
  store_id: UUID;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price: number;
  compare_price?: number;
  cost_price?: number;
  sku?: string;
  barcode?: string;
  track_inventory?: boolean;
  inventory_quantity?: number;
  allow_backorder?: boolean;
  weight?: number;
  dimensions?: string;
  category_id?: UUID;
  brand?: string;
  tags?: string[];
  images?: string[];
  featured_image?: string;
  is_active?: boolean;
  is_featured?: boolean;
  is_digital?: boolean;
  meta_title?: string;
  meta_description?: string;
  visibility?: 'public' | 'private' | 'hidden';
  sort_order?: number;
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string;
  short_description?: string;
  price?: number;
  compare_price?: number;
  cost_price?: number;
  sku?: string;
  barcode?: string;
  track_inventory?: boolean;
  inventory_quantity?: number;
  allow_backorder?: boolean;
  weight?: number;
  dimensions?: string;
  category_id?: UUID;
  brand?: string;
  tags?: string[];
  images?: string[];
  featured_image?: string;
  is_active?: boolean;
  is_featured?: boolean;
  is_digital?: boolean;
  meta_title?: string;
  meta_description?: string;
  visibility?: 'public' | 'private' | 'hidden';
  sort_order?: number;
}

export interface CreateOrderInput {
  store_id: UUID;
  customer_id?: UUID;
  order_number: string;
  status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  subtotal: number;
  tax_amount?: number;
  shipping_amount?: number;
  total_amount: number;
  currency?: string;
  payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method?: string;
  shipping_method?: string;
  customer_email: string;
  customer_phone?: string;
  billing_address?: Address;
  shipping_address?: Address;
  notes?: string;
}

export interface CreateOrderItemInput {
  order_id: UUID;
  product_id: UUID;
  product_name: string;
  product_sku?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface CreateBlogPostInput {
  store_id: UUID;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  featured_image?: string;
  status?: 'draft' | 'published' | 'scheduled';
  published_at?: Timestamp;
  scheduled_for?: Timestamp;
  meta_title?: string;
  meta_description?: string;
  tags?: string[];
  category?: string;
  author_id: UUID;
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  featured_image?: string;
  status?: 'draft' | 'published' | 'scheduled';
  published_at?: Timestamp;
  scheduled_for?: Timestamp;
  meta_title?: string;
  meta_description?: string;
  tags?: string[];
  category?: string;
}

export interface CreateCouponInput {
  store_id: UUID;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimum_amount?: number;
  usage_limit?: number;
  is_active?: boolean;
  starts_at?: Timestamp;
  expires_at?: Timestamp;
}

export interface CreateAnalyticsEventInput {
  store_id: UUID;
  event_type: AnalyticsEventType;
  path: string;
  title?: string;
  user_id?: UUID;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  referrer?: string;
  metadata?: EventMetadata;
}

export interface CreateStoreConfigInput {
  store_id: UUID;
  key: string;
  value: ConfigValue;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface CreateStoreIntegrationInput {
  store_id: UUID;
  provider: string;
  type: 'payment' | 'shipping' | 'analytics' | 'marketing' | 'inventory' | 'other';
  config: IntegrationConfig;
  is_active?: boolean;
}

// Filter types
export interface ProductFilters {
  category_id?: UUID;
  brand?: string;
  price_min?: number;
  price_max?: number;
  is_active?: boolean;
  is_featured?: boolean;
  tags?: string[];
  search?: string;
}

export interface OrderFilters {
  status?: string;
  payment_status?: string;
  customer_email?: string;
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
}

export interface BlogPostFilters {
  status?: 'draft' | 'published' | 'scheduled';
  category?: string;
  tags?: string[];
  author_id?: UUID;
  search?: string;
}

// Response types
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
  visitors: number;
  page_views: number;
  orders: number;
  revenue: number;
  conversion_rate: number;
  average_order_value: number;
  bounce_rate: number;
  top_pages: Array<{
    path: string;
    title?: string;
    views: number;
  }>;
  top_products: Array<{
    id: UUID;
    name: string;
    sales: number;
    revenue: number;
  }>;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  timeout?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
}

export type AnalyticsEventType = 
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'order_completed'
  | 'search'
  | 'custom';

// ShipStation Integration Types
export interface CustomsItem {
  description: string;
  quantity: number;
  value: number;
  harmonized_tariff_code?: string;
  country_of_origin?: string;
}

export interface InternationalOptions {
  contents?: string;
  customs_items?: CustomsItem[];
  non_delivery?: string;
}

export interface AdvancedOptions {
  warehouse_id?: string;
  non_machinable?: boolean;
  saturday_delivery?: boolean;
  contains_alcohol?: boolean;
  store_id?: string;
  custom_field1?: string;
  custom_field2?: string;
  custom_field3?: string;
  source?: string;
  merge_option?: string;
  parent_id?: string;
  bill_to_party?: string;
  bill_to_account?: string;
  bill_to_postal_code?: string;
  bill_to_country_code?: string;
  bill_to_my_other_account?: string;
}

export interface ShipmentNotification {
  id: UUID;
  order_id: UUID;
  notification_type: 'shipped' | 'delivered' | 'exception' | 'in_transit' | 'out_for_delivery';
  sent_at: Timestamp;
  email_sent: boolean;
  email_error?: string;
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;
  message?: string;
  created_at: Timestamp;
}

export interface ShipmentData {
  shipment_id: string;
  order_id: string;
  user_id?: string;
  order_number: string;
  create_date: string;
  ship_date?: string;
  shipment_cost?: number;
  insurance_cost?: number;
  tracking_number?: string;
  is_return_label?: boolean;
  batch_number?: string;
  carrier_code?: string;
  service_code?: string;
  package_code?: string;
  confirmation?: string;
  warehouse_id?: string;
  voided?: boolean;
  void_date?: string;
  marketplace_notified?: boolean;
  notify_error_message?: string;
  ship_to?: Address;
  weight?: {
    value: number;
    units: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    units: string;
  };
  insurance_options?: {
    provider: string;
    insure_shipment: boolean;
    insured_value: number;
  };
  international_options?: InternationalOptions;
  advanced_options?: AdvancedOptions;
  label_data?: string;
  form_data?: string;
}

export interface ShipStationWebhookPayload {
  resource_url: string;
  resource_type: 'ITEM_ORDER_NOTIFY' | 'ITEM_SHIP_NOTIFY' | 'ITEM_DELIVERED_NOTIFY';
  resource_id: string;
  order_id?: string;
  shipment_id?: string;
  tracking_number?: string;
  carrier_code?: string;
  service_code?: string;
  package_code?: string;
  ship_date?: string;
  delivered_date?: string;
  exception_date?: string;
  exception_description?: string;
  tracking_status?: string;
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  shipment_cost?: number;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    units: string;
  };
  label_url?: string;
  form_url?: string;
  delivery_confirmation?: string;
  signature_required?: boolean;
  adult_signature?: boolean;
  ship_to?: Address;
  created_at: string;
}

export interface OrderStatusUpdateData {
  order_id: UUID;
  shipstation_order_id?: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  carrier_code?: string;
  service_code?: string;
  shipped_at?: Timestamp;
  delivered_at?: Timestamp;
  estimated_delivery_date?: Timestamp;
  actual_delivery_date?: Timestamp;
  shipment_cost?: number;
  label_url?: string;
  form_url?: string;
  notes?: string;
  updated_by?: string;
}

export interface InventoryAdjustment {
  product_id: UUID;
  sku: string;
  quantity_change: number;
  reason: 'sale' | 'return' | 'damage' | 'theft' | 'found' | 'adjustment' | 'shipment';
  reference_id?: UUID;
  reference_type?: 'order' | 'shipment' | 'return' | 'manual';
  notes?: string;
}

export interface NotificationTemplate {
  id: UUID;
  store_id: UUID;
  template_type: 'order_confirmation' | 'shipment_notification' | 'delivery_notification' | 'exception_notification';
  subject: string;
  html_content: string;
  text_content?: string;
  variables?: Record<string, string>;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface JobPayload {
  order_id?: UUID;
  product_id?: UUID;
  shipment_id?: string;
  webhook_data?: {
    resource_url: string;
    resource_type: string;
    resource_id: string;
    [key: string]: string | number | boolean;
  };
  notification_data?: {
    template_id: UUID;
    recipient_email: string;
    variables: Record<string, string | number>;
  };
  sync_data?: {
    integration_type: string;
    operation: string;
    filters?: Record<string, string | number | boolean>;
  };
  custom_data?: Record<string, string | number | boolean>;
}

export interface JobQueue {
  id: UUID;
  job_type: 'order_notification' | 'inventory_update' | 'shipment_processing' | 'webhook_processing';
  payload: JobPayload;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attempts: number;
  max_attempts: number;
  error_message?: string;
  scheduled_at?: Timestamp;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RequestBody {
  [key: string]: string | number | boolean | string[] | number[] | boolean[] | null;
}

export interface LogRequestData {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url?: string;
  headers?: Record<string, string>;
  body?: string | RequestBody;
  query_params?: Record<string, string | number>;
  authentication_type?: 'api_key' | 'oauth' | 'basic' | 'bearer';
}

export interface ResponseBody {
  [key: string]: string | number | boolean | string[] | number[] | boolean[] | null;
}

export interface LogResponseData {
  status_code?: number;
  headers?: Record<string, string>;
  body?: string | ResponseBody;
  response_time_ms?: number;
  content_type?: string;
  content_length?: number;
}

export interface IntegrationLog {
  id: UUID;
  store_id: UUID;
  integration_type: 'shipstation' | 'shipengine' | 'stripe' | 'other';
  operation: 'order_export' | 'shipment_import' | 'inventory_sync' | 'webhook_processing';
  status: 'success' | 'failure' | 'warning';
  request_data?: LogRequestData;
  response_data?: LogResponseData;
  error_message?: string;
  execution_time_ms?: number;
  created_at: Timestamp;
}

export interface CouponValidationResult {
  isValid: boolean;
  discount: number;
  message?: string;
  coupon?: Coupon;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}