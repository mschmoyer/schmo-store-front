import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

interface DeadStockItem {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  current_stock: number;
  unit_cost: number;
  total_value: number;
  last_sale_date: string | null;
  last_restock_date: string | null;
  days_since_last_sale: number;
  days_in_stock: number;
  carrying_cost: number;
  risk_score: number;
  suggested_markdown_percent: number;
  liquidation_value: number;
  potential_bundles: string[];
}

interface DeadStockStats {
  total_dead_stock_items: number;
  total_dead_stock_value: number;
  total_carrying_cost: number;
  average_days_dead: number;
  highest_risk_items: number;
  total_liquidation_value: number;
  potential_recovery_value: number;
}

interface DeadStockTrend {
  date: string;
  dead_stock_count: number;
  dead_stock_value: number;
}

// Default carrying cost rate (annual percentage)
const ANNUAL_CARRYING_COST_RATE = 0.25; // 25% per year

/**
 * GET /api/admin/inventory/reports/dead-stock
 * Analyze dead stock with configurable thresholds and recommendations
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
    const threshold90Days = searchParams.get('threshold90') !== 'false';
    const threshold180Days = searchParams.get('threshold180') !== 'false';
    const threshold365Days = searchParams.get('threshold365') !== 'false';
    const customThreshold = searchParams.get('customThreshold');
    
    // Build threshold conditions
    const thresholds: number[] = [];
    if (threshold90Days) thresholds.push(90);
    if (threshold180Days) thresholds.push(180);
    if (threshold365Days) thresholds.push(365);
    if (customThreshold) thresholds.push(parseInt(customThreshold));

    // Default to 90 days if no threshold specified
    const maxThreshold = thresholds.length > 0 ? Math.max(...thresholds) : 90;
    const minThreshold = thresholds.length > 0 ? Math.min(...thresholds) : 90;

    // Get dead stock items
    const deadStockQuery = `
      WITH last_sales AS (
        SELECT 
          oi.product_id,
          MAX(o.created_at) as last_sale_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.store_id = $1 
          AND o.status IN ('completed', 'shipped', 'processing')
        GROUP BY oi.product_id
      ),
      last_restocks AS (
        SELECT 
          product_id,
          MAX(created_at) as last_restock_date
        FROM inventory_logs
        WHERE store_id = $1 
          AND change_type = 'restock'
          AND quantity_change > 0
        GROUP BY product_id
      ),
      dead_stock_analysis AS (
        SELECT 
          p.id as product_id,
          p.sku,
          p.name,
          COALESCE(c.name, 'Uncategorized') as category,
          p.stock_quantity as current_stock,
          COALESCE(p.cost_price, p.base_price * 0.6) as unit_cost,
          p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6) as total_value,
          ls.last_sale_date,
          lr.last_restock_date,
          CASE 
            WHEN ls.last_sale_date IS NULL THEN 999999
            ELSE EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ls.last_sale_date)) / 86400
          END as days_since_last_sale,
          CASE 
            WHEN lr.last_restock_date IS NULL THEN 
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400
            ELSE 
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - lr.last_restock_date)) / 86400
          END as days_in_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN last_sales ls ON p.id = ls.product_id
        LEFT JOIN last_restocks lr ON p.id = lr.product_id
        WHERE p.store_id = $1
          AND p.is_active = true
          AND p.stock_quantity > 0
          AND (
            ls.last_sale_date IS NULL 
            OR ls.last_sale_date < CURRENT_TIMESTAMP - INTERVAL '${minThreshold} days'
          )
      )
      SELECT 
        *,
        -- Calculate carrying cost (prorated daily rate)
        total_value * (${ANNUAL_CARRYING_COST_RATE} / 365) * days_in_stock as carrying_cost,
        -- Calculate risk score (0-100)
        LEAST(100, 
          (days_since_last_sale / 3.65) * 0.4 + -- 40% weight on age
          (total_value / 1000) * 0.3 + -- 30% weight on value
          (current_stock / 100) * 0.2 + -- 20% weight on quantity
          (days_in_stock / 3.65) * 0.1 -- 10% weight on stock age
        ) as risk_score
      FROM dead_stock_analysis
      WHERE days_since_last_sale >= $2
      ORDER BY risk_score DESC, total_value DESC
    `;

    const deadStockResult = await db.query(deadStockQuery, [user.storeId, minThreshold]);

    // Get similar products for bundle suggestions
    const bundleSuggestionsQuery = `
      WITH dead_stock_ids AS (
        SELECT DISTINCT product_id FROM (${deadStockQuery}) ds
      )
      SELECT 
        ds.product_id as dead_stock_id,
        p.id as bundle_product_id,
        p.name as bundle_product_name,
        p.sku as bundle_product_sku
      FROM dead_stock_ids ds
      CROSS JOIN LATERAL (
        SELECT p2.* 
        FROM products p2
        WHERE p2.store_id = $1
          AND p2.id != ds.product_id
          AND p2.category_id = (SELECT category_id FROM products WHERE id = ds.product_id)
          AND p2.stock_quantity > 0
          AND p2.id NOT IN (SELECT product_id FROM dead_stock_ids)
        ORDER BY p2.base_price DESC
        LIMIT 3
      ) p
    `;

    const bundleResult = await db.query(bundleSuggestionsQuery, [user.storeId, minThreshold]);

    // Group bundle suggestions by dead stock item
    const bundlesByProduct = bundleResult.rows.reduce((acc, row) => {
      if (!acc[row.dead_stock_id]) {
        acc[row.dead_stock_id] = [];
      }
      acc[row.dead_stock_id].push(`${row.bundle_product_name} (${row.bundle_product_sku})`);
      return acc;
    }, {} as Record<string, string[]>);

    // Process dead stock items with recommendations
    const deadStockItems: DeadStockItem[] = deadStockResult.rows.map(row => {
      const daysSinceLastSale = Number(row.days_since_last_sale) || 999999;
      const daysInStock = Number(row.days_in_stock) || 0;
      const riskScore = Number(row.risk_score) || 0;
      const totalValue = Number(row.total_value) || 0;

      // Calculate suggested markdown based on age and risk
      let suggestedMarkdown = 0;
      if (daysSinceLastSale >= 365) {
        suggestedMarkdown = 50 + (riskScore / 10); // 50-60% off
      } else if (daysSinceLastSale >= 180) {
        suggestedMarkdown = 30 + (riskScore / 20); // 30-35% off
      } else if (daysSinceLastSale >= 90) {
        suggestedMarkdown = 15 + (riskScore / 40); // 15-17.5% off
      }

      // Calculate liquidation value (deeper discount)
      const liquidationDiscount = Math.min(75, suggestedMarkdown * 1.5);
      const liquidationValue = totalValue * (1 - liquidationDiscount / 100);

      return {
        product_id: row.product_id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        current_stock: Number(row.current_stock) || 0,
        unit_cost: Number(row.unit_cost) || 0,
        total_value: totalValue,
        last_sale_date: row.last_sale_date ? format(new Date(row.last_sale_date), 'yyyy-MM-dd') : null,
        last_restock_date: row.last_restock_date ? format(new Date(row.last_restock_date), 'yyyy-MM-dd') : null,
        days_since_last_sale: Math.round(daysSinceLastSale),
        days_in_stock: Math.round(daysInStock),
        carrying_cost: Number(row.carrying_cost) || 0,
        risk_score: Math.round(riskScore),
        suggested_markdown_percent: Math.round(suggestedMarkdown),
        liquidation_value: liquidationValue,
        potential_bundles: bundlesByProduct[row.product_id] || []
      };
    });

    // Get historical dead stock trends
    const trendQuery = `
      SELECT 
        snapshot_date as date,
        dead_stock_count,
        dead_stock_value
      FROM inventory_snapshots
      WHERE store_id = $1
        AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY snapshot_date ASC
    `;

    const trendResult = await db.query(trendQuery, [user.storeId]);

    const trends: DeadStockTrend[] = trendResult.rows.map(row => ({
      date: format(new Date(row.date), 'yyyy-MM-dd'),
      dead_stock_count: Number(row.dead_stock_count) || 0,
      dead_stock_value: Number(row.dead_stock_value) || 0
    }));

    // Calculate summary statistics
    const stats: DeadStockStats = {
      total_dead_stock_items: deadStockItems.length,
      total_dead_stock_value: deadStockItems.reduce((sum, item) => sum + item.total_value, 0),
      total_carrying_cost: deadStockItems.reduce((sum, item) => sum + item.carrying_cost, 0),
      average_days_dead: deadStockItems.length > 0 
        ? deadStockItems.reduce((sum, item) => sum + item.days_since_last_sale, 0) / deadStockItems.length
        : 0,
      highest_risk_items: deadStockItems.filter(item => item.risk_score >= 75).length,
      total_liquidation_value: deadStockItems.reduce((sum, item) => sum + item.liquidation_value, 0),
      potential_recovery_value: deadStockItems.reduce((sum, item) => {
        // Calculate potential recovery with suggested markdown
        return sum + (item.total_value * (1 - item.suggested_markdown_percent / 100));
      }, 0)
    };

    // Generate actionable recommendations
    const recommendations = generateRecommendations(deadStockItems, stats);

    return NextResponse.json({
      success: true,
      data: {
        items: deadStockItems,
        stats: stats,
        trends: trends,
        recommendations: recommendations,
        thresholds: {
          min_days: minThreshold,
          max_days: maxThreshold,
          active_thresholds: thresholds
        }
      }
    });

  } catch (error) {
    console.error('Dead stock analysis error:', error);
    
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

/**
 * Generate actionable recommendations based on dead stock analysis
 */
function generateRecommendations(items: DeadStockItem[], stats: DeadStockStats) {
  const recommendations = [];

  // High-risk items recommendation
  const highRiskItems = items.filter(item => item.risk_score >= 75);
  if (highRiskItems.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Immediate Action Required',
      description: `${highRiskItems.length} items have critical risk scores. Consider aggressive markdowns or liquidation.`,
      items: highRiskItems.slice(0, 5).map(item => ({
        sku: item.sku,
        name: item.name,
        action: `Apply ${item.suggested_markdown_percent}% discount immediately`
      }))
    });
  }

  // Bundle opportunity recommendation
  const bundleOpportunities = items.filter(item => item.potential_bundles.length > 0);
  if (bundleOpportunities.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Bundle Opportunities',
      description: `${bundleOpportunities.length} dead stock items can be bundled with active products.`,
      items: bundleOpportunities.slice(0, 5).map(item => ({
        sku: item.sku,
        name: item.name,
        action: `Bundle with: ${item.potential_bundles[0]}`
      }))
    });
  }

  // Seasonal items recommendation
  const oldestItems = items.filter(item => item.days_since_last_sale > 365);
  if (oldestItems.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Obsolete Inventory',
      description: `${oldestItems.length} items haven't sold in over a year. Consider liquidation or donation.`,
      items: oldestItems.slice(0, 5).map(item => ({
        sku: item.sku,
        name: item.name,
        action: 'Liquidate at 75% discount or donate for tax benefit'
      }))
    });
  }

  // Carrying cost reduction
  if (stats.total_carrying_cost > stats.total_dead_stock_value * 0.1) {
    recommendations.push({
      priority: 'medium',
      title: 'Reduce Carrying Costs',
      description: `Carrying costs (${formatCurrency(stats.total_carrying_cost)}) are significant. Quick action can save money.`,
      action: 'Implement tiered markdown strategy: 90-180 days (25% off), 180+ days (50% off)'
    });
  }

  return recommendations;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}