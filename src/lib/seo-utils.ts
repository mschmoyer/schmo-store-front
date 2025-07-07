import { EnhancedProduct } from '@/types/product';
import { ReviewSummary } from '@/types/review';

/**
 * Generate SEO-optimized page title
 */
export function generateSEOTitle(product: EnhancedProduct): string {
  // Use override title if available
  if (product.seo_title) {
    return product.seo_title;
  }
  
  // Generate title from product data
  const parts = [product.display_name];
  
  if (product.brand) {
    parts.push(product.brand);
  }
  
  // Add category if meaningful
  const category = product.product_category?.name || product.category;
  if (category && category !== 'Other') {
    parts.push(category);
  }
  
  // Add rating if available
  if (product.average_rating && product.review_count) {
    parts.push(`${product.average_rating.toFixed(1)} Stars`);
  }
  
  // Add store name
  parts.push('Premium Products');
  
  return parts.join(' | ');
}

/**
 * Generate SEO-optimized meta description
 */
export function generateSEODescription(product: EnhancedProduct): string {
  // Use override description if available
  if (product.seo_description) {
    return product.seo_description;
  }
  
  // Generate description from product data
  let description = '';
  
  // Start with product name and brand
  if (product.brand) {
    description += `${product.brand} ${product.display_name}`;
  } else {
    description += product.display_name;
  }
  
  // Add price
  description += ` - Starting at $${product.display_price.toFixed(2)}`;
  
  // Add brief product description
  if (product.display_description) {
    const briefDesc = product.display_description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .substring(0, 100)
      .trim();
    if (briefDesc) {
      description += `. ${briefDesc}`;
    }
  }
  
  // Add features if available
  if (product.features && product.features.length > 0) {
    const firstFeature = product.features[0].substring(0, 50);
    description += `. ${firstFeature}`;
  }
  
  // Add availability
  if (product.is_in_stock) {
    description += '. In stock and ready to ship.';
  }
  
  // Add reviews if available
  if (product.review_count && product.average_rating) {
    description += ` Rated ${product.average_rating.toFixed(1)}/5 by ${product.review_count} customers.`;
  }
  
  // Ensure description is within meta description length limits
  if (description.length > 155) {
    description = description.substring(0, 152) + '...';
  }
  
  return description;
}

/**
 * Generate product keywords for SEO
 */
export function generateProductKeywords(product: EnhancedProduct): string[] {
  const keywords = new Set<string>();
  
  // Add product name keywords
  const nameWords = product.display_name.toLowerCase().split(/\s+/);
  nameWords.forEach(word => {
    if (word.length > 2) {
      keywords.add(word);
    }
  });
  
  // Add brand
  if (product.brand) {
    keywords.add(product.brand.toLowerCase());
  }
  
  // Add category
  const category = product.product_category?.name || product.category;
  if (category && category !== 'Other') {
    keywords.add(category.toLowerCase());
  }
  
  // Add features
  if (product.features) {
    product.features.forEach(feature => {
      const featureWords = feature.toLowerCase().split(/\s+/);
      featureWords.forEach(word => {
        if (word.length > 3) {
          keywords.add(word);
        }
      });
    });
  }
  
  // Add specifications
  if (product.specifications) {
    Object.entries(product.specifications).forEach(([key, value]) => {
      const specWords = `${key} ${value}`.toLowerCase().split(/\s+/);
      specWords.forEach(word => {
        if (word.length > 3) {
          keywords.add(word);
        }
      });
    });
  }
  
  // Add model
  if (product.model) {
    keywords.add(product.model.toLowerCase());
  }
  
  // Add generic product keywords
  keywords.add('buy');
  keywords.add('shop');
  keywords.add('premium');
  keywords.add('quality');
  
  return Array.from(keywords);
}

/**
 * Generate canonical URL for product
 */
export function generateCanonicalUrl(product: EnhancedProduct, baseUrl: string = ''): string {
  return `${baseUrl}/store/${product.product_id}`;
}

/**
 * Generate Open Graph data
 */
export function generateOpenGraphData(product: EnhancedProduct, baseUrl: string = '') {
  const primaryImage = product.display_images[0];
  
  return {
    title: product.seo_title || product.display_name,
    description: generateSEODescription(product),
    type: 'product',
    url: generateCanonicalUrl(product, baseUrl),
    siteName: 'Premium Products Store',
    images: [
      {
        url: primaryImage?.url || '/placeholder-product.svg',
        width: 1200,
        height: 630,
        alt: product.display_name,
        secureUrl: primaryImage?.url || '/placeholder-product.svg',
      },
    ],
    product: {
      price: {
        amount: product.display_price.toFixed(2),
        currency: 'USD',
      },
      availability: product.is_in_stock ? 'instock' : 'outofstock',
      condition: 'new',
      retailer: 'Premium Products Store',
      brand: product.brand,
      category: product.product_category?.name || product.category,
    },
  };
}

/**
 * Generate Twitter Card data
 */
export function generateTwitterCardData(product: EnhancedProduct) {
  const primaryImage = product.display_images[0];
  
  return {
    card: 'summary_large_image',
    site: '@premiumstore',
    creator: '@premiumstore',
    title: product.seo_title || product.display_name,
    description: generateSEODescription(product),
    images: [primaryImage?.url || '/placeholder-product.svg'],
    app: {
      name: {
        iphone: 'Premium Products',
        ipad: 'Premium Products',
        googleplay: 'Premium Products',
      },
      id: {
        iphone: 'com.premiumstore.app',
        ipad: 'com.premiumstore.app',
        googleplay: 'com.premiumstore.app',
      },
    },
  };
}

/**
 * Generate robots meta tag
 */
export function generateRobotsTag(product: EnhancedProduct) {
  // Don't index products that are not visible or out of stock
  if (!product.is_visible || !product.is_in_stock) {
    return {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    };
  }
  
  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

/**
 * Generate breadcrumb structured data
 */
export function generateBreadcrumbStructuredData(product: EnhancedProduct, baseUrl: string = '') {
  const breadcrumbs = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: `${baseUrl}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Store',
      item: `${baseUrl}/store`,
    },
  ];
  
  // Add category if available
  const category = product.product_category?.name || product.category;
  if (category && category !== 'Other') {
    breadcrumbs.push({
      '@type': 'ListItem',
      position: 3,
      name: category,
      item: `${baseUrl}/store?category=${encodeURIComponent(category)}`,
    });
  }
  
  // Add product
  breadcrumbs.push({
    '@type': 'ListItem',
    position: breadcrumbs.length + 1,
    name: product.display_name,
    item: generateCanonicalUrl(product, baseUrl),
  });
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs,
  };
}

/**
 * Generate FAQ structured data from product features
 */
export function generateFAQStructuredData(product: EnhancedProduct) {
  const faqItems = [];
  
  // Add shipping info FAQ
  if (product.shipping_info) {
    faqItems.push({
      '@type': 'Question',
      name: 'What are the shipping options?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: product.shipping_info,
      },
    });
  }
  
  // Add return policy FAQ
  if (product.return_policy) {
    faqItems.push({
      '@type': 'Question',
      name: 'What is the return policy?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: product.return_policy,
      },
    });
  }
  
  // Add warranty FAQ
  if (product.warranty_info) {
    faqItems.push({
      '@type': 'Question',
      name: 'What warranty is included?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: product.warranty_info,
      },
    });
  }
  
  // Add specifications FAQ
  if (product.specifications && Object.keys(product.specifications).length > 0) {
    const specText = Object.entries(product.specifications)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    faqItems.push({
      '@type': 'Question',
      name: 'What are the product specifications?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: specText,
      },
    });
  }
  
  if (faqItems.length === 0) {
    return null;
  }
  
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems,
  };
}

/**
 * Generate page metadata for Next.js
 */
export function generatePageMetadata(product: EnhancedProduct, baseUrl: string = '') {
  const keywords = generateProductKeywords(product);
  
  return {
    title: generateSEOTitle(product),
    description: generateSEODescription(product),
    keywords: keywords.join(', '),
    authors: [{ name: 'Premium Products Store' }],
    creator: 'Premium Products Store',
    publisher: 'Premium Products Store',
    alternates: {
      canonical: generateCanonicalUrl(product, baseUrl),
    },
    openGraph: generateOpenGraphData(product, baseUrl),
    twitter: generateTwitterCardData(product),
    robots: generateRobotsTag(product),
    other: {
      'product:price:amount': product.display_price.toFixed(2),
      'product:price:currency': 'USD',
      'product:availability': product.is_in_stock ? 'instock' : 'outofstock',
      'product:condition': 'new',
      'product:brand': product.brand || '',
      'product:category': product.product_category?.name || product.category || '',
    },
  };
}

/**
 * Generate hreflang tags for international SEO
 */
export function generateHreflangTags(product: EnhancedProduct, baseUrl: string = '') {
  const canonicalUrl = generateCanonicalUrl(product, baseUrl);
  
  return {
    'en-US': canonicalUrl,
    'en': canonicalUrl,
    'x-default': canonicalUrl,
  };
}

/**
 * Generate structured data for reviews
 */
export function generateReviewStructuredData(product: EnhancedProduct, reviews: ReviewSummary) {
  if (!reviews.total_reviews || reviews.total_reviews === 0) {
    return null;
  }
  
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateRating',
    ratingValue: reviews.average_rating.toFixed(1),
    reviewCount: reviews.total_reviews.toString(),
    bestRating: '5',
    worstRating: '1',
    itemReviewed: {
      '@type': 'Product',
      name: product.display_name,
      image: product.display_images[0]?.url || '/placeholder-product.svg',
    },
  };
}

/**
 * Validate SEO metadata
 */
export function validateSEOMetadata(product: EnhancedProduct) {
  const warnings = [];
  const errors = [];
  
  // Check title length
  const title = generateSEOTitle(product);
  if (title.length > 60) {
    warnings.push('Title is too long (over 60 characters)');
  }
  if (title.length < 30) {
    warnings.push('Title is too short (under 30 characters)');
  }
  
  // Check description length
  const description = generateSEODescription(product);
  if (description.length > 155) {
    warnings.push('Meta description is too long (over 155 characters)');
  }
  if (description.length < 120) {
    warnings.push('Meta description is too short (under 120 characters)');
  }
  
  // Check for required fields
  if (!product.display_name) {
    errors.push('Product name is required');
  }
  
  if (!product.display_images || product.display_images.length === 0) {
    warnings.push('No product images available');
  }
  
  if (!product.display_description) {
    warnings.push('Product description is missing');
  }
  
  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}