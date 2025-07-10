import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface SearchAnalytics {
  totalSearches: number;
  uniqueSearches: number;
  averageResultsPerSearch: number;
  mostPopularSearches: {
    search_query: string;
    search_count: number;
    avg_results: number;
    last_searched: string;
  }[];
  searchTrends: {
    date: string;
    search_count: number;
  }[];
  zeroResultSearches: {
    search_query: string;
    search_count: number;
    last_searched: string;
  }[];
}

interface VisitorAnalytics {
  totalVisitors: number;
  uniqueVisitors: number;
  totalPageViews: number;
  averageSessionDuration: number;
  topPages: {
    page_path: string;
    view_count: number;
    unique_visitors: number;
  }[];
  visitorTrends: {
    date: string;
    visitor_count: number;
    page_views: number;
  }[];
}

interface AnalyticsData {
  searchAnalytics: SearchAnalytics;
  visitorAnalytics: VisitorAnalytics;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

/**
 * GET /api/admin/analytics
 * Get comprehensive analytics data for the store
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

    // Check if search_tracking table exists
    const tableExistsResult = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'search_tracking'
      );
    `);

    const searchTrackingExists = tableExistsResult.rows[0]?.exists || false;

    // Get search analytics (if table exists)
    const searchAnalytics: SearchAnalytics = {
      totalSearches: 0,
      uniqueSearches: 0,
      averageResultsPerSearch: 0,
      mostPopularSearches: [],
      searchTrends: [],
      zeroResultSearches: []
    };

    if (searchTrackingExists) {
      // Total searches
      const totalSearchesResult = await db.query(`
        SELECT 
          COUNT(*) as total_searches,
          COUNT(DISTINCT search_query) as unique_searches,
          COALESCE(AVG(results_count), 0) as avg_results
        FROM search_tracking 
        WHERE store_id = $1 AND created_at >= $2
      `, [user.storeId, startDate]);

      const searchStats = totalSearchesResult.rows[0];
      searchAnalytics.totalSearches = parseInt(String(searchStats?.total_searches || '0'));
      searchAnalytics.uniqueSearches = parseInt(String(searchStats?.unique_searches || '0'));
      searchAnalytics.averageResultsPerSearch = parseFloat(String(searchStats?.avg_results || '0'));

      // Most popular searches
      const popularSearchesResult = await db.query(`
        SELECT 
          search_query,
          COUNT(*) as search_count,
          AVG(results_count) as avg_results,
          MAX(created_at) as last_searched
        FROM search_tracking 
        WHERE store_id = $1 AND created_at >= $2
        GROUP BY search_query
        ORDER BY search_count DESC, last_searched DESC
        LIMIT 10
      `, [user.storeId, startDate]);

      searchAnalytics.mostPopularSearches = popularSearchesResult.rows.map(row => ({
        search_query: row.search_query,
        search_count: parseInt(String(row.search_count)),
        avg_results: parseFloat(String(row.avg_results || '0')),
        last_searched: row.last_searched
      }));

      // Search trends by day
      const searchTrendsResult = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as search_count
        FROM search_tracking 
        WHERE store_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [user.storeId, startDate]);

      searchAnalytics.searchTrends = searchTrendsResult.rows.map(row => ({
        date: row.date,
        search_count: parseInt(String(row.search_count))
      }));

      // Zero result searches
      const zeroResultSearchesResult = await db.query(`
        SELECT 
          search_query,
          COUNT(*) as search_count,
          MAX(created_at) as last_searched
        FROM search_tracking 
        WHERE store_id = $1 AND created_at >= $2 AND results_count = 0
        GROUP BY search_query
        ORDER BY search_count DESC, last_searched DESC
        LIMIT 10
      `, [user.storeId, startDate]);

      searchAnalytics.zeroResultSearches = zeroResultSearchesResult.rows.map(row => ({
        search_query: row.search_query,
        search_count: parseInt(String(row.search_count)),
        last_searched: row.last_searched
      }));
    }

    // Get visitor analytics (using visitors table)
    const visitorAnalytics: VisitorAnalytics = {
      totalVisitors: 0,
      uniqueVisitors: 0,
      totalPageViews: 0,
      averageSessionDuration: 0,
      topPages: [],
      visitorTrends: []
    };

    // Check if visitors table exists
    const visitorsTableExistsResult = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'visitors'
      );
    `);

    const visitorsTableExists = visitorsTableExistsResult.rows[0]?.exists || false;

    if (visitorsTableExists) {
      // Total visitor stats
      const visitorStatsResult = await db.query(`
        SELECT 
          COUNT(*) as total_visits,
          COUNT(DISTINCT ip_address) as unique_visitors,
          COUNT(*) as total_page_views
        FROM visitors 
        WHERE store_id = $1 AND created_at >= $2
      `, [user.storeId, startDate]);

      const visitorStats = visitorStatsResult.rows[0];
      visitorAnalytics.totalVisitors = parseInt(String(visitorStats?.total_visits || '0'));
      visitorAnalytics.uniqueVisitors = parseInt(String(visitorStats?.unique_visitors || '0'));
      visitorAnalytics.totalPageViews = parseInt(String(visitorStats?.total_page_views || '0'));

      // Top pages
      const topPagesResult = await db.query(`
        SELECT 
          page_path,
          COUNT(*) as view_count,
          COUNT(DISTINCT ip_address) as unique_visitors
        FROM visitors 
        WHERE store_id = $1 AND created_at >= $2
        GROUP BY page_path
        ORDER BY view_count DESC
        LIMIT 10
      `, [user.storeId, startDate]);

      visitorAnalytics.topPages = topPagesResult.rows.map(row => ({
        page_path: row.page_path,
        view_count: parseInt(String(row.view_count)),
        unique_visitors: parseInt(String(row.unique_visitors))
      }));

      // Visitor trends by day
      const visitorTrendsResult = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(DISTINCT ip_address) as visitor_count,
          COUNT(*) as page_views
        FROM visitors 
        WHERE store_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [user.storeId, startDate]);

      visitorAnalytics.visitorTrends = visitorTrendsResult.rows.map(row => ({
        date: row.date,
        visitor_count: parseInt(String(row.visitor_count)),
        page_views: parseInt(String(row.page_views))
      }));
    }

    const analyticsData: AnalyticsData = {
      searchAnalytics,
      visitorAnalytics,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };

    return NextResponse.json({
      success: true,
      data: analyticsData,
      meta: {
        searchTrackingAvailable: searchTrackingExists,
        visitorTrackingAvailable: visitorsTableExists,
        dateRange: `${days} days`
      }
    });

  } catch (error) {
    console.error('Analytics API error:', error);
    
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