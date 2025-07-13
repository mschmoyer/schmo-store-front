-- Migration 016: Inventory Snapshots for Historical Tracking
-- Creates table to store daily inventory snapshots for reporting
-- Version: 1.0.0
-- Date: 2025-07-13

BEGIN;

-- Inventory Snapshots table for historical tracking
CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    
    -- Basic Inventory Metrics
    total_products INTEGER NOT NULL DEFAULT 0,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    total_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_cost_value DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- Based on cost price
    total_retail_value DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- Based on selling price
    
    -- Value Breakdowns (stored as JSONB for flexibility)
    value_by_category JSONB DEFAULT '{}',
    value_by_supplier JSONB DEFAULT '{}',
    value_by_warehouse JSONB DEFAULT '{}',
    quantity_by_category JSONB DEFAULT '{}',
    
    -- Stock Status Counts
    in_stock_count INTEGER DEFAULT 0,
    low_stock_count INTEGER DEFAULT 0,
    out_of_stock_count INTEGER DEFAULT 0,
    discontinued_count INTEGER DEFAULT 0,
    
    -- Dead Stock Metrics
    dead_stock_count INTEGER DEFAULT 0, -- Items with no sales in 90+ days
    dead_stock_value DECIMAL(12,2) DEFAULT 0.00,
    slow_moving_count INTEGER DEFAULT 0, -- Items with low sales velocity
    slow_moving_value DECIMAL(12,2) DEFAULT 0.00,
    
    -- Turnover Metrics
    avg_turnover_ratio DECIMAL(8,2),
    avg_days_to_sell DECIMAL(8,2),
    fast_moving_count INTEGER DEFAULT 0, -- High turnover items
    
    -- Top Products Snapshot (for quick access)
    top_products_by_value JSONB DEFAULT '[]', -- Array of {product_id, sku, name, value}
    top_products_by_quantity JSONB DEFAULT '[]',
    
    -- Metadata
    snapshot_type VARCHAR(50) DEFAULT 'daily', -- daily, weekly, monthly, manual
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES public.users(id),
    
    -- Ensure one snapshot per day per store
    UNIQUE(store_id, snapshot_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_store_date 
    ON public.inventory_snapshots(store_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_date 
    ON public.inventory_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_store_id 
    ON public.inventory_snapshots(store_id);

-- Function to create inventory snapshot
CREATE OR REPLACE FUNCTION create_inventory_snapshot(
    p_store_id UUID,
    p_snapshot_date DATE DEFAULT CURRENT_DATE,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
    v_total_products INTEGER;
    v_total_quantity INTEGER;
    v_total_cost_value DECIMAL(12,2);
    v_total_retail_value DECIMAL(12,2);
BEGIN
    -- Calculate basic metrics
    SELECT 
        COUNT(DISTINCT p.id),
        COALESCE(SUM(p.stock_quantity), 0),
        COALESCE(SUM(p.stock_quantity * p.cost_price), 0),
        COALESCE(SUM(p.stock_quantity * p.base_price), 0)
    INTO 
        v_total_products,
        v_total_quantity,
        v_total_cost_value,
        v_total_retail_value
    FROM products p
    WHERE p.store_id = p_store_id
        AND p.is_active = true;

    -- Insert or update snapshot
    INSERT INTO public.inventory_snapshots (
        store_id,
        snapshot_date,
        total_products,
        total_quantity,
        total_value,
        total_cost_value,
        total_retail_value,
        created_by
    ) VALUES (
        p_store_id,
        p_snapshot_date,
        v_total_products,
        v_total_quantity,
        v_total_cost_value,
        v_total_cost_value,
        v_total_retail_value,
        p_created_by
    )
    ON CONFLICT (store_id, snapshot_date) 
    DO UPDATE SET
        total_products = EXCLUDED.total_products,
        total_quantity = EXCLUDED.total_quantity,
        total_value = EXCLUDED.total_value,
        total_cost_value = EXCLUDED.total_cost_value,
        total_retail_value = EXCLUDED.total_retail_value,
        created_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_snapshot_id;

    -- Update value by category
    UPDATE inventory_snapshots
    SET value_by_category = (
        SELECT jsonb_object_agg(
            COALESCE(c.name, 'Uncategorized'),
            COALESCE(SUM(p.stock_quantity * p.cost_price), 0)
        )
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.store_id = p_store_id
            AND p.is_active = true
        GROUP BY c.name
    )
    WHERE id = v_snapshot_id;

    -- Update quantity by category
    UPDATE inventory_snapshots
    SET quantity_by_category = (
        SELECT jsonb_object_agg(
            COALESCE(c.name, 'Uncategorized'),
            COALESCE(SUM(p.stock_quantity), 0)
        )
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.store_id = p_store_id
            AND p.is_active = true
        GROUP BY c.name
    )
    WHERE id = v_snapshot_id;

    -- Update stock status counts
    UPDATE inventory_snapshots
    SET 
        in_stock_count = (
            SELECT COUNT(*) FROM products 
            WHERE store_id = p_store_id 
                AND is_active = true 
                AND stock_quantity > low_stock_threshold
        ),
        low_stock_count = (
            SELECT COUNT(*) FROM products 
            WHERE store_id = p_store_id 
                AND is_active = true 
                AND stock_quantity > 0 
                AND stock_quantity <= low_stock_threshold
        ),
        out_of_stock_count = (
            SELECT COUNT(*) FROM products 
            WHERE store_id = p_store_id 
                AND is_active = true 
                AND stock_quantity = 0
        ),
        discontinued_count = (
            SELECT COUNT(*) FROM products 
            WHERE store_id = p_store_id 
                AND is_active = false
        )
    WHERE id = v_snapshot_id;

    -- Update dead stock metrics (items with no sales in 90 days)
    UPDATE inventory_snapshots
    SET (dead_stock_count, dead_stock_value) = (
        SELECT 
            COUNT(*),
            COALESCE(SUM(p.stock_quantity * p.cost_price), 0)
        FROM products p
        WHERE p.store_id = p_store_id
            AND p.is_active = true
            AND p.stock_quantity > 0
            AND NOT EXISTS (
                SELECT 1 FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE oi.product_id = p.id
                    AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'
                    AND o.status IN ('completed', 'processing')
            )
    )
    WHERE id = v_snapshot_id;

    -- Update top products by value
    UPDATE inventory_snapshots
    SET top_products_by_value = (
        SELECT jsonb_agg(product_data)
        FROM (
            SELECT jsonb_build_object(
                'product_id', p.id,
                'sku', p.sku,
                'name', p.name,
                'value', p.stock_quantity * p.cost_price,
                'quantity', p.stock_quantity
            ) as product_data
            FROM products p
            WHERE p.store_id = p_store_id
                AND p.is_active = true
                AND p.stock_quantity > 0
            ORDER BY (p.stock_quantity * p.cost_price) DESC
            LIMIT 10
        ) top_products
    )
    WHERE id = v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to backfill historical snapshots from existing data
CREATE OR REPLACE FUNCTION backfill_inventory_snapshots(
    p_store_id UUID,
    p_start_date DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER AS $$
DECLARE
    v_current_date DATE;
    v_snapshots_created INTEGER := 0;
BEGIN
    v_current_date := p_start_date;
    
    WHILE v_current_date <= p_end_date LOOP
        -- Only create snapshot if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM inventory_snapshots 
            WHERE store_id = p_store_id AND snapshot_date = v_current_date
        ) THEN
            PERFORM create_inventory_snapshot(p_store_id, v_current_date);
            v_snapshots_created := v_snapshots_created + 1;
        END IF;
        
        v_current_date := v_current_date + INTERVAL '1 day';
    END LOOP;
    
    RETURN v_snapshots_created;
END;
$$ LANGUAGE plpgsql;

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('016', 'Inventory Snapshots - Historical tracking for inventory reporting')
ON CONFLICT (version) DO NOTHING;

COMMIT;