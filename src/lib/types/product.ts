// Product-related TypeScript types
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  inventory: number;
  images: string[];
  categoryId?: string;
  categoryName?: string;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // ShipEngine specific fields
  shipEngineId?: string;
  warehouseId?: string;
}

export interface ProductOverride {
  id: string;
  storeId: string;
  productId: string;
  customDescription?: string;
  isVisible: boolean;
  discountType?: 'fixed' | 'percentage';
  discountValue?: number;
  customImages?: string[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithOverrides extends Product {
  override?: ProductOverride;
  effectiveDescription: string;
  effectivePrice: number;
  effectiveImages: string[];
  hasDiscount: boolean;
  discountAmount?: number;
  discountPercentage?: number;
}

export interface ProductOverrideUpdateRequest {
  customDescription?: string;
  isVisible: boolean;
  discountType?: 'fixed' | 'percentage';
  discountValue?: number;
  customImages?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

export interface ProductFilters {
  category?: string;
  priceRange?: {
    min: number;
    max: number;
  };
  availability?: 'in-stock' | 'out-of-stock' | 'low-stock';
  visibility?: 'visible' | 'hidden';
  discount?: boolean;
  search?: string;
  tags?: string[];
}

export interface ProductListResponse {
  products: ProductWithOverrides[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
  filters: {
    categories: Array<{
      id: string;
      name: string;
      count: number;
    }>;
    priceRange: {
      min: number;
      max: number;
    };
    tags: Array<{
      name: string;
      count: number;
    }>;
  };
}

export interface ProductAnalytics {
  period: 'day' | 'week' | 'month' | 'year';
  metrics: {
    totalProducts: number;
    visibleProducts: number;
    hiddenProducts: number;
    productsWithDiscounts: number;
    productsWithCustomDescriptions: number;
    totalViews: number;
    averagePrice: number;
    inventoryValue: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    views: number;
    orders: number;
    revenue: number;
    conversionRate: number;
  }>;
  categoryPerformance: Array<{
    categoryId: string;
    categoryName: string;
    productCount: number;
    averagePrice: number;
    totalViews: number;
    totalOrders: number;
  }>;
  priceDistribution: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  inventoryStatus: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
  };
}

export interface ProductImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{
    product: string;
    error: string;
  }>;
  summary: {
    totalProcessed: number;
    newProducts: number;
    updatedProducts: number;
    failedProducts: number;
  };
}

export interface ProductExportOptions {
  includeOverrides: boolean;
  includeImages: boolean;
  includeAnalytics: boolean;
  format: 'json' | 'csv' | 'xml';
  filters?: ProductFilters;
}

export interface ProductBulkUpdateRequest {
  productIds: string[];
  updates: {
    visibility?: boolean;
    discountType?: 'fixed' | 'percentage';
    discountValue?: number;
    categoryId?: string;
    tags?: string[];
  };
}

export interface ProductImageUpload {
  file: File;
  productId: string;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductImageUploadResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface ProductSEO {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  openGraph: {
    title: string;
    description: string;
    image: string;
    url: string;
    type: string;
    price?: {
      amount: number;
      currency: string;
    };
  };
  twitter: {
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    image: string;
  };
  structuredData: {
    '@context': string;
    '@type': string;
    name: string;
    description: string;
    image: string[];
    sku: string;
    brand?: string;
    offers: {
      '@type': string;
      price: number;
      priceCurrency: string;
      availability: string;
      url: string;
    };
  };
}