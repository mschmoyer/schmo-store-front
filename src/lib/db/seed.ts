import { query } from './connection';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Seed data for development
export async function seedDatabase() {
  console.log('Starting database seeding...');
  
  try {
    // Create a demo store
    const storeId = uuidv4();
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    await query(`
      INSERT INTO stores (id, name, slug, description, hero_title, hero_description, theme_id, admin_password_hash, admin_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (slug) DO NOTHING
    `, [
      storeId,
      'Demo Store',
      'demo-store',
      'A demonstration store for testing the admin system',
      'Welcome to Demo Store',
      'Your one-stop shop for amazing products',
      'default',
      passwordHash,
      'admin@demo-store.com'
    ]);
    
    // Create some sample categories
    const categories = [
      'Electronics',
      'Clothing',
      'Books',
      'Home & Garden',
      'Sports'
    ];
    
    for (let i = 0; i < categories.length; i++) {
      await query(`
        INSERT INTO categories (id, store_id, name, slug, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [
        uuidv4(),
        storeId,
        categories[i],
        categories[i].toLowerCase().replace(/[^a-z0-9]/g, '-')
      ]);
    }
    
    // No sample blog posts - stores start with empty blogs
    
    // Create sample product overrides
    const productOverrides = [
      {
        product_id: 'PROD-001',
        custom_description: '<p>This is a custom description for our featured product with special formatting.</p>',
        is_visible: true,
        discount_type: 'percentage',
        discount_value: 10.00
      },
      {
        product_id: 'PROD-002',
        custom_description: '<p>Another product with a custom description and fixed discount.</p>',
        is_visible: true,
        discount_type: 'fixed',
        discount_value: 5.00
      },
      {
        product_id: 'PROD-003',
        custom_description: null,
        is_visible: false,
        discount_type: null,
        discount_value: null
      }
    ];
    
    for (const override of productOverrides) {
      await query(`
        INSERT INTO product_overrides (id, store_id, product_id, custom_description, is_visible, discount_type, discount_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (store_id, product_id) DO NOTHING
      `, [
        uuidv4(),
        storeId,
        override.product_id,
        override.custom_description,
        override.is_visible,
        override.discount_type,
        override.discount_value
      ]);
    }
    
    console.log('Database seeding completed successfully!');
    console.log('Demo store created with:');
    console.log('- Store slug: demo-store');
    console.log('- Admin email: admin@demo-store.com');
    console.log('- Admin password: admin123');
    
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

// Function to clean up test data
export async function cleanupDatabase() {
  console.log('Cleaning up database...');
  
  try {
    await query('DELETE FROM admin_sessions');
    await query('DELETE FROM blog_posts');
    await query('DELETE FROM product_overrides');
    await query('DELETE FROM store_categories');
    await query('DELETE FROM store_integrations');
    await query('DELETE FROM stores');
    
    console.log('Database cleanup completed successfully!');
  } catch (error) {
    console.error('Error cleaning up database:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase().catch(console.error);
}