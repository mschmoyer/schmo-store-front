-- Migration 006: Add visitors table for tracking website visitors
-- Creates the visitors table for analytics and dashboard statistics
-- Version: 1.0.0
-- Date: 2025-07-07

BEGIN;

-- Visitors table for tracking unique visitors per store
CREATE TABLE IF NOT EXISTS public.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    visited_date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_agent TEXT,
    page_path VARCHAR(500),
    
    -- Additional tracking fields
    referrer_url VARCHAR(500),
    session_id VARCHAR(255),
    country VARCHAR(2),
    city VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint to prevent duplicate visitors on same day
    UNIQUE(store_id, ip_address, visited_date)
);

-- Create index for faster queries on store_id and visited_date
CREATE INDEX IF NOT EXISTS idx_visitors_store_date ON public.visitors(store_id, visited_date);

-- Create index for IP address lookups
CREATE INDEX IF NOT EXISTS idx_visitors_ip ON public.visitors(ip_address);

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_visitors_analytics ON public.visitors(store_id, visited_date, ip_address);

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('006', 'Add visitors table for tracking website visitors')
ON CONFLICT (version) DO NOTHING;

COMMIT;