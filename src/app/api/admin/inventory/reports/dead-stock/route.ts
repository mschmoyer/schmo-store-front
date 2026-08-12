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

/** Row shape returned by the dead-stock products query. */
type DeadStockRow = {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  current_stock: number | null;
  unit_cost: string;
  total_value: string;
  last_sale_date: Date | null;
  last_restock_date: Date | null;
  days_since_last_sale: number;
  days_in_stock: string;
  carrying_cost: string;
  risk_score: string;
  suggested_markdown_percent: number;
  liquidation_value: string;
  potential_bundles: string;
};

/** Row shape of a bundle suggestion for a dead-stock product. */
interface BundleSuggestionRow {
  dead_stock_id: string;
  bundle_product_name: string;
  bundle_product_sku: string;
}

/** Row shape of the historical dead-stock snapshot series. */
type DeadStockTrendRow = {
  date: Date;
  dead_stock_count: number | null;
  dead_stock_value: string | null;
};

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

    /*
     * Threshold handling.
     *
     * Each flag used to read `!== 'false'`, so an unchecked box — which the UI
     * signals by omitting the parameter entirely — still counted as checked.
     * Every request therefore asked for 90 days no matter what the merchant
     * selected. The parameters are now read positively.
     *
     * A 60-day option is added and is the default. Ninety days is the right
     * threshold for a mature catalog, but a store that has been trading for
     * three months can never have a 90-day-dead SKU, so the hero report of the
     * product opened empty for exactly the merchants most likely to be looking
     * at it. Sixty days of no movement is already dead capital for a
     * 200-SKU store.
     */
    const { searchParams } = new URL(request.url);
    const customThreshold = searchParams.get('customThreshold');

    const thresholds: number[] = [];
    if (searchParams.get('threshold60') === 'true') thresholds.push(60);
    if (searchParams.get('threshold90') === 'true') thresholds.push(90);
    if (searchParams.get('threshold180') === 'true') thresholds.push(180);
    if (searchParams.get('threshold365') === 'true') thresholds.push(365);
    if (customThreshold && Number.isFinite(parseInt(customThreshold, 10))) {
      thresholds.push(parseInt(customThreshold, 10));
    }

    const maxThreshold = thresholds.length > 0 ? Math.max(...thresholds) : 60;
    const minThreshold = thresholds.length > 0 ? Math.min(...thresholds) : 60;

    /*
     * DEAD STOCK — MEASURED FROM THE LAST SALE, NOT FROM THE PRODUCT ROW.
     *
     * Every "no order data available" placeholder in this query was false:
     * there are 119 `order_items` rows. The consequences compounded —
     * `days_since_last_sale` was the literal `999999`, and the age filter
     * measured `CURRENT_TIMESTAMP - p.created_at`, i.e. how long ago the
     * *product record* was created. Every product in a seeded or freshly
     * imported store was created today, so `days_in_stock` was 0, the
     * `>= 90` filter matched nothing, and the report returned an empty set
     * forever. This is the report the marketing deck calls its hero
     * screenshot.
     *
     * Age is now days since the product last sold, falling back to how long it
     * has existed for a product that has never sold at all — which is the
     * definition a merchant means by "dead": nothing is pulling it through.
     *
     * Verified:
     *   SELECT p.sku, MAX(o.created_at)::date AS last_sale,
     *          CURRENT_DATE - MAX(o.created_at)::date AS days
     *     FROM products p
     *     LEFT JOIN order_items oi ON oi.product_id = p.id
     *     LEFT JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
     *    WHERE p.store_id = '650e8400-…0001' GROUP BY p.sku;
     */
    const deadStockQuery = `
      WITH last_sale AS (
        SELECT oi.product_id, MAX(o.created_at) AS last_sale_date
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.store_id = $1 AND o.status <> 'cancelled'
         GROUP BY oi.product_id
      ),
      last_restock AS (
        SELECT il.product_id, MAX(il.created_at) AS last_restock_date
          FROM inventory_logs il
         WHERE il.store_id = $1 AND il.change_type IN ('restock', 'initial_stock')
         GROUP BY il.product_id
      ),
      /*
       * When the store started trading. A product that has never sold is aged
       * from here rather than from products.created_at, because a catalog
       * imported wholesale from ShipStation carries today's date on every row
       * — which made a SKU that has sat unsold since the store opened look
       * brand new, and read 0 days dead.
       */
      trading_since AS (
        SELECT MIN(o.created_at) AS first_order_at
          FROM orders o
         WHERE o.store_id = $1
      ),
      aged AS (
        SELECT
          p.id                                   as product_id,
          p.sku,
          p.name,
          COALESCE(c.name, 'Uncategorized')      as category,
          p.stock_quantity                       as current_stock,
          COALESCE(p.cost_price, p.base_price * 0.6) as unit_cost,
          p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6) as total_value,
          ls.last_sale_date,
          COALESCE(lr.last_restock_date, p.created_at) as last_restock_date,
          -- Days since it last sold. A product that has never sold is aged
          -- from when the store started trading, then from its catalog date.
          FLOOR(EXTRACT(EPOCH FROM (
            CURRENT_TIMESTAMP - COALESCE(ls.last_sale_date, ts.first_order_at, p.created_at)
          )) / 86400)                            as days_since_last_sale,
          FLOOR(EXTRACT(EPOCH FROM (
            CURRENT_TIMESTAMP - COALESCE(lr.last_restock_date, p.created_at)
          )) / 86400)                            as days_in_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN last_sale ls ON ls.product_id = p.id
        LEFT JOIN last_restock lr ON lr.product_id = p.id
        CROSS JOIN trading_since ts
        WHERE p.store_id = $1
          AND p.is_active = true
          AND p.stock_quantity > 0
      )
      SELECT
        a.*,
        -- Carrying cost accrued over the dead period at the annual rate.
        a.total_value * (${ANNUAL_CARRYING_COST_RATE} / 365) * a.days_since_last_sale
                                                 as carrying_cost,
        LEAST(100,
          a.days_since_last_sale * 0.1 +         -- how long it has been still
          (a.total_value / 100) * 0.3 +          -- how much capital is trapped
          (a.current_stock / 10.0) * 0.2         -- how many units are trapped
        )                                        as risk_score,
        CASE
          WHEN a.days_since_last_sale >= 365 THEN 50
          WHEN a.days_since_last_sale >= 180 THEN 35
          WHEN a.days_since_last_sale >= $2 THEN 20
          ELSE 0
        END                                      as suggested_markdown_percent,
        a.total_value * 0.8                      as liquidation_value,
        '[]'                                     as potential_bundles
      FROM aged a
      WHERE a.days_since_last_sale >= $2
      ORDER BY risk_score DESC, total_value DESC
    `;

    const deadStockResult = await db.query<DeadStockRow>(deadStockQuery, [user.storeId, minThreshold]);

    // Simplified bundle suggestions - just return empty for now
    const bundleResult: { rows: BundleSuggestionRow[] } = { rows: [] };

    // Group bundle suggestions by dead stock item
    const bundlesByProduct = bundleResult.rows.reduce<Record<string, string[]>>((acc, row) => {
      if (!acc[row.dead_stock_id]) {
        acc[row.dead_stock_id] = [];
      }
      acc[row.dead_stock_id].push(`${row.bundle_product_name} (${row.bundle_product_sku})`);
      return acc;
    }, {});

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

    const trendResult = await db.query<DeadStockTrendRow>(trendQuery, [user.storeId]);

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