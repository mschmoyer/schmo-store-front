-- Migration 014: Rename shipstation_warehouses to shipfroms and add is_default
-- Description: Rename table to better reflect v2/warehouses API and add default tracking
-- Created: 2025-07-10

BEGIN;

-- Rename the table to better reflect its purpose (ShipFrom addresses)
ALTER TABLE shipstation_warehouses RENAME TO shipfroms;

-- Add is_default column if it doesn't exist
ALTER TABLE shipfroms ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Update indexes to match new table name
DROP INDEX IF EXISTS idx_shipstation_warehouses_store_id;
DROP INDEX IF EXISTS idx_shipstation_warehouses_warehouse_id;
DROP INDEX IF EXISTS idx_shipstation_warehouses_active;

CREATE INDEX IF NOT EXISTS idx_shipfroms_store_id ON shipfroms(store_id);
CREATE INDEX IF NOT EXISTS idx_shipfroms_warehouse_id ON shipfroms(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipfroms_active ON shipfroms(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shipfroms_default ON shipfroms(store_id, is_default);

-- Update trigger name
DROP TRIGGER IF EXISTS update_shipstation_warehouses_updated_at ON shipfroms;
CREATE TRIGGER update_shipfroms_updated_at 
    BEFORE UPDATE ON shipfroms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('014', 'Rename shipstation_warehouses to shipfroms and add is_default field')
ON CONFLICT (version) DO NOTHING;

COMMIT;