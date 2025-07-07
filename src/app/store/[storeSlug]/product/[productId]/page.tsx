import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';
import { TopNav } from '@/components';
import { ProductPageClient } from './ProductPageClient';

interface ProductPageProps {
  params: { 
    storeSlug: string;
    productId: string; 
  };
}

interface ProductData {
  product: Record<string, unknown>;
  reviews: Record<string, unknown>;
  store: Record<string, unknown>;
}

async function getProductData(storeSlug: string, productId: string): Promise<ProductData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // First, get the store ID from the store slug
    const storeResponse = await fetch(`${baseUrl}/api/stores/public?slug=${storeSlug}`, {
      next: { revalidate: 300 }, // 5 minutes
    });
    
    if (!storeResponse.ok) {
      console.error('Failed to fetch store by slug:', storeSlug);
      return null;
    }
    
    const storeData = await storeResponse.json();
    if (!storeData.success || !storeData.data) {
      console.error('Store not found for slug:', storeSlug);
      return null;
    }
    
    const storeId = storeData.data.id;
    
    // Now fetch the product using the store ID
    const response = await fetch(`${baseUrl}/api/stores/${storeId}/products/${productId}`, {
      // Enable caching with revalidation
      next: { revalidate: 300 }, // 5 minutes
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      if (response.status === 400) {
        // Invalid product ID format - treat as not found
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data) {
      return null;
    }
    
    return {
      product: data.data.product,
      reviews: data.data.reviews,
      store: storeData.data
    };
  } catch (error) {
    console.error('Error fetching product data:', error);
    throw error;
  }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  try {
    const resolvedParams = await params;
    const data = await getProductData(resolvedParams.storeSlug, resolvedParams.productId);
    
    if (!data) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.'
      };
    }
    
    const { product } = data;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const productUrl = `${baseUrl}/store/${resolvedParams.storeSlug}/product/${resolvedParams.productId}`;
    
    // Product details with fallbacks
    const productTitle = product.name || 'Product';
    const productDescription = product.description || product.customs_description || `${productTitle} available at ${resolvedParams.storeSlug}`;
    const productPrice = product.customs_value?.amount || product.price || 29.99;
    const productImage = product.thumbnail_url || `${baseUrl}/placeholder-product.svg`;
    const storeName = resolvedParams.storeSlug; // TODO: Get actual store name from store data
    
    // TODO: Add these fields to product database schema
    const productBrand = storeName; // Mock data - should come from product.brand
    const productCondition = 'new'; // Mock data - should come from product.condition
    const productAvailability = product.active ? 'in stock' : 'out of stock';
    const productCategory = product.product_category?.name || 'General'; // Using existing field
    const productRating = '4.5'; // Mock data - TODO: calculate from reviews
    const productReviewCount = '0'; // Mock data - TODO: count from reviews table
    const productKeywords = `${productTitle}, ${productCategory}, ${storeName}, online shopping`; // Mock data - TODO: add keywords field
    const productSEOTitle = `${productTitle} - ${storeName} | Best ${productCategory} Online`;
    
    // Social media optimized metadata
    const socialMetadata = {
      // Basic metadata
      title: productSEOTitle,
      description: productDescription,
      keywords: productKeywords,
      
      // Open Graph (Facebook, Instagram, LinkedIn)
      openGraph: {
        type: 'website', // Note: 'product' is not a standard OG type, using 'website'
        title: productTitle,
        description: productDescription,
        url: productUrl,
        siteName: storeName,
        images: [
          {
            url: productImage,
            width: 1200,
            height: 630,
            alt: productTitle,
            type: 'image/jpeg', // TODO: detect actual image type
          },
          {
            url: productImage,
            width: 800,
            height: 600,
            alt: productTitle,
            type: 'image/jpeg',
          }
        ],
        locale: 'en_US', // TODO: make this dynamic based on store locale
      },
      
      // Twitter Card (Twitter)
      twitter: {
        card: 'summary_large_image',
        site: '@' + storeName, // TODO: get actual Twitter handle from store settings
        creator: '@' + storeName, // TODO: get actual Twitter handle
        title: productTitle,
        description: productDescription,
        images: [productImage],
        
        // Twitter-specific product metadata
        // @ts-expect-error - These are valid Twitter Card properties
        label1: 'Price',
        data1: `$${productPrice.toFixed(2)}`,
        label2: 'Availability',
        data2: productAvailability,
      },
      
      // Additional meta tags for better SEO and social sharing
      other: {
        // Schema.org structured data hints
        'product:price:amount': productPrice.toString(),
        'product:price:currency': 'USD',
        'product:availability': productAvailability,
        'product:condition': productCondition,
        'product:brand': productBrand,
        'product:category': productCategory,
        
        // Additional social platform optimizations
        'pinterest:rich_pin': 'true',
        'pinterest:description': productDescription,
        
        // TikTok and general mobile optimizations
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': 'default',
        'apple-mobile-web-app-title': productTitle,
        
        // SEO enhancements
        'robots': 'index,follow',
        'googlebot': 'index,follow',
        'author': storeName,
        'rating': productRating,
        'review-count': productReviewCount,
        
        // E-commerce specific
        'product:retailer_item_id': product.sku || product.product_id,
        'product:mfr_part_no': product.sku, // TODO: add manufacturer part number field
      }
    };
    
    // Console log all metadata fields for debugging
    console.log('=== SOCIAL MEDIA METADATA DEBUG ===');
    console.log('Product URL:', productUrl);
    console.log('Facebook/Instagram Open Graph:', {
      type: socialMetadata.openGraph.type,
      title: socialMetadata.openGraph.title,
      description: socialMetadata.openGraph.description,
      url: socialMetadata.openGraph.url,
      siteName: socialMetadata.openGraph.siteName,
      images: socialMetadata.openGraph.images,
      locale: socialMetadata.openGraph.locale,
      // @ts-expect-error - OpenGraph product field is not in standard types
      product: socialMetadata.openGraph.product,
    });
    console.log('Twitter Card:', {
      card: socialMetadata.twitter.card,
      site: socialMetadata.twitter.site,
      creator: socialMetadata.twitter.creator,
      title: socialMetadata.twitter.title,
      description: socialMetadata.twitter.description,
      images: socialMetadata.twitter.images,
      // @ts-expect-error - Twitter Card label/data fields are not in standard types
      label1: socialMetadata.twitter.label1,
      // @ts-expect-error - Twitter Card label/data fields are not in standard types
      data1: socialMetadata.twitter.data1,
      // @ts-expect-error - Twitter Card label/data fields are not in standard types
      label2: socialMetadata.twitter.label2,
      // @ts-expect-error - Twitter Card label/data fields are not in standard types
      data2: socialMetadata.twitter.data2,
    });
    console.log('TikTok/Mobile Optimizations:', {
      'mobile-web-app-capable': socialMetadata.other['mobile-web-app-capable'],
      'apple-mobile-web-app-capable': socialMetadata.other['apple-mobile-web-app-capable'],
      'apple-mobile-web-app-title': socialMetadata.other['apple-mobile-web-app-title'],
    });
    console.log('Pinterest Rich Pins:', {
      'pinterest:rich_pin': socialMetadata.other['pinterest:rich_pin'],
      'pinterest:description': socialMetadata.other['pinterest:description'],
    });
    console.log('Product Schema.org:', {
      'product:price:amount': socialMetadata.other['product:price:amount'],
      'product:price:currency': socialMetadata.other['product:price:currency'],
      'product:availability': socialMetadata.other['product:availability'],
      'product:condition': socialMetadata.other['product:condition'],
      'product:brand': socialMetadata.other['product:brand'],
      'product:category': socialMetadata.other['product:category'],
    });
    console.log('SEO Metadata:', {
      title: socialMetadata.title,
      description: socialMetadata.description,
      keywords: socialMetadata.keywords,
      robots: socialMetadata.other['robots'],
      rating: socialMetadata.other['rating'],
      'review-count': socialMetadata.other['review-count'],
    });
    console.log('===============================');
    
    return socialMetadata;
  } catch (error) {
    console.error('Error generating product metadata:', error);
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.'
    };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const resolvedParams = await params;
  const data = await getProductData(resolvedParams.storeSlug, resolvedParams.productId);
  
  if (!data) {
    notFound();
  }
  
  const { product, store } = data;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const productUrl = `${baseUrl}/store/${resolvedParams.storeSlug}/product/${resolvedParams.productId}`;
  
  // Generate JSON-LD structured data for better social sharing and SEO
  const productPrice = product.customs_value?.amount || product.price || 29.99;
  const productImage = product.thumbnail_url || `${baseUrl}/placeholder-product.svg`;
  
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "description": product.description || product.customs_description,
    "sku": product.sku,
    "mpn": product.sku, // TODO: add actual manufacturer part number
    "brand": {
      "@type": "Brand",
      "name": resolvedParams.storeSlug // TODO: get actual brand name
    },
    "category": product.product_category?.name || "General",
    "image": productImage,
    "url": productUrl,
    "offers": {
      "@type": "Offer",
      "price": productPrice.toString(),
      "priceCurrency": "USD", // TODO: get from store currency
      "availability": product.active ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "condition": "https://schema.org/NewCondition", // TODO: add condition field to database
      "seller": {
        "@type": "Organization",
        "name": resolvedParams.storeSlug // TODO: get actual store name
      },
      "url": productUrl
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5", // TODO: calculate from actual reviews
      "reviewCount": "0", // TODO: count from reviews table
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [], // TODO: populate from actual reviews
    "additionalProperty": [
      {
        "@type": "PropertyValue",
        "name": "Condition",
        "value": "New" // TODO: get from product condition field
      },
      {
        "@type": "PropertyValue", 
        "name": "Availability",
        "value": product.active ? "In Stock" : "Out of Stock"
      }
    ]
  };
  
  // Add weight and dimensions if available
  if (product.weight) {
    jsonLd.additionalProperty.push({
      "@type": "PropertyValue",
      "name": "Weight",
      "value": `${product.weight.value} ${product.weight.unit}`
    });
  }
  
  if (product.dimensions) {
    jsonLd.additionalProperty.push({
      "@type": "PropertyValue",
      "name": "Dimensions", 
      "value": `${product.dimensions.length}" × ${product.dimensions.width}" × ${product.dimensions.height}"`
    });
  }
  
  return (
    <StoreThemeProvider themeId={store?.theme_name || 'default'}>
      <>
        <TopNav />
        {/* JSON-LD Structured Data for Social Platforms and SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        
        <ProductPageClient product={product} store={store} />
      </>
    </StoreThemeProvider>
  );
}