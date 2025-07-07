import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const { storeId, topic, productFocus } = await request.json();

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

    // Get products for blog post inspiration
    let productsQuery = `
      SELECT 
        p.name,
        p.short_description,
        p.long_description,
        p.base_price,
        p.sale_price,
        p.sku,
        c.name as category_name,
        p.featured_image_url,
        p.tags
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
    `;

    const queryParams = [storeId];

    // If specific product focus is requested
    if (productFocus) {
      productsQuery += ` AND (p.name ILIKE $2 OR c.name ILIKE $2)`;
      queryParams.push(`%${productFocus}%`);
    }

    productsQuery += ` ORDER BY p.created_at DESC LIMIT 10`;

    const productsResult = await db.query(productsQuery, queryParams);
    const products = productsResult.rows;

    // Get existing blog categories for context
    const categoriesResult = await db.query(`
      SELECT name FROM blog_categories 
      WHERE store_id = $1 
      ORDER BY created_at DESC
    `, [storeId]);

    const blogCategories = categoriesResult.rows.map((row) => (row as { name: string }).name);

    // Generate blog post content
    const generatedBlogPost = generateBlogPost({
      storeName: (store as { store_name: string }).store_name,
      storeSlug: (store as { store_slug: string }).store_slug,
      topic: topic || 'Product Spotlight',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products: products as any,
      blogCategories,
      productFocus
    });

    return NextResponse.json({
      success: true,
      content: generatedBlogPost,
      analytics: {
        productsUsed: products.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suggestedCategory: extractCategory(topic, products as any),
        estimatedReadTime: calculateReadTime(generatedBlogPost)
      }
    });

  } catch (error) {
    console.error('Error generating blog post:', error);
    return NextResponse.json(
      { error: 'Failed to generate blog post' },
      { status: 500 }
    );
  }
}

interface Product {
  name: string;
  short_description?: string;
  long_description?: string;
  base_price?: string;
  sale_price?: string;
  sku?: string;
  category_name?: string;
  featured_image_url?: string;
  tags?: string[];
}

interface BlogPostInput {
  storeName: string;
  storeSlug: string;
  topic: string;
  products: Product[];
  blogCategories: string[];
  productFocus?: string;
}

function generateBlogPost(input: BlogPostInput): string {
  const { storeName, topic, products, productFocus } = input;
  
  // Select featured products
  const featuredProducts = products.slice(0, 3);
  
  // Generate blog post based on topic/theme
  const blogPost = topic.toLowerCase().includes('spotlight') || topic.toLowerCase().includes('featured') ?
    generateProductSpotlight(storeName, featuredProducts) :
    topic.toLowerCase().includes('guide') || topic.toLowerCase().includes('how') ?
    generateBuyingGuide(storeName, featuredProducts, productFocus) :
    topic.toLowerCase().includes('trend') || topic.toLowerCase().includes('season') ?
    generateTrendPost(storeName, featuredProducts, productFocus) :
    generateGeneralPost(storeName, featuredProducts, topic);

  // Add SEO elements
  const seoKeywords = generateSEOKeywords(storeName, featuredProducts, topic);
  const metaDescription = generateMetaDescription(blogPost);

  return `
**📝 GENERATED BLOG POST**

**Title:** ${extractTitle(blogPost)}

**Content:**
${blogPost}

---

**📊 SEO Information:**

**Meta Description:**
${metaDescription}

**Suggested Keywords:**
${seoKeywords.join(', ')}

**Suggested Tags:**
${generateTags(featuredProducts, topic).join(', ')}

**Category Suggestion:**
${extractCategory(topic, featuredProducts)}

---

**💡 Content Strategy Tips:**
1. Add high-quality product images throughout the post
2. Include internal links to product pages
3. Consider adding customer testimonials or reviews
4. Update with seasonal relevance when appropriate
5. Add a compelling call-to-action at the end

**🚀 Publishing Checklist:**
- [ ] Review and customize content for brand voice
- [ ] Add product images and optimize for web
- [ ] Set up internal links to mentioned products
- [ ] Schedule social media promotion
- [ ] Add to email newsletter if applicable
`.trim();
}

function generateProductSpotlight(storeName: string, products: Product[]): string {
  const featuredProduct = products[0];
  if (!featuredProduct) return generateFallbackPost(storeName);

  const title = `Spotlight: Discover the Amazing ${featuredProduct.name} at ${storeName}`;
  
  return `${title}

Looking for something special? Let us introduce you to one of our most exciting products: the ${featuredProduct.name}. This incredible item has been flying off our virtual shelves, and for good reason!

## What Makes ${featuredProduct.name} Special?

${featuredProduct.short_description || featuredProduct.long_description || 'This product represents the perfect blend of quality and value that our customers have come to expect.'}

## Why Our Customers Love It

The ${featuredProduct.name} stands out in the ${featuredProduct.category_name || 'marketplace'} for several key reasons:

- **Quality Construction**: Built to last and designed with attention to detail
- **Great Value**: Competitively priced at $${parseFloat(featuredProduct.sale_price || featuredProduct.base_price || '0').toFixed(2)}
- **Customer Satisfaction**: Consistently receives positive feedback from buyers
- **Fast Shipping**: Ships quickly from our warehouse to your door

## Perfect For

Whether you're ${generateUseCases()}, the ${featuredProduct.name} delivers exactly what you need.

## More Great Options

If you love the ${featuredProduct.name}, you might also be interested in these related items:

${products.slice(1, 3).map(p => `- **${p.name}** - ${p.short_description || 'Another great choice from our collection'} ($${parseFloat(p.sale_price || p.base_price || '0').toFixed(2)})`).join('\n')}

## Ready to Shop?

Don't wait – the ${featuredProduct.name} is available now at ${storeName}. With our fast shipping and excellent customer service, you'll have your new purchase in no time.

*Shop smart, shop ${storeName}.*`;
}

function generateBuyingGuide(storeName: string, products: Product[], focus?: string): string {
  const category = focus || products[0]?.category_name || 'Products';
  const title = `The Ultimate Guide to Choosing the Perfect ${category}`;
  
  return `${title}

Shopping for ${category.toLowerCase()} can be overwhelming with so many options available. That's why we've created this comprehensive guide to help you make the best choice for your needs and budget.

## What to Look For

When shopping for ${category.toLowerCase()}, consider these essential factors:

### 1. Quality and Durability
Look for products that are built to last. Check materials, construction, and customer reviews.

### 2. Value for Money
Compare features and prices to ensure you're getting the best bang for your buck.

### 3. Your Specific Needs
Consider how you'll use the product and what features matter most to you.

## Our Top Recommendations

Based on customer feedback and our expertise, here are our top picks:

${products.slice(0, 3).map((p, index) => `
### ${index + 1}. ${p.name}
**Price:** $${parseFloat(p.sale_price || p.base_price || '0').toFixed(2)}
${p.short_description || 'A fantastic choice that consistently receives excellent reviews.'}

**Best for:** ${generateBestFor()}
`).join('\n')}

## Making Your Decision

Still not sure which option is right for you? Consider these questions:
- What's your budget range?
- How often will you use this product?
- What features are most important to you?
- Do you need it immediately or can you wait for sales?

## Why Shop with ${storeName}?

When you choose ${storeName}, you get:
- Carefully curated product selection
- Competitive pricing
- Fast, reliable shipping
- Excellent customer service
- Easy returns and exchanges

Ready to find your perfect ${category.toLowerCase()}? Browse our full selection at ${storeName} today!`;
}

function generateTrendPost(storeName: string, products: Product[], focus?: string): string {
  const currentSeason = getCurrentSeason();
  const category = focus || products[0]?.category_name || 'Products';
  const title = `${currentSeason} ${category} Trends: What's Hot Right Now`;
  
  return `${title}

${currentSeason} is here, and it's bringing some exciting trends in ${category.toLowerCase()}! We've been tracking the latest developments and customer preferences to bring you the hottest products of the season.

## Top Trends This ${currentSeason}

### 1. Quality Over Quantity
Customers are increasingly choosing fewer, higher-quality items that last longer and provide better value.

### 2. Versatile Solutions
Multi-functional products that serve various purposes are more popular than ever.

### 3. Sustainable Choices
Eco-friendly options continue to gain traction among conscious consumers.

## Trending Products at ${storeName}

Here's what our customers are loving right now:

${products.slice(0, 3).map((p) => `
### ${p.name}
This ${category.toLowerCase()} has been a customer favorite because ${generateTrendReason()}. At $${parseFloat(p.sale_price || p.base_price || '0').toFixed(2)}, it offers excellent value for the quality.
`).join('\n')}

## How to Stay Ahead of the Curve

Want to keep up with the latest trends? Here are our tips:
- Follow customer reviews and ratings
- Pay attention to seasonal needs
- Consider long-term value over short-term savings
- Don't be afraid to try something new

## Shop the Trends

Ready to update your ${category.toLowerCase()} collection? Explore our trending products at ${storeName} and discover why thousands of customers trust us for their shopping needs.

*Stay trendy with ${storeName}!*`;
}

function generateGeneralPost(storeName: string, products: Product[], topic: string): string {
  const title = `${topic} | ${storeName} Blog`;
  
  return `${title}

Welcome to another exciting update from ${storeName}! Today we're exploring ${topic.toLowerCase()} and how it relates to our amazing product collection.

## What's New and Exciting

We're always working to bring you the best products and shopping experience. Here's what's caught our attention lately:

${products.slice(0, 3).map(p => `
### ${p.name}
${p.short_description || `This ${p.category_name || 'product'} represents excellent quality and value.`} Available now for $${parseFloat(p.sale_price || p.base_price || '0').toFixed(2)}.
`).join('\n')}

## Why Choose ${storeName}?

Shopping with us means you get:
- Carefully selected products
- Competitive pricing
- Fast shipping
- Excellent customer support
- Easy returns

## What's Coming Next

We're constantly expanding our selection and improving our service. Keep an eye out for new arrivals and special promotions!

*Thank you for being part of the ${storeName} community!*`;
}

function generateFallbackPost(storeName: string): string {
  return `Welcome to ${storeName}!

We're excited to share our passion for quality products and excellent service with you. Our team works hard to curate the best selection and provide an outstanding shopping experience.

## What Makes Us Different

At ${storeName}, we believe in:
- Quality over quantity
- Customer satisfaction first
- Fair, competitive pricing
- Fast, reliable service

## Join Our Community

We're more than just a store – we're a community of people who appreciate quality and value. Follow us for updates, tips, and special offers.

*Happy shopping from all of us at ${storeName}!*`;
}

// Helper functions
function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim() && !line.startsWith('#')) {
      return line.trim();
    }
  }
  return 'New Blog Post';
}

function generateSEOKeywords(storeName: string, products: Product[], topic: string): string[] {
  const keywords = [storeName.toLowerCase()];
  
  products.forEach(p => {
    if (p.name) keywords.push(p.name.toLowerCase());
    if (p.category_name) keywords.push(p.category_name.toLowerCase());
  });
  
  keywords.push(topic.toLowerCase());
  keywords.push('online shopping', 'quality products', 'best deals');
  
  return [...new Set(keywords)].slice(0, 10);
}

function generateMetaDescription(content: string): string {
  const firstParagraph = content.split('\n\n')[1] || content.split('\n')[1] || '';
  return firstParagraph.replace(/[#*]/g, '').substring(0, 155) + '...';
}

function generateTags(products: Product[], topic: string): string[] {
  const tags = [topic];
  const categories = [...new Set(products.map(p => p.category_name).filter(Boolean))] as string[];
  tags.push(...categories);
  tags.push('shopping', 'products', 'deals');
  return [...new Set(tags)].slice(0, 8);
}

function extractCategory(topic: string, products: Product[]): string {
  if (topic.toLowerCase().includes('guide')) return 'Buying Guides';
  if (topic.toLowerCase().includes('trend')) return 'Trends & News';
  if (topic.toLowerCase().includes('spotlight') || topic.toLowerCase().includes('featured')) return 'Product Spotlights';
  
  const productCategories = [...new Set(products.map(p => p.category_name).filter(Boolean))];
  if (productCategories.length > 0) return productCategories[0]!;
  
  return 'General';
}

function calculateReadTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.ceil(words / 200); // 200 words per minute average reading speed
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function generateUseCases(): string {
  const useCases = [
    'looking for a reliable everyday solution',
    'seeking quality and value',
    'upgrading your current setup',
    'shopping for someone special',
    'in need of a dependable option'
  ];
  
  return useCases[Math.floor(Math.random() * useCases.length)];
}

function generateBestFor(): string {
  const scenarios = [
    'Everyday use and reliability',
    'Those seeking excellent value',
    'Quality-conscious buyers',
    'First-time purchasers',
    'Upgrading from basic options'
  ];
  
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

function generateTrendReason(): string {
  const reasons = [
    'it combines style with functionality',
    'it offers exceptional value for money',
    'customers love its reliability',
    'it perfectly fits current lifestyle needs',
    'it represents the latest in quality design'
  ];
  
  return reasons[Math.floor(Math.random() * reasons.length)];
}