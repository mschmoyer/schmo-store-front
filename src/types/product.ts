import { ProductStructuredData } from '@/lib/structured-data';

// Core product type from ShipStation API
export interface Product {
  product_id: string;
  sku: string;
  name: string;
  description?: string;
  price?: number;
  available_stock?: number;
  thumbnail_url?: string;
  category?: string;
  product_category?: {
    product_category_id: number;
    name: string;
  };
  weight?: {
    value: number;
    unit: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
  };
  warehouse_location?: string;
  customs_country_code?: string;
  customs_description?: string;
  customs_value?: {
    amount: number;
    currency: string;
  };
  create_date?: string;
  modify_date?: string;
  active?: boolean;
}

// Enhanced product image type
export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  order: number;
  is_primary: boolean;
  width?: number;
  height?: number;
}

// Product override system types
export interface ProductOverride {
  id: string;
  product_id: string;
  description_override?: string; // Completely replaces ShipStation description
  seo_title?: string;
  seo_description?: string;
  enhanced_description?: string;
  features?: string[];
  specifications?: Record<string, string>;
  gallery_images?: ProductImage[];
  video_urls?: string[];
  brand?: string;
  model?: string;
  warranty_info?: string;
  shipping_info?: string;
  return_policy?: string;
  social_sharing_enabled: boolean;
  featured_product: boolean;
  visibility_override?: boolean;
  price_override?: number;
  discount_data?: DiscountInfo;
  created_at: string;
  updated_at: string;
}

// Discount information
export interface DiscountInfo {
  type: 'percentage' | 'fixed';
  value: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

// Enhanced product with metadata and overrides
export interface EnhancedProduct extends Product {
  // Display data (combination of ShipStation + overrides)
  display_name: string;
  display_description: string;
  display_price: number;
  display_images: ProductImage[];
  is_visible: boolean;
  
  // Metadata
  seo_title?: string;
  seo_description?: string;
  enhanced_description?: string;
  features?: string[];
  specifications?: Record<string, string>;
  gallery_images?: ProductImage[];
  video_urls?: string[];
  brand?: string;
  model?: string;
  warranty_info?: string;
  shipping_info?: string;
  return_policy?: string;
  social_sharing_enabled: boolean;
  featured_product: boolean;
  
  // SEO and social data
  meta_keywords?: string[];
  canonical_url?: string;
  social_image_url?: string;
  
  // Analytics and engagement
  view_count?: number;
  average_rating?: number;
  review_count?: number;
  last_viewed?: string;
  
  // Availability and stock
  stock_level: number;
  low_stock_threshold?: number;
  is_in_stock: boolean;
  backorder_allowed?: boolean;
  estimated_restock_date?: string;
  
  // HS Code for international trade
  hs_code?: string;
  hs_code_description?: string;
  hs_code_confidence?: number;
  hs_code_generated_at?: string;
}

// Product display logic utility type
export interface ProductDisplay {
  // Core product data from ShipStation (always authoritative)
  id: string;
  sku: string;
  name: string;
  base_price: number;
  inventory: number;
  specifications: Record<string, string | number | boolean>;
  
  // Display data (combination of ShipStation + overrides)
  display_name: string;
  display_description: string; // Override completely replaces ShipStation description
  display_price: number;
  display_images: ProductImage[];
  is_visible: boolean;
  
  // Override data from admin
  description_override?: string; // When set, this IS the description (not appended)
  price_override?: number;
  image_overrides?: ProductImage[];
  visibility_override?: boolean;
  discount_data?: DiscountInfo;
}

// Product category type
export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
  slug: string;
  parent_id?: number;
  image_url?: string;
  is_active: boolean;
  product_count?: number;
  seo_title?: string;
  seo_description?: string;
  created_at: string;
  updated_at: string;
}

// Product tag type
export interface ProductTag {
  id: string;
  name: string;
  slug: string;
  color?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Cart item type
export interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
  sku?: string;
  max_quantity?: number;
  selected_options?: Record<string, string>;
}

// Inventory item type
export interface InventoryItem {
  sku: string;
  available: number;
  on_hand: number;
  allocated: number;
  warehouse_id?: string;
  warehouse_name?: string;
  last_updated?: string;
}

// Product analytics event type
export interface ProductAnalyticsEvent {
  id: string;
  product_id: string;
  event_type: 'view' | 'add_to_cart' | 'purchase' | 'share' | 'review' | 'zoom' | 'gallery_interaction';
  event_data?: Record<string, string | number | boolean>;
  user_agent?: string;
  ip_address?: string;
  referrer?: string;
  user_id?: string;
  session_id?: string;
  created_at: string;
}

// Product search filters
export interface ProductFilters {
  category?: string | string[];
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  in_stock?: boolean;
  featured?: boolean;
  brand?: string | string[];
  tags?: string | string[];
  sort_by?: 'name' | 'price' | 'rating' | 'created_at' | 'popularity';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Product search results
export interface ProductSearchResults {
  products: EnhancedProduct[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
  filters_applied: ProductFilters;
  facets?: {
    categories: { name: string; count: number; }[];
    brands: { name: string; count: number; }[];
    price_ranges: { min: number; max: number; count: number; }[];
    ratings: { rating: number; count: number; }[];
  };
}

// Product recommendation types
export interface ProductRecommendation {
  product: EnhancedProduct;
  score: number;
  reason: 'similar_category' | 'frequently_bought_together' | 'customers_also_viewed' | 'price_similar' | 'trending';
  explanation?: string;
}

// Product comparison type
export interface ProductComparison {
  products: EnhancedProduct[];
  comparison_fields: {
    field: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'rating' | 'price';
    values: (string | number | boolean)[];
  }[];
}

// Product sharing data
export interface ProductSharingData {
  url: string;
  title: string;
  description: string;
  image_url: string;
  hashtags?: string[];
  via?: string;
}

// Product metadata for SEO
export interface ProductSEOMetadata {
  title: string;
  description: string;
  keywords: string[];
  canonical_url: string;
  og_title: string;
  og_description: string;
  og_image: string;
  og_url: string;
  twitter_card: 'summary' | 'summary_large_image';
  twitter_title: string;
  twitter_description: string;
  twitter_image: string;
  structured_data: ProductStructuredData;
}