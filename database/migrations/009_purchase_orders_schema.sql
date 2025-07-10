-- Migration 009: Purchase Orders Schema
-- Creates comprehensive purchase order system for inventory management
-- Version: 1.0.0
-- Date: 2025-07-08

BEGIN;

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    
    -- Purchase Order Details
    po_number VARCHAR(50) NOT NULL, -- PO-001, PO-002, etc.
    supplier_name VARCHAR(255) NOT NULL,
    supplier_email VARCHAR(255),
    supplier_phone VARCHAR(20),
    supplier_address TEXT,
    
    -- Order Information
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    actual_delivery DATE,
    
    -- Status Tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, shipped, delivered, cancelled
    approval_date DATE,
    approved_by UUID REFERENCES public.users(id),
    
    -- Financial Information
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    shipping_amount DECIMAL(10,2) DEFAULT 0.00,
    total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    
    -- Additional Information
    notes TEXT,
    internal_notes TEXT, -- Private notes not shown on PO
    payment_terms VARCHAR(100), -- Net 30, Cash on Delivery, etc.
    shipping_method VARCHAR(100),
    
    -- PDF Generation and Tracking
    pdf_generated_at TIMESTAMP,
    pdf_url VARCHAR(500),
    pdf_version INTEGER DEFAULT 1,
    
    -- External Integration
    external_po_id VARCHAR(255), -- For integration with external systems
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES public.users(id),
    updated_by UUID REFERENCES public.users(id),
    
    -- Constraints
    UNIQUE(store_id, po_number),
    CHECK (status IN ('pending', 'approved', 'shipped', 'delivered', 'cancelled')),
    CHECK (total_cost >= 0),
    CHECK (subtotal >= 0),
    CHECK (expected_delivery IS NULL OR expected_delivery >= order_date),
    CHECK (actual_delivery IS NULL OR actual_delivery >= order_date)
);

-- Purchase Order Items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    
    -- Product Reference
    product_id UUID REFERENCES public.products(id), -- May be NULL for new products
    product_sku VARCHAR(255) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    product_description TEXT,
    
    -- Quantity and Pricing
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    
    -- Receiving Information
    quantity_received INTEGER DEFAULT 0,
    quantity_pending INTEGER GENERATED ALWAYS AS (quantity - quantity_received) STORED,
    
    -- Product Details (for new products not yet in system)
    product_category VARCHAR(255),
    product_weight DECIMAL(8,2),
    product_dimensions VARCHAR(100), -- "12x8x4 inches"
    
    -- Line Item Notes
    notes TEXT,
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (quantity > 0),
    CHECK (unit_cost >= 0),
    CHECK (total_cost >= 0),
    CHECK (quantity_received >= 0),
    CHECK (quantity_received <= quantity)
);

-- Purchase Order Status History table (for audit trail)
CREATE TABLE IF NOT EXISTS public.purchase_order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    
    -- Status Change Information
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    status_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- User and Notes
    changed_by UUID REFERENCES public.users(id),
    notes TEXT,
    
    -- Additional metadata
    metadata JSONB, -- For storing additional status-specific data
    
    -- Constraints
    CHECK (new_status IN ('pending', 'approved', 'shipped', 'delivered', 'cancelled'))
);

-- Purchase Order Receiving Records table (for tracking partial deliveries)
CREATE TABLE IF NOT EXISTS public.purchase_order_receiving (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    purchase_order_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
    
    -- Receiving Information
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity_received INTEGER NOT NULL,
    
    -- Quality Control
    quality_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    quality_notes TEXT,
    
    -- Receiving Details
    received_by UUID REFERENCES public.users(id),
    warehouse_location VARCHAR(100),
    
    -- Damage/Issues
    damaged_quantity INTEGER DEFAULT 0,
    damage_notes TEXT,
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (quantity_received > 0),
    CHECK (damaged_quantity >= 0),
    CHECK (damaged_quantity <= quantity_received),
    CHECK (quality_status IN ('pending', 'approved', 'rejected'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_id ON public.purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON public.purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery ON public.purchase_orders(expected_delivery);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders(store_id, po_number);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sku ON public.purchase_order_items(product_sku);

CREATE INDEX IF NOT EXISTS idx_po_status_history_po_id ON public.purchase_order_status_history(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_status_history_date ON public.purchase_order_status_history(status_date);

CREATE INDEX IF NOT EXISTS idx_po_receiving_po_id ON public.purchase_order_receiving(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_receiving_item_id ON public.purchase_order_receiving(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_po_receiving_date ON public.purchase_order_receiving(received_date);

-- Create function to automatically update purchase_order updated_at timestamp
CREATE OR REPLACE FUNCTION update_purchase_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER trigger_purchase_orders_updated_at
    BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_purchase_order_updated_at();

CREATE TRIGGER trigger_purchase_order_items_updated_at
    BEFORE UPDATE ON public.purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_purchase_order_updated_at();

-- Create function to automatically calculate purchase order totals
CREATE OR REPLACE FUNCTION calculate_purchase_order_total(po_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    total_amount DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM(total_cost), 0.00)
    INTO total_amount
    FROM public.purchase_order_items
    WHERE purchase_order_id = po_id;
    
    RETURN total_amount;
END;
$$ LANGUAGE plpgsql;

-- Create function to update purchase order status and create history record
CREATE OR REPLACE FUNCTION update_purchase_order_status(
    po_id UUID,
    new_status VARCHAR(50),
    user_id UUID DEFAULT NULL,
    status_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    old_status VARCHAR(50);
    update_success BOOLEAN := FALSE;
BEGIN
    -- Get current status
    SELECT status INTO old_status
    FROM public.purchase_orders
    WHERE id = po_id;
    
    IF old_status IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Update the purchase order status
    UPDATE public.purchase_orders
    SET 
        status = new_status,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = user_id,
        approval_date = CASE WHEN new_status = 'approved' THEN CURRENT_DATE ELSE approval_date END,
        approved_by = CASE WHEN new_status = 'approved' THEN user_id ELSE approved_by END,
        actual_delivery = CASE WHEN new_status = 'delivered' THEN CURRENT_DATE ELSE actual_delivery END
    WHERE id = po_id;
    
    GET DIAGNOSTICS update_success = FOUND;
    
    -- Create status history record
    IF update_success THEN
        INSERT INTO public.purchase_order_status_history (
            purchase_order_id,
            old_status,
            new_status,
            changed_by,
            notes
        ) VALUES (
            po_id,
            old_status,
            new_status,
            user_id,
            status_notes
        );
    END IF;
    
    RETURN update_success;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate next PO number for a store
CREATE OR REPLACE FUNCTION generate_po_number(store_id_param UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    next_number INTEGER;
    po_number VARCHAR(50);
BEGIN
    -- Get the next PO number for this store
    SELECT COALESCE(MAX(
        CASE 
            WHEN po_number ~ '^PO-[0-9]+$' THEN 
                CAST(SUBSTRING(po_number FROM 4) AS INTEGER)
            ELSE 0
        END
    ), 0) + 1
    INTO next_number
    FROM public.purchase_orders
    WHERE store_id = store_id_param;
    
    -- Format as PO-001, PO-002, etc.
    po_number := 'PO-' || LPAD(next_number::TEXT, 3, '0');
    
    RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- Create function to update inventory when purchase order is received
CREATE OR REPLACE FUNCTION update_inventory_on_po_receipt(
    po_item_id UUID,
    received_quantity INTEGER,
    warehouse_id_param VARCHAR(255) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    item_sku VARCHAR(255);
    store_id_param UUID;
    current_stock INTEGER;
    update_success BOOLEAN := FALSE;
BEGIN
    -- Get the SKU and store_id from the purchase order item
    SELECT poi.product_sku, po.store_id
    INTO item_sku, store_id_param
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON poi.purchase_order_id = po.id
    WHERE poi.id = po_item_id;
    
    IF item_sku IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Update inventory in the inventory table
    INSERT INTO public.inventory (
        store_id, 
        sku, 
        available, 
        on_hand, 
        allocated, 
        warehouse_id,
        warehouse_name
    ) VALUES (
        store_id_param,
        item_sku,
        received_quantity,
        received_quantity,
        0,
        warehouse_id_param,
        COALESCE(warehouse_id_param, 'MAIN')
    )
    ON CONFLICT (store_id, sku, warehouse_id)
    DO UPDATE SET
        available = inventory.available + received_quantity,
        on_hand = inventory.on_hand + received_quantity,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Update product stock_quantity if product exists
    UPDATE public.products
    SET stock_quantity = stock_quantity + received_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE store_id = store_id_param AND sku = item_sku;
    
    GET DIAGNOSTICS update_success = FOUND;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update subtotal when items change
CREATE OR REPLACE FUNCTION update_purchase_order_subtotal()
RETURNS TRIGGER AS $$
DECLARE
    po_id UUID;
    new_subtotal DECIMAL(10,2);
BEGIN
    -- Determine the purchase order ID
    IF TG_OP = 'DELETE' THEN
        po_id := OLD.purchase_order_id;
    ELSE
        po_id := NEW.purchase_order_id;
    END IF;
    
    -- Calculate new subtotal
    SELECT COALESCE(SUM(total_cost), 0.00)
    INTO new_subtotal
    FROM public.purchase_order_items
    WHERE purchase_order_id = po_id;
    
    -- Update the purchase order
    UPDATE public.purchase_orders
    SET 
        subtotal = new_subtotal,
        total_cost = new_subtotal + COALESCE(tax_amount, 0.00) + COALESCE(shipping_amount, 0.00),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = po_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic subtotal calculation
CREATE TRIGGER trigger_update_po_subtotal_on_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_purchase_order_subtotal();

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('009', 'Purchase Orders Schema - comprehensive purchase order system for inventory management')
ON CONFLICT (version) DO NOTHING;

COMMIT;