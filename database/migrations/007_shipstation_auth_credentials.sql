-- Migration 007: Add ShipStation authentication credentials
-- Adds dedicated username/password fields for ShipStation legacy integration authentication
-- Version: 1.0.0
-- Date: 2025-07-07

BEGIN;

-- Add ShipStation authentication fields to store_integrations table
ALTER TABLE public.store_integrations 
ADD COLUMN IF NOT EXISTS shipstation_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS shipstation_password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS shipstation_auth_enabled BOOLEAN DEFAULT false;

-- Create index for faster ShipStation authentication lookups
CREATE INDEX IF NOT EXISTS idx_store_integrations_shipstation_auth 
ON public.store_integrations(shipstation_username, integration_type) 
WHERE integration_type = 'shipstation' AND shipstation_auth_enabled = true;

-- Function to generate unique ShipStation username
CREATE OR REPLACE FUNCTION generate_shipstation_username(store_id_param UUID)
RETURNS VARCHAR(255) AS $$
BEGIN
    -- Generate username format: ss_<store_id_first_8_chars>_<random_4_chars>
    RETURN 'ss_' || SUBSTRING(store_id_param::text, 1, 8) || '_' || 
           SUBSTRING(md5(random()::text), 1, 4);
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure random password
CREATE OR REPLACE FUNCTION generate_shipstation_password()
RETURNS VARCHAR(32) AS $$
BEGIN
    -- Generate 32-character random password
    RETURN SUBSTRING(md5(random()::text || clock_timestamp()::text), 1, 32);
END;
$$ LANGUAGE plpgsql;

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('007', 'Add ShipStation authentication credentials and generation functions')
ON CONFLICT (version) DO NOTHING;

COMMIT;