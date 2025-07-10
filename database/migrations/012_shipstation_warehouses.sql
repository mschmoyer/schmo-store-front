-- Migration: ShipStation Warehouses and Inventory Locations
-- Description: Add tables for ShipStation warehouses, inventory warehouses, and inventory locations
-- Created: 2025-01-10

BEGIN;

-- Create shipstation_warehouses table (ship-from locations)
CREATE TABLE IF NOT EXISTS shipstation_warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    warehouse_id VARCHAR(100) NOT NULL, -- ShipStation warehouse ID
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    
    -- Origin address
    origin_address_line1 VARCHAR(255),
    origin_address_line2 VARCHAR(255),
    origin_address_line3 VARCHAR(255),
    origin_city_locality VARCHAR(100),
    origin_state_province VARCHAR(50),
    origin_postal_code VARCHAR(20),
    origin_country_code VARCHAR(10),
    origin_residential_indicator VARCHAR(20) CHECK (origin_residential_indicator IN ('yes', 'no', 'unknown')),
    
    -- Return address  
    return_address_line1 VARCHAR(255),
    return_address_line2 VARCHAR(255),
    return_address_line3 VARCHAR(255),
    return_city_locality VARCHAR(100),
    return_state_province VARCHAR(50),
    return_postal_code VARCHAR(20),
    return_country_code VARCHAR(10),
    return_residential_indicator VARCHAR(20) CHECK (return_residential_indicator IN ('yes', 'no', 'unknown')),
    
    instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, warehouse_id)
);

-- Create shipstation_inventory_warehouses table
CREATE TABLE IF NOT EXISTS shipstation_inventory_warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    inventory_warehouse_id VARCHAR(100) NOT NULL, -- ShipStation inventory warehouse ID
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, inventory_warehouse_id)
);

-- Create shipstation_inventory_locations table
CREATE TABLE IF NOT EXISTS shipstation_inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    inventory_location_id VARCHAR(100) NOT NULL, -- ShipStation inventory location ID
    inventory_warehouse_id VARCHAR(100) NOT NULL, -- Reference to ShipStation inventory warehouse
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, inventory_location_id),
    FOREIGN KEY (store_id, inventory_warehouse_id) REFERENCES shipstation_inventory_warehouses(store_id, inventory_warehouse_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipstation_warehouses_store_id ON shipstation_warehouses(store_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_warehouses_warehouse_id ON shipstation_warehouses(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_warehouses_active ON shipstation_warehouses(store_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_warehouses_store_id ON shipstation_inventory_warehouses(store_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_warehouses_warehouse_id ON shipstation_inventory_warehouses(inventory_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_warehouses_active ON shipstation_inventory_warehouses(store_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_locations_store_id ON shipstation_inventory_locations(store_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_locations_location_id ON shipstation_inventory_locations(inventory_location_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_locations_warehouse_id ON shipstation_inventory_locations(store_id, inventory_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_inventory_locations_active ON shipstation_inventory_locations(store_id, is_active);

-- Create triggers to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_shipstation_warehouses_updated_at ON shipstation_warehouses;
CREATE TRIGGER update_shipstation_warehouses_updated_at 
    BEFORE UPDATE ON shipstation_warehouses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shipstation_inventory_warehouses_updated_at ON shipstation_inventory_warehouses;
CREATE TRIGGER update_shipstation_inventory_warehouses_updated_at 
    BEFORE UPDATE ON shipstation_inventory_warehouses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shipstation_inventory_locations_updated_at ON shipstation_inventory_locations;
CREATE TRIGGER update_shipstation_inventory_locations_updated_at 
    BEFORE UPDATE ON shipstation_inventory_locations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('012', 'ShipStation warehouses and inventory locations tables')
ON CONFLICT (version) DO NOTHING;

COMMIT;