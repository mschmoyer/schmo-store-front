-- Create suppliers table for proper supplier management
-- Migration: 012_suppliers_table.sql

-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    
    -- Basic Information
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Address Information
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United States',
    
    -- Business Information
    tax_id VARCHAR(50),
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    notes TEXT,
    
    -- Status and Performance
    is_active BOOLEAN DEFAULT true,
    performance_rating DECIMAL(3,2) DEFAULT 0.00, -- 0.00 to 5.00
    total_orders INTEGER DEFAULT 0,
    on_time_delivery_rate DECIMAL(5,2) DEFAULT 0.00, -- Percentage
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON public.suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(store_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON public.suppliers(email);

-- Add unique constraint for supplier name per store (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_supplier_name_per_store'
    ) THEN
        ALTER TABLE public.suppliers ADD CONSTRAINT unique_supplier_name_per_store 
            UNIQUE(store_id, name);
    END IF;
END $$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trigger_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_suppliers_updated_at();

-- Add supplier_id reference to purchase_orders table (optional foreign key)
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Create index for the new supplier_id column
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders(supplier_id);

-- Insert some sample suppliers for existing stores (you can customize these)
-- This is optional - can be removed if you want to start with empty suppliers
INSERT INTO public.suppliers (store_id, name, contact_person, email, phone, address, payment_terms, is_active)
SELECT 
    s.id as store_id,
    'Default Supplier' as name,
    'Contact Person' as contact_person,
    'contact@defaultsupplier.com' as email,
    '(555) 000-0000' as phone,
    '123 Supplier St, Business City, ST 12345' as address,
    'Net 30' as payment_terms,
    true as is_active
FROM public.stores s
WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers sup WHERE sup.store_id = s.id
);

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('012', 'Suppliers table for purchase order management')
ON CONFLICT (version) DO NOTHING;