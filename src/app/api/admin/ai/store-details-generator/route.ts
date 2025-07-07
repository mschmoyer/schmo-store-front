import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await request.json();

    if (!storeId) {
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      );
    }

    // Get store information
    const storeResult = await db.query(`
      SELECT * FROM stores WHERE id = $1
    `, [storeId]);

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    const store = storeResult.rows[0];

    // Get product categories and sample products
    const productsResult = await db.query(`
      SELECT 
        p.name,
        p.short_description,
        p.base_price,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
      LIMIT 20
    `, [storeId]);

    const products = productsResult.rows;

    // Analyze product categories
    const categories = [...new Set(products.map(p => p.category_name).filter(Boolean))];
    const priceRange = products.length > 0 ? {
      min: Math.min(...products.map(p => parseFloat(p.base_price || '0'))),
      max: Math.max(...products.map(p => parseFloat(p.base_price || '0')))
    } : { min: 0, max: 0 };

    // Generate AI-powered store details based on products
    const generatedContent = generateStoreDetails({
      storeName: store.store_name,
      storeSlug: store.store_slug,
      currentDescription: store.store_description,
      currentHeroTitle: store.hero_title,
      currentHeroDescription: store.hero_description,
      categories,
      priceRange,
      productCount: products.length
    });

    return NextResponse.json({
      success: true,
      content: generatedContent,
      analytics: {
        productsAnalyzed: products.length,
        categoriesFound: categories.length,
        priceRange
      }
    });

  } catch (error) {
    console.error('Error generating store details:', error);
    return NextResponse.json(
      { error: 'Failed to generate store details' },
      { status: 500 }
    );
  }
}

interface StoreAnalysis {
  storeName: string;
  storeSlug: string;
  currentDescription: string;
  currentHeroTitle: string;
  currentHeroDescription: string;
  categories: string[];
  priceRange: { min: number; max: number };
  productCount: number;
}

function generateStoreDetails(analysis: StoreAnalysis): string {
  const { storeName, categories, priceRange, productCount } = analysis;
  
  // Determine store focus based on product analysis
  const primaryCategories = categories.slice(0, 3);
  const hasVariety = categories.length > 3;
  
  // Generate price positioning
  let pricePositioning = 'affordable';
  if (priceRange.max > 100) pricePositioning = 'premium';
  else if (priceRange.max > 50) pricePositioning = 'mid-range';

  // Generate store identity
  const storeIdentity = categories.length > 0 ? 
    `specializing in ${primaryCategories.join(', ')}${hasVariety ? ' and more' : ''}` :
    'offering a curated selection of quality products';

  // Generate optimized content
  const heroTitle = generateHeroTitle(storeName, primaryCategories);
  const heroDescription = generateHeroDescription(storeName, storeIdentity, pricePositioning);
  const storeDescription = generateStoreDescription(storeName, categories, productCount, pricePositioning);
  const metaTitle = generateMetaTitle(storeName, primaryCategories);
  const metaDescription = generateMetaDescription(storeName, storeIdentity, pricePositioning);

  return `
**🎯 GENERATED STORE DETAILS**

**Hero Title:**
${heroTitle}

**Hero Description:**
${heroDescription}

**Store Description:**
${storeDescription}

**Meta Title (SEO):**
${metaTitle}

**Meta Description (SEO):**
${metaDescription}

---

**📊 Analysis Summary:**
- Products Analyzed: ${productCount}
- Categories Found: ${categories.length}
- Primary Categories: ${primaryCategories.join(', ')}
- Price Range: $${priceRange.min.toFixed(2)} - $${priceRange.max.toFixed(2)}
- Price Positioning: ${pricePositioning}

**💡 Recommendations:**
1. Consider highlighting your ${primaryCategories[0] || 'main'} category prominently
2. Your ${pricePositioning} pricing strategy appeals to value-conscious customers
3. ${hasVariety ? 'Your diverse product range offers great cross-selling opportunities' : 'Consider expanding into complementary product categories'}
4. Add customer testimonials to build trust and credibility

**🚀 Next Steps:**
- Review and customize the generated content to match your brand voice
- Update your store settings with the new copy
- A/B test different versions to see what resonates with customers
- Consider adding category-specific landing pages
`.trim();
}

function generateHeroTitle(storeName: string, categories: string[]): string {
  const templates = [
    `Discover Amazing ${categories[0] || 'Products'} at ${storeName}`,
    `${storeName} - Your Destination for ${categories[0] || 'Quality Products'}`,
    `Shop Premium ${categories[0] || 'Items'} | ${storeName}`,
    `${storeName}: Where Quality Meets ${categories[0] || 'Value'}`,
    `Find Your Perfect ${categories[0] || 'Product'} at ${storeName}`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateHeroDescription(storeName: string, identity: string, positioning: string): string {
  const templates = [
    `Welcome to ${storeName}, your trusted online destination ${identity}. We offer ${positioning} prices, fast shipping, and exceptional customer service.`,
    `Discover ${positioning} quality at ${storeName}. We're ${identity} with a commitment to customer satisfaction and reliable delivery.`,
    `Shop with confidence at ${storeName}. Our ${positioning} selection ${identity} ensures you'll find exactly what you're looking for.`,
    `${storeName} brings you the best value ${identity}. Experience ${positioning} shopping with unmatched quality and service.`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateStoreDescription(storeName: string, categories: string[], productCount: number, positioning: string): string {
  const categoryText = categories.length > 0 ? 
    `spanning ${categories.join(', ')}` : 
    'across multiple categories';
    
  return `${storeName} is your premier online marketplace offering ${positioning} products ${categoryText}. With over ${productCount} carefully curated items, we provide exceptional value and quality to customers worldwide. Our commitment to customer satisfaction, fast shipping, and competitive pricing makes us the trusted choice for discerning shoppers. Whether you're looking for everyday essentials or special finds, ${storeName} delivers the shopping experience you deserve.`;
}

function generateMetaTitle(storeName: string, categories: string[]): string {
  const category = categories[0] || 'Products';
  return `${storeName} - ${category} Store | Shop Online with Fast Shipping`;
}

function generateMetaDescription(storeName: string, identity: string, positioning: string): string {
  return `Shop at ${storeName} ${identity}. ${positioning} prices, fast shipping, and excellent customer service. Browse our collection and find your perfect products today.`;
}