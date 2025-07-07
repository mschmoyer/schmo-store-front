import { EnhancedProduct } from '@/types/product';
import { ReviewSummary, Review } from '@/types/review';

/**
 * Generate Product JSON-LD structured data
 */
export function generateProductStructuredData(product: EnhancedProduct, reviews?: ReviewSummary, baseUrl: string = '') {
  const primaryImage = product.display_images[0];
  const additionalImages = product.display_images.slice(1);
  
  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.display_name,
    description: product.display_description?.replace(/<[^>]*>/g, '') || '',
    image: primaryImage?.url || '/placeholder-product.svg',
    url: `${baseUrl}/store/${product.product_id}`,
    sku: product.sku,
    mpn: product.model || product.sku,
    brand: product.brand ? {
      '@type': 'Brand',
      name: product.brand,
    } : undefined,
    category: product.product_category?.name || product.category,
    offers: {
      '@type': 'Offer',
      price: product.display_price.toFixed(2),
      priceCurrency: 'USD',
      availability: product.is_in_stock 
        ? 'https://schema.org/InStock' 
        : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/store/${product.product_id}`,
      seller: {
        '@type': 'Organization',
        name: 'Premium Products Store',
        url: baseUrl,
      },
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
    },
  };
  
  // Add additional images
  if (additionalImages.length > 0) {
    structuredData.image = [
      primaryImage?.url || '/placeholder-product.svg',
      ...additionalImages.map(img => img.url),
    ];
  }
  
  // Add product specifications
  if (product.specifications && Object.keys(product.specifications).length > 0) {
    structuredData.additionalProperty = Object.entries(product.specifications).map(([key, value]) => ({
      '@type': 'PropertyValue',
      name: key,
      value: value,
    }));
  }
  
  // Add weight and dimensions
  if (product.weight) {
    structuredData.weight = {
      '@type': 'QuantitativeValue',
      value: product.weight.value,
      unitCode: product.weight.unit.toUpperCase(),
    };
  }
  
  if (product.dimensions) {
    structuredData.width = {
      '@type': 'QuantitativeValue',
      value: product.dimensions.width,
      unitCode: product.dimensions.unit.toUpperCase(),
    };
    structuredData.height = {
      '@type': 'QuantitativeValue',
      value: product.dimensions.height,
      unitCode: product.dimensions.unit.toUpperCase(),
    };
    structuredData.depth = {
      '@type': 'QuantitativeValue',
      value: product.dimensions.length,
      unitCode: product.dimensions.unit.toUpperCase(),
    };
  }
  
  // Add reviews and ratings
  if (reviews && reviews.total_reviews > 0) {
    structuredData.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviews.average_rating.toFixed(1),
      reviewCount: reviews.total_reviews,
      bestRating: 5,
      worstRating: 1,
    };
    
    // Add individual reviews
    if (reviews.recent_reviews && reviews.recent_reviews.length > 0) {
      structuredData.review = reviews.recent_reviews.slice(0, 5).map(review => ({
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: review.user_name,
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: 5,
          worstRating: 1,
        },
        reviewBody: review.content,
        datePublished: review.created_at,
        name: review.title,
      }));
    }
  }
  
  // Add features as keywords
  if (product.features && product.features.length > 0) {
    structuredData.keywords = product.features.join(', ');
  }
  
  // Add warranty information
  if (product.warranty_info) {
    structuredData.warranty = {
      '@type': 'WarrantyPromise',
      description: product.warranty_info,
    };
  }
  
  return structuredData;
}

/**
 * Generate Organization JSON-LD structured data
 */
export function generateOrganizationStructuredData(baseUrl: string = '') {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Premium Products Store',
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
    description: 'Premium quality products for your every need',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+1-555-0123',
      contactType: 'customer service',
      availableLanguage: 'English',
    },
    sameAs: [
      'https://facebook.com/premiumstore',
      'https://twitter.com/premiumstore',
      'https://instagram.com/premiumstore',
    ],
  };
}

/**
 * Generate WebSite JSON-LD structured data
 */
export function generateWebSiteStructuredData(baseUrl: string = '') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Premium Products Store',
    url: baseUrl,
    description: 'Premium quality products for your every need',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/store?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Premium Products Store',
      logo: `${baseUrl}/logo.svg`,
    },
  };
}

/**
 * Generate BreadcrumbList JSON-LD structured data
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
    item: `${baseUrl}/store/${product.product_id}`,
  });
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs,
  };
}

/**
 * Generate Review JSON-LD structured data
 */
export function generateReviewStructuredData(review: Review, product: EnhancedProduct) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    author: {
      '@type': 'Person',
      name: review.user_name,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    reviewBody: review.content,
    datePublished: review.created_at,
    name: review.title,
    itemReviewed: {
      '@type': 'Product',
      name: product.display_name,
      image: product.display_images[0]?.url || '/placeholder-product.svg',
    },
  };
}

/**
 * Generate FAQ JSON-LD structured data
 */
export function generateFAQStructuredData(product: EnhancedProduct) {
  const faqItems = [];
  
  // Add shipping info FAQ
  if (product.shipping_info) {
    faqItems.push({
      '@type': 'Question',
      name: 'What are the shipping options for this product?',
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
      name: 'What warranty is included with this product?',
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
  
  // Add availability FAQ
  faqItems.push({
    '@type': 'Question',
    name: 'Is this product in stock?',
    acceptedAnswer: {
      '@type': 'Answer',
      text: product.is_in_stock 
        ? `Yes, this product is currently in stock with ${product.stock_level} units available.`
        : 'This product is currently out of stock. Please check back later or contact us for availability.',
    },
  });
  
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
 * Generate ItemList JSON-LD structured data (for product categories)
 */
export function generateItemListStructuredData(
  products: EnhancedProduct[],
  listName: string,
  baseUrl: string = ''
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.display_name,
        url: `${baseUrl}/store/${product.product_id}`,
        image: product.display_images[0]?.url || '/placeholder-product.svg',
        offers: {
          '@type': 'Offer',
          price: product.display_price.toFixed(2),
          priceCurrency: 'USD',
          availability: product.is_in_stock 
            ? 'https://schema.org/InStock' 
            : 'https://schema.org/OutOfStock',
        },
      },
    })),
  };
}

/**
 * Generate AggregateRating JSON-LD structured data
 */
export function generateAggregateRatingStructuredData(reviews: ReviewSummary, product: EnhancedProduct) {
  if (!reviews.total_reviews || reviews.total_reviews === 0) {
    return null;
  }
  
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateRating',
    ratingValue: reviews.average_rating.toFixed(1),
    reviewCount: reviews.total_reviews,
    bestRating: 5,
    worstRating: 1,
    itemReviewed: {
      '@type': 'Product',
      name: product.display_name,
      image: product.display_images[0]?.url || '/placeholder-product.svg',
    },
  };
}

/**
 * Generate combined structured data for a product page
 */
export function generateCompleteProductStructuredData(
  product: EnhancedProduct,
  reviews?: ReviewSummary,
  baseUrl: string = ''
) {
  const structuredDataArray = [];
  
  // Product data
  structuredDataArray.push(generateProductStructuredData(product, reviews, baseUrl));
  
  // Breadcrumb data
  structuredDataArray.push(generateBreadcrumbStructuredData(product, baseUrl));
  
  // FAQ data
  const faqData = generateFAQStructuredData(product);
  if (faqData) {
    structuredDataArray.push(faqData);
  }
  
  // Organization data
  structuredDataArray.push(generateOrganizationStructuredData(baseUrl));
  
  // Website data
  structuredDataArray.push(generateWebSiteStructuredData(baseUrl));
  
  return structuredDataArray;
}

/**
 * Generate structured data for product search results
 */
export function generateSearchResultsStructuredData(
  products: EnhancedProduct[],
  query: string,
  baseUrl: string = ''
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `Search results for "${query}"`,
    url: `${baseUrl}/store?q=${encodeURIComponent(query)}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: product.display_name,
          url: `${baseUrl}/store/${product.product_id}`,
          image: product.display_images[0]?.url || '/placeholder-product.svg',
          offers: {
            '@type': 'Offer',
            price: product.display_price.toFixed(2),
            priceCurrency: 'USD',
            availability: product.is_in_stock 
              ? 'https://schema.org/InStock' 
              : 'https://schema.org/OutOfStock',
          },
        },
      })),
    },
  };
}

/**
 * Validate structured data
 */
export function validateStructuredData(structuredData: Record<string, unknown>) {
  const errors = [];
  const warnings = [];
  
  // Check required fields for Product
  if (structuredData['@type'] === 'Product') {
    if (!structuredData.name) errors.push('Product name is required');
    if (!structuredData.description) warnings.push('Product description is missing');
    if (!structuredData.image) warnings.push('Product image is missing');
    if (!structuredData.offers) errors.push('Product offers are required');
    
    // Check offers
    if (structuredData.offers) {
      const offers = structuredData.offers as Record<string, unknown>;
      if (!offers.price) errors.push('Product price is required');
      if (!offers.priceCurrency) errors.push('Product price currency is required');
      if (!offers.availability) errors.push('Product availability is required');
    }
  }
  
  // Check required fields for Review
  if (structuredData['@type'] === 'Review') {
    if (!structuredData.author) errors.push('Review author is required');
    if (!structuredData.reviewRating) errors.push('Review rating is required');
    if (!structuredData.itemReviewed) errors.push('Review item is required');
  }
  
  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}

/**
 * Generate JSON-LD script tag content
 */
export function generateJSONLDScript(structuredData: Record<string, unknown>): string {
  return JSON.stringify(structuredData, null, 2);
}

/**
 * Generate multiple structured data scripts
 */
export function generateMultipleJSONLDScripts(structuredDataArray: Record<string, unknown>[]): string[] {
  return structuredDataArray.map(data => generateJSONLDScript(data));
}