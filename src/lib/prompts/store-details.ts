export interface StoreDetailsPromptData {
  businessDescription: string;
  availableThemes: string[];
  productNames: string[];
  categories: string[];
  storeSlug: string;
  existingStoreName?: string;
  existingDescription?: string;
  existingHeroTitle?: string;
  existingHeroDescription?: string;
}

export interface GeneratedStoreDetails {
  storeName: string;
  storeDescription: string;
  heroTitle: string;
  heroDescription: string;
  selectedTheme: string;
  metaTitle: string;
  metaDescription: string;
  reasoning: string;
  storeId?: string; // Added as optional since it's added by the API
}

export const STORE_DETAILS_SYSTEM_PROMPT = `You are an expert e-commerce copywriter and branding specialist. Your task is to generate compelling store details that will attract customers and improve conversion rates.

Key principles:
1. Create compelling, benefit-focused copy that speaks to customer pain points
2. Use persuasive language that builds trust and urgency
3. Ensure all content is SEO-friendly with natural keyword integration
4. Match the tone and style to the business type and target audience
5. Choose themes that complement the business type and aesthetic
6. Keep hero titles punchy and memorable (under 60 characters)
7. Make descriptions clear, benefit-focused, and action-oriented
8. Ensure meta titles are under 60 characters and meta descriptions under 160 characters

Theme Selection Guidelines:
- default: General stores, green/eco-friendly businesses
- ocean: Tech, marine, blue-themed businesses
- sunset: Food, warm/cozy businesses, orange aesthetic
- purple: Luxury, beauty, creative businesses
- dark: Tech, gaming, modern businesses
- rose: Beauty, fashion, feminine products
- teal: Health, wellness, mint/fresh aesthetic  
- amber: Artisan, crafts, warm golden aesthetic
- slate: Professional, minimal, corporate
- crimson: Bold, energetic, action-oriented businesses

Always provide reasoning for your choices to help the business owner understand the strategy.`;

export const buildStoreDetailsPrompt = (data: StoreDetailsPromptData): string => {
  const {
    businessDescription,
    availableThemes,
    productNames,
    categories,
    storeSlug,
    existingStoreName,
    existingDescription,
    existingHeroTitle,
    existingHeroDescription
  } = data;

  const existingContent = existingStoreName || existingDescription || existingHeroTitle || existingHeroDescription
    ? `
Current Store Details:
- Store Name: ${existingStoreName || 'Not set'}
- Description: ${existingDescription || 'Not set'}
- Hero Title: ${existingHeroTitle || 'Not set'}
- Hero Description: ${existingHeroDescription || 'Not set'}

You can improve upon these existing details or create new ones if they don't align with the business description.`
    : '';

  return `
Business Description: ${businessDescription}

Store Slug: ${storeSlug}

Available Themes: ${availableThemes.join(', ')}

Product Categories: ${categories.length > 0 ? categories.join(', ') : 'No categories available'}

Sample Product Names: ${productNames.length > 0 ? productNames.slice(0, 15).join(', ') : 'No products available'}

${existingContent}

Please generate compelling store details that will attract customers and improve conversion rates. Consider the business type, target audience, and product offerings when crafting the copy and selecting the theme.

Requirements:
- Store Name: Should be memorable and reflect the business (if not already established)
- Store Description: 2-3 sentences that clearly explain what the store offers and why customers should choose it
- Hero Title: Catchy, benefit-focused headline (under 60 characters)
- Hero Description: Compelling 1-2 sentence value proposition that drives action
- Theme: Select the most appropriate theme from the available options based on the business type
- Meta Title: SEO-optimized title (under 60 characters)
- Meta Description: SEO-friendly description (under 160 characters)
- Reasoning: Explain your choices and strategy

Focus on benefits over features, use action-oriented language, and ensure the copy builds trust and urgency.
`.trim();
};

export const STORE_DETAILS_FUNCTION_SCHEMA = {
  type: 'object',
  properties: {
    storeName: {
      type: 'string',
      description: 'A memorable store name that reflects the business'
    },
    storeDescription: {
      type: 'string',
      description: 'A compelling 2-3 sentence description of what the store offers'
    },
    heroTitle: {
      type: 'string',
      description: 'A catchy, benefit-focused headline under 60 characters'
    },
    heroDescription: {
      type: 'string',
      description: 'A compelling 1-2 sentence value proposition that drives action'
    },
    selectedTheme: {
      type: 'string',
      description: 'The selected theme name from the available options'
    },
    metaTitle: {
      type: 'string',
      description: 'SEO-optimized title under 60 characters'
    },
    metaDescription: {
      type: 'string',
      description: 'SEO-friendly description under 160 characters'
    },
    reasoning: {
      type: 'string',
      description: 'Explanation of the choices and strategy behind the generated content'
    }
  },
  required: ['storeName', 'storeDescription', 'heroTitle', 'heroDescription', 'selectedTheme', 'metaTitle', 'metaDescription', 'reasoning']
};