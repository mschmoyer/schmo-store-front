-- Migration 004: Add inventory table and update integrations schema
-- Date: 2025-07-04

BEGIN;

-- Create inventory table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    available INTEGER DEFAULT 0,
    on_hand INTEGER DEFAULT 0,
    allocated INTEGER DEFAULT 0,
    warehouse_id VARCHAR(255),
    warehouse_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, sku, warehouse_id)
);

-- Update store_integrations table to add auto_sync_interval if it doesn't exist
ALTER TABLE public.store_integrations 
ADD COLUMN IF NOT EXISTS auto_sync_interval VARCHAR(20) DEFAULT '1hour';

-- Update the sync_frequency column to match our new naming
-- Note: We'll keep both for compatibility during transition
UPDATE public.store_integrations 
SET auto_sync_interval = 
    CASE sync_frequency
        WHEN 'daily' THEN '1day'
        WHEN '1hour' THEN '1hour'
        WHEN '10min' THEN '10min'
        ELSE '1hour'
    END
WHERE auto_sync_interval IS NULL OR auto_sync_interval = '1hour';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_store_sku ON public.inventory(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON public.inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_store_integrations_type ON public.store_integrations(store_id, integration_type);

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('004', 'Add inventory table and update store_integrations schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;