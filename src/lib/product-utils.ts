import { Product, EnhancedProduct, ProductOverride, ProductImage, DiscountInfo } from '@/types/product';
import sanitizeHtml from 'sanitize-html';

/**
 * Product override system: Custom descriptions completely replace ShipStation data when set
 */
export function getProductDescription(product: Product, override?: ProductOverride): string {
  // If override exists, use it exclusively - do not combine with ShipStation description
  if (override?.description_override) {
    return sanitizeHtml(override.description_override, {
      allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6'],
      allowedAttributes: {
        '*': ['class', 'id']
      }
    });
  }
  // Otherwise use ShipStation description
  return product.description || '';
}

/**
 * Get the display name for a product (with override support)
 */
export function getProductDisplayName(product: Product, override?: ProductOverride): string {
  return override?.seo_title || product.name;
}

/**
 * Get the display price for a product (with override and discount support)
 */
export function getProductDisplayPrice(product: Product, override?: ProductOverride): number {
  const basePrice = product.price || product.customs_value?.amount || 0;
  
  // Apply price override if set
  const overridePrice = override?.price_override || basePrice;
  
  // Apply discount if active
  if (override?.discount_data?.is_active) {
    const discount = override.discount_data;
    if (discount.type === 'percentage') {
      return overridePrice * (1 - discount.value / 100);
    } else if (discount.type === 'fixed') {
      return Math.max(0, overridePrice - discount.value);
    }
  }
  
  return overridePrice;
}

/**
 * Get original price (for showing discount)
 */
export function getProductOriginalPrice(product: Product, override?: ProductOverride): number | null {
  const basePrice = product.price || product.customs_value?.amount || 0;
  const overridePrice = override?.price_override || basePrice;
  
  if (override?.discount_data?.is_active) {
    return overridePrice;
  }
  
  return null;
}

/**
 * Get product images with override support
 */
export function getProductImages(product: Product, override?: ProductOverride): ProductImage[] {
  const images: ProductImage[] = [];
  
  // Add ShipStation thumbnail as primary image
  if (product.thumbnail_url) {
    images.push({
      id: 'shipstation-primary',
      url: product.thumbnail_url,
      alt: product.name,
      caption: product.name,
      order: 0,
      is_primary: true
    });
  }
  
  // Add override images if available
  if (override?.gallery_images) {
    override.gallery_images.forEach((img, index) => {
      images.push({
        ...img,
        order: index + 1,
        is_primary: false
      });
    });
  }
  
  return images.sort((a, b) => a.order - b.order);
}

/**
 * Check if product is visible (considering override)
 */
export function isProductVisible(product: Product, override?: ProductOverride): boolean {
  // Check override visibility first
  if (override?.visibility_override !== undefined) {
    return override.visibility_override;
  }
  
  // Default to active status from ShipStation
  return product.active !== false;
}

/**
 * Get product availability information
 */
export function getProductAvailability(product: Product, inventoryLevel?: number) {
  const stock = inventoryLevel ?? product.available_stock ?? 0;
  
  return {
    stock_level: stock,
    is_in_stock: stock > 0,
    is_low_stock: stock > 0 && stock <= 10,
    is_out_of_stock: stock <= 0,
    stock_message: stock <= 0 ? 'Out of Stock' : 
                   stock <= 10 ? `Only ${stock} left` : 
                   'In Stock'
  };
}

/**
 * Format product price with currency
 */
export function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(price);
}

/**
 * Calculate discount percentage
 */
export function calculateDiscountPercentage(originalPrice: number, discountedPrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
}

/**
 * Get product specifications with override support
 */
export function getProductSpecifications(product: Product, override?: ProductOverride): Record<string, string> {
  const specs: Record<string, string> = {};
  
  // Add ShipStation specs
  if (product.sku) specs['SKU'] = product.sku;
  if (product.weight) specs['Weight'] = `${product.weight.value} ${product.weight.unit}`;
  if (product.dimensions) {
    specs['Dimensions'] = `${product.dimensions.length} × ${product.dimensions.width} × ${product.dimensions.height} ${product.dimensions.unit}`;
  }
  if (product.customs_country_code) specs['Origin'] = product.customs_country_code;
  
  // Add override specs (these can override ShipStation specs)
  if (override?.specifications) {
    Object.assign(specs, override.specifications);
  }
  
  return specs;
}

/**
 * Get product features with override support
 */
export function getProductFeatures(product: Product, override?: ProductOverride): string[] {
  const features: string[] = [];
  
  // Add basic features from ShipStation data
  if (product.customs_description) {
    features.push(product.customs_description);
  }
  
  // Add override features
  if (override?.features) {
    features.push(...override.features);
  }
  
  return features;
}

/**
 * Generate product URL slug
 */
export function generateProductSlug(product: Product): string {
  return product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get product category information
 */
export function getProductCategory(product: Product) {
  return {
    id: product.product_category?.product_category_id,
    name: product.product_category?.name || product.category || 'Other',
    slug: (product.product_category?.name || product.category || 'other')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  };
}

/**
 * Generate product keywords for SEO
 */
export function generateProductKeywords(product: Product, override?: ProductOverride): string[] {
  const keywords: string[] = [];
  
  // Add product name words
  keywords.push(...product.name.split(' ').filter(word => word.length > 2));
  
  // Add category
  const category = getProductCategory(product);
  if (category.name !== 'Other') {
    keywords.push(category.name);
  }
  
  // Add brand if available
  if (override?.brand) {
    keywords.push(override.brand);
  }
  
  // Add features as keywords
  const features = getProductFeatures(product, override);
  features.forEach(feature => {
    keywords.push(...feature.split(' ').filter(word => word.length > 3));
  });
  
  // Remove duplicates and return
  return [...new Set(keywords.map(k => k.toLowerCase()))];
}

/**
 * Transform ShipStation product to enhanced product
 */
export function transformToEnhancedProduct(
  product: Product, 
  override?: ProductOverride,
  inventoryLevel?: number
): EnhancedProduct {
  const availability = getProductAvailability(product, inventoryLevel);
  
  return {
    ...product,
    display_name: getProductDisplayName(product, override),
    display_description: getProductDescription(product, override),
    display_price: getProductDisplayPrice(product, override),
    display_images: getProductImages(product, override),
    is_visible: isProductVisible(product, override),
    
    // Metadata from override
    seo_title: override?.seo_title,
    seo_description: override?.seo_description,
    enhanced_description: override?.enhanced_description,
    features: override?.features,
    specifications: getProductSpecifications(product, override),
    gallery_images: override?.gallery_images,
    video_urls: override?.video_urls,
    brand: override?.brand,
    model: override?.model,
    warranty_info: override?.warranty_info,
    shipping_info: override?.shipping_info,
    return_policy: override?.return_policy,
    social_sharing_enabled: override?.social_sharing_enabled ?? true,
    featured_product: override?.featured_product ?? false,
    
    // Availability
    stock_level: availability.stock_level,
    is_in_stock: availability.is_in_stock,
    
    // Defaults for analytics
    view_count: 0,
    average_rating: 0,
    review_count: 0,
    
    // SEO
    meta_keywords: generateProductKeywords(product, override),
    canonical_url: `/store/${product.product_id}`,
    social_image_url: getProductImages(product, override)[0]?.url
  };
}

/**
 * Validate product data
 */
export function validateProductData(product: Partial<Product>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!product.product_id) errors.push('Product ID is required');
  if (!product.sku) errors.push('SKU is required');
  if (!product.name) errors.push('Product name is required');
  if (!product.price && !product.customs_value?.amount) errors.push('Price is required');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get product sharing URL
 */
export function getProductSharingUrl(product: Product, baseUrl: string = ''): string {
  return `${baseUrl}/store/${product.product_id}`;
}

/**
 * Check if discount is active
 */
export function isDiscountActive(discount?: DiscountInfo): boolean {
  if (!discount?.is_active) return false;
  
  const now = new Date();
  
  if (discount.start_date && new Date(discount.start_date) > now) {
    return false;
  }
  
  if (discount.end_date && new Date(discount.end_date) < now) {
    return false;
  }
  
  return true;
}

/**
 * Get discount information for display
 */
export function getDiscountInfo(product: Product, override?: ProductOverride) {
  const discount = override?.discount_data;
  
  if (!discount || !isDiscountActive(discount)) {
    return null;
  }
  
  const originalPrice = getProductOriginalPrice(product, override);
  const discountedPrice = getProductDisplayPrice(product, override);
  
  if (!originalPrice || originalPrice === discountedPrice) {
    return null;
  }
  
  return {
    type: discount.type,
    value: discount.value,
    original_price: originalPrice,
    discounted_price: discountedPrice,
    savings: originalPrice - discountedPrice,
    percentage: calculateDiscountPercentage(originalPrice, discountedPrice),
    is_active: true
  };
}