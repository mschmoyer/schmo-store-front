import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface TrendData {
  date: string;
  search_count?: number;
  visitor_count?: number;
  page_views?: number;
}

interface TrendStats {
  totalSearches: number;
  uniqueVisitors: number;
  totalPageViews: number;
  /**
   * Metrics this store cannot measure, and why.
   *
   * `avgSessionDuration` and `bounceRate` used to be returned here as the
   * literals `272` and `32.1` — no data source, no computation, identical for
   * every store forever, and contradicted 200px away on the same page by the
   * AI narrative's own crude estimate of 2m 0s and 70.0%. They are not
   * approximated here; they are named as unmeasurable, with the reason, so the
   * UI can say so instead of inventing a figure.
   */
  unavailable: Array<{ metric: string; reason: string }>;
  trendsData: {
    searchTrends: TrendData[];
    visitorTrends: TrendData[];
  };
}

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
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let dateCondition: string;
    let dateParams: (string | number)[];
    
    if (startDate && endDate) {
      dateCondition = 'WHERE store_id = $1 AND created_at >= $2 AND created_at <= $3';
      dateParams = [user.storeId, startDate, endDate];
    } else {
      dateCondition = `WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'`;
      dateParams = [user.storeId];
    }

    // Check if tables exist
    const tablesExist = await db.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'search_tracking') as search_tracking_exists,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visitors') as visitors_exists
    `);

    const hasSearchTracking = tablesExist.rows[0].search_tracking_exists;
    const hasVisitorTracking = tablesExist.rows[0].visitors_exists;

      /*
       * There is no sample-data generator here any more.
       *
       * When a tracking table was absent this route used to synthesise a
       * sine wave plus `Math.random()` — 400±100 searches and 80±30 visitors a
       * day — and return it through the same field as real measurements, with
       * only a `meta.sampledData` flag distinguishing them. A merchant reading
       * the chart had no way to know which they were looking at. An absent
       * table now yields an empty series and the UI says the data is not
       * being collected.
       */
      let searchTrends: TrendData[] = [];
      let visitorTrends: TrendData[] = [];

    if (hasSearchTracking) {
      // Get real search trends
      const searchTrendsQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as search_count
        FROM search_tracking
        ${dateCondition}
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `;
      
      const searchTrendsResult = await db.query<{ date: Date; search_count: string }>(
        searchTrendsQuery,
        dateParams
      );
      searchTrends = searchTrendsResult.rows.map(row => ({
        date: row.date.toISOString(),
        search_count: Number(row.search_count) || 0
      }));
    }

    if (hasVisitorTracking) {
      // Get real visitor trends
      const visitorTrendsQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(DISTINCT ip_address) as visitor_count,
          COUNT(*) as page_views
        FROM visitors
        ${dateCondition}
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `;
      
      const visitorTrendsResult = await db.query<{
        date: Date;
        visitor_count: string;
        page_views: string;
      }>(visitorTrendsQuery, dateParams);
      visitorTrends = visitorTrendsResult.rows.map(row => ({
        date: row.date.toISOString(),
        visitor_count: Number(row.visitor_count) || 0,
        page_views: Number(row.page_views) || 0
      }));
    }

      // Calculate summary stats
      const totalSearches = searchTrends.reduce((sum, item) => sum + (item.search_count || 0), 0);
      const totalPageViews = visitorTrends.reduce((sum, item) => sum + (item.page_views || 0), 0);

      /*
       * Unique visitors, counted once across the whole window.
       *
       * Was `Math.floor(totalVisitors * 0.7)` — the daily distinct-IP counts
       * summed, then multiplied by an invented 70% de-duplication constant,
       * which is how the tile read 37 while the narrative on the same page
       * said 54. A DISTINCT over the window is the actual answer and needs no
       * constant.
       *
       * Verified: SELECT COUNT(DISTINCT ip_address) FROM visitors
       *   WHERE store_id = '650e8400-…0001'
       *     AND created_at >= NOW() - INTERVAL '30 days';   -> 55
       */
      let uniqueVisitors = 0;
      if (hasVisitorTracking) {
        const uniqueResult = await db.query<{ unique_visitors: string }>(
          `SELECT COUNT(DISTINCT ip_address) as unique_visitors FROM visitors ${dateCondition}`,
          dateParams
        );
        uniqueVisitors = Number(uniqueResult.rows[0]?.unique_visitors) || 0;
      }

      /*
       * Bounce rate and session duration are not computable from this schema
       * and are therefore not returned.
       *
       * `visitors` carries a UNIQUE (store_id, ip_address, visited_date)
       * constraint — one row per visitor per day, with a single `page_path`.
       * Pages-per-session is 1 for every row by construction, so a bounce rate
       * derived from it would be 100% for every store and would be measuring
       * the constraint rather than the visitors. There is no exit timestamp
       * anywhere, so session duration has no second event to subtract from.
       * `page_analytics`, which would carry both, has 0 rows.
       *
       * Reporting "not measured" is worth more to a merchant than reporting
       * 32.1%. The 32.1% told them their storefront was doing well.
       */
      const unavailable = [
        {
          metric: 'Bounce rate',
          reason:
            'Page views are recorded once per visitor per day, so pages-per-session is always 1. Measuring this needs per-pageview tracking.',
        },
        {
          metric: 'Average session duration',
          reason: 'No session end time is recorded, so there is nothing to measure a duration against.',
        },
      ];

      const result: TrendStats = {
        totalSearches,
        uniqueVisitors,
        totalPageViews,
        unavailable,
        trendsData: {
          searchTrends,
          visitorTrends
        }
      };

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        searchTrackingAvailable: hasSearchTracking,
        visitorTrackingAvailable: hasVisitorTracking,
        dateRange: `${days} days`,
        /* Always false now: this route no longer synthesises data. Kept so
           existing consumers do not break on a missing field. */
        sampledData: false
      }
    });

  } catch (error) {
    console.error('Analytics trends error:', error);
    
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