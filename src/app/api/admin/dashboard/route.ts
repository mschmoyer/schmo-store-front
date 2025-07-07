import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get dashboard statistics
    const [
      productStats,
      blogStats,
      categoryStats,
      integrationStats,
      storeInfo,
      topProducts,
      lowStockProducts,
      revenueStats,
      visitorStats
    ] = await Promise.all([
      // Product statistics
      db.query(`
        SELECT 
          COUNT(*) as total_products,
          COUNT(CASE WHEN is_active = true THEN 1 END) as visible_products,
          COUNT(CASE WHEN is_active = false THEN 1 END) as hidden_products,
          COUNT(CASE WHEN sale_price IS NOT NULL AND sale_price < base_price THEN 1 END) as products_with_discounts
        FROM products
        WHERE store_id = $1
      `, [user.storeId]),
      
      // Blog statistics
      db.query(`
        SELECT 
          COUNT(*) as total_posts,
          COUNT(CASE WHEN status = 'published' THEN 1 END) as published_posts,
          COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_posts
        FROM blog_posts
        WHERE store_id = $1
      `, [user.storeId]),
      
      // Category statistics
      db.query(`
        SELECT 
          COUNT(*) as total_categories
        FROM categories
        WHERE store_id = $1
      `, [user.storeId]),
      
      // Integration statistics
      db.query(`
        SELECT 
          integration_type,
          is_active
        FROM store_integrations
        WHERE store_id = $1
      `, [user.storeId]),
      
      // Store information (for public/private status)
      db.query(`
        SELECT 
          store_name,
          is_public,
          created_at
        FROM stores
        WHERE id = $1
      `, [user.storeId]),
      
      // Top 10 selling products by sales count
      db.query(`
        SELECT 
          p.name,
          p.base_price,
          p.featured_image_url,
          COALESCE(SUM(oi.quantity), 0) as sales_count
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
        WHERE p.store_id = $1 AND p.is_active = true
        GROUP BY p.id, p.name, p.base_price, p.featured_image_url
        HAVING COALESCE(SUM(oi.quantity), 0) > 0
        ORDER BY sales_count DESC
        LIMIT 10
      `, [user.storeId]),
      
      // Low stock products (stock_quantity <= 5)
      db.query(`
        SELECT 
          p.name,
          p.base_price,
          p.stock_quantity,
          p.featured_image_url
        FROM products p
        WHERE p.store_id = $1 AND p.is_active = true AND p.stock_quantity <= 5
        ORDER BY p.stock_quantity ASC
        LIMIT 10
      `, [user.storeId]),
      
      // Revenue statistics (orders table)
      db.query(`
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN total_amount ELSE 0 END), 0) as monthly_revenue,
          COUNT(*) as total_orders,
          COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) as monthly_orders
        FROM orders
        WHERE store_id = $1 AND status = 'completed'
      `, [user.storeId]),
      
      // Visitor statistics (visitors table)
      db.query(`
        SELECT 
          COUNT(DISTINCT ip_address) as total_unique_visitors,
          COUNT(DISTINCT CASE WHEN visited_date >= date_trunc('month', CURRENT_DATE) THEN ip_address END) as monthly_unique_visitors,
          COUNT(DISTINCT CASE WHEN visited_date >= CURRENT_DATE THEN ip_address END) as daily_unique_visitors
        FROM visitors
        WHERE store_id = $1
      `, [user.storeId])
    ]);
    
    // Process integration stats
    const integrations = integrationStats.rows.reduce((acc, row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      acc[(row as any).integration_type] = (row as any).is_active;
      return acc;
    }, {} as Record<string, boolean>);
    
    // Get recent activity
    const recentActivity = await db.query(`
      SELECT 
        'blog_post' as type,
        title as title,
        created_at,
        'Created blog post' as action
      FROM blog_posts
      WHERE store_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [user.storeId]);
    
    const stats = {
      totalProducts: parseInt(String(productStats.rows[0]?.total_products || '0')),
      visibleProducts: parseInt(String(productStats.rows[0]?.visible_products || '0')),
      hiddenProducts: parseInt(String(productStats.rows[0]?.hidden_products || '0')),
      productsWithDiscounts: parseInt(String(productStats.rows[0]?.products_with_discounts || '0')),
      totalBlogPosts: parseInt(String(blogStats.rows[0]?.total_posts || '0')),
      publishedBlogPosts: parseInt(String(blogStats.rows[0]?.published_posts || '0')),
      draftBlogPosts: parseInt(String(blogStats.rows[0]?.draft_posts || '0')),
      totalCategories: parseInt(String(categoryStats.rows[0]?.total_categories || '0')),
      integrations: {
        shipengine: integrations.shipengine || false,
        stripe: integrations.stripe || false,
      },
      // New dashboard data
      store: {
        name: storeInfo.rows[0]?.store_name || 'Unknown Store',
        isPublic: storeInfo.rows[0]?.is_public || false,
        createdAt: storeInfo.rows[0]?.created_at
      },
      siteVisitors: parseInt(String(visitorStats.rows[0]?.total_unique_visitors || '0')),
      lowStockCount: lowStockProducts.rows.length,
      revenue: {
        totalRevenue: parseFloat(String(revenueStats.rows[0]?.total_revenue || '0')),
        monthlyRevenue: parseFloat(String(revenueStats.rows[0]?.monthly_revenue || '0')),
        totalOrders: parseInt(String(revenueStats.rows[0]?.total_orders || '0')),
        monthlyOrders: parseInt(String(revenueStats.rows[0]?.monthly_orders || '0'))
      }
    };
    
    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentActivity: recentActivity.rows,
        topProducts: topProducts.rows,
        lowStockProducts: lowStockProducts.rows
      }
    });
    
  } catch (error) {
    console.error('Dashboard stats error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}