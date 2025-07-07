// Database schema definitions for the admin system
import { z } from 'zod';

// Store Schema
export const StoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Store name is required'),
  slug: z.string().min(1, 'Store slug is required'),
  description: z.string().optional(),
  hero_title: z.string().optional(),
  hero_description: z.string().optional(),
  theme_id: z.string().default('default'),
  admin_password_hash: z.string(),
  admin_email: z.string().email('Valid email is required'),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Store = z.infer<typeof StoreSchema>;

// Store Integration Schema
export const StoreIntegrationSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  integration_type: z.enum(['shipengine', 'stripe']),
  api_key_encrypted: z.string().optional(),
  configuration: z.record(z.any()).optional(),
  is_active: z.boolean().default(false),
  auto_sync_enabled: z.boolean().default(false),
  auto_sync_interval: z.enum(['10min', '1hour', '1day']).default('1hour'),
  created_at: z.date(),
  updated_at: z.date(),
});

export type StoreIntegration = z.infer<typeof StoreIntegrationSchema>;

// Product Override Schema
export const ProductOverrideSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  product_id: z.string(), // ShipStation product ID
  custom_description: z.string().optional(),
  is_visible: z.boolean().default(true),
  discount_type: z.enum(['fixed', 'percentage']).optional(),
  discount_value: z.number().optional(),
  custom_images: z.array(z.string()).optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type ProductOverride = z.infer<typeof ProductOverrideSchema>;

// Store Category Schema
export const StoreCategorySchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  category_name: z.string().min(1, 'Category name is required'),
  is_visible: z.boolean().default(true),
  sort_order: z.number().default(0),
  created_at: z.date(),
  updated_at: z.date(),
});

export type StoreCategory = z.infer<typeof StoreCategorySchema>;

// Blog Post Schema
export const BlogPostSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  title: z.string().min(1, 'Blog post title is required'),
  slug: z.string().min(1, 'Blog post slug is required'),
  content: z.string().min(1, 'Blog post content is required'),
  excerpt: z.string().optional(),
  featured_image_url: z.string().url().optional(),
  author_name: z.string().optional(),
  published_at: z.date().optional(),
  is_published: z.boolean().default(false),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type BlogPost = z.infer<typeof BlogPostSchema>;

// Admin Session Schema
export const AdminSessionSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  session_token: z.string(),
  expires_at: z.date(),
  created_at: z.date(),
});

export type AdminSession = z.infer<typeof AdminSessionSchema>;

// Form validation schemas
export const CreateStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  slug: z.string().min(1, 'Store slug is required').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().optional(),
  admin_email: z.string().email('Valid email is required'),
  admin_password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const AdminLoginSchema = z.object({
  store_slug: z.string().min(1, 'Store slug is required'),
  password: z.string().min(1, 'Password is required'),
});

export const StoreConfigUpdateSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  description: z.string().optional(),
  hero_title: z.string().optional(),
  hero_description: z.string().optional(),
  theme_id: z.string().default('default'),
});

export const ProductOverrideUpdateSchema = z.object({
  custom_description: z.string().optional(),
  is_visible: z.boolean().default(true),
  discount_type: z.enum(['fixed', 'percentage']).optional(),
  discount_value: z.number().min(0).optional(),
  custom_images: z.array(z.string()).optional(),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
});

export const BlogPostCreateSchema = z.object({
  title: z.string().min(1, 'Blog post title is required'),
  slug: z.string().min(1, 'Blog post slug is required').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  content: z.string().min(1, 'Blog post content is required'),
  excerpt: z.string().optional(),
  featured_image_url: z.string().url().optional(),
  author_name: z.string().optional(),
  is_published: z.boolean().default(false),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
});

export const IntegrationUpdateSchema = z.object({
  api_key: z.string().min(1, 'API key is required'),
  configuration: z.record(z.any()).optional(),
  is_active: z.boolean().default(false),
  auto_sync_enabled: z.boolean().optional(),
  auto_sync_interval: z.enum(['10min', '1hour', '1day']).optional(),
});