import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface LandingPageAnalytics {
  totalLandingPageViews: number;
  uniqueLandingPageVisitors: number;
  topLandingPages: {
    page_path: string;
    view_count: number;
    unique_visitors: number;
    bounce_rate: number;
  }[];
  conversionMetrics: {
    visitors_to_orders: number;
    conversion_rate: number;
    average_order_value: number;
  };
  trafficSources: {
    source: string;
    visitor_count: number;
    percentage: number;
  }[];
}

/**
 * GET /api/admin/analytics/landing
 * Get landing page analytics data for the store
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Check if visitors table exists
    const visitorsTableExistsResult = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'visitors'
      );
    `);

    const visitorsTableExists = visitorsTableExistsResult.rows[0]?.exists || false;

    const landingAnalytics: LandingPageAnalytics = {
      totalLandingPageViews: 0,
      uniqueLandingPageVisitors: 0,
      topLandingPages: [],
      conversionMetrics: {
        visitors_to_orders: 0,
        conversion_rate: 0,
        average_order_value: 0
      },
      trafficSources: []
    };

    if (visitorsTableExists) {
      // Get landing page views (assuming first page visit per session is landing page)
      const landingPageStatsResult = await db.query(`
        WITH first_visits AS (
          SELECT DISTINCT ON (ip_address, DATE(created_at))
            ip_address, 
            page_path,
            created_at,
            referrer
          FROM visitors 
          WHERE store_id = $1 AND created_at >= $2
          ORDER BY ip_address, DATE(created_at), created_at ASC
        )
        SELECT 
          COUNT(*) as total_landing_views,
          COUNT(DISTINCT ip_address) as unique_landing_visitors
        FROM first_visits
      `, [user.storeId, startDate]);

      const landingStats = landingPageStatsResult.rows[0];
      landingAnalytics.totalLandingPageViews = parseInt(String(landingStats?.total_landing_views || '0'));
      landingAnalytics.uniqueLandingPageVisitors = parseInt(String(landingStats?.unique_landing_visitors || '0'));

      // Top landing pages
      const topLandingPagesResult = await db.query(`
        WITH first_visits AS (
          SELECT DISTINCT ON (ip_address, DATE(created_at))
            ip_address, 
            page_path,
            created_at
          FROM visitors 
          WHERE store_id = $1 AND created_at >= $2
          ORDER BY ip_address, DATE(created_at), created_at ASC
        ),
        page_stats AS (
          SELECT 
            page_path,
            COUNT(*) as view_count,
            COUNT(DISTINCT ip_address) as unique_visitors
          FROM first_visits
          GROUP BY page_path
        )
        SELECT 
          page_path,
          view_count,
          unique_visitors,
          CASE WHEN view_count > 0 THEN (view_count - unique_visitors) * 100.0 / view_count ELSE 0 END as bounce_rate
        FROM page_stats
        ORDER BY view_count DESC
        LIMIT 10
      `, [user.storeId, startDate]);

      landingAnalytics.topLandingPages = topLandingPagesResult.rows.map(row => ({
        page_path: row.page_path,
        view_count: parseInt(String(row.view_count)),
        unique_visitors: parseInt(String(row.unique_visitors)),
        bounce_rate: parseFloat(String(row.bounce_rate || '0'))
      }));

      // Traffic sources (based on referrer)
      const trafficSourcesResult = await db.query(`
        WITH first_visits AS (
          SELECT DISTINCT ON (ip_address, DATE(created_at))
            ip_address, 
            page_path,
            created_at,
            referrer
          FROM visitors 
          WHERE store_id = $1 AND created_at >= $2
          ORDER BY ip_address, DATE(created_at), created_at ASC
        ),
        source_stats AS (
          SELECT 
            CASE 
              WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
              WHEN referrer ILIKE '%google%' THEN 'Google'
              WHEN referrer ILIKE '%facebook%' THEN 'Facebook'
              WHEN referrer ILIKE '%instagram%' THEN 'Instagram'
              WHEN referrer ILIKE '%twitter%' THEN 'Twitter'
              WHEN referrer ILIKE '%linkedin%' THEN 'LinkedIn'
              ELSE 'Other'
            END as source,
            COUNT(DISTINCT ip_address) as visitor_count
          FROM first_visits
          GROUP BY 
            CASE 
              WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
              WHEN referrer ILIKE '%google%' THEN 'Google'
              WHEN referrer ILIKE '%facebook%' THEN 'Facebook'
              WHEN referrer ILIKE '%instagram%' THEN 'Instagram'
              WHEN referrer ILIKE '%twitter%' THEN 'Twitter'
              WHEN referrer ILIKE '%linkedin%' THEN 'LinkedIn'
              ELSE 'Other'
            END
        )
        SELECT 
          source,
          visitor_count,
          (visitor_count * 100.0 / SUM(visitor_count) OVER ()) as percentage
        FROM source_stats
        ORDER BY visitor_count DESC
      `, [user.storeId, startDate]);

      landingAnalytics.trafficSources = trafficSourcesResult.rows.map(row => ({
        source: row.source,
        visitor_count: parseInt(String(row.visitor_count)),
        percentage: parseFloat(String(row.percentage || '0'))
      }));

      // Conversion metrics
      const conversionResult = await db.query(`
        WITH visitor_orders AS (
          SELECT 
            v.ip_address,
            COUNT(DISTINCT o.id) as order_count,
            SUM(o.total_amount) as total_spent
          FROM visitors v
          LEFT JOIN orders o ON v.store_id = o.store_id 
            AND DATE(v.created_at) = DATE(o.created_at)
          WHERE v.store_id = $1 AND v.created_at >= $2
          GROUP BY v.ip_address
        )
        SELECT 
          COUNT(CASE WHEN order_count > 0 THEN 1 END) as visitors_with_orders,
          COUNT(*) as total_unique_visitors,
          AVG(CASE WHEN total_spent > 0 THEN total_spent END) as avg_order_value
        FROM visitor_orders
      `, [user.storeId, startDate]);

      const conversionStats = conversionResult.rows[0];
      const visitorsWithOrders = parseInt(String(conversionStats?.visitors_with_orders || '0'));
      const totalUniqueVisitors = parseInt(String(conversionStats?.total_unique_visitors || '0'));
      
      landingAnalytics.conversionMetrics = {
        visitors_to_orders: visitorsWithOrders,
        conversion_rate: totalUniqueVisitors > 0 ? (visitorsWithOrders / totalUniqueVisitors) * 100 : 0,
        average_order_value: parseFloat(String(conversionStats?.avg_order_value || '0'))
      };
    }

    return NextResponse.json({
      success: true,
      data: landingAnalytics,
      meta: {
        visitorsTableExists,
        dateRange: `${days} days`,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Landing page analytics API error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}