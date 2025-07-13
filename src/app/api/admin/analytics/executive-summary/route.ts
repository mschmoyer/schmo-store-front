import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { analyzeStorePerformance } from '@/lib/ai/business-advisor';
import type { BusinessMetrics, BusinessAnalysis } from '@/lib/ai/business-advisor';

// Simple in-memory cache with 1-hour TTL
interface CacheEntry {
  data: ExecutiveSummaryData;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

function getCacheKey(storeId: string, days: number, startDate?: string, endDate?: string): string {
  return `${storeId}-${days}-${startDate || ''}-${endDate || ''}`;
}

function getCachedData(cacheKey: string): ExecutiveSummaryData | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    cache.delete(cacheKey);
    return null;
  }
  
  console.log('📦 Using cached executive summary data');
  return entry.data;
}

function setCachedData(cacheKey: string, data: ExecutiveSummaryData): void {
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl: CACHE_TTL
  });
  console.log('💾 Cached executive summary data for 1 hour');
}

interface ExecutiveSummaryData {
  period: string;
  totalSearches: number;
  uniqueVisitors: number;
  searchTrend: number;
  visitorTrend: number;
  topSearchTerm: string;
  topSearchCount: number;
  bounceRate: number;
  avgSessionDuration: number;
  keyInsights: string[];
  alerts: string[];
  recommendations: string[];
  overallScore: number;
  focusAreas: string[];
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
    
    // Check cache first
    const cacheKey = getCacheKey(user.storeId, days, startDate || undefined, endDate || undefined);
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: cachedData,
        meta: {
          searchTrackingAvailable: true,
          visitorTrackingAvailable: true,
          generatedAt: new Date().toISOString(),
          cached: true,
          cacheKey
        }
      });
    }
    
    // Set up date conditions
    let dateCondition: string;
    let dateParams: (string | number)[];
    
    if (startDate && endDate) {
      dateCondition = 'WHERE store_id = $1 AND created_at >= $2 AND created_at <= $3';
      dateParams = [user.storeId, startDate, endDate];
    } else {
      dateCondition = `WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'`;
      dateParams = [user.storeId];
    }

    // Comparison period for trends
    const comparisonDateCondition = `WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '${days * 2} days' AND created_at < NOW() - INTERVAL '${days} days'`;
    
    // Check if tables exist
    const tablesExist = await db.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'search_tracking') as search_tracking_exists,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visitors') as visitors_exists
    `);

    const hasSearchTracking = tablesExist.rows[0].search_tracking_exists;
    const hasVisitorTracking = tablesExist.rows[0].visitors_exists;

    // Generate executive summary with real data
    const generateExecutiveSummary = async (): Promise<ExecutiveSummaryData> => {
        // Get real search data
        let totalSearches = 0;
        let searchTrend = 0;
        let topSearchTerm = 'No searches yet';
        let topSearchCount = 0;

        if (hasSearchTracking) {
          try {
            // Current period searches
            const currentSearches = await db.query(`
              SELECT COUNT(*) as total
              FROM search_tracking
              ${dateCondition}
            `, dateParams);
            totalSearches = parseInt(currentSearches.rows[0]?.total || '0');

            // Previous period searches for trend calculation
            const previousSearches = await db.query(`
              SELECT COUNT(*) as total
              FROM search_tracking
              ${comparisonDateCondition}
            `, [user.storeId]);
            const previousTotal = parseInt(previousSearches.rows[0]?.total || '0');
            
            if (previousTotal > 0) {
              searchTrend = ((totalSearches - previousTotal) / previousTotal) * 100;
            }

            // Get top search term
            const topSearchResult = await db.query(`
              SELECT search_query, COUNT(*) as search_count
              FROM search_tracking
              ${dateCondition}
              GROUP BY search_query
              ORDER BY search_count DESC
              LIMIT 1
            `, dateParams);
            
            if (topSearchResult.rows.length > 0) {
              topSearchTerm = topSearchResult.rows[0].search_query;
              topSearchCount = parseInt(topSearchResult.rows[0].search_count);
            }
          } catch (error) {
            console.error('Error querying search data:', error);
            // Fall back to showing no data message
            totalSearches = 0;
            searchTrend = 0;
            topSearchTerm = 'No search data available';
            topSearchCount = 0;
          }
        }

        // Get real visitor data
        let uniqueVisitors = 0;
        let visitorTrend = 0;
        let avgSessionDuration = 180; // 3 minutes default
        let bounceRate = 45.0; // Default bounce rate

        if (hasVisitorTracking) {
          try {
            // Current period visitors
            const currentVisitors = await db.query(`
              SELECT COUNT(DISTINCT ip_address) as total
              FROM visitors
              ${dateCondition}
            `, dateParams);
            uniqueVisitors = parseInt(currentVisitors.rows[0]?.total || '0');

            // Previous period visitors for trend calculation
            const previousVisitors = await db.query(`
              SELECT COUNT(DISTINCT ip_address) as total
              FROM visitors
              ${comparisonDateCondition}
            `, [user.storeId]);
            const previousTotal = parseInt(previousVisitors.rows[0]?.total || '0');
            
            if (previousTotal > 0) {
              visitorTrend = ((uniqueVisitors - previousTotal) / previousTotal) * 100;
            }

            // Calculate simple bounce rate based on single page visits
            const bounceRateQuery = await db.query(`
              SELECT 
                COUNT(DISTINCT ip_address) as total_sessions,
                COUNT(*) as total_page_views
              FROM visitors
              ${dateCondition}
            `, dateParams);
            
            if (bounceRateQuery.rows.length > 0) {
              const stats = bounceRateQuery.rows[0];
              const totalSessions = parseInt(stats.total_sessions || '1');
              const totalPageViews = parseInt(stats.total_page_views || '0');
              
              // Simple bounce rate estimation: if page views per session is close to 1, higher bounce rate
              const avgPagesPerSession = totalPageViews / totalSessions;
              bounceRate = avgPagesPerSession <= 1.5 ? 70 : avgPagesPerSession <= 2.5 ? 45 : 25;
              
              // Simple session duration estimation based on activity
              avgSessionDuration = Math.max(120, Math.min(300, avgPagesPerSession * 45));
            }
          } catch (error) {
            console.error('Error querying visitor data:', error);
            // Fall back to showing no data message
            uniqueVisitors = 0;
            visitorTrend = 0;
            avgSessionDuration = 0;
            bounceRate = 0;
          }
        }

        // Get zero results count for analysis
        let zeroResultsCount = 0;
        if (hasSearchTracking && totalSearches > 0) {
          try {
            const zeroResultsQuery = await db.query(`
              SELECT COUNT(*) as zero_results
              FROM search_tracking
              ${dateCondition}
              AND results_count = 0
            `, dateParams);
            zeroResultsCount = parseInt(zeroResultsQuery.rows[0]?.zero_results || '0');
          } catch (error) {
            console.error('Error querying zero results:', error);
          }
        }

        // Prepare business metrics for AI analysis
        const businessMetrics: BusinessMetrics = {
          totalSearches,
          uniqueVisitors,
          searchTrend,
          visitorTrend,
          topSearchTerm,
          topSearchCount,
          bounceRate,
          avgSessionDuration,
          period: startDate && endDate ? `${startDate} to ${endDate}` : `last ${days} days`,
          zeroResultsCount,
          hasSearchTracking,
          hasVisitorTracking
        };

        // Generate AI-powered business insights with fallback handling
        console.log('🤖 AI Business Advisor - Input Metrics:', JSON.stringify(businessMetrics, null, 2));
        
        let businessAnalysis: BusinessAnalysis;
        try {
          businessAnalysis = analyzeStorePerformance(businessMetrics);
          console.log('🤖 AI Business Advisor - Generated Analysis:', JSON.stringify(businessAnalysis, null, 2));
        } catch (error) {
          console.error('Error generating business insights:', error);
          // Fallback to basic insights if AI analysis fails
          businessAnalysis = {
            keyInsights: [],
            alerts: totalSearches === 0 && uniqueVisitors === 0 ? [
              {
                type: 'alert',
                category: 'growth',
                priority: 'high',
                title: 'No Data Available',
                description: 'Your store analytics are ready to start tracking customer behavior and performance metrics.'
              }
            ] : [],
            recommendations: [
              {
                type: 'recommendation',
                category: 'strategy',
                priority: 'high',
                title: 'Get Started',
                description: 'Focus on driving traffic and implementing analytics to gain business insights.'
              }
            ],
            overallScore: 50,
            focusAreas: ['Setup', 'Growth']
          };
        }

        // Convert insights to simple arrays for frontend compatibility
        const keyInsights = businessAnalysis.keyInsights.map(insight => 
          insight.actionItems && insight.actionItems.length > 0 
            ? `${insight.description} ${insight.actionItems.join(' ')}`
            : insight.description
        );
        
        const alerts = businessAnalysis.alerts.map(alert => 
          alert.actionItems && alert.actionItems.length > 0 
            ? `${alert.description} ${alert.actionItems.join(' ')}`
            : alert.description
        );
        
        const recommendations = businessAnalysis.recommendations.map(rec => 
          rec.actionItems && rec.actionItems.length > 0 
            ? `${rec.description} ${rec.actionItems.join(' ')}`
            : rec.description
        );

        return {
          period: businessMetrics.period,
          totalSearches,
          uniqueVisitors,
          searchTrend,
          visitorTrend,
          topSearchTerm,
          topSearchCount,
          bounceRate,
          avgSessionDuration,
          keyInsights,
          alerts,
          recommendations,
          overallScore: businessAnalysis.overallScore,
          focusAreas: businessAnalysis.focusAreas
        };
      };

      const executiveSummary = await generateExecutiveSummary();

      // Cache the generated data
      setCachedData(cacheKey, executiveSummary);

    return NextResponse.json({
      success: true,
      data: executiveSummary,
      meta: {
        searchTrackingAvailable: hasSearchTracking,
        visitorTrackingAvailable: hasVisitorTracking,
        generatedAt: new Date().toISOString(),
        sampledData: !hasSearchTracking || !hasVisitorTracking,
        cached: false,
        cacheKey
      }
    });

  } catch (error) {
    console.error('Executive summary error:', error);
    
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