/**
 * Row shapes returned by `db.query` for the application's Postgres tables.
 *
 * These mirror the physical columns (names, nullability and driver-level JS
 * types) rather than the higher-level domain models in `./database.ts`. Pass
 * them as the generic argument to `query<Row>(...)` so result rows are typed at
 * the boundary instead of being narrowed at every use site.
 *
 * Notes on driver types:
 * - `numeric`/`decimal` columns come back from `pg` as strings, not numbers.
 * - `bigint` results of `COUNT(*)` also come back as strings.
 * - Nullable columns are typed `| null`.
 */

/** Row of `public.store_integrations`. */
export type StoreIntegrationRow = {
  id: string;
  store_id: string;
  integration_type: string;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  configuration: Record<string, unknown> | null;
  auto_sync_enabled: boolean | null;
  auto_sync_interval: string | null;
  sync_frequency: string | null;
  last_sync_at: Date | null;
  sync_status: string | null;
  sync_error_message: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  shipstation_username: string | null;
  shipstation_password_hash: string | null;
  shipstation_auth_enabled: boolean | null;
};

/** Row of `public.orders`. */
export type OrderRow = {
  id: string;
  store_id: string;
  order_number: string;
  customer_email: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string | null;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string | null;
  billing_first_name: string | null;
  billing_last_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  subtotal: string;
  tax_amount: string | null;
  shipping_amount: string | null;
  discount_amount: string | null;
  total_amount: string;
  payment_method: string | null;
  payment_status: string | null;
  payment_transaction_id: string | null;
  shipping_method: string | null;
  tracking_number: string | null;
  estimated_delivery_date: string | null;
  status: string | null;
  fulfillment_status: string | null;
  shipstation_order_id: string | null;
  shipengine_shipment_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  shipstation_order_key: string | null;
  shipstation_order_status: string | null;
  tracking_url: string | null;
  carrier: string | null;
  carrier_code: string | null;
  service_code: string | null;
  package_code: string | null;
  actual_delivery_date: string | null;
  shipment_cost: string | null;
  shipment_weight: string | null;
  shipment_dimensions: Record<string, unknown> | null;
  label_url: string | null;
  form_url: string | null;
  insurance_cost: string | null;
  confirmation_delivery: boolean | null;
  signature_required: boolean | null;
  adult_signature: boolean | null;
  delivery_confirmation: string | null;
  customs_items: Record<string, unknown> | null;
  international_options: Record<string, unknown> | null;
  advanced_options: Record<string, unknown> | null;
  shipment_data: Record<string, unknown> | null;
  notes: string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id: string | null;
  stripe_account_id: string | null;
  payment_provider: string | null;
  amount_total: string | null;
  currency: string | null;
  refunded_amount: string;
  application_fee_amount: string | null;
  paid_at: Date | null;
  refunded_at: Date | null;
};

/** Row of `public.order_items`. */
export type OrderItemRow = {
  id: string;
  store_id: string;
  order_id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_image_url: string | null;
  unit_price: string;
  quantity: number;
  total_price: string;
  discount_type: string | null;
  discount_value: string | null;
  discount_amount: string | null;
  created_at: Date | null;
};

/** Row of `public.stores`. */
export type StoreRow = {
  id: string;
  owner_id: string;
  store_name: string;
  store_slug: string;
  store_description: string | null;
  hero_title: string | null;
  hero_description: string | null;
  domain: string | null;
  subdomain: string | null;
  theme_name: string | null;
  custom_css: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  currency: string | null;
  timezone: string | null;
  is_active: boolean | null;
  is_public: boolean | null;
  allow_guest_checkout: boolean | null;
  meta_title: string | null;
  meta_description: string | null;
  google_analytics_id: string | null;
  facebook_pixel_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/** Row of `public.notification_templates`. */
export type NotificationTemplateRow = {
  id: string;
  store_id: string;
  template_type: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  variables: Record<string, unknown> | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/** A `COUNT(*)`/`COUNT(x)` projection. `pg` returns bigint columns as strings. */
export type CountRow = {
  count: string;
};
