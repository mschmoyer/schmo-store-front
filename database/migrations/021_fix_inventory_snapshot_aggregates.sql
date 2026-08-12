-- 021_fix_inventory_snapshot_aggregates.sql
--
-- Fixes create_inventory_snapshot(), which has never successfully run.
--
-- Migration 016 defined the category rollups as:
--
--     jsonb_object_agg(COALESCE(c.name, 'Uncategorized'),
--                      COALESCE(SUM(p.stock_quantity * p.cost_price), 0))
--     ... GROUP BY c.name
--
-- SUM() inside jsonb_object_agg() is a nested aggregate, which Postgres rejects
-- outright: "aggregate function calls cannot be nested". The function therefore
-- raises on every invocation, which is why the inventory_snapshots table is empty
-- and the scheduled snapshot job reports per-store failures.
--
-- The fix aggregates in two stages: a subquery groups and sums, then
-- jsonb_object_agg runs over those already-grouped rows.
--
-- Two related defects fixed while replacing the function:
--
--   * jsonb_object_agg returns NULL when it aggregates over zero rows, so a store
--     with no active products wrote NULL into columns that declare
--     DEFAULT '{}'. Every read site then has to cope with NULL instead of an
--     empty object. Now coalesced to '{}'::jsonb.
--   * top_products_by_value had the same NULL-on-empty problem via jsonb_agg.
--   * The insert referenced p.price, which does not exist on products. Retail value
--     now uses the effective selling price: override_price -> sale_price -> base_price.
--   * cost_price is nullable, so stock_quantity * cost_price was NULL for any product
--     without a cost, silently dropping it from the valuation. Coalesced to 0.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION create_inventory_snapshot(
    p_store_id UUID,
    p_snapshot_date DATE DEFAULT CURRENT_DATE,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
BEGIN
    INSERT INTO inventory_snapshots (
        store_id,
        snapshot_date,
        total_products,
        total_quantity,
        total_value,
        total_cost_value,
        total_retail_value,
        created_by
    )
    SELECT
        p_store_id,
        p_snapshot_date,
        COUNT(*),
        COALESCE(SUM(p.stock_quantity), 0),
        COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0),
        COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0),
        COALESCE(SUM(p.stock_quantity * COALESCE(p.override_price, p.sale_price, p.base_price)), 0),
        p_created_by
    FROM products p
    WHERE p.store_id = p_store_id
      AND p.is_active = true
    ON CONFLICT (store_id, snapshot_date) DO UPDATE
    SET total_products     = EXCLUDED.total_products,
        total_quantity     = EXCLUDED.total_quantity,
        total_value        = EXCLUDED.total_value,
        total_cost_value   = EXCLUDED.total_cost_value,
        total_retail_value = EXCLUDED.total_retail_value,
        created_at         = CURRENT_TIMESTAMP
    RETURNING id INTO v_snapshot_id;

    -- Category rollups. Grouped in a subquery first so the outer
    -- jsonb_object_agg never wraps an aggregate call.
    UPDATE inventory_snapshots
    SET value_by_category = COALESCE((
            SELECT jsonb_object_agg(category_name, category_value)
            FROM (
                SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
                       COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0) AS category_value
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.store_id = p_store_id
                  AND p.is_active = true
                GROUP BY COALESCE(c.name, 'Uncategorized')
            ) grouped
        ), '{}'::jsonb),
        quantity_by_category = COALESCE((
            SELECT jsonb_object_agg(category_name, category_quantity)
            FROM (
                SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
                       COALESCE(SUM(p.stock_quantity), 0) AS category_quantity
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.store_id = p_store_id
                  AND p.is_active = true
                GROUP BY COALESCE(c.name, 'Uncategorized')
            ) grouped
        ), '{}'::jsonb)
    WHERE id = v_snapshot_id;

    UPDATE inventory_snapshots
    SET in_stock_count = (
            SELECT COUNT(*) FROM products
            WHERE store_id = p_store_id AND is_active = true
              AND stock_quantity > low_stock_threshold
        ),
        low_stock_count = (
            SELECT COUNT(*) FROM products
            WHERE store_id = p_store_id AND is_active = true
              AND stock_quantity > 0
              AND stock_quantity <= low_stock_threshold
        ),
        out_of_stock_count = (
            SELECT COUNT(*) FROM products
            WHERE store_id = p_store_id AND is_active = true
              AND stock_quantity = 0
        ),
        discontinued_count = (
            SELECT COUNT(*) FROM products
            WHERE store_id = p_store_id AND is_active = false
        )
    WHERE id = v_snapshot_id;

    -- Dead stock: on hand, but nothing sold in 90 days.
    UPDATE inventory_snapshots
    SET (dead_stock_count, dead_stock_value) = (
        SELECT COUNT(*),
               COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0)
        FROM products p
        WHERE p.store_id = p_store_id
          AND p.is_active = true
          AND p.stock_quantity > 0
          AND NOT EXISTS (
              SELECT 1
              FROM order_items oi
              JOIN orders o ON oi.order_id = o.id
              WHERE oi.product_id = p.id
                AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'
                AND o.status IN ('completed', 'processing')
          )
    )
    WHERE id = v_snapshot_id;

    UPDATE inventory_snapshots
    SET top_products_by_value = COALESCE((
        SELECT jsonb_agg(product_data)
        FROM (
            SELECT jsonb_build_object(
                       'product_id', p.id,
                       'sku',        p.sku,
                       'name',       p.name,
                       'value',      p.stock_quantity * COALESCE(p.cost_price, 0),
                       'quantity',   p.stock_quantity
                   ) AS product_data
            FROM products p
            WHERE p.store_id = p_store_id
              AND p.is_active = true
              AND p.stock_quantity > 0
            ORDER BY (p.stock_quantity * COALESCE(p.cost_price, 0)) DESC
            LIMIT 10
        ) top_products
    ), '[]'::jsonb)
    WHERE id = v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;
