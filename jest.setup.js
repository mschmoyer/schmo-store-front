import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return ''
  },
}))

// Mock database connection - only if it exists
jest.mock('@/lib/database/connection', () => ({
  db: {
    initialize: jest.fn(),
    query: jest.fn(),
  },
  initializeDatabase: jest.fn(),
}), { virtual: true })

// Mock authentication - only if it exists
jest.mock('@/lib/auth/session', () => ({
  createSession: jest.fn(),
  verifySession: jest.fn(),
  getSessionFromRequest: jest.fn(),
  requireAuth: jest.fn(),
}), { virtual: true })

// Mock fetch globally
global.fetch = jest.fn()

// Setup database test data
export const mockStores = [
  {
    id: '650e8400-e29b-41d4-a716-446655440001',
    store_name: 'Demo Electronics Store',
    store_slug: 'demo-electronics',
    store_description: 'Your one-stop shop for quality electronics and gadgets',
    hero_title: 'Welcome to Demo Electronics',
    hero_description: 'Discover the latest in technology and electronics with unbeatable prices and quality service.',
    theme_name: 'default',
    currency: 'USD',
    is_active: true,
    is_public: true,
    meta_title: 'Demo Electronics - Quality Tech at Great Prices',
    meta_description: 'Shop the latest electronics, smartphones, laptops, and gadgets at Demo Electronics.'
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440002',
    store_name: 'Artisan Craft Corner',
    store_slug: 'artisan-craft',
    store_description: 'Handmade crafts and artisan goods',
    hero_title: 'Handcrafted with Love',
    hero_description: 'Unique, handmade items created by talented artisans from around the world.',
    theme_name: 'default',
    currency: 'USD',
    is_active: true,
    is_public: true,
    meta_title: 'Artisan Craft Corner - Handmade with Love',
    meta_description: 'Discover unique handmade crafts, jewelry, pottery, and artisan goods.'
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440003',
    store_name: 'Fitness Pro Shop',
    store_slug: 'fitness-pro',
    store_description: 'Professional fitness equipment and accessories',
    hero_title: 'Achieve Your Fitness Goals',
    hero_description: 'Professional-grade fitness equipment and accessories for home and commercial use.',
    theme_name: 'default',
    currency: 'USD',
    is_active: true,
    is_public: false,
    meta_title: 'Fitness Pro Shop - Professional Fitness Equipment',
    meta_description: 'High-quality fitness equipment, supplements, and accessories.'
  }
]

export const mockProducts = [
  {
    id: '850e8400-e29b-41d4-a716-446655440001',
    sku: 'PHONE-001',
    name: 'Latest Smartphone Pro',
    slug: 'latest-smartphone-pro',
    short_description: 'Premium smartphone with advanced features',
    long_description: 'Experience the latest in mobile technology with our flagship smartphone featuring a stunning display, powerful processor, and professional-grade camera system.',
    base_price: 899.99,
    sale_price: 799.99,
    stock_quantity: 25,
    low_stock_threshold: 5,
    featured_image_url: '/images/smartphone-pro.jpg',
    is_active: true,
    is_featured: true,
    requires_shipping: true,
    category_name: 'Smartphones',
    tags: ['smartphone', 'mobile', 'premium']
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440004',
    sku: 'JEWELRY-001',
    name: 'Handcrafted Silver Necklace',
    slug: 'handcrafted-silver-necklace',
    short_description: 'Beautiful silver necklace made by local artisans',
    long_description: 'This stunning silver necklace is handcrafted by skilled artisans using traditional techniques. Each piece is unique and comes with a certificate of authenticity.',
    base_price: 149.99,
    sale_price: null,
    stock_quantity: 8,
    low_stock_threshold: 2,
    featured_image_url: '/images/silver-necklace.jpg',
    is_active: true,
    is_featured: true,
    requires_shipping: true,
    category_name: 'Jewelry',
    tags: ['jewelry', 'silver', 'handmade', 'necklace']
  }
]

export const mockUsers = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'demo@schmostore.com',
    password_hash: '$2b$10$rQkKm2rU6lzjVwjTBJEhE.TwXRQJ1L2NVPW2X3ZQJZ6E8dGZcH8bO',
    first_name: 'Demo',
    last_name: 'User',
    email_verified: true,
    is_active: true
  }
]