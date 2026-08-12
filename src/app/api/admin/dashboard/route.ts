import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import {
  AGEING_THRESHOLD_DAYS,
  GROSS_PROFIT_QUERY,
  ORDER_UNSHIPPED_STATUSES,
  mapGrossProfitRow,
  periodDelta,
  type GrossProfitRow,
} from '@/lib/services/orders';

/** The trailing window the dashboard reports on, in days. */
const WINDOW_DAYS = 30;

/**
 * GET /api/admin/dashboard
 *
 * The ten-minute Monday answer. Four figures on this route were wrong before
 * this pass and each is annotated at its query below:
 *
 * 1. Revenue filtered `status = 'completed'`, discarding every shipped,
 *    processing and pending order — 61% of booked value.
 * 2. "Top products" put the status test in a `LEFT JOIN … ON` clause, where it
 *    filters nothing, so cancelled orders counted as sales.
 * 3. "Site visitors / This month" rendered the all-time figure: 164 against a
 *    true 22.
 * 4. "Low stock" hardcoded `stock_quantity <= 5`, ignoring the per-product
 *    `low_stock_threshold` the merchant configured.
 *
 * And one thing was missing entirely: profit. It is fully computable from data
 * the store already holds and is now the second tile on the page.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @returns `{ success, data: { stats, recentActivity, topProducts, lowStockProducts } }`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - WINDOW_DAYS * 2);

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
      visitorStats,
      profitAllTime,
      profitWindow,
      profitPrior,
      orderOps
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
      
      /*
       * Top 10 selling products.
       *
       * The status test used to sit in `LEFT JOIN orders o ON … AND o.status =
       * 'completed'`, which filters nothing — an outer join's ON clause decides
       * what to match, not what to keep, so cancelled orders were counted as
       * sales. Voltpack Power Bank read 5 sold against 1 truly booked.
       *
       * Both joins are now inner and the test is in the WHERE clause, with the
       * same `<> 'cancelled'` rule the revenue figures use so the two panels on
       * this page cannot disagree.
       *
       * Verified: SELECT p.name, SUM(oi.quantity) FROM products p
       *   JOIN order_items oi ON oi.product_id = p.id
       *   JOIN orders o ON o.id = oi.order_id
       *  WHERE p.store_id = '650e8400-…0001' AND o.status <> 'cancelled'
       *  GROUP BY p.name ORDER BY 2 DESC;
       *   -> Anchor Charging Dock 10, Glide Wireless Mouse 7, …
       */
      db.query(`
        SELECT
          p.name,
          p.base_price,
          p.featured_image_url,
          SUM(oi.quantity)                                    as sales_count,
          SUM(oi.quantity * oi.unit_price)                    as revenue,
          SUM(oi.quantity * (oi.unit_price - COALESCE(oi.unit_cost, p.cost_price)))
                                                              as gross_profit
        FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        JOIN orders o ON o.id = oi.order_id
        WHERE p.store_id = $1
          AND p.is_active = true
          AND o.status <> 'cancelled'
        GROUP BY p.id, p.name, p.base_price, p.featured_image_url
        HAVING SUM(oi.quantity) > 0
        ORDER BY sales_count DESC
        LIMIT 10
      `, [user.storeId]),

      /*
       * Low stock.
       *
       * Was `stock_quantity <= 5` — a constant that ignored the per-product
       * `low_stock_threshold` column, which exists and defaults to 10. The
       * dashboard therefore disagreed with the merchant's own configured
       * thresholds by construction, and with the Inventory page (3 vs 4 vs a
       * true 2). It now reads the threshold, matching the Products and
       * Inventory queries exactly.
       *
       * Verified: SELECT COUNT(*) FROM products WHERE store_id = '650e8400-…0001'
       *   AND is_active AND track_inventory AND stock_quantity > 0
       *   AND stock_quantity <= low_stock_threshold;  -> 2
       */
      db.query(`
        SELECT
          p.name,
          p.base_price,
          p.stock_quantity,
          p.low_stock_threshold,
          p.featured_image_url
        FROM products p
        WHERE p.store_id = $1
          AND p.is_active = true
          AND p.track_inventory = true
          AND p.stock_quantity <= p.low_stock_threshold
        ORDER BY p.stock_quantity ASC
        LIMIT 10
      `, [user.storeId]),

      /*
       * Booked revenue.
       *
       * Was `status = 'completed'`, which showed $2,174.05 of a real $5,588.11
       * and reported "$0.00 this month" while order BCA-1010 sat shipped and
       * paid. A merchant does not think an order they shipped last Tuesday is
       * not revenue. Cancellations, and only cancellations, are excluded.
       *
       * Verified: SELECT SUM(total_amount), COUNT(*) FROM orders
       *   WHERE store_id = '650e8400-…0001' AND status <> 'cancelled';
       *   -> 5588.11 / 21
       */
      db.query(`
        SELECT
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN created_at >= $2 THEN total_amount ELSE 0 END), 0) as monthly_revenue,
          COUNT(*) as total_orders,
          COUNT(CASE WHEN created_at >= $2 THEN 1 END) as monthly_orders
        FROM orders
        WHERE store_id = $1 AND status <> 'cancelled'
      `, [user.storeId, windowStart]),

      // Visitor statistics (visitors table)
      db.query(`
        SELECT
          COUNT(DISTINCT ip_address) as total_unique_visitors,
          COUNT(DISTINCT CASE WHEN visited_date >= $2 THEN ip_address END) as window_unique_visitors,
          COUNT(DISTINCT CASE WHEN visited_date >= CURRENT_DATE THEN ip_address END) as daily_unique_visitors
        FROM visitors
        WHERE store_id = $1
      `, [user.storeId, windowStart]),

      // Gross profit, all time. See GROSS_PROFIT_QUERY for the arithmetic.
      // Verified: revenue 5358.00 | cogs 2972.01 | gross profit 2385.99 | 44.5%
      db.query<GrossProfitRow>(GROSS_PROFIT_QUERY, [user.storeId, null, null]),

      // Gross profit, trailing 30 days.
      // Verified: revenue 918.00 | cogs 476.77 | gross profit 441.23 | 48.1%
      db.query<GrossProfitRow>(GROSS_PROFIT_QUERY, [user.storeId, windowStart, null]),

      // The 30 days before that, so every figure has something to be compared to.
      // "All time" is not a period and cannot tell you whether the month was good.
      db.query<GrossProfitRow>(GROSS_PROFIT_QUERY, [user.storeId, priorStart, windowStart]),

      /*
       * What is stuck. Five orders totalling $1,946.55 had been sitting
       * unshipped for 61 to 73 days with nothing in the admin mentioning it.
       *
       * Verified: SELECT order_number, status, total_amount,
       *   CURRENT_DATE - created_at::date FROM orders
       *   WHERE store_id = '650e8400-…0001' AND status IN ('pending','processing');
       *   -> BCA-1014 73d, BCA-1011 69d, BCA-1004 66d, BCA-1001 63d, BCA-1020 61d
       */
      db.query<{
        unshipped_count: string;
        unshipped_value: string;
        ageing_count: string;
        ageing_value: string;
        oldest_unshipped_days: string | null;
      }>(`
        SELECT
          COUNT(*)                                           as unshipped_count,
          COALESCE(SUM(total_amount), 0)                     as unshipped_value,
          COUNT(*) FILTER (WHERE created_at < CURRENT_DATE - $3::int)
                                                             as ageing_count,
          COALESCE(SUM(total_amount) FILTER (WHERE created_at < CURRENT_DATE - $3::int), 0)
                                                             as ageing_value,
          MAX(CURRENT_DATE - created_at::date)               as oldest_unshipped_days
        FROM orders
        WHERE store_id = $1 AND status = ANY($2::text[])
      `, [user.storeId, `{${ORDER_UNSHIPPED_STATUSES.join(',')}}`, AGEING_THRESHOLD_DAYS])
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
    
    const windowProfit = mapGrossProfitRow(profitWindow.rows[0]);
    const priorProfit = mapGrossProfitRow(profitPrior.rows[0]);

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
        shipstation: integrations.shipstation || false,
        stripe: integrations.stripe || false,
      },
      // New dashboard data
      store: {
        name: storeInfo.rows[0]?.store_name || 'Unknown Store',
        isPublic: storeInfo.rows[0]?.is_public || false,
        createdAt: storeInfo.rows[0]?.created_at
      },
      /*
       * The tile is labelled "Last 30 days", so it gets the 30-day figure.
       * `monthly_unique_visitors` was computed and then never used — line 160
       * assigned `total_unique_visitors` instead, so a tile reading "This
       * month" showed 164 against a true 22 and would have drifted further
       * every month the store stayed open.
       */
      siteVisitors: parseInt(String(visitorStats.rows[0]?.window_unique_visitors || '0')),
      siteVisitorsAllTime: parseInt(String(visitorStats.rows[0]?.total_unique_visitors || '0')),
      lowStockCount: lowStockProducts.rows.length,
      revenue: {
        totalRevenue: parseFloat(String(revenueStats.rows[0]?.total_revenue || '0')),
        monthlyRevenue: parseFloat(String(revenueStats.rows[0]?.monthly_revenue || '0')),
        totalOrders: parseInt(String(revenueStats.rows[0]?.total_orders || '0')),
        monthlyOrders: parseInt(String(revenueStats.rows[0]?.monthly_orders || '0'))
      },
      profit: {
        windowDays: WINDOW_DAYS,
        allTime: mapGrossProfitRow(profitAllTime.rows[0]),
        window: windowProfit,
        prior: priorProfit,
        delta: {
          revenue: periodDelta(windowProfit.revenue, priorProfit.revenue),
          grossProfit: periodDelta(windowProfit.grossProfit, priorProfit.grossProfit),
          /* Margin is already a percentage; a percent change of a percent is
             noise, so this is the plain point difference. */
          marginPoints: priorProfit.revenue > 0
            ? windowProfit.marginPct - priorProfit.marginPct
            : null,
          orderCount: periodDelta(windowProfit.orderCount, priorProfit.orderCount),
        },
      },
      orders: {
        unshippedCount: parseInt(String(orderOps.rows[0]?.unshipped_count || '0')),
        unshippedValue: parseFloat(String(orderOps.rows[0]?.unshipped_value || '0')),
        ageingCount: parseInt(String(orderOps.rows[0]?.ageing_count || '0')),
        ageingValue: parseFloat(String(orderOps.rows[0]?.ageing_value || '0')),
        oldestUnshippedDays: parseInt(String(orderOps.rows[0]?.oldest_unshipped_days || '0')),
        ageingThresholdDays: AGEING_THRESHOLD_DAYS,
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