// Store-related TypeScript types
export interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  heroTitle?: string;
  heroDescription?: string;
  themeId: string;
  adminEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreIntegration {
  id: string;
  storeId: string;
  integrationType: 'shipengine' | 'stripe';
  apiKeyEncrypted?: string;
  configuration?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreCategory {
  id: string;
  storeId: string;
  categoryName: string;
  isVisible: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreTheme {
  id: string;
  name: string;
  displayName: string;
  description: string;
  previewImage?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  layout: {
    headerStyle: 'default' | 'minimal' | 'bold';
    footerStyle: 'default' | 'minimal' | 'extended';
  };
}

export interface StoreConfiguration {
  store: Store;
  integrations: StoreIntegration[];
  categories: StoreCategory[];
  theme: StoreTheme;
  settings: {
    allowGuestCheckout: boolean;
    requireAccountForPurchase: boolean;
    showInventoryCount: boolean;
    enableWishlist: boolean;
    enableProductReviews: boolean;
    enableBlog: boolean;
    enableNewsletter: boolean;
    socialMedia: {
      facebook?: string;
      twitter?: string;
      instagram?: string;
      youtube?: string;
    };
    contact: {
      email?: string;
      phone?: string;
      address?: string;
    };
    seo: {
      metaTitle?: string;
      metaDescription?: string;
      googleAnalyticsId?: string;
      facebookPixelId?: string;
    };
  };
}

export interface StoreCreationRequest {
  name: string;
  slug: string;
  description?: string;
  adminEmail: string;
  adminPassword: string;
  themeId?: string;
  heroTitle?: string;
  heroDescription?: string;
}

export interface StoreUpdateRequest {
  name?: string;
  description?: string;
  heroTitle?: string;
  heroDescription?: string;
  themeId?: string;
}

export interface StoreIntegrationUpdateRequest {
  apiKey: string;
  configuration?: Record<string, unknown>;
  isActive: boolean;
}

export interface StoreCategoryUpdateRequest {
  categoryName: string;
  isVisible: boolean;
  sortOrder: number;
}

export interface StoreAnalytics {
  period: 'day' | 'week' | 'month' | 'year';
  metrics: {
    pageViews: number;
    uniqueVisitors: number;
    orders: number;
    revenue: number;
    averageOrderValue: number;
    conversionRate: number;
  };
  topProducts: Array<{
    productId: string;
    name: string;
    views: number;
    orders: number;
    revenue: number;
  }>;
  topCategories: Array<{
    categoryName: string;
    views: number;
    orders: number;
    revenue: number;
  }>;
  trafficSources: Array<{
    source: string;
    visitors: number;
    percentage: number;
  }>;
}

export interface StoreBackup {
  id: string;
  storeId: string;
  type: 'manual' | 'automatic';
  data: {
    store: Store;
    integrations: StoreIntegration[];
    categories: StoreCategory[];
    productOverrides: unknown[];
    blogPosts: unknown[];
  };
  createdAt: Date;
  size: number;
}

export interface StoreExportOptions {
  includeProducts: boolean;
  includeBlogPosts: boolean;
  includeCategories: boolean;
  includeIntegrations: boolean;
  format: 'json' | 'csv' | 'xml';
}