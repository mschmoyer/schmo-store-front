import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { format } from 'date-fns';

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

    // Get dead stock items - simplified version without order/inventory log data
    const deadStockQuery = `
      SELECT 
        p.id as product_id,
        p.sku,
        p.name,
        COALESCE(c.name, 'Uncategorized') as category,
        p.stock_quantity as current_stock,
        COALESCE(p.cost_price, p.base_price * 0.6) as unit_cost,
        p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6) as total_value,
        NULL as last_sale_date,     -- No order data available
        p.created_at as last_restock_date, -- Use creation date as fallback
        999999 as days_since_last_sale,    -- No sales data available
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400 as days_in_stock,
        -- Calculate carrying cost (prorated daily rate)
        (p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)) * (${ANNUAL_CARRYING_COST_RATE} / 365) * 
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400 as carrying_cost,
        -- Simplified risk score based on inventory age and value
        LEAST(100, 
          (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400) * 0.1 + -- Age factor
          (p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6) / 100) * 0.3 + -- Value factor
          (p.stock_quantity / 10) * 0.2 -- Quantity factor
        ) as risk_score,
        -- Suggested markdown percent (20% for old stock)
        CASE 
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400 > $2 THEN 20
          ELSE 0
        END as suggested_markdown_percent,
        -- Liquidation value (80% of cost)
        (p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)) * 0.8 as liquidation_value,
        -- Potential bundles (empty array as string)
        '[]' as potential_bundles
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1
        AND p.is_active = true
        AND p.stock_quantity > 0
        AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.created_at)) / 86400 >= $2
      ORDER BY risk_score DESC, total_value DESC
    `;

    const deadStockResult = await db.query(deadStockQuery, [user.storeId, minThreshold]);

    // Simplified bundle suggestions - just return empty for now
    const bundleResult = { rows: [] };

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