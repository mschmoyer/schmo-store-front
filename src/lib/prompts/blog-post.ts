import { z } from 'zod';

export interface BlogPostPromptData {
  userPrompt: string;
  storeName: string;
  storeDescription: string;
  heroTitle: string;
  heroDescription: string;
  productNames: string[];
  categories: string[];
  existingBlogTitles?: string[];
}

export interface GeneratedBlogPost {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  featuredProductSuggestions: string[];
  reasoning: string;
}

export const BLOG_POST_SYSTEM_PROMPT = `You are an expert content marketing copywriter specializing in e-commerce blog posts. Your job is to create engaging, SEO-optimized blog posts that showcase products naturally while providing valuable content to readers.

Key Guidelines:
1. Write engaging, conversational content that builds trust and authority
2. Naturally incorporate product mentions without being overly promotional
3. Focus on providing value to the reader first, selling second
4. Use storytelling and emotional connection when appropriate
5. Include actionable tips or insights readers can use
6. Optimize for search engines with relevant keywords
7. Create compelling headlines that drive clicks
8. Write meta descriptions that encourage click-through
9. Suggest relevant products that complement the content
10. Use appropriate tags for categorization and SEO

Content Structure:
- Start with an engaging hook that draws readers in
- Use clear headings and subheadings for readability
- Include practical examples or case studies when relevant
- End with a strong call-to-action
- Keep paragraphs short and scannable
- Use bullet points or numbered lists when appropriate

SEO Best Practices:
- Include target keywords naturally throughout
- Write compelling meta titles (50-60 characters)
- Create engaging meta descriptions (150-160 characters)
- Use relevant tags for categorization
- Suggest featured products that align with content

Voice and Tone:
- Professional yet approachable
- Enthusiastic about the products/topics
- Helpful and informative
- Authentic and trustworthy
- Appropriate for the store's brand personality`;

export const BLOG_POST_FUNCTION_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description: "Compelling blog post title that's engaging and SEO-friendly (50-70 characters)"
    },
    slug: {
      type: "string", 
      description: "URL-friendly slug for the blog post (lowercase, hyphens for spaces, no special characters)"
    },
    content: {
      type: "string",
      description: "Full blog post content in markdown format with proper headings, paragraphs, and formatting"
    },
    excerpt: {
      type: "string",
      description: "Brief excerpt or summary of the blog post (150-200 characters)"
    },
    metaTitle: {
      type: "string",
      description: "SEO meta title for search engines (50-60 characters)"
    },
    metaDescription: {
      type: "string", 
      description: "SEO meta description for search engines (150-160 characters)"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-8 relevant tags for categorization and SEO"
    },
    featuredProductSuggestions: {
      type: "array",
      items: { type: "string" },
      description: "2-5 product names from the store's catalog that should be featured or mentioned in this post"
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of your content strategy, keyword targeting, and product selection reasoning"
    }
  },
  required: ["title", "slug", "content", "excerpt", "metaTitle", "metaDescription", "tags", "featuredProductSuggestions", "reasoning"]
};

export const BlogPostSchema = z.object({
  title: z.string().min(10).max(100),
  slug: z.string().min(5).max(100).regex(/^[a-z0-9-]+$/),
  content: z.string().min(500),
  excerpt: z.string().min(50).max(300),
  metaTitle: z.string().min(10).max(60),
  metaDescription: z.string().min(50).max(160),
  tags: z.array(z.string()).min(3).max(8),
  featuredProductSuggestions: z.array(z.string()).min(2).max(5),
  reasoning: z.string().min(50)
});

export function buildBlogPostPrompt(data: BlogPostPromptData): string {
  const {
    userPrompt,
    storeName,
    storeDescription,
    heroTitle,
    heroDescription,
    productNames,
    categories,
    existingBlogTitles = []
  } = data;

  return `Write a compelling blog post for "${storeName}" based on the following information:

STORE CONTEXT:
- Store Name: ${storeName}
- Store Description: ${storeDescription}
- Hero Title: ${heroTitle}
- Hero Description: ${heroDescription}

PRODUCT CATALOG:
- Available Products: ${productNames.slice(0, 20).join(', ')}${productNames.length > 20 ? ` (and ${productNames.length - 20} more)` : ''}
- Product Categories: ${categories.join(', ')}

USER'S BLOG POST REQUEST:
${userPrompt}

${existingBlogTitles.length > 0 ? `
EXISTING BLOG TITLES (avoid duplicating these):
${existingBlogTitles.slice(0, 10).join('\n')}
` : ''}

REQUIREMENTS:
1. Create an engaging blog post that naturally incorporates relevant products from the catalog
2. Provide genuine value to readers beyond just product promotion
3. Use SEO best practices with relevant keywords
4. Make the content scannable with headers, lists, and short paragraphs
5. Include a strong call-to-action that encourages store engagement
6. Ensure the slug is unique and SEO-friendly
7. Select products that genuinely relate to the blog topic
8. Write in a tone that matches the store's brand personality

Generate a complete blog post that will engage customers and drive traffic to the store.`;
}