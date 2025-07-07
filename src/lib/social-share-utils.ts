import { EnhancedProduct } from '@/types/product';

/**
 * Social sharing platforms configuration
 */
export const SOCIAL_PLATFORMS = {
  FACEBOOK: 'facebook',
  TWITTER: 'twitter',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  PINTEREST: 'pinterest',
  LINKEDIN: 'linkedin',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  COPY_LINK: 'copy_link',
} as const;

export type SocialPlatform = typeof SOCIAL_PLATFORMS[keyof typeof SOCIAL_PLATFORMS];

/**
 * Generate social sharing data for a product
 */
export function generateSocialSharingData(product: EnhancedProduct, baseUrl: string = '') {
  const productUrl = `${baseUrl}/store/${product.product_id}`;
  const primaryImage = product.display_images[0]?.url || '/placeholder-product.svg';
  
  return {
    url: productUrl,
    title: product.display_name,
    description: generateSocialDescription(product),
    image_url: primaryImage,
    hashtags: generateHashtags(product),
    price: product.display_price,
    brand: product.brand,
    category: product.product_category?.name || product.category,
  };
}

/**
 * Generate social media description (shorter than SEO description)
 */
export function generateSocialDescription(product: EnhancedProduct): string {
  let description = product.display_name;
  
  // Add price
  description += ` - $${product.display_price.toFixed(2)}`;
  
  // Add brief description
  if (product.display_description) {
    const briefDesc = product.display_description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .substring(0, 80)
      .trim();
    if (briefDesc) {
      description += `. ${briefDesc}`;
    }
  }
  
  // Add availability
  if (product.is_in_stock) {
    description += '. In stock!';
  }
  
  return description;
}

/**
 * Generate hashtags for social sharing
 */
export function generateHashtags(product: EnhancedProduct): string[] {
  const hashtags = new Set<string>();
  
  // Add brand hashtag
  if (product.brand) {
    hashtags.add(product.brand.replace(/\s+/g, '').toLowerCase());
  }
  
  // Add category hashtags
  const category = product.product_category?.name || product.category;
  if (category && category !== 'Other') {
    hashtags.add(category.replace(/\s+/g, '').toLowerCase());
  }
  
  // Add product name hashtags (first 2 words)
  const nameWords = product.display_name.toLowerCase().split(/\s+/);
  nameWords.slice(0, 2).forEach(word => {
    if (word.length > 3) {
      hashtags.add(word.replace(/[^a-z0-9]/g, ''));
    }
  });
  
  // Add generic hashtags
  hashtags.add('premium');
  hashtags.add('quality');
  hashtags.add('shopping');
  
  return Array.from(hashtags).slice(0, 10); // Limit to 10 hashtags
}

/**
 * Generate platform-specific sharing URLs
 */
export function generateSharingUrl(platform: SocialPlatform, data: ReturnType<typeof generateSocialSharingData>): string {
  const { url, title, description, hashtags } = data;
  
  switch (platform) {
    case SOCIAL_PLATFORMS.FACEBOOK:
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    
    case SOCIAL_PLATFORMS.TWITTER:
      const twitterText = `${title} ${description}`;
      const twitterHashtags = hashtags.join(',');
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(url)}&hashtags=${encodeURIComponent(twitterHashtags)}`;
    
    case SOCIAL_PLATFORMS.PINTEREST:
      return `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(data.image_url)}&description=${encodeURIComponent(description)}`;
    
    case SOCIAL_PLATFORMS.LINKEDIN:
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    
    case SOCIAL_PLATFORMS.WHATSAPP:
      const whatsappText = `${title} - ${description} ${url}`;
      return `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
    
    case SOCIAL_PLATFORMS.EMAIL:
      const emailSubject = `Check out this product: ${title}`;
      const emailBody = `I found this great product and thought you might be interested:\n\n${title}\n${description}\n\nCheck it out: ${url}`;
      return `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    default:
      return url;
  }
}

/**
 * Generate Instagram-optimized sharing data
 */
export function generateInstagramSharingData(product: EnhancedProduct, baseUrl: string = '') {
  const hashtags = generateHashtags(product);
  
  return {
    caption: `${product.display_name} ✨\n\n${generateSocialDescription(product)}\n\n${hashtags.map(h => `#${h}`).join(' ')}\n\n🛍️ Shop now: ${baseUrl}/store/${product.product_id}`,
    image_url: product.display_images[0]?.url || '/placeholder-product.svg',
    product_tags: [{
      product_id: product.product_id,
      name: product.display_name,
      price: product.display_price,
    }],
  };
}

/**
 * Generate TikTok-optimized sharing data
 */
export function generateTikTokSharingData(product: EnhancedProduct, baseUrl: string = '') {
  const hashtags = generateHashtags(product);
  
  return {
    caption: `${product.display_name} 🔥\n\n${generateSocialDescription(product)}\n\n${hashtags.map(h => `#${h}`).join(' ')} #ProductReview #Shopping #MustHave`,
    video_description: `Showcasing the amazing ${product.display_name}! Perfect for anyone looking for quality products. What do you think?`,
    product_link: `${baseUrl}/store/${product.product_id}`,
    price: product.display_price,
    brand: product.brand,
  };
}

/**
 * Generate Open Graph meta tags for social sharing
 */
export function generateOpenGraphTags(product: EnhancedProduct, baseUrl: string = '') {
  const data = generateSocialSharingData(product, baseUrl);
  
  return {
    'og:type': 'product',
    'og:title': data.title,
    'og:description': data.description,
    'og:image': data.image_url,
    'og:url': data.url,
    'og:site_name': 'Premium Products Store',
    'product:price:amount': data.price.toFixed(2),
    'product:price:currency': 'USD',
    'product:availability': product.is_in_stock ? 'instock' : 'outofstock',
    'product:condition': 'new',
    'product:brand': data.brand || '',
    'product:category': data.category || '',
  };
}

/**
 * Generate Twitter Card meta tags
 */
export function generateTwitterCardTags(product: EnhancedProduct, baseUrl: string = '') {
  const data = generateSocialSharingData(product, baseUrl);
  
  return {
    'twitter:card': 'summary_large_image',
    'twitter:site': '@premiumstore',
    'twitter:creator': '@premiumstore',
    'twitter:title': data.title,
    'twitter:description': data.description,
    'twitter:image': data.image_url,
    'twitter:image:alt': data.title,
  };
}

/**
 * Track social sharing events
 */
export function trackSocialShare(platform: SocialPlatform, product: EnhancedProduct) {
  // Send analytics event
  if (typeof window !== 'undefined' && (window as Window & { gtag?: (...args: unknown[]) => void }).gtag) {
    (window as Window & { gtag: (...args: unknown[]) => void }).gtag('event', 'share', {
      method: platform,
      content_type: 'product',
      item_id: product.product_id,
      item_name: product.display_name,
      item_category: product.product_category?.name || product.category,
      value: product.display_price,
    });
  }
  
  // Send custom event for product analytics
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('productShare', {
      detail: {
        platform,
        product_id: product.product_id,
        product_name: product.display_name,
        timestamp: new Date().toISOString(),
      },
    }));
  }
}

/**
 * Copy product URL to clipboard
 */
export async function copyProductUrl(product: EnhancedProduct, baseUrl: string = ''): Promise<boolean> {
  const url = `${baseUrl}/store/${product.product_id}`;
  
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (err) {
    console.error('Failed to copy URL:', err);
    return false;
  }
}

/**
 * Generate rich sharing data for messaging apps
 */
export function generateRichSharingData(product: EnhancedProduct, baseUrl: string = '') {
  return {
    url: `${baseUrl}/store/${product.product_id}`,
    title: product.display_name,
    description: generateSocialDescription(product),
    image: product.display_images[0]?.url || '/placeholder-product.svg',
    price: {
      amount: product.display_price,
      currency: 'USD',
      formatted: `$${product.display_price.toFixed(2)}`,
    },
    availability: product.is_in_stock ? 'In Stock' : 'Out of Stock',
    rating: product.average_rating ? {
      value: product.average_rating,
      count: product.review_count,
      formatted: `${product.average_rating.toFixed(1)}/5 (${product.review_count} reviews)`,
    } : null,
    brand: product.brand,
    category: product.product_category?.name || product.category,
    features: product.features?.slice(0, 3) || [],
  };
}

/**
 * Generate social sharing buttons configuration
 */
export function generateSharingButtonsConfig(product: EnhancedProduct, baseUrl: string = '') {
  const data = generateSocialSharingData(product, baseUrl);
  
  return [
    {
      platform: SOCIAL_PLATFORMS.FACEBOOK,
      label: 'Share on Facebook',
      icon: 'facebook',
      color: '#1877F2',
      url: generateSharingUrl(SOCIAL_PLATFORMS.FACEBOOK, data),
    },
    {
      platform: SOCIAL_PLATFORMS.TWITTER,
      label: 'Share on Twitter',
      icon: 'twitter',
      color: '#1DA1F2',
      url: generateSharingUrl(SOCIAL_PLATFORMS.TWITTER, data),
    },
    {
      platform: SOCIAL_PLATFORMS.PINTEREST,
      label: 'Pin on Pinterest',
      icon: 'pinterest',
      color: '#BD081C',
      url: generateSharingUrl(SOCIAL_PLATFORMS.PINTEREST, data),
    },
    {
      platform: SOCIAL_PLATFORMS.LINKEDIN,
      label: 'Share on LinkedIn',
      icon: 'linkedin',
      color: '#0A66C2',
      url: generateSharingUrl(SOCIAL_PLATFORMS.LINKEDIN, data),
    },
    {
      platform: SOCIAL_PLATFORMS.WHATSAPP,
      label: 'Share on WhatsApp',
      icon: 'whatsapp',
      color: '#25D366',
      url: generateSharingUrl(SOCIAL_PLATFORMS.WHATSAPP, data),
    },
    {
      platform: SOCIAL_PLATFORMS.EMAIL,
      label: 'Share via Email',
      icon: 'email',
      color: '#EA4335',
      url: generateSharingUrl(SOCIAL_PLATFORMS.EMAIL, data),
    },
    {
      platform: SOCIAL_PLATFORMS.COPY_LINK,
      label: 'Copy Link',
      icon: 'link',
      color: '#6B7280',
      onClick: () => copyProductUrl(product, baseUrl),
    },
  ];
}

/**
 * Validate social sharing configuration
 */
export function validateSocialSharing(product: EnhancedProduct) {
  const warnings = [];
  const errors = [];
  
  // Check if social sharing is enabled
  if (!product.social_sharing_enabled) {
    warnings.push('Social sharing is disabled for this product');
  }
  
  // Check for required fields
  if (!product.display_name) {
    errors.push('Product name is required for social sharing');
  }
  
  if (!product.display_images || product.display_images.length === 0) {
    warnings.push('No product images available for social sharing');
  }
  
  if (!product.display_description) {
    warnings.push('Product description is missing for social sharing');
  }
  
  // Check description length for social platforms
  const description = generateSocialDescription(product);
  if (description.length > 280) {
    warnings.push('Social description is too long for Twitter (over 280 characters)');
  }
  
  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}

/**
 * Generate Web Share API data
 */
export function generateWebShareData(product: EnhancedProduct, baseUrl: string = '') {
  return {
    title: product.display_name,
    text: generateSocialDescription(product),
    url: `${baseUrl}/store/${product.product_id}`,
  };
}

/**
 * Check if Web Share API is supported
 */
export function isWebShareSupported(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator;
}

/**
 * Share using Web Share API
 */
export async function shareViaWebShare(product: EnhancedProduct, baseUrl: string = ''): Promise<boolean> {
  if (!isWebShareSupported()) {
    return false;
  }
  
  try {
    const shareData = generateWebShareData(product, baseUrl);
    await navigator.share(shareData);
    trackSocialShare('web_share' as SocialPlatform, product);
    return true;
  } catch (err) {
    console.error('Web Share API failed:', err);
    return false;
  }
}