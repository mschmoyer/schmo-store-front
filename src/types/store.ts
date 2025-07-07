export interface Store {
  id: string;
  userId: string;
  title: string;
  description: string;
  storeSlug: string;
  theme: string;
  domain: string | null;
  isActive: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreConfig {
  title: string;
  description: string;
  theme: string;
  slug: string;
}

export interface StoreCreationRequest {
  title: string;
  description: string;
  theme: string;
  slug?: string; // Optional - will be auto-generated if not provided
}

export interface StoreCreationResponse {
  success: boolean;
  store?: Store;
  storeUrl?: string;
  message?: string;
  error?: string;
}

export interface StoreUpdateRequest {
  title?: string;
  description?: string;
  theme?: string;
  domain?: string;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface SlugGenerationRequest {
  title: string;
}

export interface SlugGenerationResponse {
  success: boolean;
  slug?: string;
  suggestions?: string[];
  error?: string;
}

export interface SlugAvailabilityRequest {
  slug: string;
}

export interface SlugAvailabilityResponse {
  success: boolean;
  available: boolean;
  suggestions?: string[];
  error?: string;
}

export interface StoreStats {
  totalViews: number;
  totalOrders: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface StoreSettings {
  allowGuestCheckout: boolean;
  requireEmailVerification: boolean;
  enableReviews: boolean;
  enableWishlist: boolean;
  enableCoupons: boolean;
  enableInventoryTracking: boolean;
  enableBackorders: boolean;
  enableTaxCalculation: boolean;
  enableShipping: boolean;
  enableDigitalProducts: boolean;
}

export interface StoreTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  layout: {
    headerStyle: 'classic' | 'modern' | 'minimal';
    footerStyle: 'simple' | 'detailed' | 'minimal';
    productGridColumns: number;
    showBreadcrumbs: boolean;
  };
}

export interface StoreMetadata {
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  ogImage?: string;
  favicon?: string;
  googleAnalyticsId?: string;
  facebookPixelId?: string;
}

// Database types
export interface StoreRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  store_slug: string;
  theme: string;
  domain: string | null;
  is_active: boolean;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StoreWithUser extends Store {
  user: {
    id: string;
    email: string;
    createdAt: Date;
  };
}

export interface StoreListResponse {
  success: boolean;
  stores: Store[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}

export interface StoreValidationError {
  field: string;
  message: string;
  code: string;
}

export interface StoreApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  validationErrors?: StoreValidationError[];
}

// Reserved store slugs that cannot be used
export const RESERVED_SLUGS = [
  'admin',
  'api',
  'www',
  'app',
  'store',
  'shop',
  'cart',
  'checkout',
  'account',
  'auth',
  'login',
  'register',
  'signup',
  'signin',
  'logout',
  'dashboard',
  'settings',
  'help',
  'support',
  'about',
  'contact',
  'privacy',
  'terms',
  'blog',
  'news',
  'faq',
  'search',
  'orders',
  'products',
  'categories',
  'collections',
  'tags',
  'reviews',
  'wishlist',
  'compare',
  'shipping',
  'returns',
  'refunds',
  'coupons',
  'discounts',
  'gift-cards',
  'newsletter',
  'notifications',
  'preferences',
  'security',
  'billing',
  'invoices',
  'reports',
  'analytics',
  'integrations',
  'webhooks',
  'email',
  'sms',
  'push'
];

// Slug validation regex
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Maximum lengths
export const MAX_STORE_TITLE_LENGTH = 100;
export const MAX_STORE_DESCRIPTION_LENGTH = 500;
export const MAX_STORE_SLUG_LENGTH = 50;
export const MIN_STORE_SLUG_LENGTH = 3;