-- Migration 008: Update ShipStation auth to be deterministic and automatic
-- Replaces random generation with deterministic credential generation
-- Version: 1.0.0
-- Date: 2025-07-07

BEGIN;

-- Drop the old random generation functions
DROP FUNCTION IF EXISTS generate_shipstation_username(UUID);
DROP FUNCTION IF EXISTS generate_shipstation_password();

-- Create deterministic username generation function
-- Format: ss_<store_id_first_8>_<api_key_hash_4>
CREATE OR REPLACE FUNCTION generate_shipstation_username_deterministic(
    store_id_param UUID, 
    api_key_param TEXT
)
RETURNS VARCHAR(255) AS $$
BEGIN
    -- Generate deterministic username: ss_<store_id_8_chars>_<api_key_hash_4_chars>
    RETURN 'ss_' || 
           SUBSTRING(REPLACE(store_id_param::text, '-', ''), 1, 8) || '_' ||
           SUBSTRING(md5(api_key_param), 1, 4);
END;
$$ LANGUAGE plpgsql;

-- Create deterministic password generation function
-- Based on store_id + api_key + secret salt
CREATE OR REPLACE FUNCTION generate_shipstation_password_deterministic(
    store_id_param UUID,
    api_key_param TEXT
)
RETURNS VARCHAR(32) AS $$
BEGIN
    -- Generate deterministic password from store_id + api_key + salt
    RETURN SUBSTRING(
        md5(store_id_param::text || api_key_param || 'shipstation_salt_2025'), 
        1, 24
    ) || SUBSTRING(md5(api_key_param), 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('008', 'Update ShipStation auth to deterministic credential generation')
ON CONFLICT (version) DO NOTHING;

COMMIT;