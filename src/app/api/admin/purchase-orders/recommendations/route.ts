import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface RecommendationItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  reorder_point: number;
  forecast_demand: number;
  recommended_quantity: number;
  unit_cost: number;
  supplier: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  days_until_stockout: number;
  sales_velocity: {
    daily_velocity: number;
    weekly_velocity: number;
    monthly_velocity: number;
    velocity_trend: 'increasing' | 'stable' | 'decreasing';
  };
}

interface SalesVelocity {
  total_sales: number;
  total_orders: number;
  avg_order_quantity: number;
  last_sale_date: string | null;
  sales_last_7_days: number;
  sales_last_14_days: number;
  sales_last_30_days: number;
  sales_last_60_days: number;
  sales_last_90_days: number;
  sales_last_180_days: number;
  sales_last_365_days: number;
  avg_monthly_sales: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Get inventory data with sales velocity
    const inventoryQuery = `
      SELECT 
        p.id as product_id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.low_stock_threshold,
        p.cost_price as unit_cost,
        p.base_price,
        p.is_active,
        c.name as category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.name
    `;

    const inventoryResult = await query(inventoryQuery, [user.storeId]);
    const products = inventoryResult.rows;

    // Get sales data for forecasting
    const salesQuery = `
      SELECT 
        oi.product_id,
        oi.product_sku,
        SUM(oi.quantity) as total_sales,
        COUNT(DISTINCT oi.order_id) as total_orders,
        AVG(oi.quantity) as avg_order_quantity,
        MAX(oi.created_at) as last_sale_date,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '7 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_7_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '14 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_14_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_30_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '60 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_60_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_90_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '180 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_180_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '365 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_365_days,
        AVG(CASE WHEN oi.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity END) as avg_monthly_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.store_id = $1 AND o.status IN ('completed', 'processing')
      GROUP BY oi.product_id, oi.product_sku
    `;

    const salesResult = await query(salesQuery, [user.storeId]);
    const salesData = salesResult.rows.reduce((acc, row) => {
      acc[row.product_id] = row;
      return acc;
    }, {} as Record<string, SalesVelocity>);

    // Get suppliers
    const suppliersQuery = `
      SELECT id, name, is_active
      FROM suppliers
      WHERE store_id = $1 AND is_active = true
      ORDER BY name
    `;

    const suppliersResult = await query(suppliersQuery, [user.storeId]);
    const suppliers = suppliersResult.rows;

    // Generate recommendations
    const recommendations: RecommendationItem[] = [];

    for (const product of products) {
      const sales = salesData[product.product_id] || {
        total_sales: 0,
        total_orders: 0,
        avg_order_quantity: 0,
        last_sale_date: null,
        sales_last_7_days: 0,
        sales_last_14_days: 0,
        sales_last_30_days: 0,
        sales_last_60_days: 0,
        sales_last_90_days: 0,
        sales_last_180_days: 0,
        sales_last_365_days: 0,
        avg_monthly_sales: 0
      };

      const stockQuantity = Number(product.stock_quantity) || 0;
      const lowStockThreshold = Number(product.low_stock_threshold) || 10;
      const unitCost = Number(product.unit_cost) || 0;

      // Calculate sales velocity and forecasting
      const salesLast7Days = Number(sales.sales_last_7_days) || 0;
      const salesLast30Days = Number(sales.sales_last_30_days) || 0;
      const salesLast90Days = Number(sales.sales_last_90_days) || 0;
      const avgMonthlySales = Number(sales.avg_monthly_sales) || 0;
      
      // Calculate different velocity metrics
      const dailyVelocity = salesLast30Days > 0 ? salesLast30Days / 30 : avgMonthlySales / 30;
      const weeklyVelocity = salesLast7Days > 0 ? salesLast7Days : (salesLast30Days / 30) * 7;
      const monthlyVelocity = salesLast30Days > 0 ? salesLast30Days : avgMonthlySales;
      
      // Determine velocity trend
      let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (salesLast30Days > avgMonthlySales * 1.2) {
        velocityTrend = 'increasing';
      } else if (salesLast30Days < avgMonthlySales * 0.8 && avgMonthlySales > 0) {
        velocityTrend = 'decreasing';
      }

      // Calculate forecasts
      const forecast30Days = Math.max(salesLast30Days, avgMonthlySales);
      const forecast90Days = Math.max(salesLast90Days, avgMonthlySales * 3);

      // Calculate reorder point (30 days of sales + buffer)
      const reorderPoint = Math.max(forecast30Days + 5, lowStockThreshold);
      const reorderQuantity = Math.max(forecast90Days, 20);

      // Calculate days until stockout
      const daysUntilStockout = dailyVelocity > 0 ? Math.floor(stockQuantity / dailyVelocity) : 999;

      // Determine if recommendation is needed
      let needsRecommendation = false;
      let priority: 'urgent' | 'high' | 'medium' | 'low' = 'low';
      let reason = '';
      let confidence: 'high' | 'medium' | 'low' = 'low';

      if (stockQuantity === 0) {
        needsRecommendation = true;
        priority = 'urgent';
        reason = 'Out of stock';
        confidence = 'high';
      } else if (stockQuantity <= lowStockThreshold) {
        needsRecommendation = true;
        priority = 'high';
        reason = 'Below low stock threshold';
        confidence = sales.total_sales > 5 ? 'high' : 'medium';
      } else if (stockQuantity <= reorderPoint) {
        needsRecommendation = true;
        priority = 'high';
        reason = 'Below reorder point';
        confidence = sales.total_sales > 3 ? 'high' : 'medium';
      } else if (forecast30Days > stockQuantity) {
        needsRecommendation = true;
        priority = 'medium';
        reason = 'Forecast demand exceeds current stock';
        confidence = sales.total_sales > 2 ? 'medium' : 'low';
      } else if (daysUntilStockout < 30 && dailyVelocity > 0) {
        needsRecommendation = true;
        priority = 'medium';
        reason = 'Will run out of stock within 30 days';
        confidence = sales.total_sales > 2 ? 'medium' : 'low';
      }

      // Add seasonal adjustment
      if (needsRecommendation) {
        const recentTrend = salesLast30Days > avgMonthlySales * 1.2;
        if (recentTrend) {
          reason += ', increasing sales trend';
          if (priority === 'medium') priority = 'high';
        }
      }

      if (needsRecommendation) {
        // Assign a supplier (random for now, could be based on product category or history)
        const supplier = suppliers.length > 0 
          ? suppliers[Math.floor(Math.random() * suppliers.length)].name
          : 'Default Supplier';

        recommendations.push({
          product_id: product.product_id,
          product_name: product.name,
          product_sku: product.sku,
          current_stock: stockQuantity,
          reorder_point: reorderPoint,
          forecast_demand: forecast30Days,
          recommended_quantity: reorderQuantity,
          unit_cost: unitCost,
          supplier: supplier,
          confidence: confidence,
          reason: reason,
          priority: priority,
          days_until_stockout: Math.max(0, daysUntilStockout),
          sales_velocity: {
            daily_velocity: Math.round(dailyVelocity * 100) / 100,
            weekly_velocity: Math.round(weeklyVelocity * 100) / 100,
            monthly_velocity: Math.round(monthlyVelocity * 100) / 100,
            velocity_trend: velocityTrend
          }
        });
      }
    }

    // Sort by priority (urgent first, then high, medium, low)
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.days_until_stockout - b.days_until_stockout;
    });

    // Apply limit
    const filteredRecommendations = recommendations.slice(0, limit);

    // Calculate summary statistics
    const urgentCount = recommendations.filter(r => r.priority === 'urgent').length;
    const highCount = recommendations.filter(r => r.priority === 'high').length;
    const estimatedCost = filteredRecommendations.reduce((sum, r) => sum + (r.recommended_quantity * r.unit_cost), 0);

    return NextResponse.json({
      success: true,
      data: {
        recommendations: filteredRecommendations,
        summary: {
          total_recommendations: recommendations.length,
          urgent_items: urgentCount,
          high_priority_items: highCount,
          estimated_cost: estimatedCost
        }
      }
    });

  } catch (error) {
    console.error('Error in recommendations API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}